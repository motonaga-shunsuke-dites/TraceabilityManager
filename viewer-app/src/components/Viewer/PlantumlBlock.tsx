import { useEffect, useRef, useState, useCallback } from 'react'

interface Transform { x: number; y: number; scale: number }

export function PlantumlBlock({ code }: { code: string }): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [svgMarkup, setSvgMarkup] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [expandedScale, setExpandedScale] = useState(2.5)
  const [fitTransform, setFitTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const dragMoved = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  const applyTransform = useCallback((t: Transform) => {
    if (!svgRef.current) return
    transformRef.current = t
    svgRef.current.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`
  }, [])

  const calcFit = useCallback((): Transform => {
    const wrapper = wrapperRef.current
    const svg = svgRef.current?.querySelector('svg')
    if (!wrapper || !svg) return { x: 0, y: 0, scale: 1 }
    const svgW = svg.scrollWidth || svg.viewBox?.baseVal?.width || 1
    const wrapW = wrapper.clientWidth
    const fitScale = svgW > wrapW ? wrapW / svgW : 1
    const scale = Math.min(fitScale * 2, 5)
    return { x: 0, y: 0, scale }
  }, [])

  // SVG レンダリング
  useEffect(() => {
    if (!code.trim()) return
    setError(null)
    setRendering(true)

    window.api.renderPlantuml(code).then((res) => {
      if (!res.ok || !res.data) {
        setError(res.error ?? 'PlantUML レンダリングに失敗しました')
        setSvgMarkup('')
        setRendering(false)
        return
      }
      setSvgMarkup(res.data)
      if (svgRef.current) {
        svgRef.current.innerHTML = res.data
        const svgEl = svgRef.current.querySelector('svg')
        if (svgEl) { svgEl.style.maxWidth = 'none'; svgEl.style.display = 'block' }
      }
      setRendering(false)
      requestAnimationFrame(() => {
        const fit = calcFit()
        setFitTransform(fit)
        applyTransform(fit)
      })
    }).catch((err) => {
      setError(String(err?.message ?? err))
      setSvgMarkup('')
      setRendering(false)
    })
  }, [code, calcFit, applyTransform])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    if (expanded) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  // ホイールズーム
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const t = transformRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const newScale = Math.min(Math.max(t.scale * factor, 0.05), 20)
      const rect = wrapper.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      applyTransform({
        x: cx - (cx - t.x) * (newScale / t.scale),
        y: cy - (cy - t.y) * (newScale / t.scale),
        scale: newScale,
      })
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragMoved.current = false
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.mx
      const dy = e.clientY - dragStart.current.my
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true
      applyTransform({
        ...transformRef.current,
        x: dragStart.current.tx + dx,
        y: dragStart.current.ty + dy,
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [applyTransform])

  const handleWrapperClick = useCallback(() => {
    if (dragMoved.current || rendering || !svgMarkup) {
      dragMoved.current = false
      return
    }
    setExpanded(true)
  }, [rendering, svgMarkup])

  const handleOpenSeparateWindow = useCallback(async () => {
    if (!svgMarkup) return
    const res = await window.api.openPlantumlPreviewWindow(svgMarkup, 'クラス図プレビュー')
    if (!res.ok) {
      setError(res.error ?? '別ウィンドウ表示に失敗しました')
    }
  }, [svgMarkup])

  if (error) {
    return (
      <div className="rounded border-l-4 border-l-red-500 border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-mono whitespace-pre-wrap overflow-auto max-h-96 leading-relaxed">
        <div className="font-bold text-red-800 mb-2">PlantUML レンダリングエラー</div>
        <div>{error}</div>
      </div>
    )
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="relative overflow-hidden rounded border border-gray-200 bg-white"
        style={{ minHeight: '200px', maxHeight: '500px', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onClick={handleWrapperClick}
        title="クリックで拡大表示"
      >
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs bg-white/80 z-10 pointer-events-none">
            描画中...
          </div>
        )}
        {!rendering && svgMarkup && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); void handleOpenSeparateWindow() }}
              className="rounded bg-blue-600/90 hover:bg-blue-600 px-2 py-0.5 text-[10px] text-white"
              title="別ウィンドウで表示"
            >
              別ウィンドウ
            </button>
            <div className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white pointer-events-none">
              クリックで拡大
            </div>
          </div>
        )}
        <div
          ref={svgRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${fitTransform.x}px, ${fitTransform.y}px) scale(${fitTransform.scale})`,
            userSelect: 'none',
          }}
        />
      </div>

      {expanded && svgMarkup && (
        <div className="fixed inset-0 z-[70] bg-black/55 p-3" onClick={() => setExpanded(false)}>
          <div className="h-full w-full rounded-lg bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-10 border-b border-gray-200 px-3 flex items-center justify-between bg-gray-50">
              <span className="text-xs font-semibold text-gray-600">クラス図 拡大表示</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedScale((s) => Math.max(s / 1.25, 0.5))}
                  className="px-2 py-0.5 text-xs rounded border border-gray-200 hover:bg-gray-100 text-gray-700"
                >－</button>
                <button
                  onClick={() => setExpandedScale(1)}
                  className="px-2 py-0.5 text-xs rounded border border-gray-200 hover:bg-gray-100 text-gray-700"
                >100%</button>
                <button
                  onClick={() => setExpandedScale((s) => Math.min(s * 1.25, 8))}
                  className="px-2 py-0.5 text-xs rounded border border-gray-200 hover:bg-gray-100 text-gray-700"
                >＋</button>
                <span className="text-[11px] text-gray-500 min-w-12 text-right">{Math.round(expandedScale * 100)}%</span>
                <button
                  onClick={() => void handleOpenSeparateWindow()}
                  className="px-2 py-0.5 text-xs rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                >別ウィンドウ</button>
                <button
                  onClick={() => setExpanded(false)}
                  className="px-2 py-0.5 text-xs rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
                >閉じる</button>
              </div>
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-auto p-4 bg-white">
              <div
                style={{
                  width: 'max-content',
                  height: 'max-content',
                  transform: `scale(${expandedScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  className="inline-block"
                  style={{ minWidth: '100%', minHeight: '100%' }}
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
