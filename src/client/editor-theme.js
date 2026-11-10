/**
 * Editor chrome: the DSH design tokens applied to CodeMirror, plus the small
 * amount of layout CSS the body needs.
 *
 * The editor paints with the application's own custom properties
 * (`--dsw-alias-*`), so it follows the active theme with no JavaScript theme
 * switching and no second source of colour truth. Each use names a literal
 * fallback, because a token that ever disappears should degrade to something
 * legible rather than to nothing.
 */

import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/** Token reference with a light-mode fallback. */
const token = (name, fallback) => `var(${name}, ${fallback})`

const BG = token('--dsw-alias-bg-base', '#ffffff')
const FG = token('--dsw-alias-label-primary', '#1f1f1f')
const MUTED = token('--dsw-alias-label-tertiary', token('--dsw-alias-label-secondary', '#6b6b6b'))
const BORDER = token('--dsw-alias-border-l2', 'rgba(127,127,127,0.28)')
const SURFACE = token('--dsw-alias-bg-layer-2', token('--dsw-alias-bg-layer-1', '#f6f6f6'))
const ACCENT = token('--dsw-alias-state-business-primary', '#4d6bfe')
const DANGER = token('--dsw-alias-state-error-primary', '#d92c20')
const WARN = token('--dsw-alias-state-warn-primary', '#c47f00')
const OK = token('--dsw-alias-state-success-primary', '#1f9d55')

/** The editor's own layout and colour rules, scoped to `.dsh-editor`. */
export const EDITOR_CSS = `
.dsh-editor-root { display: flex; flex-direction: column; height: 100%; min-height: 0; background: ${BG}; color: ${FG}; }
.dsh-editor-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid ${BORDER}; background: ${SURFACE}; flex: none; flex-wrap: wrap; }
.dsh-editor-spacer { flex: 1 1 auto; }
.dsh-editor-chip { font-size: 11px; line-height: 18px; padding: 0 7px; border-radius: 9px; border: 1px solid ${BORDER}; color: ${MUTED}; flex: none; }
.dsh-editor-status { font-size: 12px; line-height: 18px; flex: none; }
.dsh-editor-status[data-tone="dirty"] { color: ${WARN}; }
.dsh-editor-status[data-tone="error"] { color: ${DANGER}; }
.dsh-editor-status[data-tone="ok"] { color: ${MUTED}; }
.dsh-editor-status[data-tone="saved"] { color: ${OK}; }
.dsh-editor-button { font: inherit; font-size: 12px; line-height: 20px; padding: 2px 10px; border-radius: 6px; border: 1px solid ${BORDER}; background: transparent; color: ${FG}; cursor: pointer; flex: none; }
.dsh-editor-button:hover:not(:disabled) { border-color: ${ACCENT}; color: ${ACCENT}; }
.dsh-editor-button:disabled { opacity: .45; cursor: default; }
.dsh-editor-button[data-primary="true"] { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
.dsh-editor-button[data-primary="true"]:disabled { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
.dsh-editor-button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 1px; }
.dsh-editor-button[data-eol] { font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); letter-spacing: .02em; }
.dsh-editor-cm { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; }
.dsh-editor-cm[data-hidden="true"] { display: none; }
.dsh-editor-cm > .cm-editor { flex: 1 1 auto; min-height: 0; }
.dsh-editor-notice { margin: 0; padding: 14px; font-size: 13px; line-height: 1.7; color: ${MUTED}; }
.dsh-editor-notice strong { color: ${FG}; font-weight: 600; }
.dsh-editor-notice code { font-family: var(--dsh-font-mono, ui-monospace, Menlo, Consolas, monospace); font-size: 12px; }
.dsh-editor-notice-actions { display: flex; gap: 8px; margin-top: 12px; }
.dsh-editor-conflict { padding: 10px 12px; border-bottom: 1px solid ${BORDER}; background: color-mix(in srgb, ${WARN} 12%, transparent); color: ${FG}; font-size: 12.5px; line-height: 1.6; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-editor-alert { padding: 8px 12px; border-bottom: 1px solid ${BORDER}; background: color-mix(in srgb, ${DANGER} 12%, transparent); color: ${FG}; font-size: 12.5px; line-height: 1.6; }
`

/** CodeMirror theme bound to the DSH tokens. */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: FG,
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace)',
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': { padding: '10px 0', caretColor: FG },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: MUTED,
    border: 'none',
    borderRight: `1px solid ${BORDER}`,
  },
  '.cm-activeLine': { backgroundColor: `color-mix(in srgb, ${FG} 5%, transparent)` },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: FG },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: `color-mix(in srgb, ${ACCENT} 26%, transparent)`,
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: FG },
  '.cm-panels': { backgroundColor: SURFACE, color: FG },
  '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${BORDER}` },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-textfield': {
    fontFamily: 'inherit',
    fontSize: '12px',
    color: FG,
    backgroundColor: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    padding: '2px 6px',
    outline: 'none',
  },
  '.cm-panel.cm-search label': { color: MUTED, fontSize: '12px' },
  '.cm-searchMatch': { backgroundColor: `color-mix(in srgb, ${WARN} 35%, transparent)` },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)` },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
    outline: `1px solid ${BORDER}`,
  },
  '.cm-tooltip': { backgroundColor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '6px', color: FG },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: `color-mix(in srgb, ${ACCENT} 22%, transparent)`, color: FG },
})

/** Syntax colours, kept few and legible against either theme. */
const highlight = HighlightStyle.define([
  { tag: tags.comment, color: MUTED, fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: token('--dsw-alias-state-business-primary', '#7048e8') },
  { tag: [tags.string, tags.special(tags.string)], color: token('--dsw-alias-state-success-primary', '#1f7a45') },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: token('--dsw-alias-state-warn-primary', '#b35c00') },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: token('--dsw-alias-state-business-primary', '#2255cc') },
  { tag: [tags.typeName, tags.className, tags.namespace], color: token('--dsw-alias-state-warn-primary', '#9a6700') },
  { tag: [tags.propertyName, tags.attributeName], color: FG },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: FG },
  { tag: [tags.tagName], color: token('--dsw-alias-state-error-primary', '#c0392b') },
  { tag: [tags.heading, tags.strong], color: FG, fontWeight: '600' },
  { tag: [tags.link, tags.url], color: ACCENT, textDecoration: 'underline' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.meta, tags.processingInstruction], color: MUTED },
  { tag: [tags.invalid], color: DANGER, textDecoration: 'underline' },
])

/** The editor chrome extension: theme plus syntax highlighting. */
export const editorTheme = [theme, syntaxHighlighting(highlight)]

/** Transparent-scrollbar rules so the long line scrollport does not double up. */
export const editorLayout = EditorView.theme({
  '.cm-scroller::-webkit-scrollbar': { width: '10px', height: '10px' },
  '.cm-scroller::-webkit-scrollbar-thumb': { backgroundColor: BORDER, borderRadius: '5px' },
  '.cm-scroller::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
})
