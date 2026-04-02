import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderAdoc } from '../../utils/adoc'
import { MermaidBlock } from './MermaidBlock'
import { PlantumlBlock } from './PlantumlBlock'
import { MarkdownImage } from './MarkdownImage'
import { ImageOverlay } from './ImageOverlay'
import { isAdocPath, resolveAdocImages, splitAtSection } from './contentUtils'

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

function PlantumlInclude({ filePath }: { filePath: string }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setCode(null); setErr(false)
    window.api.readText(filePath).then((res) => {
      if (res.ok && res.data != null) setCode(res.data)
      else setErr(true)
    })
  }, [filePath])
  if (err) return <div className="text-xs text-red-500 font-mono">読み込み失敗: {filePath}</div>
  if (code === null) return <div className="text-xs text-gray-400 italic">読み込み中...</div>
  return <PlantumlBlock code={code} />
}

function MermaidInclude({ filePath }: { filePath: string }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    setCode(null); setErr(false)
    window.api.readText(filePath).then((res) => {
      if (res.ok && res.data != null) setCode(res.data)
      else setErr(true)
    })
  }, [filePath])
  if (err) return <div className="text-xs text-red-500 font-mono">読み込み失敗: {filePath}</div>
  if (code === null) return <div className="text-xs text-gray-400 italic">読み込み中...</div>
  return <MermaidBlock code={code} />
}

function resolveMmdPath(docPath: string, rel: string): string {
  const norm = docPath.replace(/\\/g, '/')
  const dir = norm.substring(0, norm.lastIndexOf('/'))
  const cleanRel = rel.trim().replace(/^\.[\\/]/, '')
  return dir + '/' + cleanRel
}

function makeMarkdownComponents(docPath: string | null, onImageClick: (url: string) => void) {
  return {
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
      const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
      if (lang === 'mermaid') return <MermaidBlock code={String(children).replace(/\n$/, '')} />
      if (lang === 'mermaid-include' && docPath) return <MermaidInclude filePath={resolveMmdPath(docPath, String(children).trim())} />
      if (lang === 'plantuml') return <PlantumlBlock code={String(children).replace(/\n$/, '')} />
      if (lang === 'plantuml-include' && docPath) return <PlantumlInclude filePath={resolveMmdPath(docPath, String(children).trim())} />
      return <code className={className} {...props}>{children}</code>
    },
    img({ src, alt, title }) {
      return <MarkdownImage src={src} alt={alt} title={title} docPath={docPath} onImageClick={onImageClick} />
    }
  }
}

export function DocPreview({
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
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const handleImageClick = useCallback((url: string) => setOverlayUrl(url), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mdComponents = useMemo(() => makeMarkdownComponents(path, handleImageClick), [path, handleImageClick])

  // AsciiDoc 画像のクリックでオーバーレイを表示
  const handleAdocClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement
      if (img.src) setOverlayUrl(img.src)
    }
  }, [])

  // AsciiDoc: DOM でセクションをハイライト
  useEffect(() => {
    if (!adoc || !containerRef.current || !adocHtml) return
    containerRef.current.querySelectorAll('.adoc-section-highlight').forEach((el) => {
      el.classList.remove('adoc-section-highlight')
    })
    if (!heading || !highlightOn) return
    const headingText = heading.replace(/^[#=]{1,6}\s+/, '').replace(/^\.\s*/, '').trim()
    for (const el of containerRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (el.textContent?.trim() === headingText) {
        const sect = el.closest('[class^="sect"]') as HTMLElement | null
        if (sect) sect.classList.add('adoc-section-highlight')
        else (el as HTMLElement).classList.add('adoc-section-highlight')
        break
      }
    }
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

  // スクロール
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
          const imageBlock = el.closest('.imageblock') as HTMLElement | null
          const target = imageBlock ?? (el as HTMLElement)
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          break
        }
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [heading, content, adocHtml])

  if (path === null) return <div className="text-gray-300 text-xs p-4">紐づけなし</div>
  if (content === null) {
    return (
      <div className="text-amber-500 text-xs p-4">
        ファイルが見つかりません<br />
        <span className="text-gray-400 break-all">{path}</span>
      </div>
    )
  }

  if (adoc) {
    if (!adocHtml) return <div className="text-gray-400 text-xs p-4">読み込み中...</div>
    return (
      <>
        <div
          ref={containerRef}
          className="h-full overflow-auto p-4 adoc-content"
          dangerouslySetInnerHTML={{ __html: adocHtml }}
          onClick={handleAdocClick}
          style={{ cursor: undefined }}
        />
        {overlayUrl && <ImageOverlay url={overlayUrl} onClose={() => setOverlayUrl(null)} />}
      </>
    )
  }

  if (heading && highlightOn) {
    const split = splitAtSection(content, heading, false)
    if (split) {
      return (
        <>
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
          {overlayUrl && <ImageOverlay url={overlayUrl} onClose={() => setOverlayUrl(null)} />}
        </>
      )
    }
  }

  return (
    <>
      <div ref={containerRef} className="h-full overflow-auto p-4 prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
      </div>
      {overlayUrl && <ImageOverlay url={overlayUrl} onClose={() => setOverlayUrl(null)} />}
    </>
  )
}
