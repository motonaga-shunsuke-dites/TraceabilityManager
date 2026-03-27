import type { DocLink, LinkNode, ContentState, Roots } from '../types'
import { path as joinPath } from './path'

function genId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

/** 旧フォーマット（spec/design 直接フィールド）を links 配列へ変換 */
export function migrateNode(node: LinkNode): LinkNode {
  if (node.links && node.links.length > 0) return node
  if (!node.spec && !node.design) return { ...node, links: node.links ?? [] }
  const link: DocLink = {
    id: genId(),
    label: '既定',
    spec: node.spec,
    design: node.design
  }
  const { spec: _s, design: _d, ...rest } = node
  return { ...rest, links: [link] }
}

export function migrateNodes(nodes: LinkNode[]): LinkNode[] {
  return nodes.map(migrateNode)
}

/** テキストから見出し一覧を抽出（Markdown: "## xxx"、AsciiDoc: "== xxx" および ".タイトル" 両対応） */
export function extractHeadings(content: string, filePath?: string): string[] {
  const ext = filePath?.split('.').pop()?.toLowerCase()
  const isAdoc = ext === 'adoc'
  return content
    .split('\n')
    .filter((line) => {
      if (isAdoc) {
        // 見出し（= xxx）またはブロックタイトル（.xxx ← テーブル・コードブロック等のキャプション）
        return /^={1,6}\s/.test(line) || /^\.[^\s.]/.test(line)
      }
      return /^#{1,6}\s/.test(line)
    })
    .map((line) => line.trim())
}

/** DocLink のコンテンツを読み込んで ContentState を返す */
export async function loadLinkContent(
  link: DocLink,
  roots: Roots,
  existingSources?: ContentState
): Promise<ContentState> {
  // 仕様書
  let specPath: string | null = null
  let specContent: string | null = null
  if (link.spec && roots.spec) {
    specPath = joinPath(roots.spec, link.spec)
    const res = await window.api.readText(specPath)
    specContent = res.ok ? (res.data ?? null) : null
  }

  // 設計書
  let designPath: string | null = null
  let designContent: string | null = null
  if (link.design && roots.design) {
    designPath = joinPath(roots.design, link.design)
    const res = await window.api.readText(designPath)
    designContent = res.ok ? (res.data ?? null) : null
  }

  return {
    activeLinkId: link.id,
    specPath,
    specContent,
    specHeading: link.specHeading ?? null,
    designPath,
    designContent,
    designHeading: link.designHeading ?? null,
    // ソースは呼び出し元から引き継ぐ（リンク切り替えではソースは変わらない）
    sourcePaths: existingSources?.sourcePaths ?? [],
    sourceContents: existingSources?.sourceContents ?? []
  }
}

/** ノードのソースコードを読み込む */
export async function loadSourceContent(
  node: LinkNode,
  roots: Roots
): Promise<Pick<ContentState, 'sourcePaths' | 'sourceContents'>> {
  const sourcePaths: string[] = []
  const sourceContents: { path: string; content: string }[] = []
  if (node.sources && roots.source) {
    for (const rel of node.sources) {
      const absPath = joinPath(roots.source, rel)
      sourcePaths.push(absPath)
      const res = await window.api.readText(absPath)
      if (res.ok && res.data !== undefined) {
        sourceContents.push({ path: absPath, content: res.data })
      }
    }
  }
  return { sourcePaths, sourceContents }
}
