/**
 * The browser end of the Host route.
 *
 * One function, because every action is the same request: POST JSON to one
 * exact path, with the action in the body. Keeping the transport here means the
 * editor component never spells a URL or interprets an HTTP status.
 */

/** The one Host route this plugin owns; see `src/host/protocol.js`. */
export const ROUTE = 'api/plugins/dsh-file-editor'

/**
 * Call the editor route on the Host.
 * @param {'read' | 'write' | 'stat'} action - which operation to run.
 * @param {Record<string, unknown>} body - the operation's own payload.
 * @param {AbortSignal} [signal] - cancellation.
 * @returns {Promise<any>} the decoded result; a failure rejects with a `code` property.
 */
export async function callHost(action, body, signal) {
  const response = await fetch(new URL(ROUTE, document.baseURI).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
    credentials: 'same-origin',
    signal,
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    throw Object.assign(new Error(`HTTP ${response.status}`), { code: 'bad-response' })
  }
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message ?? `HTTP ${response.status}`), { code: payload?.code ?? 'http-error' })
  }
  return payload
}
