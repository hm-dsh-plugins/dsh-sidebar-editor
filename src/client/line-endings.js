/**
 * Line endings, as the file has them and as the editor writes them.
 *
 * CodeMirror stores a document as lines either way, so a save has to decide what
 * to put between them. That decision belongs to the file, not to the platform:
 * a CRLF file edited on Windows and saved must still be CRLF, and opening a
 * file must not silently normalize it.
 */

export const LF = '\n'
export const CRLF = '\r\n'
export const CR = '\r'

/** The separators CodeMirror itself splits a string document on. */
export const LINE_BREAK = /\r\n?|\n/

/**
 * The line ending a file is written back with.
 *
 * Detection is by majority, which keeps a file with one stray ending from
 * flipping the whole document. All three separators CodeMirror recognizes are
 * candidates: a file that uses only `\r` is not a file without line endings, and
 * calling it LF would rewrite every one of its separators on the first save.
 * @param {string} text - the file as read from disk.
 * @returns {string} `'\r\n'`, `'\r'`, or `'\n'` — whichever dominates.
 */
export function detectLineEnding(text) {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charCodeAt(at)
    if (unit === 13) {
      if (text.charCodeAt(at + 1) === 10) {
        crlf += 1
        at += 1
      } else {
        cr += 1
      }
    } else if (unit === 10) {
      lf += 1
    }
  }
  // On a tie the ending that was already the default wins, so a file mixing
  // CRLF and LF by accident keeps the LF behaviour it had before CR existed
  // here. CR has to win outright to be selected: it is the rarest of the three.
  if (crlf > lf && crlf > cr) return CRLF
  if (cr > lf) return CR
  return LF
}

/**
 * The other ending, for the toggle's tooltip and its next value.
 *
 * The control only cycles LF and CRLF. CR is what a CR-only file arrives with,
 * and one click moves it to LF — after which the usual two-way toggle takes
 * over. Keeping CR on the cycle would put a CR-only file one careless click away
 * from every file edited from here on.
 * @param {string} ending - the current ending.
 * @returns {string} the alternative.
 */
export function otherEnding(ending) {
  if (ending === CR) return LF
  return ending === CRLF ? LF : CRLF
}

/**
 * How an ending is written in the interface.
 * @param {string} ending - the ending.
 * @returns {'CRLF' | 'LF' | 'CR'} the label.
 */
export function endingLabel(ending) {
  if (ending === CRLF) return 'CRLF'
  if (ending === CR) return 'CR'
  return 'LF'
}
