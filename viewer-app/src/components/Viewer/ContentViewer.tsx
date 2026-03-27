import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { codeToHtml } from 'shiki'
import { toast } from 'sonner'
import { renderAdoc } from '../../utils/adoc'
import { useViewerStore, initialContent } from '../../store/viewerStore'
import { MarkdownEditor, type MarkdownEditorHandle } from '../Editor/MarkdownEditor'
import { extname, basename } from '../../utils/path'
import { loadLinkContent } from '../../utils/nodes'
import type { DocLink } from '../../types'
import { MermaidBlock } from './MermaidBlock'

function isAdocPath(path: string | null): boolean {
  return !!path && path.toLowerCase().endsWith('.adoc')
}

/** 相対パスをドキュメントディレクトリを基点に絶対パスへ解決する */
function resolveAbsPath(docDir: string, rel: string): string {
  const parts = docDir.replace(/\\/g, '/').split('/')
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

/** HTML 内のローカル画像 src を IPC 経由で base64 データ URL に差し替える */
async function resolveAdocImages(html: string, docPath: string): Promise<string> {
  const docDir = docPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')


  const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp'
  }

  // 全 img src を収集（重複排除）
  const srcSet = new Set<string>()
  html.replace(/\ssrc="([^"]+)"/gi, (_, src) => { srcSet.add(src); return _ })

  const dataUrlMap = new Map<string, string>()
  await Promise.all(
    Array.from(srcSet)
      .filter((src) => !/^(https?:|file:|data:)/.test(src))
      .map(async (src) => {
        const absPath = resolveAbsPath(docDir, src).replace(/\//g, '\\')
        const res = await window.api.readBinary(absPath)
        if (res.ok && res.data) {
          const ext = absPath.split('.').pop()?.toLowerCase() ?? 'png'
          const mime = MIME[ext] ?? 'image/png'
          dataUrlMap.set(src, `data:${mime};base64,${res.data}`)
        }
      })
  )

  return html.replace(/(\ssrc=")([^"]+)(")/gi, (_m, pre, src, post) => {
    const dataUrl = dataUrlMap.get(src)
    return dataUrl ? pre + dataUrl + post : _m
  })
}


// --- マークダウン挿入ツールバー ---

