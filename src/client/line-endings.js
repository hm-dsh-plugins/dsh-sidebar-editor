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

/** The separators CodeMirror itself splits a string document on. */
export const LINE_BREAK = /\r\n?|\n/

/**
 * The line ending a file is written back with.
 *
 * Detection is by majority, which keeps a file with one stray ending from
 * flipping the whole document.
 * @param {string} text - the file as read from disk.
 * @returns {string} `'\r\n'` when CRLF dominates, `'\n'` otherwise.
 */
export function detectLineEnding(text) {
  let crlf = 0
  let lf = 0
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    if (at > 0 && text[at - 1] === '\r') crlf += 1
    else lf += 1
  }
  return crlf > lf ? CRLF : LF
}

/**
 * The other ending, for the toggle's tooltip and its next value.
 * @param {string} ending - the current ending.
 * @returns {string} the alternative.
 */
export function otherEnding(ending) {
  return ending === CRLF ? LF : CRLF
}

/**
 * How an ending is written in the interface.
 * @param {string} ending - the ending.
 * @returns {'CRLF' | 'LF'} the label.
 */
export function endingLabel(ending) {
  return ending === CRLF ? 'CRLF' : 'LF'
}
