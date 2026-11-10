/**
 * A Node-side harness for the plugin's two halves.
 *
 * The browser half needs a real GUI to be *seen*, but it does not need one to be
 * checked: the bundle is a `window.__ModuleLoader__` registration, so this
 * harness stands up a fake loader and a fake Cordis context and asserts what the
 * plugin actually registers. The host half gets a fake connection registry and
 * exercises real files in a temporary directory.
 *
 * Run with `npm run verify`.
 */

import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { eq, ok, report } from './assert.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Context members that are not services, so a `ctx.<name>` read of one needs no
 * `inject` declaration. Both halves are checked against this one set.
 */
const CORE_CTX = new Set([
  'effect', 'on', 'off', 'once', 'emit', 'get', 'set', 'plugin', 'provide',
  'inject', 'logger', 'fiber', 'reflect',
])

/**
 * The services a source tree reaches for through `ctx.<service>`.
 *
 * Cordis resolves a service on `ctx` only for fibers that declare it: an
 * undeclared read throws `cannot get property "x" without inject`, which fails
 * the plugin's entry — for a client entry that is the whole web boot. Deriving
 * the list from the source is what keeps a new service from being used without
 * being injected.
 *
 * The walk is recursive because the halves are split into modules: the entry of
 * each half no longer names every service it depends on.
 * @param {string} target - a source directory, or a single file.
 * @returns {Promise<string[]>} the non-core service names, sorted.
 */
async function servicesUsedIn(target) {
  const files = []
  const walk = async (path) => {
    if (path.endsWith('.js')) {
      files.push(path)
      return
    }
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (entry.name.endsWith('.js')) files.push(child)
    }
  }
  await walk(target)

  const used = new Set()
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) used.add(match[1])
  }
  return [...used].filter((name) => !CORE_CTX.has(name)).sort()
}

// ---------------------------------------------------------------------------
// The host half
// ---------------------------------------------------------------------------

console.log('\nhost half: lib/index.js')

const host = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
ok(host.name === 'dsh-sidebar-editor', 'exports the plugin name')
ok(host.inject.includes('connection') && host.inject.includes('sessions'), 'declares its required services', host.inject)
for (const service of await servicesUsedIn(join(root, 'src', 'index.js'))) {
  ok(host.inject.includes(service), `injects the "${service}" service the host half uses`)
}
for (const service of await servicesUsedIn(join(root, 'src', 'host'))) {
  ok(host.inject.includes(service), `injects the "${service}" service a host module uses`)
}

const workspace = await mkdtemp(join(tmpdir(), 'dsh-sidebar-editor-'))
const routes = new Map()
const effects = []

/**
 * Stands in for the persistence backend: it knows `session-2`, which is never
 * live in this run and so can only be resolved through this route. The shape is
 * the real one — `{ header, revision }`, with the workspace under `header`.
 */
const persistence = {
  async stat(sessionId) {
    return sessionId === 'session-2' ? { header: { cwd: workspace }, revision: 1 } : undefined
  },
}

const ctx = {
  effect(callback, label) {
    effects.push(label)
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  get(name) {
    return name === 'sessionPersistence' ? persistence : undefined
  },
  sessions: {
    get(sessionId) {
      return sessionId === 'session-1' ? { header: { cwd: workspace } } : undefined
    },
  },
  connection: {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return async () => routes.delete(route.path)
      },
    },
  },
}

host.apply(ctx)
ok(effects.some((label) => label.includes('file route')), 'registers its route inside an effect', effects)
ok(routes.size === 1, 'registers exactly one route', [...routes.keys()])

const route = routes.get('/api/plugins/dsh-sidebar-editor')
ok(route !== undefined, 'route path is the documented one')
eq(route.methods, ['POST'], 'route is POST-only')
ok(route.requestBody === 'buffered', 'route buffers its body')

/**
 * Invoke the registered route.
 *
 * Connection's Fetch registry is an exact-path table, so the action travels in
 * the body; there is no per-action sub-path to reach.
 * @param {string} action - `read`, `write`, or `stat`.
 * @param {unknown} body - request payload.
 * @returns {Promise<{ status: number, body: any }>} the decoded response.
 */
