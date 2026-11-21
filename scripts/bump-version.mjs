/**
 * Move the package version to today's dated form.
 *
 * The version is `yyyy.MM.dd-x`, where `x` counts the releases shipped that day:
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

/** This script's own package root, used when no other directory is named. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The dated version shape this script maintains. */
const DATED = /^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/

/**
 * The day an instant falls on, in the local time zone.
 * @param {Date} [now] - the instant; defaults to now.
 * @returns {string} `yyyy.MM.dd`.
 */
export function today(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
}

/**
 * The version that follows `current` on `day`.
 * @param {string} current - the version now in the manifest.
 * @param {string} day - today, as `today()` returns it.
 * @returns {string} the next version.
 */
export function nextVersion(current, day) {
  const matched = DATED.exec(current)
  const build = matched !== null && `${matched[1]}.${matched[2]}.${matched[3]}` === day
    ? Number(matched[4]) + 1
    : 1
  return `${day}-${build}`
}

/**
 * Bump one package's version, manifest and lock file together.
 *
 * Both files are read and parsed before either is written: an unreadable lock
 * file must fail without leaving the manifest one build ahead — the number would
 * be spent, and `npm ci` would refuse the mismatch.
 * @param {string} [root] - the package directory; defaults to this script's.
 * @returns {Promise<string>} the new version.
 */
export async function bumpVersion(root = ROOT) {
  const manifestPath = join(root, 'package.json')
  const lockPath = join(root, 'package-lock.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`${manifestPath} has no version to bump.`)
  }
  const version = nextVersion(manifest.version, today())
  manifest.version = version
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  // The lock file states the package's own version twice, and a lock that
  // disagrees with its manifest makes `npm ci` refuse to run.
  lock.version = version
  if (lock.packages?.[''] !== undefined) lock.packages[''].version = version
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  return version
}

// Only when run as a program: importing this module must not rewrite anything.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await bumpVersion())
}
