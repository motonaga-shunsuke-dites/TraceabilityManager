/**
 * Windows/Mac 両対応のパス結合
 * Electron Renderer プロセスは Node.js の path モジュールが使えないため自前実装
 */
export function path(base: string, relative: string): string {
  // セパレーターを統一
  const sep = base.includes('\\') ? '\\' : '/'
  const normalBase = base.replace(/[/\\]+$/, '')
  const normalRel = relative.replace(/^[/\\]+/, '').replace(/\//g, sep)
  return `${normalBase}${sep}${normalRel}`
}

/** ファイルパスから拡張子を取得 */
export function extname(filePath: string): string {
  const idx = filePath.lastIndexOf('.')
  if (idx < 0) return ''
  return filePath.slice(idx).toLowerCase()
}

/** ファイルパスからファイル名のみ取得 */
export function basename(filePath: string): string {
  return filePath.replace(/.*[/\\]/, '')
}
