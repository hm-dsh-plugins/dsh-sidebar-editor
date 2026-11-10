/**
 * Filename-to-language resolution for the editor.
 *
 * Two tiers, because CodeMirror has two kinds of grammar package and the lean
 * one covers far more file types:
 *
 * 1. A dedicated `@codemirror/lang-*` package, for the languages whose grammar
 *    is worth its bundle weight.
 * 2. A legacy stream parser from `@codemirror/legacy-modes`, for everything
 *    else. Those are regex tokenizers, so a few kilobytes each buys broad
 *    coverage.
 *
 * Everything is imported statically on purpose: the plugin ships as one
 * `client.js` served by the host's plugin route, and a code-split chunk would
 * have to be served from a path this package cannot rely on. A suffix with no
 * entry falls back to plain text, which is still fully editable.
 */

import { StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { c, cpp, java, csharp, kotlin, scala } from '@codemirror/legacy-modes/mode/clike'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { go } from '@codemirror/legacy-modes/mode/go'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { r } from '@codemirror/legacy-modes/mode/r'
import { julia } from '@codemirror/legacy-modes/mode/julia'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'
import { clojure } from '@codemirror/legacy-modes/mode/clojure'
import { erlang } from '@codemirror/legacy-modes/mode/erlang'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { cmake } from '@codemirror/legacy-modes/mode/cmake'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { protobuf } from '@codemirror/legacy-modes/mode/protobuf'
import { http } from '@codemirror/legacy-modes/mode/http'
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript'
import { fortran } from '@codemirror/legacy-modes/mode/fortran'
import { pascal } from '@codemirror/legacy-modes/mode/pascal'
import { tcl } from '@codemirror/legacy-modes/mode/tcl'
import { verilog } from '@codemirror/legacy-modes/mode/verilog'
import { elm } from '@codemirror/legacy-modes/mode/elm'
import { haxe } from '@codemirror/legacy-modes/mode/haxe'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { octave } from '@codemirror/legacy-modes/mode/octave'
import { jinja2 } from '@codemirror/legacy-modes/mode/jinja2'
import { vb } from '@codemirror/legacy-modes/mode/vb'

/**
 * @typedef {import('@codemirror/state').Extension} Extension
 */

/**
 * Suffix-to-language table. The suffix is the text after the last dot of the
 * final path segment, lowercased; a leading dot counts as the separator, so
 * `.env` resolves through `env`.
 */
const BY_SUFFIX = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', es6: 'javascript',
  jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'tsx',
  json: 'json', jsonc: 'json', json5: 'json', webmanifest: 'json',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'css', less: 'css',
  xml: 'xml', svg: 'xml', xsd: 'xml', xsl: 'xml', plist: 'xml', csproj: 'xml',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', pyi: 'python', pyw: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'powershell', cmd: 'powershell',
  ini: 'properties', cfg: 'properties', conf: 'properties', env: 'properties',
  properties: 'properties', editorconfig: 'properties', gitconfig: 'properties',
  toml: 'toml',
  dockerfile: 'dockerfile', containerfile: 'dockerfile',
  sql: 'sql',
  diff: 'diff', patch: 'diff',
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby',
  go: 'go',
  rs: 'rust',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  java: 'java',
  cs: 'csharp',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala', sc: 'scala',
  swift: 'swift',
  php: 'php', phtml: 'php',
  lua: 'lua',
  pl: 'perl', pm: 'perl',
  r: 'r',
  jl: 'julia',
  hs: 'haskell', lhs: 'haskell',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
  erl: 'erlang', hrl: 'erlang',
  cmake: 'cmake',
  nginx: 'nginx',
  proto: 'protobuf',
  http: 'http', rest: 'http',
  coffee: 'coffeescript',
  f: 'fortran', f90: 'fortran', f95: 'fortran', f03: 'fortran', for: 'fortran',
  pas: 'pascal', pp: 'pascal',
  tcl: 'tcl',
  v: 'verilog', sv: 'verilog', svh: 'verilog', vh: 'verilog',
  elm: 'elm',
  hx: 'haxe',
  groovy: 'groovy', gradle: 'groovy',
  m: 'octave',
  jinja: 'jinja', jinja2: 'jinja', j2: 'jinja',
  vb: 'vb', vbs: 'vb',
}

