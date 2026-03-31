import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useViewerStore } from '../../store/viewerStore'
import { basename } from '../../utils/path'
import { highlight } from './contentUtils'

export function useAutoSave(filePath: string | null, content: string | null, editingContent: string | null): void {
  useEffect(() => {
    if (!filePath || editingContent === null || editingContent === content) return
    const timer = setTimeout(async () => {
      const res = await window.api.writeText(filePath, editingContent)
      if (!res.ok) toast.error(`保存に失敗しました: ${res.error}`)
    }, 500)
    return () => clearTimeout(timer)
  }, [filePath, content, editingContent])
}

export function SourcePane(): JSX.Element {
  const sourcePaths = useViewerStore((s) => s.content.sourcePaths)
  const sourceContents = useViewerStore((s) => s.content.sourceContents)
  const [htmlMap, setHtmlMap] = useState<Map<string, string>>(new Map())
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [highlighting, setHighlighting] = useState(false)

  useEffect(() => {
    setSelectedIdx(0)
    setHtmlMap(new Map())
  }, [sourceContents])

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
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>
      ) : (
        <div className="flex-1 overflow-auto text-xs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      )}
    </div>
  )
}