async function call(action, body) {
  const request = new Request('http://127.0.0.1/api/plugins/dsh-sidebar-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const response = await route.fetch(request)
  let decoded
  try {
    decoded = await response.json()
  } catch {
    decoded = undefined
  }
  return { status: response.status, body: decoded }
}

const relative = 'notes/readme.txt'
const absolute = join(workspace, relative)

let result = await call('read', { sessionId: 'session-1', path: relative })
ok(result.status === 404 && result.body.code === 'not-found', 'read of a missing file reports not-found', result)

result = await call('write', { sessionId: 'session-1', path: relative, text: 'hello 世界\n' })
ok(result.status === 200, 'write creates a missing file, directories included', result)
ok((await readFile(absolute, 'utf8')) === 'hello 世界\n', 'the file carries the written UTF-8 bytes')
const firstVersion = result.body.version
ok(typeof firstVersion === 'string' && firstVersion.length > 0, 'write returns a version', firstVersion)
ok(/^\d+:\d+$/.test(firstVersion), 'a version carries both the modification time and the size', firstVersion)

// A save that names no version must not overwrite a file its author never read:
// that is how the empty document of a still-loading editor erased files.
result = await call('write', { sessionId: 'session-1', path: relative, text: 'nope\n' })
ok(result.status === 428 && result.body.code === 'version-required', 'a versionless overwrite of an existing file is refused', result)
ok((await readFile(absolute, 'utf8')) === 'hello 世界\n', 'the refused overwrite left the file untouched')

result = await call('read', { sessionId: 'session-1', path: relative })
ok(result.status === 200 && result.body.text === 'hello 世界\n', 'read returns what was written', result)
ok(result.body.absolutePath === absolute, 'read reports the absolute path', result.body.absolutePath)
ok(result.body.bom === false, 'a file without a byte-order mark reports none', result.body.bom)

result = await call('write', { sessionId: 'session-1', path: relative, text: 'second\n', expectedVersion: '1' })
ok(result.status === 409 && result.body.code === 'version-conflict', 'a stale expectedVersion is refused', result)
ok((await readFile(absolute, 'utf8')) === 'hello 世界\n', 'the refused write left the file untouched')

result = await call('write', { sessionId: 'session-1', path: relative, text: 'second\n', expectedVersion: '1', force: true })
ok(result.status === 200, 'force overwrites', result)

result = await call('read', { sessionId: 'session-1', path: join(workspace, '..', 'escape.txt') })
ok(result.status === 403 && result.body.code === 'outside-workspace', 'a traversal path is refused', result)

result = await call('read', { sessionId: 'session-1', path: 'C:\\Windows\\win.ini' })
ok(result.status === 403 && result.body.code === 'outside-workspace', 'a foreign absolute path is refused', result)

// A directory link is a way out of the workspace even when the file below it
// does not exist yet, so containment has to be checked through the nearest
// existing ancestor rather than only on paths that already resolve.
const outside = await mkdtemp(join(tmpdir(), 'dsh-sidebar-editor-outside-'))
try {
  await symlink(outside, join(workspace, 'escape-link'), 'junction')
  result = await call('write', { sessionId: 'session-1', path: 'escape-link/escaped.txt', text: 'escaped\n' })
  ok(result.status === 403 && result.body.code === 'outside-workspace', 'a write through a directory link is refused', result)
  ok(!existsSync(join(outside, 'escaped.txt')), 'nothing was created outside the workspace')
  result = await call('read', { sessionId: 'session-1', path: 'escape-link/escaped.txt' })
  ok(result.status === 403, 'the same link is refused for a read', result)
} finally {
  await rm(outside, { recursive: true, force: true })
}

// A read-only target is refused by its reason, not by a rename that fails later.
await writeFile(join(workspace, 'readonly.txt'), 'locked\n')
await chmod(join(workspace, 'readonly.txt'), 0o444)
result = await call('write', { sessionId: 'session-1', path: 'readonly.txt', text: 'new\n', expectedVersion: 'stale' })
ok(result.status === 403 && result.body.code === 'read-only', 'a read-only file is refused with its reason', result)
await chmod(join(workspace, 'readonly.txt'), 0o666)

await writeFile(join(workspace, 'blob.txt'), Buffer.from([0x41, 0x00, 0x42]))
result = await call('read', { sessionId: 'session-1', path: 'blob.txt' })
ok(result.status === 415 && result.body.code === 'not-text', 'a NUL-bearing file is refused as non-text', result)

await writeFile(join(workspace, 'latin.txt'), Buffer.from([0x41, 0xff, 0x42]))
result = await call('read', { sessionId: 'session-1', path: 'latin.txt' })
ok(result.status === 415 && result.body.code === 'not-text', 'invalid UTF-8 is refused', result)

await writeFile(join(workspace, 'bom.txt'), '\uFEFFcontent')
result = await call('read', { sessionId: 'session-1', path: 'bom.txt' })
ok(result.body.text === 'content', 'a leading BOM is stripped', result.body.text)
ok(result.body.bom === true, 'read reports the byte-order mark it stripped', result.body.bom)

result = await call('write', { sessionId: 'session-1', path: 'bom.txt', text: 'content', expectedVersion: result.body.version, bom: true })
ok(
  (await readFile(join(workspace, 'bom.txt'))).subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])),
  'a save puts the byte-order mark back',
)
result = await call('read', { sessionId: 'session-1', path: 'bom.txt' })
ok(result.body.bom === true && result.body.text === 'content', 'the round trip keeps both the mark and the text', result.body)