function MarkdownToolbar({
  editorRef,
  filePath
}: {
  editorRef: { current: MarkdownEditorHandle | null }
  filePath: string | null
}): JSX.Element {
  const btn = 'px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 active:bg-gray-300 text-gray-600 leading-none select-none'
  const adoc = isAdocPath(filePath)

  if (adoc) {
    return (
      <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-200 flex-wrap shrink-0">
        <button onClick={() => editorRef.current?.insertLinePrefix('= ')} title="見出し1" className={btn}>H1</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('== ')} title="見出し2" className={btn}>H2</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('=== ')} title="見出し3" className={btn}>H3</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button onClick={() => editorRef.current?.wrapSelection('*', '*', '太字')} title="太字" className={`${btn} font-bold font-sans`}>B</button>
        <button onClick={() => editorRef.current?.wrapSelection('_', '_', '斜体')} title="斜体" className={`${btn} italic font-sans`}>I</button>
        <button onClick={() => editorRef.current?.wrapSelection('`', '`', 'code')} title="インラインコード" className={`${btn} font-mono`}>`C`</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button onClick={() => editorRef.current?.insertLinePrefix('* ')} title="箇条書き" className={btn}>・</button>
        <button onClick={() => editorRef.current?.insertLinePrefix('. ')} title="番号付きリスト" className={`${btn} font-mono`}>1.</button>
        <button onClick={() => editorRef.current?.insertText('NOTE: ')} title="注記" className={btn}>NOTE</button>
        <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />
        <button
          onClick={() => editorRef.current?.insertText('[source]\n----\n\n----')}
          title="コードブロック"
          className={`${btn} font-mono`}
        >----</button>
        <button
          onClick={() => editorRef.current?.insertText(
            '|===\n| 列1 | 列2 | 列3\n\n| データ | データ | データ\n|==='
          )}
          title="テーブル"
          className={btn}
        >表</button>
        <button
          onClick={() => editorRef.current?.insertText('image::../images/ファイル名.png[代替テキスト]')}
          title="画像"
          className={btn}
        >画像</button>
        <button onClick={() => editorRef.current?.insertText("\n'''\n")} title="水平線" className={btn}>—</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-200 flex-wrap shrink-0">
      {/* 見出し */}
      <button onClick={() => editorRef.current?.insertLinePrefix('# ')} title="見出し1" className={btn}>H1</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('## ')} title="見出し2" className={btn}>H2</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('### ')} title="見出し3" className={btn}>H3</button>

      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />

      {/* インライン装飾 */}
      <button
        onClick={() => editorRef.current?.wrapSelection('**', '**', '太字')}
        title="太字"
        className={`${btn} font-bold font-sans`}
      >B</button>
      <button
        onClick={() => editorRef.current?.wrapSelection('*', '*', '斜体')}
        title="斜体"
        className={`${btn} italic font-sans`}
      >I</button>
      <button
        onClick={() => editorRef.current?.wrapSelection('`', '`', 'code')}
        title="インラインコード"
        className={`${btn} font-mono`}
      >`C`</button>

      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />

      {/* リスト・引用 */}
      <button onClick={() => editorRef.current?.insertLinePrefix('- ')} title="箇条書き" className={btn}>・</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('1. ')} title="番号付きリスト" className={`${btn} font-mono`}>1.</button>
      <button onClick={() => editorRef.current?.insertLinePrefix('> ')} title="引用" className={btn}>&gt;</button>

      <div className="w-px h-3 bg-gray-300 mx-0.5 self-center shrink-0" />

      {/* ブロック要素 */}
      <button
        onClick={() => editorRef.current?.insertText('```\n\n```')}
        title="コードブロック"
        className={`${btn} font-mono`}
      >```</button>
      <button
        onClick={() => editorRef.current?.insertText(
          '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| データ | データ | データ |\n'
        )}
        title="テーブル"
        className={btn}
      >表</button>
      <button
        onClick={() => editorRef.current?.insertText('![代替テキスト](images/ファイル名.png)')}
        title="画像"
        className={btn}
      >画像</button>
      <button
        onClick={() => editorRef.current?.insertText('\n---\n')}
        title="水平線"
        className={btn}
      >—</button>
    </div>
  )
}

// --- シンタックスハイライト ---

async function highlight(code: string, filePath: string): Promise<string> {
  const ext = extname(filePath)
  const langMap: Record<string, string> = {
    '.cs': 'csharp', '.xaml': 'xml', '.java': 'java', '.py': 'python',
    '.cpp': 'cpp', '.cc': 'cpp', '.h': 'cpp', '.ts': 'typescript',
    '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx', '.json': 'json',
    '.xml': 'xml', '.html': 'html', '.css': 'css'
  }
  const lang = langMap[ext] ?? 'text'
  try {
    return await codeToHtml(code, { lang, theme: 'one-dark-pro' })
  } catch {
    return `<pre><code>${code}</code></pre>`
  }
}

// --- ペインヘッダー ---

function PaneHeader({ title, subtitle, highlighted, onToggleHighlight }: {
  title: string
  subtitle?: string
  highlighted?: boolean
  onToggleHighlight?: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs shrink-0">
      <span className="font-semibold text-gray-500 uppercase tracking-wide shrink-0">{title}</span>
      {subtitle && (
        <span className="text-gray-400 truncate flex-1" title={subtitle}>{subtitle}</span>
      )}
      {onToggleHighlight && (
        <button
          onClick={onToggleHighlight}
          title={highlighted ? 'ハイライトを非表示' : 'ハイライトを表示'}
          className={[
            'shrink-0 px-1.5 py-0.5 rounded text-xs transition-colors',
            highlighted
              ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          ].join(' ')}
        >
          ★
        </button>
      )}
    </div>
  )
}

// --- セクション分割（見出しとその内容を切り出す） ---

interface SectionSplit { before: string; section: string; after: string }

function splitAtSection(content: string, heading: string, adoc = false): SectionSplit | null {
  const lines = content.split('\n')

  // AsciiDoc ブロックタイトル（.xxx）の場合
  if (adoc && /^\.[^\s.]/.test(heading)) {
    const titleText = heading.slice(1).trim()
    let startIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^\.[^\s.]/.test(lines[i]) && lines[i].slice(1).trim() === titleText) {
        startIdx = i
        break
      }
    }
    if (startIdx === -1) return null
    let endIdx = lines.length
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^={1,6}\s/.test(lines[i]) || /^\.[^\s.]/.test(lines[i])) {
        endIdx = i
        break
      }
    }
    return {
      before: lines.slice(0, startIdx).join('\n'),
      section: lines.slice(startIdx, endIdx).join('\n'),
      after: lines.slice(endIdx).join('\n')
    }
  }

  const pattern = adoc ? /^(={1,6})\s+(.+)$/ : /^(#{1,6})\s+(.+)$/
  const m = heading.match(pattern)
  if (!m) return null
  const level = m[1].length
  const headingText = m[2].trim()

  const linePattern = adoc ? /^(={1,6})\s+(.*)$/ : /^(#{1,6})\s+(.*)$/
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(linePattern)
    if (lm && lm[1].length === level && lm[2].trim() === headingText) {
      startIdx = i
      break
    }
  }
  if (startIdx === -1) return null

  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const lm = lines[i].match(linePattern)
    if (lm && lm[1].length <= level) {
      endIdx = i
      break
    }
  }

  return {
    before: lines.slice(0, startIdx).join('\n'),
    section: lines.slice(startIdx, endIdx).join('\n'),
    after: lines.slice(endIdx).join('\n')
  }
}

// --- ドキュメントプレビュー（Markdown / AsciiDoc 両対応） ---

/** AsciiDoc 用: 画像を base64 解決済み HTML として返す hook（フルドキュメントを1度だけレンダリング） */
function useAdocHtml(content: string | null, path: string | null): string | null {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!content || !path) { setHtml(null); return }
    let cancelled = false
    resolveAdocImages(renderAdoc(content), path).then((resolved) => {
      if (!cancelled) setHtml(resolved)
    })
    return () => { cancelled = true }
  }, [content, path])

  return html
}

/** mermaid-include ブロック: .mmd ファイルを非同期で読み込んで描画 */
function MermaidInclude({ filePath }: { filePath: string }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    setCode(null)
    setErr(false)
    window.api.readText(filePath).then((res) => {
      if (res.ok && res.data != null) setCode(res.data)
      else setErr(true)
    })
  }, [filePath])

  if (err) return <div className="text-xs text-red-500 font-mono">読み込み失敗: {filePath}</div>
  if (code === null) return <div className="text-xs text-gray-400 italic">読み込み中...</div>
  return <MermaidBlock code={code} />
}

/** ドキュメントパスを基点に相対パスを絶対パスへ変換 */
function resolveMmdPath(docPath: string, rel: string): string {
  const norm = docPath.replace(/\\/g, '/')
  const dir = norm.substring(0, norm.lastIndexOf('/'))
  const cleanRel = rel.trim().replace(/^\.[\\/]/, '')
  return dir + '/' + cleanRel
}

function makeMarkdownComponents(docPath: string | null) {
  return {
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
      const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
      if (lang === 'mermaid') {
        return <MermaidBlock code={String(children).replace(/\n$/, '')} />
      }
      if (lang === 'mermaid-include' && docPath) {
        const absPath = resolveMmdPath(docPath, String(children).trim())
        return <MermaidInclude filePath={absPath} />
      }
      return <code className={className} {...props}>{children}</code>
    }
  }
}

function DocPreview({
  path,
  content,
  heading,
  highlightOn
}: {
  path: string | null
  content: string | null
  heading: string | null
  highlightOn: boolean
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const adoc = isAdocPath(path)
  const adocHtml = useAdocHtml(adoc ? content : null, path)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mdComponents = useMemo(() => makeMarkdownComponents(path), [path])

  // AsciiDoc: DOMでセクションをハイライト（フルレンダリングを活かし属性・画像を保持）
  useEffect(() => {
    if (!adoc || !containerRef.current || !adocHtml) return
    // 前のハイライトをクリア
    containerRef.current.querySelectorAll('.adoc-section-highlight').forEach((el) => {
      el.classList.remove('adoc-section-highlight')
    })
    if (!heading || !highlightOn) return
    const headingText = heading.replace(/^[#=]{1,6}\s+/, '').replace(/^\.\s*/, '').trim()

    // 見出し要素（h1-h6）から対応する sect div を探してハイライト
    for (const el of containerRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (el.textContent?.trim() === headingText) {
        const sect = el.closest('[class^="sect"]') as HTMLElement | null
        if (sect) sect.classList.add('adoc-section-highlight')
        else (el as HTMLElement).classList.add('adoc-section-highlight')
        break
      }
    }
    // ブロックタイトル（テーブルキャプション・画像キャプション等）
    const autoNumRe = /^.+\s\d+\.\s/
    for (const el of containerRef.current.querySelectorAll('caption, .imageblock .title, .listingblock .title, .exampleblock .title')) {
      const text = el.textContent?.trim() ?? ''
      if (text === headingText || text.replace(autoNumRe, '') === headingText) {
        const block = el.closest('table, .listingblock, .imageblock, .exampleblock, .sidebarblock') as HTMLElement | null
        if (block) block.classList.add('adoc-section-highlight')
        break
      }
    }
  }, [adoc, heading, highlightOn, adocHtml])

  // スクロール（Markdown / AsciiDoc 共通）
  useEffect(() => {
    if (!heading || !containerRef.current || !content) return
    const headingText = heading.replace(/^[#=]{1,6}\s+/, '').replace(/^\.\s*/, '').trim()
    const autoNumRe = /^.+\s\d+\.\s/
    const timer = setTimeout(() => {
      if (!containerRef.current) return
      const selector = 'h1,h2,h3,h4,h5,h6,caption,.imageblock .title,.listingblock .title,.exampleblock .title'
      for (const el of containerRef.current.querySelectorAll(selector)) {
        const text = el.textContent?.trim() ?? ''
        if (text === headingText || text.replace(autoNumRe, '') === headingText) {
          // 画像の場合はキャプション（画像の下）ではなく imageblock コンテナにスクロール
          const imageBlock = el.closest('.imageblock') as HTMLElement | null
          const target = imageBlock ?? (el as HTMLElement)
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          break
        }
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [heading, content, adocHtml])

  if (path === null) {
    return <div className="text-gray-300 text-xs p-4">紐づけなし</div>
  }
  if (content === null) {
    return (
      <div className="text-amber-500 text-xs p-4">
        ファイルが見つかりません<br />
        <span className="text-gray-400 break-all">{path}</span>
      </div>
    )
  }

  if (adoc) {
    if (!adocHtml) {
      return <div className="text-gray-400 text-xs p-4">読み込み中...</div>
    }
    return (
      <div ref={containerRef} className="h-full overflow-auto p-4 adoc-content" dangerouslySetInnerHTML={{ __html: adocHtml }} />
    )
  }

  if (heading && highlightOn) {
    const split = splitAtSection(content, heading, false)
    if (split) {
      return (
        <div ref={containerRef} className="h-full overflow-auto">
          {split.before && (
            <div className="px-4 pt-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{split.before}</ReactMarkdown>
            </div>
          )}
          <div className="px-4 py-3 bg-amber-50 border-l-4 border-amber-400 prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{split.section}</ReactMarkdown>
          </div>
          {split.after && (
            <div className="px-4 pb-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{split.after}</ReactMarkdown>
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto p-4 prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
    </div>
  )
}

// --- リンク切り替えタブ ---

function LinkTabs(): JSX.Element | null {
  const nodes = useViewerStore((s) => s.nodes)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const roots = useViewerStore((s) => s.roots)
  const content = useViewerStore((s) => s.content)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )
  const links: DocLink[] = node?.links ?? []

  const handleSwitch = useCallback(
    async (link: DocLink) => {
      const state = await loadLinkContent(link, roots, content)
      setContent(state)
      setEditingSpec(state.specContent)
      setEditingDesign(state.designContent)
    },
    [roots, content, setContent, setEditingSpec, setEditingDesign]
  )

  if (links.length <= 1) return null

  return (
    <div className="flex items-center overflow-x-auto border-b border-gray-200 bg-gray-50 shrink-0">
      <span className="px-2 text-xs text-gray-400 shrink-0">紐づけ:</span>
      {links.map((link) => (
        <button
          key={link.id}
          onClick={() => handleSwitch(link)}
          className={[
            'px-3 py-1.5 text-xs whitespace-nowrap border-r border-gray-200 transition-colors',
            content.activeLinkId === link.id
              ? 'bg-white font-semibold text-blue-600 border-b-2 border-b-blue-500'
              : 'text-gray-500 hover:bg-gray-100'
          ].join(' ')}
        >
          {link.label}
        </button>
      ))}
    </div>
  )
}

// --- ソースコードペイン ---

function SourcePane(): JSX.Element {
  const sourcePaths = useViewerStore((s) => s.content.sourcePaths)
  const sourceContents = useViewerStore((s) => s.content.sourceContents)
  const [htmlMap, setHtmlMap] = useState<Map<string, string>>(new Map())
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [highlighting, setHighlighting] = useState(false)

  // ノードが変わったら選択をリセット・キャッシュをクリア
  useEffect(() => {
    setSelectedIdx(0)
    setHtmlMap(new Map())
  }, [sourceContents])

  // 選択中ファイルだけをハイライト（キャッシュ済みならスキップ）
  useEffect(() => {
    const current = sourceContents[selectedIdx]
    if (!current) return
    if (htmlMap.has(current.path)) return

    let cancelled = false
    setHighlighting(true)
    highlight(current.content, current.path).then((html) => {
      if (cancelled) return
      setHtmlMap((prev) => new Map(prev).set(current.path, html))
      setHighlighting(false)
    })
    return () => { cancelled = true }
  }, [selectedIdx, sourceContents])

  if (sourcePaths.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-300 text-xs">紐づけなし</div>
  }
  if (sourceContents.length === 0) {
    return (
      <div className="p-4 text-xs text-amber-500">
        ファイルが見つかりません
        <ul className="mt-1 text-gray-400 break-all space-y-0.5">
          {sourcePaths.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    )
  }

  const current = sourceContents[selectedIdx]
  const highlightedHtml = current ? htmlMap.get(current.path) : undefined

  return (
    <div className="flex flex-col h-full">
      {sourceContents.length > 1 && (
        <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 shrink-0">
          {sourceContents.map((s, i) => (
            <button
              key={s.path}
              onClick={() => setSelectedIdx(i)}
              className={[
                'px-3 py-1 text-xs whitespace-nowrap border-r border-gray-200',
                i === selectedIdx ? 'bg-white font-semibold text-blue-600' : 'text-gray-500 hover:bg-gray-100'
              ].join(' ')}
            >
              {basename(s.path)}
            </button>
          ))}
        </div>
      )}
      {highlighting || highlightedHtml === undefined ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
          読み込み中...
        </div>
      ) : (
        <div className="flex-1 overflow-auto text-xs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      )}
    </div>
  )
}

// --- 自動保存 ---

function useAutoSave(filePath: string | null, content: string | null, editingContent: string | null): void {
  useEffect(() => {
    if (!filePath || editingContent === null || editingContent === content) return
    const timer = setTimeout(async () => {
      const res = await window.api.writeText(filePath, editingContent)
      if (!res.ok) toast.error(`保存に失敗しました: ${res.error}`)
    }, 500)
    return () => clearTimeout(timer)
  }, [filePath, content, editingContent])
}

// --- メイン ---

export function ContentViewer(): JSX.Element {
  const mode = useViewerStore((s) => s.mode)
  const content = useViewerStore((s) => s.content)
  const editingSpec = useViewerStore((s) => s.editingSpec)
  const editingDesign = useViewerStore((s) => s.editingDesign)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)
  const paneVisible = useViewerStore((s) => s.paneVisible)

  const [specHighlight, setSpecHighlight] = useState(true)
  const [designHighlight, setDesignHighlight] = useState(true)

  const specEditorRef = useRef<MarkdownEditorHandle>(null)
  const designEditorRef = useRef<MarkdownEditorHandle>(null)

  useAutoSave(content.specPath, content.specContent, editingSpec)
  useAutoSave(content.designPath, content.designContent, editingDesign)

  const headingLabel = (h: string | null): string | undefined =>
    h ? h.replace(/^[#=]{1,6}\s+/, '').replace(/^\.\s*/, '') : undefined

  const visibleCount = Object.values(paneVisible).filter(Boolean).length
  const defaultPaneSize = visibleCount > 0 ? Math.floor(100 / visibleCount) : 33
  const visibleKey = `${paneVisible.spec}-${paneVisible.design}-${paneVisible.source}`

  return (
    <div className="flex flex-col h-full">

      {/* リンク切り替えタブ */}
      <LinkTabs />

      {/* コンテンツエリア */}
      {visibleCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">
          表示するペインを選択してください
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <PanelGroup key={visibleKey} direction="horizontal" className="h-full">

            {/* 仕様書ペイン */}
            {paneVisible.spec && (
              <>
                <Panel defaultSize={defaultPaneSize} minSize={15}>
                  <div className="flex flex-col h-full border-r border-gray-200">
                    <PaneHeader
                      title="仕様書"
                      subtitle={headingLabel(content.specHeading)}
                      highlighted={content.specHeading ? specHighlight : undefined}
                      onToggleHighlight={content.specHeading ? () => setSpecHighlight((v) => !v) : undefined}
                    />
                    {mode === 'edit' && <MarkdownToolbar editorRef={specEditorRef} filePath={content.specPath} />}
                    <div className="flex-1 overflow-hidden">
                      {mode === 'edit' ? (
                        <MarkdownEditor ref={specEditorRef} value={editingSpec ?? ''} onChange={setEditingSpec} />
                      ) : (
                        <DocPreview
                          path={content.specPath}
                          content={content.specContent}
                          heading={content.specHeading}
                          highlightOn={specHighlight}
                        />
                      )}
                    </div>
                  </div>
                </Panel>
                {(paneVisible.design || paneVisible.source) && (
                  <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />
                )}
              </>
            )}

            {/* 設計書ペイン */}
            {paneVisible.design && (
              <>
                <Panel defaultSize={defaultPaneSize} minSize={15}>
                  <div className="flex flex-col h-full border-r border-gray-200">
                    <PaneHeader
                      title="設計書"
                      subtitle={headingLabel(content.designHeading)}
                      highlighted={content.designHeading ? designHighlight : undefined}
                      onToggleHighlight={content.designHeading ? () => setDesignHighlight((v) => !v) : undefined}
                    />
                    {mode === 'edit' && <MarkdownToolbar editorRef={designEditorRef} filePath={content.designPath} />}
                    <div className="flex-1 overflow-hidden">
                      {mode === 'edit' ? (
                        <MarkdownEditor ref={designEditorRef} value={editingDesign ?? ''} onChange={setEditingDesign} />
                      ) : (
                        <DocPreview
                          path={content.designPath}
                          content={content.designContent}
                          heading={content.designHeading}
                          highlightOn={designHighlight}
                        />
                      )}
                    </div>
                  </div>
                </Panel>
                {paneVisible.source && (
                  <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />
                )}
              </>
            )}

            {/* ソースコードペイン */}
            {paneVisible.source && (
              <Panel defaultSize={defaultPaneSize} minSize={15}>
                <div className="flex flex-col h-full">
                  <PaneHeader title="ソースコード" />
                  <div className="flex-1 overflow-hidden">
                    <SourcePane />
                  </div>
                </div>
              </Panel>
            )}

          </PanelGroup>
        </div>
      )}
    </div>
  )
}
