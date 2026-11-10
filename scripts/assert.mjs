/**
 * The assertion helpers the two verify scripts share.
 *
 * `verify.mjs` and `dom.mjs` each run as their own process and print their own
 * section; this module owns the shape of one check and the closing tally, so a
 * failure reads the same wherever it came from.
 */

let checks = 0
let failures = 0

/**
 * Assert one condition.
 * @param {boolean} condition - the condition.
 * @param {string} label - what is being checked.
 * @param {unknown} [detail] - extra context on failure.
 */
export function ok(condition, label, detail) {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`)
}

/**
 * Assert deep equality.
 * @param {unknown} actual - observed value.
 * @param {unknown} expected - expected value.
 * @param {string} label - what is being checked.
 */
export function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label, { actual, expected })
}

/**
 * Print the closing tally, failing the process when any check did.
 * @param {string} subject - what the count describes, e.g. `checks` or `DOM checks`.
 */
export function report(subject) {
  console.log(`\n${checks - failures}/${checks} ${subject} passed`)
  if (failures > 0) {
    console.log(`${failures} FAILED`)
    process.exitCode = 1
  }
}
