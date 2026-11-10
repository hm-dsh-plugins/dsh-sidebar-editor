/**
 * One file's editing state: what was read, what is on screen, what a save would
 * write, and whether the two still agree.
 *
 * This is the whole state machine of the body. The component above it only
 * wires refs and draws; nothing here touches markup.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { callHost } from './host-route.js'
import { LF, LINE_BREAK, detectLineEnding, otherEnding } from './line-endings.js'
import { documentListenerCompartment } from './editor-setup.js'

/** The states a save can be in, shared with the toolbar that reports them. */
export const SAVE = Object.freeze({ idle: 'idle', busy: 'busy', saved: 'saved', failed: 'failed', conflict: 'conflict' })

/**
 * Read, edit, and save one file.
 * @param {object} options - the file and the view showing it.
 * @param {{ sessionId: string, path: string } | undefined} options.file - decoded tab address.
 * @param {object} options.content - the owner's renderer-mode content (revision + callbacks).
 * @param {import('react').MutableRefObject<import('@codemirror/view').EditorView | null>} options.viewRef - the live view.
 * @param {import('react').RefObject<HTMLElement | null>} options.rootRef - the panel, for the save shortcut.
 * @returns {object} state (phase, failure, absolutePath, dirty, save, lineEnding)
 *   and actions (load, persist, toggleLineEnding).
 */
