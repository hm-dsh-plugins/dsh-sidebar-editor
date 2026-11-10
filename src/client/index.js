/**
 * Browser half of `dsh-file-editor`.
 *
 * It contributes one more renderer to the right Sidebar's document preview:
 * an editable CodeMirror view offered next to the shipped read-only viewers.
 * The preview's own renderers are untouched, and the user chooses the editor
 * from the renderer menu they already use — so a picture, a PDF, or a
 * spreadsheet still opens as itself.
 *
 * The declared suffixes are the editor's own language table plus the extra
 * plain-text shapes worth editing. A file whose suffix no renderer claims still
 * reaches the shipped plain-text preview, which is unchanged.
 */

import { EditorBody } from './EditorBody.js'
import { KNOWN_SUFFIXES } from './languages.js'
import { strings } from './copy.js'

/** This implementation's identity in the document-preview registry. */
const ID = 'dsh-file-editor'

/** One more alternative for every suffix the editor can highlight. */
const EXTENSIONS = [
  ...KNOWN_SUFFIXES,
  // Plain-text shapes with no dedicated grammar: still worth a real editor.
  'txt',
  'text',
  'log',
  'csv',
  'tsv',
  'list',
  'lock',
  'gitignore',
  'gitattributes',
  'npmrc',
  'nvmrc',
  'babelrc',
  'eslintrc',
  'prettierrc',
  'stylelintrc',
  'browserslistrc',
  'sublime-project',
  'sublime-settings',
]

export const name = ID

/**
 * The client services this plugin reaches for.
 *
 * `documentPreviews` must be injected, not merely used: cordis resolves a
 * service on `ctx` only for fibers that declare it, and an undeclared read
 * throws `cannot get property "documentPreviews" without inject` — which fails
 * the whole client entry. Declaring it also makes load order irrelevant: the
 * fiber waits in `pending` until the preview package provides the registry.
 */
export const inject = ['slots', 'documentPreviews']

/**
 * Client plugin body: register the renderer metadata and its body.
 * @param ctx - the client root context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.documentPreviews.register({
        id: ID,
        extensions: EXTENSIONS,
        // No `priority` means the `extension` band, so this counts as a plugin
        // renderer: for a text file it becomes the renderer shown first, and the
        // shipped read-only viewers stay selectable beside it.
        title: () => strings().title,
        loading: 'renderer',
        wrap: true,
      }),
    `${ID}: renderer metadata`,
  )

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.tab.document', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.tab.document',
            key: ID,
          },
          EditorBody,
        ),
      ),
    `${ID}: editor body`,
  )
}
