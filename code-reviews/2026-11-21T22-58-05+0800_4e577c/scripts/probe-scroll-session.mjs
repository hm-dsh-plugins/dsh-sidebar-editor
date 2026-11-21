/**
 * Probe: does the scroll memory identify the conversation the right Sidebar is
 * actually drawing?
 *
 * `src/client/scroll-memory.js` scans `[data-sidebar-right-session]` and takes
 * the first element whose `hidden` is false. The sidebar package puts that
 * attribute on two different elements:
 *
 *   - the retained Session wrapper, which carries `hidden` (RightbarRoot.tsx:22)
 *   - the panel inside it, which never carries `hidden` (SidebarRight.tsx:347)
 *
 * The DOM below mirrors that shape, with the retained conversation sorted first
 * the way `SidebarSessionViews.publish()` sorts views by session id.
 *
 * Run: node code-reviews/<round>/scripts/probe-scroll-session.mjs
 */

import { JSDOM } from 'jsdom'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const dom = new JSDOM(`<!doctype html><html><body>
  <div data-sidebar-right-session="session-a" hidden>
    <div class="panel" data-sidebar-right-session="session-a"></div>
  </div>
  <div data-sidebar-right-session="session-b">
    <div class="panel" data-sidebar-right-session="session-b"></div>
  </div>
</body></html>`)
globalThis.document = dom.window.document
globalThis.MutationObserver = dom.window.MutationObserver

const { watchScrollMemory, rememberScroll, recallScroll } = await import(
  pathToFileURL(join(root, 'src', 'client', 'scroll-memory.js')).href
)

const matches = [...dom.window.document.querySelectorAll('[data-sidebar-right-session]')]
console.log('matches in document order:',
  matches.map((node) => `${node.dataset.sidebarRightSession}${node.classList.contains('panel') ? '(panel)' : '(wrapper)'} hidden=${node.hidden}`))

// session-b is the conversation on screen; session-a is a retained background
// conversation with a tab still open.
const stop = watchScrollMemory()

rememberScroll('session-b', 'notes.txt', 240)
console.log('recall before switching conversation:', recallScroll('session-b', 'notes.txt'))

// The user switches back to session-a: its wrapper becomes visible, session-b's
// is hidden. The mutation observer inside watchScrollMemory runs the session
// check on the next task.
const [aWrapper, bWrapper] = [matches[0], matches[2]]
aWrapper.hidden = false
bWrapper.hidden = true
await new Promise((done) => setTimeout(done, 10))

console.log('recall after switching to another conversation:', recallScroll('session-b', 'notes.txt'))
console.log('recall of the now-open conversation (session-a):', recallScroll('session-a', 'notes.txt'))
console.log(
  'expected: the position recorded for session-b is discarded on a conversation switch,',
  'so the next open in session-b starts at the first line (README: 切换对话后从首行开始)',
)
stop()
