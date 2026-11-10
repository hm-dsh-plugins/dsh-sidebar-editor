/**
 * How a CodeMirror view is configured for this editor.
 *
 * Three things live here, because they are the view's own concerns: the base
 * extension list, the compartments that let language / wrapping / theme / the
 * document listener change without rebuilding the view, and the two small hooks
 * that tie the app's theme and stylesheet to the editor.
 */

import { useLayoutEffect, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EDITOR_CSS, editorLayout, editorTheme } from './editor-theme.js'
import { activeLanguage } from './copy.js'

/** The plugin's identity, used for the stylesheet tag and error messages. */
export const EDITOR_ID = 'dsh-sidebar-editor'

/**
 * Settings the view reconfigures in place.
 *
 * Rebuilding the view to change a language or a theme would lose the caret, the
 * scroll position, and the undo history; a compartment swaps just that slice.
 */
export const languageCompartment = new Compartment()
export const wrapCompartment = new Compartment()
export const darkCompartment = new Compartment()
export const documentListenerCompartment = new Compartment()

/**
 * The editor's base configuration: everything that never changes for the life
 * of a mounted body. Language, wrapping, theme, and the document listener are
 * compartments and start empty here.
 * @returns {import('@codemirror/state').Extension[]} the extension list.
 */
export function baseExtensions() {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: false }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    editorTheme,
    editorLayout,
    documentListenerCompartment.of([]),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ]
}

/**
 * Whether the interface is painting a dark theme.
 *
 * `color-scheme` is what the app's theme actually publishes; the media query is
 * only the fallback for a host that sets neither.
 * @returns {boolean} true for dark.
 */
export function isDark() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const scheme = getComputedStyle(document.documentElement).colorScheme
    if (scheme.includes('dark')) return true
    if (scheme.includes('light')) return false
  } catch {
    /* fall through to the media query */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

/**
 * Follow the application theme while the body is mounted.
 * @returns {boolean} whether the interface is dark right now.
 */
export function useAppTheme() {
  const [dark, setDark] = useState(() => isDark())

  useLayoutEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => setDark(isDark())
    media?.addEventListener?.('change', onChange)
    return () => {
      observer.disconnect()
      media?.removeEventListener?.('change', onChange)
    }
  }, [])

  return dark
}

/** Inject the plugin's stylesheet once per document. */
export function useEditorStyles() {
  useLayoutEffect(() => {
    const id = `${EDITOR_ID}/editor.css`
    if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return
    const tag = document.createElement('style')
    tag.dataset.plugin = EDITOR_ID
    tag.dataset.pluginCss = id
    tag.textContent = EDITOR_CSS
    document.head.appendChild(tag)
  }, [])
}

/**
 * Follow the application language while the body is mounted.
 *
 * A body that read the dictionary once at mount kept showing the language the
 * page opened with, even after the interface switched. The dictionary is chosen
 * from `document.documentElement.lang`, so that attribute is what to watch.
 * @returns {'zh' | 'en'} the language the interface is using right now.
 */
export function useUiLanguage() {
  const [language, setLanguage] = useState(() => activeLanguage())

  useLayoutEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined
    const observer = new MutationObserver(() => setLanguage(activeLanguage()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])

  return language
}
