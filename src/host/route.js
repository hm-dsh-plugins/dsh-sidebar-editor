/**
 * The route's request dispatch: validate the envelope, resolve the target,
 * then run the one action the body names.
 *
 * The action travels in the body rather than as a path segment because
 * Connection's Fetch registry is an exact-path table: a route is looked up with
 * `map.get(pathname)`, so a registered prefix would never see its sub-paths and
 * every `…/read` request would fall through to the SPA's 404.
 */

import { MAX_BODY_BYTES, describe, failure, readJson } from './protocol.js'
import { readText, writeText } from './text-file.js'
import { resolveTarget } from './workspace-path.js'

/**
 * Answer one editor request.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {Request} request - incoming request.
 * @returns {Promise<Response>} the JSON response.
 */
export async function handle(ctx, request) {
  const decoded = await readJson(request, MAX_BODY_BYTES)
  if (decoded.code !== undefined) return failure(decoded.code, decoded.message)

  const body = decoded.value
  const action = body.action

  const resolved = await resolveTarget(ctx, body)
  if (resolved.code !== undefined) return failure(resolved.code, resolved.message)
  const target = resolved.target

  try {
    if (action === 'read') {
      const result = await readText(target)
      return result.code === undefined ? Response.json(result.value) : failure(result.code, result.message)
    }

    if (action === 'write') {
      if (typeof body.text !== 'string') {
        return failure('bad-request', 'text must be a string.')
      }
      const result = await writeText(target, body.text, body.expectedVersion, body.force, body.bom)
      return result.code === undefined ? Response.json(result.value) : failure(result.code, result.message)
    }

    return failure('unknown-action', `Unknown editor action ${JSON.stringify(action)}.`)
  } catch (error) {
    return failure('io-error', describe(error))
  }
}
