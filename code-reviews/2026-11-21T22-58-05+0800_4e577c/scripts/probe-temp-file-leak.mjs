/**
 * Probe: is the same-directory temporary file removed when the write itself
 * fails (as opposed to the rename failing)?
 *
 * `src/host/text-file.js` removes the temporary only in the `rename` failure
 * path. A failing `writeFile`/`sync` (disk full, I/O error, revoked handle)
 * leaves it behind. The failure is injected by loading a copy of the built
 * module whose `node:fs/promises` import points at a shim; no repository file is
 * touched.
 *
 * Run: node code-reviews/<round>/scripts/probe-temp-file-leak.mjs
 */

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const built = await readFile(join(root, 'lib', 'host', 'text-file.js'), 'utf8')

const work = await mkdtemp(join(tmpdir(), 'dsh-editor-probe-'))
const shimPath = join(work, 'fs-shim.mjs')
await writeFile(shimPath, `
import * as real from 'node:fs/promises'
export const { chmod, mkdir, readFile, rename, rm, stat } = real
/** Hand back a handle whose writes fail, for the module's temporary file only. */
export async function open(path, flags) {
  const handle = await real.open(path, flags)
  if (!String(path).endsWith('.tmp')) return handle
  return {
    writeFile: async () => { throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }) },
    sync: () => handle.sync(),
    close: () => handle.close(),
  }
}
`, 'utf8')

// The built module imports `./protocol.js`; carry an untouched copy next to it.
await writeFile(join(work, 'protocol.js'), await readFile(join(root, 'lib', 'host', 'protocol.js'), 'utf8'), 'utf8')

const underTest = join(work, 'text-file-under-test.mjs')
await writeFile(underTest, built.replace("'node:fs/promises'", JSON.stringify(pathToFileURL(shimPath).href)), 'utf8')
const { writeText } = await import(pathToFileURL(underTest).href)

const target = join(work, 'notes.txt')
await writeFile(target, 'old contents\n', 'utf8')

let failure
try {
  await writeText(target, 'new contents\n', undefined, true, false)
} catch (error) {
  failure = error
}
console.log('writeText rejected with:', failure?.code, '-', failure?.message)
console.log('target still holds:', JSON.stringify(await readFile(target, 'utf8')))
const leftovers = (await readdir(work)).filter((name) => name.includes('.dsh-editor-'))
console.log('temporary files left in the directory:', leftovers)
for (const name of leftovers) console.log('  ', name, (await stat(join(work, name))).size, 'bytes')
console.log('expected: a failed write leaves no .tmp file behind (.gitignore only hides them with *.tmp)')

await rm(work, { recursive: true, force: true })
