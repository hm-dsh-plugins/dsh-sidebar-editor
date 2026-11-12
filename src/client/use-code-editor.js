/**
 * Owning one CodeMirror view for as long as the body is mounted.
 *
 * The view is built once — everything that changes later goes through a
 * compartment — so the caret, the scroll position, and the undo history survive
 * a language change, a wrap toggle, or the application switching theme.
 */

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions, darkCompartment, isDark, languageCompartment, wrapCompartment } from './editor-setup.js'
import { rememberScroll } from './scroll-memory.js'

/**
 * Create and maintain the editor view.
 * @param {object} options - what the view is configured from.
 * @param {import('react').RefObject<HTMLElement | null>} options.containerRef - element the view mounts into.
 * @param {{ sessionId: string, path: string } | undefined} options.file - the file this body shows.
 * @param {{ extension?: import('@codemirror/state').Extension }} options.language - the file's syntax, when known.
 * @param {boolean} options.wrap - the preview's wrap preference.
 * @param {boolean} options.dark - whether the interface is dark.
 * @returns {import('react').MutableRefObject<EditorView | null>} the live view, or null.
 */
export function useCodeEditor({ containerRef, file, language, wrap, dark }) {
  const viewRef = useRef(null)
  // The scroll listener outlives this render, and a body can be handed another
  // file without being rebuilt, so the listener reads the file from a ref.
  const fileRef = useRef(file)
  useEffect(() => {
    fileRef.current = file
  })

  // Build the view once; every later change is a dispatch, never a rebuild.
  useEffect(() => {
    const host = containerRef.current
    if (host === null || viewRef.current !== null) return undefined
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '',
        extensions: [
          ...baseExtensions(),
          languageCompartment.of(language.extension ?? []),
          wrapCompartment.of(wrap === true ? EditorView.lineWrapping : []),
          darkCompartment.of(EditorView.darkTheme.of(isDark())),
        ],
      }),
    })
    viewRef.current = view
    // Remember the position as it changes, so closing the tab — or switching to
    // another tab — is enough to keep it; nothing has to run at teardown.
    // A hidden view reports no scrollport, and the browser then resets its
    // scroll offset to zero: recording that would forget the real position.
    const onScroll = () => {
      const current = fileRef.current
      if (current === undefined || view.scrollDOM.clientHeight === 0) return
      rememberScroll(current.sessionId, current.path, view.scrollDOM.scrollTop)
    }
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll)
      onScroll()
      viewRef.current = null
      view.destroy()
    }
    // One view per mounted body; language, wrap, and theme are compartments.
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({ effects: languageCompartment.reconfigure(language.extension ?? []) })
  }, [language.extension])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({ effects: wrapCompartment.reconfigure(wrap === true ? EditorView.lineWrapping : []) })
  }, [wrap])

  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({ effects: darkCompartment.reconfigure(EditorView.darkTheme.of(dark)) })
  }, [dark])

  return viewRef
}