export function useFileDocument({ file, content, viewRef, rootRef }) {
  const [phase, setPhase] = useState('loading')
  const [failure, setFailure] = useState(undefined)
  const [absolutePath, setAbsolutePath] = useState(undefined)
  const [dirty, setDirty] = useState(false)
  const [save, setSave] = useState({ state: SAVE.idle, at: undefined })
  const [lineEnding, setLineEnding] = useState(/** @type {string} */ (LF))

  /** The document as loaded or last saved; `null` until a read has landed. */
  const baselineRef = useRef(/** @type {Text | null} */ (null))
  const versionRef = useRef(/** @type {string | undefined} */ (undefined))
  const dirtyRef = useRef(false)
  const saveRef = useRef(() => {})
  /** Whether the file arrived with a UTF-8 byte-order mark, so a save can keep it. */
  const bomRef = useRef(false)
  /** What a save would write now, and what the file on disk holds. */
  const lineEndingRef = useRef(LF)
  const baselineLineEndingRef = useRef(LF)

  // The owner's `content` object carries the callbacks the read reports through.
  // Held in a ref so `load` can stay keyed on the file itself: the object is
  // memoized upstream today, but depending on its identity would re-read the
  // file whenever that memo recomputed for an unrelated reason.
  const contentRef = useRef(content)
  useEffect(() => {
    contentRef.current = content
  })

  const revision = content?.kind === 'renderer' ? content.revision : 0

  /**
   * Recompute `dirty` from the document and the chosen line ending.
   *
   * The ending counts: switching it changes what a save would put on disk, so
   * the editor must not report the file as saved while the two disagree. Both
   * the document listener and the toggle call this.
   */
  const syncDirty = useCallback(() => {
    const view = viewRef.current
    const baseline = baselineRef.current
    if (view === null || baseline === null) return
    const next = !view.state.doc.eq(baseline) || lineEndingRef.current !== baselineLineEndingRef.current
    if (next !== dirtyRef.current) {
      dirtyRef.current = next
      setDirty(next)
    }
    if (next) setSave((current) => (current.state === SAVE.saved ? { state: SAVE.idle, at: undefined } : current))
  }, [viewRef])

  /**
   * Tell the view to report document changes.
   *
   * Installed as a compartment rather than baked into the view's creation, so
   * this hook can be called after the one that builds the view and still run
   * after it.
   */
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return undefined
    view.dispatch({
      effects: documentListenerCompartment.reconfigure(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) syncDirty()
        }),
      ),
    })
    return () => {
      if (viewRef.current === view) view.dispatch({ effects: documentListenerCompartment.reconfigure([]) })
    }
  }, [syncDirty, viewRef])

  /** Switch the ending this file is written with, without touching its text. */
  const toggleLineEnding = useCallback(() => {
    const next = otherEnding(lineEndingRef.current)
    lineEndingRef.current = next
    setLineEnding(next)
    syncDirty()
  }, [syncDirty])

  /**
   * Read the file and put it into the editor.
   *
   * A reload that arrives while the user has unsaved edits — the owner bumps its
   * revision when the file changes underneath the tab — must not throw those
   * edits away. It parks them in the same conflict state a refused save uses, so
   * the toolbar offers overwrite-or-reload and the choice stays with the user.
   * @param {AbortSignal} [signal] - cancellation.
   * @param {{ discardEdits?: boolean }} [options] - discard unsaved edits without asking.
   */
  const load = useCallback(
    async (signal, options) => {
      if (file === undefined) {
        setPhase('failed')
        setFailure({ code: 'unsupported-address', message: 'This tab does not address a workspace file.' })
        return
      }
      if (options?.discardEdits !== true && dirtyRef.current) {
        setSave({ state: SAVE.conflict, at: undefined })
        return
      }
      setPhase('loading')
      setFailure(undefined)
      try {
        const result = await callHost('read', { sessionId: file.sessionId, path: file.path }, signal)
        if (signal?.aborted === true) return
        versionRef.current = result.version
        bomRef.current = result.bom === true
        setSave({ state: SAVE.idle, at: undefined })
        setAbsolutePath(result.absolutePath)
        setPhase('ready')
        contentRef.current?.loaded?.(result.version)
        // The file keeps the ending it arrived with until the user says
        // otherwise, so a save rewrites the same bytes it read.
        const ending = detectLineEnding(result.text)
        lineEndingRef.current = ending
        baselineLineEndingRef.current = ending
        setLineEnding(ending)
        const view = viewRef.current
        // A reload whose text matches what the editor already holds is a no-op,
        // and dispatching it anyway would throw away the caret and the scroll
        // position for nothing — which is precisely what used to happen on save,
        // because the owner refreshes once the file's version moves. Comparing
        // documents rather than strings keeps a line-ending-only difference from
        // counting as a change; that is the toggle's business, not a reload's.
        if (view !== null && !view.state.doc.eq(Text.of(result.text.split(LINE_BREAK)))) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: result.text },
            selection: { anchor: 0 },
            scrollIntoView: true,
          })
        }
        // The baseline is the document as a `Text`, not the string that was
        // read: CodeMirror stores lines, and comparing texts is what lets the
        // dirty check run without rebuilding the file on every keystroke.
        baselineRef.current = view === null ? null : view.state.doc
        dirtyRef.current = false
        setDirty(false)
      } catch (error) {
        if (signal?.aborted === true) return
        setPhase('failed')
        setFailure({ code: error?.code ?? 'failed', message: error?.message ?? String(error) })
        contentRef.current?.failed?.()
      }
    },
    [file?.sessionId, file?.path, viewRef],
  )

  /** Write the current document back to disk. */
  const persist = useCallback(
    async (force) => {
      const view = viewRef.current
      // A save before the read landed would write an empty document over the
      // file: the view exists and is blank, and there is nothing to compare it
      // against. The button is disabled in that state, but Ctrl+S is not a
      // button, so the refusal has to live here.
      if (view === null || file === undefined || baselineRef.current === null) return
      setSave({ state: SAVE.busy, at: undefined })
      // The document being written, kept so the comparison after the round trip
      // is against what actually reached disk: keystrokes made while the save is
      // in flight must stay dirty, not be silently counted as saved.
      const sent = view.state.doc
      const sentEnding = lineEndingRef.current
      try {
        const result = await callHost('write', {
          sessionId: file.sessionId,
          path: file.path,
          text: sent.sliceString(0, sent.length, sentEnding),
          expectedVersion: versionRef.current,
          force: force === true,
          bom: bomRef.current,
        })
        versionRef.current = result.version
        // Tell the owner the editor is showing this version now. Without it the
        // owner still holds the pre-save version, sees the file move on disk,
        // and reloads the preview underneath the user right after every save.
        contentRef.current?.loaded?.(result.version)
        baselineRef.current = sent
        baselineLineEndingRef.current = sentEnding
        const stillDirty = !view.state.doc.eq(sent) || lineEndingRef.current !== sentEnding
        dirtyRef.current = stillDirty
        setDirty(stillDirty)
        setAbsolutePath(result.absolutePath)
        setFailure(undefined)
        // Typing during the round trip leaves the document ahead of the file on
        // disk. Reporting 「已保存」 here would be a lie the save button itself
        // contradicts, so that case falls back to the unsaved state.
        setSave(stillDirty ? { state: SAVE.idle, at: undefined } : { state: SAVE.saved, at: new Date() })
      } catch (error) {
        if (error?.code === 'version-conflict') {
          setSave({ state: SAVE.conflict, at: undefined })
          return
        }
        setFailure({ code: error?.code ?? 'failed', message: error?.message ?? String(error) })
        setSave({ state: SAVE.failed, at: new Date() })
      }
    },
    [file?.sessionId, file?.path, viewRef],
  )

  // Assigned after commit rather than during render, so the Ctrl+S listener can
  // read the current save without being re-attached on every render.
  useEffect(() => {
    saveRef.current = persist
  }, [persist])

  // Ctrl/Cmd+S saves whenever the focus is anywhere in this panel — in the
  // editor, or on a toolbar button a click just landed on. Listening on the
  // editor alone made the shortcut go dead after any toolbar click, and left
  // the browser's own save dialog to answer instead. Scoped to the panel, it
  // still stays out of the rest of the application's way.
  //
  // The handler swallows the shortcut even when `persist` declines to write:
  // during a load, or with nothing to save, the browser's save dialog is still
  // the wrong answer.
  useEffect(() => {
    const host = rootRef.current
    if (host === null) return undefined
    const onKey = (event) => {
      if (event.key !== 's' && event.key !== 'S') return
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      event.stopPropagation()
      void saveRef.current(false)
    }
    host.addEventListener('keydown', onKey, true)
    return () => host.removeEventListener('keydown', onKey, true)
    // `phase` re-attaches after the panel element changes between the failure
    // view and the editor view.
  }, [phase, rootRef])

  // Read on mount, and again whenever the owner bumps its revision — the two
  // things that define which file at which version this body is showing.
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, revision])

  return { phase, failure, absolutePath, dirty, save, lineEnding, toggleLineEnding, load, persist }
}
