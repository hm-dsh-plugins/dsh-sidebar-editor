/**
 * Mount the editor body in a DOM, with the Host route faked.
 *
 * The bundle's own activation is covered by `verify.mjs`; this goes one step
 * further and renders the registered component, which is the only reliable way
 * to catch a bad CodeMirror import, a hook used outside its rules, or a prop
 * shape the slot does not actually supply.
 *
 * Run with `npm run verify` (it runs after `verify.mjs`).
 */

import { JSDOM } from 'jsdom'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { eq, ok, report } from './assert.mjs'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

console.log('\nDOM: mounting the editor body')

const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3090/',
  pretendToBeVisual: true,
})

// CodeMirror and React both reach for the ambient document. Node defines some of
// these as getter-only properties, so each is installed defensively.
globalThis.window = dom.window
globalThis.document = dom.window.document
for (const [name, value] of [
  ['navigator', dom.window.navigator],
  ['HTMLElement', dom.window.HTMLElement],
  ['Element', dom.window.Element],
  ['Node', dom.window.Node],
  ['MutationObserver', dom.window.MutationObserver],
  // CodeMirror's scroll measurement uses `instanceof Window`, which only exists
  // as a global inside a browser. Without it the measure pass throws from a
  // rAF callback and never commits.
  ['Window', dom.window.Window],
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
]) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch {
    /* Node's own value stands; nothing here depends on the difference. */
  }
}
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (dom.window.matchMedia === undefined) {
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
}
// jsdom implements no layout, so a Range has no client rects. CodeMirror asks for
// them while measuring, and an empty list is the honest answer here.
if (typeof dom.window.Range.prototype.getClientRects !== 'function') {
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
}

const react = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = react

/**
 * The file the fake Host serves. A synthetic path on purpose — the non-ASCII
 * name is what exercises decoding, and no machine's real layout is assumed.
 */
const FILE_PATH = 'sandbox/新建 文本文档.txt'
// CRLF on purpose: the file's own ending is what the editor must default to,
// and what a save must reproduce when the control is left alone.
const FILE_TEXT = '第一行\r\nconst answer = 42\r\n第三行\r\n'

/** Requests the body made, for assertions. */
const calls = []
/** Set to a response body to make the next write fail, then cleared. */
let failNextWrite
/** Versions the body reported to the owner through `content.loaded`. */
const reportedVersions = []
/** What the fake Host serves; reassigned to simulate an external rewrite. */
let servedText = FILE_TEXT
/** `'ok'`, or `'binary'` to make the next reads fail as a non-text file. */
let readMode = 'ok'
/** Latency before a read/write answer, for the in-flight cases. */
let readDelayMs = 0
let writeDelayMs = 0
/** Whether the file the fake Host serves arrived with a byte-order mark. */
let servedBom = false

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push({ action: body.action, body })
  if (url !== 'http://127.0.0.1:3090/api/plugins/dsh-sidebar-editor') {
    ok(false, 'the client calls the one registered route path', String(url))
  }
  if (body.action === 'read') {
    if (readDelayMs > 0) await new Promise((resolveTick) => setTimeout(resolveTick, readDelayMs))
    if (readMode === 'binary') {
      return { ok: false, status: 415, json: async () => ({ code: 'not-text', message: 'that file is binary' }) }
    }
    return { ok: true, status: 200, json: async () => ({ absolutePath: FILE_PATH, text: servedText, version: '123', bytes: Buffer.byteLength(servedText), bom: servedBom }) }
  }
  if (body.action === 'write') {
    if (failNextWrite !== undefined) {
      const refusal = failNextWrite
      failNextWrite = undefined
      return { ok: false, status: 500, json: async () => refusal }
    }
    if (writeDelayMs > 0) await new Promise((resolveTick) => setTimeout(resolveTick, writeDelayMs))
    return { ok: true, status: 200, json: async () => ({ absolutePath: FILE_PATH, version: '124', bytes: Buffer.byteLength(body.text), bom: servedBom }) }
  }
  return { ok: false, status: 404, json: async () => ({ code: 'unknown-action', message: 'no' }) }
}

/** The bundle registers itself on import; the file exports nothing. */
let bundle
globalThis.window.__ModuleLoader__ = {
  load(entry) {
    bundle = entry.factory((name) => {
      if (name === 'react') return react
      throw new Error(`unexpected platform module: ${name}`)
    })
  },
}

await import(pathToFileURL(join(pluginRoot, 'lib', 'client.js')).href)
ok(typeof bundle?.apply === 'function', 'bundle loaded in a DOM environment')

