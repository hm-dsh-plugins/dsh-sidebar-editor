/**
 * Probe: `scripts/bump-version.mjs` behaviour at its edges.
 *
 * Copies the script and the two manifests into a scratch directory, then runs
 * the script there — the repository itself is never modified.
 *
 * Cases: same-day +1, another date restarts at 1, a pre-scheme version restarts
 * at 1, lock/manifest sync, and a missing lock file (what state is left behind).
 *
 * Run: node code-reviews/<round>/scripts/probe-bump-version.mjs
 */

import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function today() {
  const at = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())}`
}

/** Build a scratch checkout whose versions start at `version`. */
async function scratch(version, { lock = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-bump-probe-'))
  await mkdir(join(dir, 'scripts'))
  await copyFile(join(root, 'scripts', 'bump-version.mjs'), join(dir, 'scripts', 'bump-version.mjs'))
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  manifest.version = version
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  if (lock) {
    const lockText = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
    lockText.version = version
    lockText.packages[''].version = version
    await writeFile(join(dir, 'package-lock.json'), `${JSON.stringify(lockText, null, 2)}\n`, 'utf8')
  }
  return dir
}

async function versions(dir) {
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(join(dir, 'package-lock.json'), 'utf8'))
  return { manifest: manifest.version, lockTop: lock.version, lockRoot: lock.packages[''].version }
}

async function run(dir) {
  try {
    const out = execFileSync(process.execPath, [join(dir, 'scripts', 'bump-version.mjs')], { cwd: dir, encoding: 'utf8' })
    return { ok: true, out: out.trim() }
  } catch (error) {
    return { ok: false, stderr: String(error.stderr ?? error.message).split('\n').slice(0, 2).join(' | ') }
  }
}

const day = today()
console.log('today (local):', day)

const same = await scratch(`${day}-3`)
console.log('same day   :', await run(same), '->', await versions(same))

const older = await scratch('2026.01.02-9')
console.log('older date :', await run(older), '->', await versions(older))

const legacy = await scratch('0.2.0')
console.log('pre-scheme :', await run(legacy), '->', await versions(legacy))

const malformed = await scratch('2026.1.2-3')
console.log('unpadded   :', await run(malformed), '->', await versions(malformed))

// A lock file that is absent: the manifest is written first, the lock read
// second. What does the scratch checkout look like afterwards?
const noLock = await scratch(`${day}-7`, { lock: false })
const noLockRun = await run(noLock)
const manifestAfter = JSON.parse(await readFile(join(noLock, 'package.json'), 'utf8')).version
console.log('missing lock:', noLockRun, '-> package.json version is now', manifestAfter, '(was', `${day}-7`, ')')

for (const dir of [same, older, legacy, malformed, noLock]) await rm(dir, { recursive: true, force: true })