await mkdir(join(workspace, 'subdir'), { recursive: true })
result = await call('read', { sessionId: 'session-1', path: 'subdir' })
ok(result.status === 404, 'a directory is refused', result)

result = await call('read', { sessionId: 'session-1', path: '.' })
ok(result.status === 404 && result.body.code === 'not-found', 'the workspace directory itself is not a file', result)

result = await call('read', { path: relative })
ok(result.status === 400, 'a missing sessionId is a bad request', result)

result = await call('read', { sessionId: 'session-1', path: '' })
ok(result.status === 400, 'an empty path is a bad request', result)

result = await call('read', { sessionId: 'nope', path: relative })
ok(result.status === 404 && result.body.code === 'unknown-session', 'an unknown session is refused', result)

result = await call('stat', { sessionId: 'session-1', path: relative })
ok(result.status === 404 && result.body.code === 'unknown-action', 'stat is not part of the protocol', result)

result = await call('nonsense', { sessionId: 'session-1', path: relative })
ok(result.status === 404 && result.body.code === 'unknown-action', 'an unknown action is refused', result)

// A session that is not materialized in this run still has a workspace; the
// preview can reference one from a restored layout, and its paths must resolve.
result = await call('read', { sessionId: 'session-2', path: relative })
ok(result.status === 200 && result.body.text === 'second\n', 'a session that is not live resolves through sessionPersistence', result)

// JSON escaping doubles newline-heavy text, so a body can legitimately outgrow
// the content limit. That is a transport concern, not a reason to call a
// well-formed write malformed.
const newlineHeavy = '\n'.repeat(6 * 1024 * 1024 + 64 * 1024)
result = await call('write', { sessionId: 'session-1', path: 'newlines.txt', text: newlineHeavy })
ok(result.status === 200, 'a legal body larger than the content limit still saves', result)
ok(result.body.bytes === Buffer.byteLength(newlineHeavy, 'utf8'), 'the newline-heavy file kept its size', result.body)

const names = await readdir(workspace)
ok(!names.some((name) => name.includes('.dsh-editor-')), 'no temporary write file is left behind', names)

await rm(workspace, { recursive: true, force: true })

// ---------------------------------------------------------------------------
// The browser half
// ---------------------------------------------------------------------------

console.log('\nclient half: lib/client.js')