/** The body component captured from a fake slot registry. */
let EditorBody
bundle.apply({
  effect(callback) {
    callback()
    return () => {}
  },
  documentPreviews: { register: () => () => {} },
  slots: {
    inject: (_name, register) => register(),
    register: (options, component) => {
      if (options.name === 'sidebar.right.tab.document') EditorBody = component
      return () => {}
    },
  },
})
ok(typeof EditorBody === 'function', 'the body component was registered')

const address = `dsh-resource://file/session/session-1/${encodeURIComponent('新建 文本文档.txt')}`

/** Owner props the preview supplies to a renderer-owned body. */
const rendererContent = {
  kind: 'renderer',
  revision: 1,
  loaded: (version) => { reportedVersions.push(version) },
  failed: () => {},
  reload: () => {},
}

/** The owner props the preview supplies, reused when the owner re-renders. */
const ownerProps = (content) => ({
  resourceAddress: address,
  content,
  wrap: true,
  scrollportRef: () => {},
  addResource: () => {},
  setResources: () => {},
  useTabInfo: () => ({ tab: { id: 't1', navigation: { address, params: undefined, revision: 0 } } }),
})

let container
let reactRoot
try {
  await act(async () => {
    container = dom.window.document.getElementById('root')
    reactRoot = createRoot(container)
    reactRoot.render(react.createElement(EditorBody, ownerProps(rendererContent)))
  })
} catch (error) {
  ok(false, 'mounting the component throws nothing', error?.stack ?? String(error))
}

// Let the read promise settle and React commit the loaded document.
await act(async () => {
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})

const html = container?.innerHTML ?? ''
ok(calls.some((entry) => entry.action === 'read'), 'the body read the file through the Host route')
ok(calls.some((entry) => entry.action === 'read' && entry.body.path === '新建 文本文档.txt'), 'the decoded path is what the route received', calls.find((c) => c.action === 'read')?.body)
ok(html.includes('dsh-editor-root'), 'the editor chrome rendered')
ok(html.includes('cm-editor'), 'CodeMirror mounted')
ok(html.includes('cm-gutters'), 'line numbers are on')
// The preview's own header shows the absolute path; repeating it here was the
// duplicate the toolbar used to draw above the document.
const bar = dom.window.document.querySelector('.dsh-editor-bar')
ok(bar !== null, 'the toolbar rendered')
ok(bar?.textContent.includes('新建 文本文档.txt') !== true, 'the toolbar does not repeat the path', bar?.textContent)
ok(dom.window.document.querySelector('.dsh-editor-path') === null, 'no path element is left in the toolbar')
ok(bar?.textContent.includes('CRLF') === true, 'the toolbar carries the ending control', bar?.textContent)
ok(bar?.querySelector('.dsh-editor-chip') === null, 'plain text gets no language chip', bar?.textContent)
ok(!html.includes('dsh-editor-notice'), 'no failure notice was rendered')
ok(dom.window.document.querySelector('style[data-plugin="dsh-sidebar-editor"]') !== null, 'the stylesheet was injected once')

const view = dom.window.document.querySelector('.cm-content')
ok(view !== null, 'the editor content surface exists')
const content = dom.window.document.querySelector('.cm-content')?.textContent ?? ''
ok(content.includes('const answer = 42'), 'the file text is in the document', content.slice(0, 120))
ok(view?.getAttribute('contenteditable') === 'true', 'the surface is editable')

const status = dom.window.document.querySelector('.dsh-editor-status')?.textContent ?? ''
ok(status.length > 0, 'a status line is rendered', status)
ok(dom.window.document.querySelector('.dsh-editor-button') !== null, 'the toolbar rendered its buttons')

// ---------------------------------------------------------------------------
// The line-ending control
// ---------------------------------------------------------------------------

const eolButton = () => dom.window.document.querySelector('button[data-eol]')
const saveButton = () => [...dom.window.document.querySelectorAll('button')]
  .find((node) => node.textContent.trim() === '保存')
const writes = () => calls.filter((entry) => entry.action === 'write')

/** Click one button, letting whatever it starts settle before the next check. */
async function click(button) {
  await act(async () => {
    button.click()
    await new Promise((resolveTick) => setTimeout(resolveTick, 30))
  })
}

eq(eolButton()?.textContent.trim(), 'CRLF', "the ending control starts at the file's own ending")
ok(saveButton()?.disabled === true, 'a freshly loaded file is not dirty')

