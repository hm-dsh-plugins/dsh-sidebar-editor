/**
 * The editable document body.
 *
 * It registers as one alternative renderer for text-bearing files, so the
 * preview's own read-only viewers stay in place and the user picks the editor
 * from the same renderer menu they already use. Nothing here reaches into the
 * preview package: the body receives the standard document owner props, reads
 * the file through this plugin's own Host route, and writes it back the same
 * way.
 *
 * The file's path is deliberately *not* repeated in the toolbar: the preview's
 * own header already shows it, and the tab title carries the file name. What is
 * left here is only what the header cannot say — the language, whether the
 * document is saved, its line ending, and the two actions.
 *
 * Behaviour lives in two hooks beside this file: `use-code-editor.js` owns the
 * CodeMirror view, `use-file-document.js` owns the file's state. This component
 * wires them together and draws.
 */

import { createElement, useEffect, useMemo, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { parseFileAddress } from './address.js'
import { languageForName } from './languages.js'
import { endingLabel, otherEnding } from './line-endings.js'
import { useAppTheme, useEditorStyles, useUiLanguage } from './editor-setup.js'
import { useCodeEditor } from './use-code-editor.js'
import { SAVE, useFileDocument } from './use-file-document.js'
import { MAX_TEXT_MIB, fill, strings } from './copy.js'

/**
 * The editor body.
 * @param {object} props - the standard document body props supplied by the preview's slot.
 * @returns {import('react').ReactElement} the rendered editor.
 */
export function EditorBody(props) {
  const { resourceAddress, content, wrap, scrollportRef, setResources, useTabInfo } = props
  const uiLanguage = useUiLanguage()
  const t = useMemo(() => strings(), [uiLanguage])
  useEditorStyles()

  const file = useMemo(() => parseFileAddress(resourceAddress), [resourceAddress])
  // The slot always supplies this reader; the fallback keeps the call site
  // unconditional so the hook order cannot depend on whether it arrived.
  const readTabInfo = useTabInfo ?? (() => undefined)
  const navigation = readTabInfo()?.tab?.navigation
  const language = useMemo(() => (file === undefined ? {} : languageForName(file.path)), [file?.path])

  const rootRef = useRef(null)
  const containerRef = useRef(null)

  const dark = useAppTheme()
  // The view must exist before the document hook's effects run, so this call
  // comes first: its mount effect builds the view, and the document hook then
  // attaches its change listener to it.
  const viewRef = useCodeEditor({ containerRef, language, wrap, dark })
  const doc = useFileDocument({ file, content, viewRef, rootRef })

  // The preview owns the dependency set and clears it whenever the chosen
  // renderer changes, so one declaration on mount is enough.
  useEffect(() => {
    setResources([])
  }, [setResources])

  // Follow line navigation delivered by the Sidebar, once there is a document to
  // move the caret in.
  const line = navigation?.params !== undefined && typeof navigation.params.line === 'number' ? navigation.params.line : undefined
  useEffect(() => {
    const view = viewRef.current
    if (view === null || line === undefined || line < 1) return
    const clamped = Math.min(line, view.state.doc.lines)
    const target = view.state.doc.line(clamped)
    view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
    view.focus()
  }, [line, navigation?.revision, doc.phase, viewRef])

  const failed = doc.phase === 'failed' && doc.failure !== undefined
  const status = describeStatus(t, doc)

  // The editor container stays mounted through a failed open. Unmounting it
  // would take the CodeMirror view's host element with it while the view itself
  // lives on, so a retry would have nothing to render into: the panel came back
  // empty and stayed empty.
  const editorHost = createElement('div', {
    key: 'editor',
    className: 'dsh-editor-cm',
    ref: (node) => {
      containerRef.current = node
      scrollportRef?.(node)
    },
    'data-hidden': failed ? 'true' : undefined,
  })

  if (failed) {
    const binary = doc.failure.code === 'not-text'
    const huge = doc.failure.code === 'too-large'
    return createElement(
      'div',
      { className: 'dsh-editor-root', ref: rootRef },
      createElement(
        'div',
        { key: 'bar', className: 'dsh-editor-bar' },
        createElement(
          'span',
          { className: 'dsh-editor-status', 'data-tone': 'error' },
          binary ? t.binaryTitle : huge ? t.hugeTitle : t.failedTitle,
        ),
      ),
      createElement(
        'div',
        { key: 'notice', className: 'dsh-editor-notice' },
        createElement('p', null, binary ? t.binaryBody : huge ? fill(t.hugeBody, { limit: String(MAX_TEXT_MIB) }) : doc.failure.message),
        createElement(
          'div',
          { className: 'dsh-editor-notice-actions' },
          createElement(
            'button',
            { type: 'button', className: 'dsh-editor-button', onClick: () => void doc.load(undefined, { discardEdits: true }) },
            t.retry,
          ),
        ),
      ),
      editorHost,
    )
  }

  const canSave = doc.save.state !== SAVE.busy && (doc.dirty || doc.save.state === SAVE.conflict || doc.save.state === SAVE.failed)

  return createElement(
    'div',
    { className: 'dsh-editor-root', ref: rootRef },
    createElement(
      'div',
      { key: 'bar', className: 'dsh-editor-bar' },
      language.label !== undefined ? createElement('span', { className: 'dsh-editor-chip' }, language.label) : null,
      createElement('span', { className: 'dsh-editor-status', 'data-tone': status.tone }, status.text),
      // Pushes the actions to the far end, so the bar reads left-to-right as
      // "what this file is" then "what I can do to it".
      createElement('span', { className: 'dsh-editor-spacer' }),
      createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-editor-button',
          'data-eol': endingLabel(doc.lineEnding).toLowerCase(),
          title: fill(t.eolTitle, { current: endingLabel(doc.lineEnding), next: endingLabel(otherEnding(doc.lineEnding)) }),
          onClick: doc.toggleLineEnding,
        },
        endingLabel(doc.lineEnding),
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-editor-button',
          disabled: !doc.dirty || doc.save.state === SAVE.busy,
          title: t.revert,
          onClick: () => void doc.load(undefined, { discardEdits: true }),
        },
        t.revert,
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-editor-button',
          'data-primary': 'true',
          disabled: !canSave,
          onClick: () => void doc.persist(false),
        },
        t.save,
      ),
    ),
    doc.save.state === SAVE.conflict
      ? createElement(
          'div',
          { key: 'conflict', className: 'dsh-editor-conflict' },
          createElement('span', null, t.conflict),
          createElement('button', { type: 'button', className: 'dsh-editor-button', onClick: () => void doc.persist(true) }, t.conflictSave),
          createElement(
            'button',
            { type: 'button', className: 'dsh-editor-button', onClick: () => void doc.load(undefined, { discardEdits: true }) },
            t.conflictReload,
          ),
        )
      : null,
    // A refused save has to say why: the full notice only covers a failed open,
    // so without this the toolbar would just read 「保存失败」 and stop there.
    doc.save.state === SAVE.failed && doc.failure !== undefined
      ? createElement('div', { key: 'alert', className: 'dsh-editor-alert' }, fill(t.saveFailedDetail, { message: doc.failure.message }))
      : null,
    editorHost,
  )
}

/**
 * The status line's words and tone.
 * @param {ReturnType<typeof strings>} t - the active dictionary.
 * @param {ReturnType<typeof useFileDocument>} doc - the file's state.
 * @returns {{ tone: string, text: string }} what to paint.
 */
function describeStatus(t, doc) {
  if (doc.phase === 'loading') return { tone: 'ok', text: t.loading }
  if (doc.save.state === SAVE.busy) return { tone: 'dirty', text: t.saving }
  if (doc.save.state === SAVE.failed) return { tone: 'error', text: t.saveFailed }
  if (doc.save.state === SAVE.saved) return { tone: 'saved', text: fill(t.savedAt, { time: doc.save.at?.toLocaleTimeString?.() ?? '' }) }
  if (doc.dirty) return { tone: 'dirty', text: t.dirty }
  return { tone: 'ok', text: t.saved }
}
