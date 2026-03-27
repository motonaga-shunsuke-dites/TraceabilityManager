import Asciidoctor from '@asciidoctor/core'

export const asciidoctor = Asciidoctor()

export function renderAdoc(content: string): string {
  try {
    return asciidoctor.convert(content, { safe: 'safe', standalone: false }) as string
  } catch (e) {
    console.error('[adoc] render error:', e)
    return `<pre>${content.replace(/</g, '&lt;')}</pre>`
  }
}

/** AsciiDoc ドキュメントから見出し・キャプション一覧を抽出（自動番号付き）
 *  - 見出し: { value: "== 見出し", label: "== 見出し" }
 *  - テーブル・画像等: { value: ".タイトル", label: "表 1. タイトル" }
 */
export function extractAdocHeadings(content: string): { value: string; label: string }[] {
  const html = renderAdoc(content)
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')

  const results: { value: string; label: string }[] = []
  // 自動番号プレフィックス "表 1. " や "Figure 1. " 等
  const autoNumRe = /^.+\s\d+\.\s/

  const selector = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'caption',
    '.imageblock .title',
    '.listingblock .title',
    '.exampleblock .title'
  ].join(',')

  for (const el of dom.body.querySelectorAll(selector)) {
    const text = el.textContent?.trim() ?? ''
    if (!text) continue

    if (/^H[1-6]$/.test(el.tagName)) {
      const level = parseInt(el.tagName[1])
      const value = '='.repeat(level) + ' ' + text
      results.push({ value, label: value })
    } else {
      // キャプション: 自動番号プレフィックスを除いたものを value に
      const baseTitle = text.replace(autoNumRe, '')
      results.push({ value: '.' + baseTitle, label: text })
    }
  }

  return results
}
