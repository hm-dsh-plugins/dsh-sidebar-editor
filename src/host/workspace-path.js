/**
 * Turning a request's `sessionId` + `path` into one absolute path, and refusing
 * anything that would land outside that session's workspace.
 *
 * This is the plugin's only security boundary. The browser half cannot widen it:
 * the path is resolved here, from the session's own workspace directory, and
 * both the lexical path and its canonical form (symlinks followed) must stay
 * inside. Nothing about the request can name a different root.
 */

import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path'
import { describe } from './protocol.js'

/**
 * Whether `candidate` is `root` itself or lies beneath it.
 *
 * Comparison is case-insensitive on Windows, where the filesystem is.
 * @param {string} root - canonical workspace root.
 * @param {string} candidate - canonical candidate path.
 * @returns {boolean} true when the candidate is contained.
 */
export function contains(root, candidate) {
  const normalizedRoot = root.endsWith(sep) ? root.slice(0, -1) : root
  const left = process.platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot
  const right = process.platform === 'win32' ? candidate.toLowerCase() : candidate
  return right === left || right.startsWith(`${left}${sep}`)
}

/**
 * The workspace root a session's relative paths resolve against.
 *
 * A live session carries its header in memory; a session restored from a
 * layout after a restart does not, and only persistence knows it. That is why
 * an ordinary open of yesterday's file still works.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {string} sessionId - session identity from the request.
 * @returns {Promise<string | undefined>} the workspace directory, when known.
 */
async function workspaceRootOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  const fromLive = live?.header?.cwd
  if (typeof fromLive === 'string' && fromLive.length > 0) return fromLive

  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return undefined
  // `sessionPersistence.stat` answers `{ header, revision }` — the workspace sits
  // under `header` here exactly as it does on the live Session above.
  const stored = await persistence.stat(sessionId)
  const fromStore = stored?.header?.cwd
  return typeof fromStore === 'string' && fromStore.length > 0 ? fromStore : undefined
}

/**
 * The canonical form of a path that may not exist yet.
 *
 * The last segment of an editor path is often a file the save is about to
 * create, so `realpath` on the whole path fails with ENOENT. Walking up to the
 * nearest ancestor that does exist and resolving *that* is what keeps a
 * directory symlink from turning into an escape: `root/link/new.txt` where
 * `link` points outside still canonicalizes outside, and is then refused.
 * @param {string} lexical - absolute, lexically resolved path.
 * @returns {Promise<string>} the canonical path, existing or not.
 */
async function canonicalTargetOf(lexical) {
  try {
    return await realpath(lexical)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
  }

  const missing = []
  let current = lexical
  for (;;) {
    const parent = dirname(current)
    if (parent === current) return lexical
    missing.unshift(basename(current))
    current = parent
    try {
      return resolve(await realpath(current), ...missing)
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
  }
}

/**
 * Resolve one request's target inside the Session's workspace.
 *
 * Relative paths resolve against the Session's workspace directory; absolute
 * paths are accepted only when they still land inside it. Both the lexical path
 * and its canonical form (symlinks followed) must be contained, so a link
 * cannot be used to reach out of the workspace — including when the target does
 * not exist yet and the link is an ancestor directory.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {Record<string, unknown>} body - decoded request body.
 * @returns {Promise<{ target?: string, code?: string, message?: string }>}
 *   `{ target }`, or `{ code, message }` to answer with.
 */
export async function resolveTarget(ctx, body) {
  const { sessionId, path } = body
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { code: 'bad-request', message: 'sessionId is required.' }
  }
  if (typeof path !== 'string' || path.length === 0) {
    return { code: 'bad-request', message: 'path is required.' }
  }
  if (path.includes('\0')) {
    return { code: 'bad-request', message: 'The path contains a NUL byte.' }
  }

  const root = await workspaceRootOf(ctx, sessionId)
  if (root === undefined) {
    return {
      code: 'unknown-session',
      message: 'That session has no known workspace directory, so its paths cannot be resolved.',
    }
  }

  let canonicalRoot
  try {
    canonicalRoot = await realpath(root)
  } catch (error) {
    return { code: 'unknown-session', message: `The session workspace is unavailable: ${describe(error)}` }
  }

  const lexical = isAbsolute(path) ? resolve(path) : resolve(canonicalRoot, path)
  if (!contains(canonicalRoot, lexical)) {
    return {
      code: 'outside-workspace',
      message: `The editor only touches files inside the session workspace (${canonicalRoot}).`,
    }
  }

  let canonicalTarget
  try {
    canonicalTarget = await canonicalTargetOf(lexical)
  } catch (error) {
    return { code: 'unreadable', message: describe(error) }
  }

  if (!contains(canonicalRoot, canonicalTarget)) {
    return {
      code: 'outside-workspace',
      message: `The editor only touches files inside the session workspace (${canonicalRoot}).`,
    }
  }
  if (canonicalTarget === canonicalRoot) {
    return { code: 'not-found', message: 'The editor edits files, not the workspace directory itself.' }
  }
  return { target: canonicalTarget }
}