await click(eolButton())
eq(eolButton()?.textContent.trim(), 'LF', 'clicking the control switches the ending')
ok(saveButton()?.disabled === false, 'switching the ending counts as an unsaved change')

await click(saveButton())
ok(writes().length === 1, 'saving after the switch sends one write', writes().length)
ok(writes()[0]?.body.text.includes('\r') === false, 'the LF choice writes LF', writes()[0]?.body.text.slice(0, 48))
ok(
  reportedVersions.includes('124'),
  'a save tells the owner which version is on screen, so the preview has nothing to refresh',
  reportedVersions,
)

await click(eolButton())
await click(saveButton())
ok(writes()[1]?.body.text.includes('\r\n') === true, 'switching back writes CRLF again', writes()[1]?.body.text.slice(0, 48))

// A click leaves focus on a toolbar button, so the shortcut has to work from
// there too — otherwise the browser's own save dialog answers instead.
await click(eolButton())
const writesBeforeShortcut = writes().length
eolButton().focus()
await act(async () => {
  eolButton().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})
ok(
  writes().length === writesBeforeShortcut + 1,
  'Ctrl+S saves with the focus on a toolbar button',
  { before: writesBeforeShortcut, after: writes().length },
)

// A refused save must show the reason, not just the two words in the toolbar.
await click(eolButton())
failNextWrite = { code: 'io-error', message: 'the disk said no' }
await click(saveButton())
ok(dom.window.document.querySelector('.dsh-editor-status')?.textContent === '保存失败', 'a refused save reports failure')
ok(
  dom.window.document.querySelector('.dsh-editor-alert')?.textContent.includes('the disk said no') === true,
  'the refusal explains itself',
  dom.window.document.querySelector('.dsh-editor-alert')?.textContent,
)

// An owner refresh that lands while the document has unsaved edits must not
// throw them away: it asks first, through the same conflict bar a refused save
// uses.
servedText = 'rewritten\r\nby someone else\r\n'
await act(async () => {
  reactRoot.render(react.createElement(EditorBody, ownerProps({ ...rendererContent, revision: 2 })))
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})
ok(
  dom.window.document.querySelector('.cm-content')?.textContent.includes('rewritten') !== true,
  'a refresh does not overwrite unsaved edits',
  dom.window.document.querySelector('.cm-content')?.textContent?.slice(0, 40),
)
const reloadButton = [...dom.window.document.querySelectorAll('.dsh-editor-conflict button')]
  .find((node) => node.textContent.trim() === '重新载入')
ok(reloadButton !== undefined, 'the refresh offers to reload from disk')
if (reloadButton !== undefined) await click(reloadButton)
ok(
  dom.window.document.querySelector('.cm-content')?.textContent.includes('rewritten') === true,
  'reloading from the conflict replaces the document',
  dom.window.document.querySelector('.cm-content')?.textContent?.slice(0, 40),
)

// Typing must mark the document dirty. The change listener is attached to the
// view *after* the view is created (see use-file-document.js), so a wrong
// ordering here would leave the save button disabled while the user types — the
// exact failure this check exists to catch.
//
// jsdom cannot type: a synthetic `beforeinput` is ignored by CodeMirror's input
// handling. So this dispatches a real change through CodeMirror's own DOM
// back-reference, which is how CodeMirror's own tests drive a view.
const contentEl = dom.window.document.querySelector('.cm-content')
const liveView = contentEl?.cmTile?.root?.view
ok(liveView !== undefined, 'the live editor view is reachable', Boolean(contentEl))
await act(async () => {
  liveView.dispatch({ changes: { from: 0, insert: 'X' } })
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})
ok(
  dom.window.document.querySelector('.dsh-editor-status')?.textContent === '未保存',
  'a document change marks the file unsaved',
  dom.window.document.querySelector('.dsh-editor-status')?.textContent,
)

await act(async () => {
  reactRoot.unmount()
})
ok(dom.window.document.querySelector('.cm-editor') === null, 'unmounting tears the editor down')

// ---------------------------------------------------------------------------
// In-flight cases: a save before the read lands, and typing during a save
// ---------------------------------------------------------------------------

/** The status line's text inside one mounted body. */
const statusIn = (host) => host.querySelector('.dsh-editor-status')?.textContent ?? ''

readDelayMs = 120
readMode = 'ok'
servedText = 'precious\r\n'
servedBom = true
calls.length = 0

