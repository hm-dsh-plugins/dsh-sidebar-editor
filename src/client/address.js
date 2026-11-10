/**
 * Reading a tab's content address.
 *
 * The Sidebar addresses a file as
 * `dsh-resource://file/session/<sessionId>/<path>`. Everything the editor does
 * afterwards — reading, saving, following a line link — is scoped by the two
 * halves of this address, so it is parsed once and never guessed at.
 */

/** Every file tab the preview opens uses this prefix. */
const PREFIX = 'dsh-resource://file/'

/**
 * Split a `dsh-resource://file/session/<session>/<path>` address.
 *
 * A percent-encoded path is decoded once; a raw one is used as-is. An address
 * this cannot read yields undefined, and the body then says so rather than
 * guessing at a path.
 * @param {unknown} address - the tab's content address.
 * @returns {{ sessionId: string, path: string } | undefined} the session and path.
 */
export function parseFileAddress(address) {
  if (typeof address !== 'string' || !address.startsWith(PREFIX)) return undefined
  const tail = address.slice(PREFIX.length)
  if (!tail.startsWith('session/')) return undefined
  const rest = tail.slice('session/'.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return undefined
  const sessionId = rest.slice(0, slash)
  const raw = rest.slice(slash + 1)
  if (raw === '') return undefined
  try {
    return { sessionId, path: decodeURIComponent(raw) }
  } catch {
    return { sessionId, path: raw }
  }
}
