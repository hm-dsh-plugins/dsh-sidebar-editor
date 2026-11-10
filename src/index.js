/**
 * Host half of `dsh-sidebar-editor`.
 *
 * The web client's document preview is read-only by construction: the
 * `workspaceFiles` Remote namespace exposes no mutation operation at all. This
 * plugin adds the one capability an editor needs — an authenticated,
 * workspace-confined text read/write route on the shared `/api` channel — and
 * nothing else. The browser half owns every piece of UI.
 *
 * This file is only the wiring. The route's contract lives in
 * [`host/protocol.js`](host/protocol.js), its dispatch in
 * [`host/route.js`](host/route.js), path confinement in
 * [`host/workspace-path.js`](host/workspace-path.js), and the file operations
 * themselves in [`host/text-file.js`](host/text-file.js).
 */

import { ROUTE_PATH } from './host/protocol.js'
import { handle } from './host/route.js'

const NAME = 'dsh-sidebar-editor'

export const name = NAME

/** The route needs the shared API channel and the Session store that scopes paths. */
export const inject = ['connection', 'sessions']

/**
 * Install the editor's file route on the shared `/api` channel.
 *
 * One exact path, with the action in the body: Connection's Fetch registry
 * resolves a request by exact pathname, so there is no prefix form to hang
 * per-action sub-paths off.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handle(ctx, request),
      }),
    `${NAME}: file route`,
  )
}
