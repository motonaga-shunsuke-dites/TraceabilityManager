import { useCallback, useEffect, useRef, useState } from 'react'
import type { PZTransform } from './types'

interface LivePreviewProps {
  code: string
}

export function LivePreview({ code }: LivePreviewProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const counterRef = useRef(0)
  const prevCodeRef = useRef('')
  const transformRef = useRef<PZTransform>({ x: 0, y: 0, scale: 1 })
  const [fitTransform, setFitTransform] = useState<PZTransform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  const applyTransform = useCallback((t: PZTransform) => {
    if (!svgRef.current) return
    transformRef.current = t
    svgRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`
  }, [])

  const calcFit = useCallback((): PZTransform => {
    const wrapper = wrapperRef.current
    const svg = svgRef.current?.querySelector('svg')
    if (!wrapper || !svg) return { x: 0, y: 0, scale: 1 }
    const svgW = svg.scrollWidth || svg.viewBox?.baseVal?.width || 1
    const svgH = svg.scrollHeight || svg.viewBox?.baseVal?.height || 1
    const wW = wrapper.clientWidth
    const wH = wrapper.clientHeight
    const scale = Math.min(wW / svgW, wH / svgH, 1)
    const x = (wW - svgW * scale) / 2
    const y = (wH - svgH * scale) / 2
    return { x, y, scale }
  }, [])

  // SVG レンダリング（PlantUML jar 経由）
  useEffect(() => {
    if (!code.trim()) {
      setError(null)
      setRendering(false)
      if (svgRef.current) svgRef.current.innerHTML = ''
      prevCodeRef.current = ''
      return
    }

    // 前回が空 → 今回が非空 = ファイルロード直後: 即座に描画開始
    // 前回も非空 = 編集中: 1500ms デバウンスで描画を抑制
    const wasEmpty = !prevCodeRef.current.trim()
    prevCodeRef.current = code
    const delay = wasEmpty ? 50 : 1500

    const current = ++counterRef.current

    const timer = setTimeout(async () => {
      if (current !== counterRef.current) return
      setError(null)
      setRendering(true)
      try {
        const res = await window.api.renderPlantuml(code)
        if (current !== counterRef.current) return
        if (!res.ok || !res.data) {
          setError(res.error ?? 'PlantUML レンダリングに失敗しました')
          setRendering(false)
          return
        }
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
      } catch (err) {
        if (current !== counterRef.current) return
        setError(String((err as Error)?.message ?? err))
        setRendering(false)
      }
    }, delay)

    return () => { clearTimeout(timer) }
  }, [code, calcFit, applyTransform])

  // ホイールズーム
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
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
    wrapper.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => wrapper.removeEventListener('wheel', onWheel, { capture: true })
  }, [applyTransform])

  // ドラッグパン
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      applyTransform({
        ...transformRef.current,
        x: dragStart.current.tx + (e.clientX - dragStart.current.mx),
        y: dragStart.current.ty + (e.clientY - dragStart.current.my),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [applyTransform])

  const handleFit = useCallback(() => {
    const fit = calcFit()
    setFitTransform(fit)
    applyTransform(fit)
  }, [calcFit, applyTransform])

  if (!code.trim()) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          クラスを追加すると図が表示されます
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* ツールバー */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50 shrink-0">
        <button
          onClick={() => { const t = transformRef.current; applyTransform({ ...t, scale: Math.min(t.scale * 1.2, 20) }) }}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="拡大"
        >＋</button>
        <button
          onClick={() => { const t = transformRef.current; applyTransform({ ...t, scale: Math.max(t.scale / 1.2, 0.05) }) }}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="縮小"
        >－</button>
        <button
          onClick={handleFit}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="全体表示"
        >fit</button>
        <span className="ml-1 text-xs text-gray-400 select-none">ホイール: ズーム　ドラッグ: 移動</span>
        {error && (
          <span className="ml-2 text-xs text-red-500 truncate max-w-xs" title={error}>エラー: {error}</span>
        )}
      </div>
      {/* PanZoom エリア */}
      <div
        ref={wrapperRef}
        className="flex-1 relative overflow-hidden bg-white"
        style={{ cursor: 'grab' }}
        onMouseDown={onMouseDown}
      >
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs bg-white/80 z-10 pointer-events-none">
            描画中...
          </div>
        )}
        <div
          ref={svgRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${fitTransform.x}px,${fitTransform.y}px) scale(${fitTransform.scale})`,
            userSelect: 'none',
          }}
        />
      </div>
    </div>
  )
}
