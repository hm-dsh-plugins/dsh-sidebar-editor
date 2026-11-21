/**
 * Move the package version to today's dated form.
 *
 * The version is `yyyy.MM.dd-x`, where `x` counts the builds shipped that day:
 * the first release of 2026-11-21 is `2026.11.21-1`, the next one
 * `2026.11.21-2`, and the first release of the following day starts over at
 * `2026.11.22-1`. A version that already carries today's date is incremented;
 * anything else — an older date, or a version from before this scheme — starts
 * that day's count at 1.
 *
 * Run by hand before a release (`npm run bump`), never from `build`: rebuilding
 * is not shipping, and a build that rewrote `package.json` would leave every
 * working tree dirty and burn a number on every local `npm run build`.
 *
 * The date is local, not UTC: the count belongs to the day the person shipping
 * is living in.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The dated version shape this script maintains. */
const DATED = /^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/

/**
 * Today in the local time zone.
 * @returns {string} `yyyy.MM.dd`.
 */
function today() {
  const at = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())}`
}

const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const day = today()
const matched = DATED.exec(manifest.version)
const build = matched !== null && `${matched[1]}.${matched[2]}.${matched[3]}` === day
  ? Number(matched[4]) + 1
  : 1
const version = `${day}-${build}`

manifest.version = version
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

// The lock file states the package's own version in two places, and a lock that
// disagrees with its manifest makes `npm ci` refuse to run.
const lockPath = join(root, 'package-lock.json')
const lock = JSON.parse(await readFile(lockPath, 'utf8'))
lock.version = version
if (lock.packages?.[''] !== undefined) lock.packages[''].version = version
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')

console.log(version)