/**
 * Adapt one legacy CodeMirror 5 mode to CodeMirror 6's stream-parser contract.
 *
 * The mode objects already expose `token`, `startState`, and friends; this only
 * normalizes an absent `blankLine`.
 * @param {Record<string, any>} mode - a mode object from `@codemirror/legacy-modes/mode/*`.
 * @returns {Extension} the language extension.
 */
function legacy(mode) {
  const spec = {
    name: mode.name,
    startState: (indentUnit) => {
      const inner = typeof mode.startState === 'function' ? mode.startState(indentUnit) : {}
      return { inner }
    },
    copyState: (state) => {
      const inner = typeof mode.copyState === 'function' ? mode.copyState(state.inner) : state.inner
      return { inner }
    },
    token: (stream, state) => (typeof mode.token === 'function' ? (mode.token(stream, state.inner) ?? null) : null),
    blankLine: (state, indentUnit) => {
      if (typeof mode.blankLine === 'function') mode.blankLine(state.inner, indentUnit)
    },
  }
  if (typeof mode.indent === 'function') {
    spec.indent = (state, textAfter, context) => mode.indent(state.inner, textAfter, context)
  }
  if (mode.languageData !== undefined) spec.languageData = mode.languageData
  return StreamLanguage.define(spec)
}

/** Language extensions, built once and reused across every editor instance. */
const extensions = {
  javascript: javascript(),
  jsx: javascript({ jsx: true }),
  typescript: javascript({ typescript: true }),
  tsx: javascript({ jsx: true, typescript: true }),
  json: json(),
  html: html(),
  css: css(),
  xml: xml(),
  yaml: yaml(),
  markdown: markdown(),
  python: python(),
  shell: legacy(shell),
  properties: legacy(properties),
  toml: legacy(toml),
  dockerfile: legacy(dockerFile),
  sql: legacy(standardSQL),
  diff: legacy(diff),
  ruby: legacy(ruby),
  go: legacy(go),
  rust: legacy(rust),
  swift: legacy(swift),
  // PHP ships no stream mode; the C-like tokenizer still colours its braces,
  // strings, comments, and keywords usefully.
  php: legacy(c),
  lua: legacy(lua),
  perl: legacy(perl),
  r: legacy(r),
  julia: legacy(julia),
  haskell: legacy(haskell),
  clojure: legacy(clojure),
  erlang: legacy(erlang),
  powershell: legacy(powerShell),
  cmake: legacy(cmake),
  nginx: legacy(nginx),
  protobuf: legacy(protobuf),
  http: legacy(http),
  coffeescript: legacy(coffeeScript),
  fortran: legacy(fortran),
  pascal: legacy(pascal),
  tcl: legacy(tcl),
  verilog: legacy(verilog),
  elm: legacy(elm),
  haxe: legacy(haxe),
  groovy: legacy(groovy),
  octave: legacy(octave),
  jinja: legacy(jinja2),
  vb: legacy(vb),
  c: legacy(c),
  cpp: legacy(cpp),
  java: legacy(java),
  csharp: legacy(csharp),
  kotlin: legacy(kotlin),
  scala: legacy(scala),
}

/**
 * The suffix of a filename or path, lowercased.
 * @param {string} path - path or bare filename.
 * @returns {string | undefined} the suffix, or undefined when the name has none.
 */
export function suffixOf(path) {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const base = path.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? undefined : base.slice(dot + 1).toLowerCase()
}

/**
 * Resolve a path's syntax-highlighting extension.
 * @param {string} path - path or bare filename.
 * @returns {{ extension?: Extension, label?: string }} the extension plus its display label.
 */
export function languageFor(path) {
  const suffix = suffixOf(path)
  if (suffix === undefined) return {}
  const id = BY_SUFFIX[suffix]
  if (id === undefined) return {}
  return { extension: extensions[id], label: suffix }
}

/**
 * Resolve a well-known extensionless filename, which `languageFor` cannot see.
 * @param {string} path - path or bare filename.
 * @returns {{ extension?: Extension, label?: string }} the extension plus its display label.
 */
export function languageForName(path) {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const base = path.slice(slash + 1).toLowerCase()
  if (base === 'dockerfile' || base === 'containerfile') return { extension: extensions.dockerfile, label: 'dockerfile' }
  if (base === 'cmakelists.txt') return { extension: extensions.cmake, label: 'cmake' }
  if (base === 'makefile' || base === 'gnumakefile') return { extension: extensions.cmake, label: 'makefile' }
  return languageFor(path)
}

/** Every suffix this build recognizes, for the editor's extension claims. */
export const KNOWN_SUFFIXES = Object.keys(BY_SUFFIX)
