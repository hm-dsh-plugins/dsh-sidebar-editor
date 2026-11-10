/**
 * Copy for the editor body, keyed by the interface language.
 *
 * Self-contained on purpose: the editor registers no locale namespace with the
 * client's locale service, which would make the whole plugin wait on that
 * service before it could load.
 */

const zh = {
  title: '编辑器',
  loading: '正在读取文件…',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  dirty: '未保存',
  conflict: '这个文件在我们读取之后被其他程序修改过。',
  conflictSave: '仍然覆盖',
  conflictReload: '重新载入',
  save: '保存',
  revert: '撤销改动',
  retry: '重试',
  binaryTitle: '这个文件看起来不是文本文件',
  binaryBody: '编辑器只打开 UTF-8 文本文件。你仍然可以用只读预览查看它。',
  hugeTitle: '这个文件太大了',
  hugeBody: '编辑器打开的文本文件上限是 {limit} MiB。',
  failedTitle: '无法打开这个文件',
  savedAt: '已保存 · {time}',
  saveFailedDetail: '保存失败：{message}',
  eolTitle: '行尾：{current}（点击改为 {next}）',
}

const en = {
  title: 'Editor',
  loading: 'Reading file…',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Save failed',
  dirty: 'Unsaved',
  conflict: 'This file changed on disk after the editor read it.',
  conflictSave: 'Overwrite anyway',
  conflictReload: 'Reload from disk',
  save: 'Save',
  revert: 'Discard changes',
  retry: 'Retry',
  binaryTitle: 'This does not look like a text file',
  binaryBody: 'The editor opens UTF-8 text files. The read-only preview can still show it.',
  hugeTitle: 'This file is too large',
  hugeBody: 'The editor opens text files up to {limit} MiB.',
  failedTitle: 'This file could not be opened',
  savedAt: 'Saved · {time}',
  saveFailedDetail: 'Save failed: {message}',
  eolTitle: 'Line endings: {current} — click for {next}',
}

/**
 * The size ceiling as the interface states it.
 *
 * The Host owns the rule (`MAX_TEXT_BYTES` in `host/protocol.js`); the two
 * bundles cannot share a module, so this mirrors it and the copy interpolates
 * it instead of spelling the number out twice.
 */
export const MAX_TEXT_MIB = 12

/**
 * The active interface language.
 * @returns `zh` or `en`.
 */
export function activeLanguage() {
  const declared = typeof document === 'undefined' ? '' : document.documentElement.lang
  const tag = (declared || (typeof navigator === 'undefined' ? '' : navigator.language) || 'en').toLowerCase()
  return tag.startsWith('zh') ? 'zh' : 'en'
}

/**
 * The dictionary for the active language.
 * @returns the string table.
 */
export function strings() {
  return activeLanguage() === 'zh' ? zh : en
}

/**
 * Render one template with its substitutions.
 * @param {string} template - text carrying `{name}` placeholders.
 * @param {Record<string, string>} values - substitution values.
 * @returns {string} the rendered text.
 */
export function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? '')
}
