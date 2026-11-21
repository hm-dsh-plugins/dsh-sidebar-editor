/**
 * Probe: what happens to a file whose only line separator is CR (classic Mac)?
 *
 * `detectLineEnding` counts only `\n` separators, so such a file is classified
 * as LF; `persist` then joins the document lines with LF. The file is rewritten
 * with different bytes without any warning. This mounts the real body against a
 * fake Host, exactly like scripts/dom.mjs, and prints the text a save sends.
 *
 * Run: node code-reviews/<round>/scripts/probe-cr-only-save.mjs
 */

import { JSDOM } from 'jsdom'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3090/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
for (const [name, value] of [
  ['navigator', dom.window.navigator],
  ['HTMLElement', dom.window.HTMLElement],
  ['Element', dom.window.Element],
  ['Node', dom.window.Node],
  ['MutationObserver', dom.window.MutationObserver],
  ['Window', dom.window.Window],
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
]) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch { /* Node's own value stands */ }
}
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (dom.window.matchMedia === undefined) {
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
}
if (typeof dom.window.Range.prototype.getClientRects !== 'function') {
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
}

const react = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = react

const FILE_PATH = 'sandbox/classic-mac.txt'
const FILE_TEXT = 'first\rsecond\rthird\r'
const calls = []

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push({ action: body.action, body })
  if (body.action === 'read') {
    return { ok: true, status: 200, json: async () => ({ absolutePath: FILE_PATH, text: FILE_TEXT, version: '7:20', bytes: 20, bom: false }) }
  }
  return { ok: true, status: 200, json: async () => ({ absolutePath: FILE_PATH, version: '8:23', bytes: body.text.length }) }
}

let bundle
globalThis.window.__ModuleLoader__ = {
  load(entry) {
    bundle = entry.factory((name) => {
      if (name === 'react') return react
      throw new Error(`unexpected platform module: ${name}`)
    })
  },
}
await import(pathToFileURL(join(root, 'lib', 'client.js')).href)

let EditorBody
bundle.apply({
  effect(callback) { callback(); return () => {} },
  documentPreviews: { register: () => () => {} },
  slots: {
    inject: (_name, register) => register(),
    register: (options, component) => {
      if (options.name === 'sidebar.right.tab.document') EditorBody = component
      return () => {}
    },
  },
})

const address = `dsh-resource://file/session/session-1/${encodeURIComponent('classic-mac.txt')}`
const content = { kind: 'renderer', revision: 1, loaded() {}, failed() {}, reload() {} }
const props = {
  resourceAddress: address,
  content,
  wrap: true,
  scrollportRef: () => {},
  addResource: () => {},
  setResources: () => {},
  useTabInfo: () => ({ tab: { id: 't1', navigation: { address, params: undefined, revision: 0 } } }),
}

let container
let reactRoot
await act(async () => {
  container = dom.window.document.getElementById('root')
  reactRoot = createRoot(container)
  reactRoot.render(react.createElement(EditorBody, props))
})
await act(async () => { await new Promise((done) => setTimeout(done, 40)) })

const doc = dom.window.document
console.log('line-ending control shows:', doc.querySelector('button[data-eol]')?.textContent.trim())
console.log('document text content lines:', JSON.stringify(doc.querySelector('.cm-content')?.textContent))
console.log('save button disabled right after open:', doc.querySelector('button[data-primary]')?.disabled)

// The save button is disabled until something changes: nudge the document, the
// way a user would, then save.
const liveView = doc.querySelector('.cm-content')?.cmTile?.root?.view
await act(async () => {
  liveView.dispatch({ changes: { from: liveView.state.doc.length, insert: 'x' } })
  await new Promise((done) => setTimeout(done, 30))
})
await act(async () => {
  const save = [...doc.querySelectorAll('button')].find((node) => node.textContent.trim() === '保存')
  save.click()
  await new Promise((done) => setTimeout(done, 30))
})

const written = calls.filter((entry) => entry.action === 'write').at(-1)?.body.text
console.log('file on disk (read):', JSON.stringify(FILE_TEXT))
console.log('text the save writes:', JSON.stringify(written))
console.log('status line:', doc.querySelector('.dsh-editor-status')?.textContent)
console.log('expected: the CR bytes survive, or the user is told they will not')
await act(async () => { reactRoot.unmount() })