const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')
ok(source.startsWith('/* Generated from src/'), 'bundle says it is a build artifact')
const loader = source.slice(source.indexOf('*/') + 2).trimStart()
ok(loader.startsWith('window.__ModuleLoader__.load({'), 'bundle is a module-loader registration')
ok(source.includes('id: "dsh-sidebar-editor"'), 'bundle registers under its package name')
ok(/factory: \(require\) => \{/.test(source), 'bundle exports a factory taking require')
ok(/require\("react"\)/.test(source), 'react is left to the platform module table')

const hostEntry = await readFile(join(root, 'lib', 'index.js'), 'utf8')
ok(hostEntry.startsWith('/* Generated from src/'), 'the host entry says it is a build artifact')
ok(!hostEntry.includes('node:fs'), 'the host entry is wiring only; file operations live in host modules')
for (const name of await readdir(join(root, 'src', 'host'))) {
  const built = await readFile(join(root, 'lib', 'host', name), 'utf8')
  ok(built.startsWith('/* Generated from src/') && built.length > 0, `lib/host/${name} was built`, name)
}

/** A minimal React whose hooks are inert — enough to materialize the bundle. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useId: () => 'id',
}

/** Module id the fake loader saw. */
let registeredId
/** The bundle's exports, once materialized. */
let bundle

globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registeredId = entry.id
      bundle = entry.factory((name) => {
        if (name === 'react') return reactStub
        throw new Error(`unexpected platform module request: ${name}`)
      })
    },
  },
}

const registrations = { previews: [], slots: [], effects: [] }

const clientCtx = {
  effect(callback, label) {
    registrations.effects.push(label)
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  documentPreviews: {
    register(definition) {
      registrations.previews.push(definition)
      return () => {}
    },
  },
  slots: {
    inject(_name, register) {
      return register()
    },
    register(options, component) {
      registrations.slots.push({ options, component })
      return () => {}
    },
  },
}

// The bundle registers itself on import; the file has no exports of its own.
await import(pathToFileURL(join(root, 'lib', 'client.js')).href)
ok(registeredId === 'dsh-sidebar-editor', 'the loader receives the package name', registeredId)
ok(typeof bundle?.apply === 'function', 'the materialized bundle exports apply')
ok(Array.isArray(bundle?.inject), 'the materialized bundle exports inject', bundle?.inject)

const requiredServices = await servicesUsedIn(join(root, 'src', 'client'))
ok(requiredServices.length > 0, 'the client source reaches for at least one service', requiredServices)
for (const service of requiredServices) {
  ok(bundle.inject.includes(service), `injects the "${service}" service the client half uses`)
}

bundle.apply(clientCtx)

eq(registrations.previews.length, 1, 'registers exactly one renderer definition')
const definition = registrations.previews[0]
ok(definition.id === 'dsh-sidebar-editor', 'renderer id is the package name', definition.id)
ok(definition.priority === undefined, 'no priority means the extension band, so it outranks builtin viewers')
ok(definition.loading === 'renderer', 'the body loads its own content')
ok(definition.wrap === true, 'the body consumes the wrap preference')
ok(typeof definition.title === 'function' && definition.title().length > 0, 'the renderer has a title', definition.title?.())
ok(Array.isArray(definition.extensions) && definition.extensions.length > 100, 'declares a broad suffix list', definition.extensions?.length)
for (const suffix of ['txt', 'md', 'json', 'ts', 'py', 'yaml', 'sh', 'ini', 'env', 'log', 'lock']) {
  ok(definition.extensions.includes(suffix), `claims .${suffix}`)
}

const body = registrations.slots.find((entry) => entry.options?.name === 'sidebar.right.tab.document')
ok(body !== undefined, 'registers into the document body slot')
ok(body?.options?.key === 'dsh-sidebar-editor', 'the body key matches the renderer id', body?.options?.key)
ok(typeof body?.component === 'function', 'the body is a component')
ok(registrations.effects.some((label) => label.includes('renderer metadata')), 'metadata registration is owned by an effect')
ok(registrations.effects.some((label) => label.includes('editor body')), 'body registration is owned by an effect')

report('checks')
