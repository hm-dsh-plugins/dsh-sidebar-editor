/**
 * Turning a request's `sessionId` + `path` into one absolute path.
 *
 * Any file the session's user can name is fair game, inside the session
 * workspace or elsewhere on the machine: the route only answers requests that
 * the Host has already authenticated, and a conversation routinely reads and
 * writes files the user pointed at deliberately. Relative paths resolve against
 * the session's workspace; absolute paths are taken as they are. The one rule
 * that outlives the location is that this is a file editor, so a directory is
 * not something it opens.
 */

import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, parse, resolve } from 'node:path'
import { describe } from './protocol.js'

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
 * nearest ancestor that does exist and resolving *that* keeps the answer
 * canonical, and keeps a directory link resolving to where it actually points
 * rather than to the link's own spelling.
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
 * Resolve one request's target.
 *
 * Relative paths resolve against the Session's workspace directory; absolute
 * paths stand on their own. The canonical form (symlinks followed) is what comes
 * back, so a link is followed to the file it names rather than refused.
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

  let canonicalTarget
  try {
    canonicalTarget = await canonicalTargetOf(lexical)
  } catch (error) {
    return { code: 'unreadable', message: describe(error) }
  }

  // The workspace is not a fence: a path elsewhere on the machine is opened as
  // itself. What survives is the one rule that has nothing to do with location —
  // the editor edits files, not the workspace directory or the filesystem root.
  if (canonicalTarget === canonicalRoot || canonicalTarget === parse(canonicalTarget).root) {
    return { code: 'bad-request', message: 'The editor edits files, not a directory.' }
  }
  return { target: canonicalTarget }
}
