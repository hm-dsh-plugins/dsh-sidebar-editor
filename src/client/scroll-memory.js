/**
 * 每个文件在侧边栏里停下的位置，按对话分开记住。
 *
 * 关掉标签再打开、或在两个标签之间来回切，CodeMirror 视图会重建，文档回到
 * 首行；位置因此记在这里而不是视图里。侧边栏为每个对话保留常驻视图，切换
 * 对话只改 `hidden`，所以「换了对话」可以从 DOM 上看出来：那时整组作废，
 * 回到对话里重新打开文件才从头开始。
 */

/** 位置 key：对话与路径一起，避免同名文件在对话之间串位。 */
function keyOf(sessionId, path) {
  return `${sessionId}\u0000${path}`
}

/** `sessionId\0path` → 滚动的像素位置。 */
const positions = new Map()

/** 侧边栏当前画着的对话，用来发现「换了对话」。 */
let activeSession

/**
 * 侧边栏此刻画着哪个对话。
 *
 * 每个对话的侧边栏视图都常驻 DOM，只有当前那个不带 `hidden`；折叠侧边栏不改
 * 这个属性，所以折叠不会被当成换了对话。
 * @returns {string | undefined} the conversation the right Sidebar is drawing.
 */
function visibleSession() {
  if (typeof document === 'undefined') return undefined
  for (const node of document.querySelectorAll('[data-sidebar-right-session]')) {
    if (node.hidden !== true) return node.dataset.sidebarRightSession
  }
  return undefined
}

/** 换过对话就丢掉上一组位置；折叠、侧边栏尚未渲染都不算换。 */
function syncSession() {
  const next = visibleSession()
  if (next === undefined || next === activeSession) return
  if (activeSession !== undefined) positions.clear()
  activeSession = next
}

/**
 * 开始观察侧边栏的对话切换。
 * @returns {() => void} disposer of the plugin's lifetime.
 */
export function watchScrollMemory() {
  syncSession()
  if (typeof MutationObserver !== 'function' || typeof document === 'undefined' || document.body === null) {
    return () => {}
  }
  const observer = new MutationObserver(syncSession)
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] })
  return () => {
    observer.disconnect()
    positions.clear()
    activeSession = undefined
  }
}

/**
 * Remember where one file stopped.
 * @param {string} sessionId - conversation the file was opened in.
 * @param {string} path - workspace-relative path of the file.
 * @param {number} top - pixels scrolled from the document's start.
 */
export function rememberScroll(sessionId, path, top) {
  syncSession()
  if (!Number.isFinite(top) || top <= 0) {
    positions.delete(keyOf(sessionId, path))
    return
  }
  positions.set(keyOf(sessionId, path), top)
}

/**
 * Where the same file stopped the last time it was opened in this conversation.
 * @param {string} sessionId - conversation the file is opened in.
 * @param {string} path - workspace-relative path of the file.
 * @returns {number | undefined} the remembered offset, if there is one.
 */
export function recallScroll(sessionId, path) {
  syncSession()
  return positions.get(keyOf(sessionId, path))
}
