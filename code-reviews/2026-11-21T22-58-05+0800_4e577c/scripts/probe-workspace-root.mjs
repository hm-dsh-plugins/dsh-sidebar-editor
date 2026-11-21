/**
 * Probe: is the workspace fence correct when the Session's workspace is a
 * Windows drive root (`C:\`)?
 *
 * `contains()` strips a trailing separator from the root, so `C:\` becomes
 * `C:`, which is not a prefix of `C:\work\a.txt` and is not equal to it.
 * Every file in that workspace is then refused.
 *
 * Run: node code-reviews/<round>/scripts/probe-workspace-root.mjs
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const { contains, resolveTarget } = await import(
  pathToFileURL(join(root, 'lib', 'host', 'workspace-path.js')).href
)

console.log('platform:', process.platform)
console.log("contains('C:\\\\work', 'C:\\\\work\\\\a.txt') =", contains('C:\\work', 'C:\\work\\a.txt'), '(expected true)')
console.log("contains('C:\\\\', 'C:\\\\work\\\\a.txt') =", contains('C:\\', 'C:\\work\\a.txt'), '(expected true)')
console.log("contains('C:\\\\', 'C:\\\\') =", contains('C:\\', 'C:\\'), '(expected true, the root itself)')
console.log("contains('\\\\\\\\server\\\\share\\\\', '\\\\\\\\server\\\\share\\\\a.txt') =",
  contains('\\\\server\\share\\', '\\\\server\\share\\a.txt'), '(expected true)')

if (process.platform === 'win32') {
  const ctx = {
    sessions: { get: () => ({ header: { cwd: 'C:\\' } }) },
    get: () => undefined,
  }
  const resolved = await resolveTarget(ctx, { sessionId: 'probe', path: 'work\\a.txt' })
  console.log('resolveTarget for a file under a drive-root workspace:', resolved)
}