const lateHost = dom.window.document.createElement('div')
dom.window.document.body.appendChild(lateHost)
let lateRoot
await act(async () => {
  lateRoot = createRoot(lateHost)
  lateRoot.render(react.createElement(EditorBody, ownerProps(rendererContent)))
})
ok(statusIn(lateHost) === '正在读取文件…', 'the body starts in its loading state', statusIn(lateHost))

const latePanel = lateHost.querySelector('.dsh-editor-root')
await act(async () => {
  latePanel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
})
ok(!calls.some((entry) => entry.action === 'write'), 'Ctrl+S before the read lands writes nothing', calls.map((entry) => entry.action))

await act(async () => {
  await new Promise((resolveTick) => setTimeout(resolveTick, 200))
})
readDelayMs = 0
ok(
  lateHost.querySelector('.cm-content')?.textContent.includes('precious') === true,
  'the document arrives once the read lands',
  lateHost.querySelector('.cm-content')?.textContent?.slice(0, 40),
)

// Typing while a save is in flight leaves the file unsaved, and the toolbar has
// to say so: reporting 「已保存」 there was the lie this check exists to catch.
const lateView = lateHost.querySelector('.cm-content')?.cmTile?.root?.view
const lateSave = () => [...lateHost.querySelectorAll('button')].find((node) => node.textContent.trim() === '保存')
await act(async () => {
  lateView.dispatch({ changes: { from: 0, insert: 'Z' } })
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})
ok(statusIn(lateHost) === '未保存', 'editing marks the file unsaved', statusIn(lateHost))

writeDelayMs = 120
await act(async () => {
  lateSave().click()
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
})
await act(async () => {
  lateView.dispatch({ changes: { from: 0, insert: 'Y' } })
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
})
await act(async () => {
  await new Promise((resolveTick) => setTimeout(resolveTick, 250))
})
writeDelayMs = 0
ok(statusIn(lateHost) === '未保存', 'a save that raced the keyboard leaves the file unsaved', statusIn(lateHost))

// The mark the read reported has to come back on the save, or saving a file
// silently changes its encoding.
const lateWrites = calls.filter((entry) => entry.action === 'write')
ok(lateWrites.length > 0 && lateWrites.at(-1).body.bom === true, 'a save carries the byte-order mark the read reported', lateWrites.at(-1)?.body?.bom)

// The dictionary follows the interface language without a remount.
await act(async () => {
  dom.window.document.documentElement.lang = 'en'
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})
ok(statusIn(lateHost) === 'Unsaved', 'the copy follows a language switch', statusIn(lateHost))
await act(async () => {
  dom.window.document.documentElement.lang = 'zh'
  await new Promise((resolveTick) => setTimeout(resolveTick, 30))
})

await act(async () => {
  lateRoot.unmount()
})

// ---------------------------------------------------------------------------
// A failed open that is retried
// ---------------------------------------------------------------------------

readMode = 'binary'
servedText = 'now text\r\n'
const retryHost = dom.window.document.createElement('div')
dom.window.document.body.appendChild(retryHost)
let retryRoot
await act(async () => {
  retryRoot = createRoot(retryHost)
  retryRoot.render(react.createElement(EditorBody, ownerProps(rendererContent)))
})
await act(async () => {
  await new Promise((resolveTick) => setTimeout(resolveTick, 40))
})
ok(retryHost.querySelector('.dsh-editor-notice') !== null, 'a refused open renders its notice')
ok(
  retryHost.querySelector('.dsh-editor-cm')?.getAttribute('data-hidden') === 'true',
  'the editor host is hidden behind the notice',
  retryHost.querySelector('.dsh-editor-cm')?.getAttribute('data-hidden'),
)

readMode = 'ok'
const retryButton = [...retryHost.querySelectorAll('.dsh-editor-notice button')].find((node) => node.textContent.trim() === '重试')
ok(retryButton !== undefined, 'the refused open offers a retry')
if (retryButton !== undefined) {
  await act(async () => {
    retryButton.click()
    await new Promise((resolveTick) => setTimeout(resolveTick, 60))
  })
}
const retriedEditor = retryHost.querySelector('.cm-editor')
ok(retriedEditor !== null, 'a retried open brings the editor back')
ok(retryHost.querySelector('.dsh-editor-cm')?.contains(retriedEditor) === true, 'the editor is mounted in the live panel')
ok(
  retryHost.querySelector('.cm-content')?.textContent.includes('now text') === true,
  'a retried open loads the document',
  retryHost.querySelector('.cm-content')?.textContent?.slice(0, 40),
)

await act(async () => {
  retryRoot.unmount()
})

report('DOM checks')
