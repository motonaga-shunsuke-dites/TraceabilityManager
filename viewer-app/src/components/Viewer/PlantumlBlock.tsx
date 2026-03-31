import { useEffect, useRef, useState, useCallback } from 'react'

interface Transform { x: number; y: number; scale: number }

export function PlantumlBlock({ code }: { code: string }): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [fitTransform, setFitTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
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
    }).catch((err) => {
      setError(String(err?.message ?? err))
      setRendering(false)
    })
  }, [code, calcFit, applyTransform])

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

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-600 font-mono whitespace-pre-wrap">
        {error}
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="relative overflow-hidden rounded border border-gray-200 bg-white"
      style={{ minHeight: '200px', maxHeight: '500px', cursor: 'grab' }}
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
          transform: `translate(${fitTransform.x}px, ${fitTransform.y}px) scale(${fitTransform.scale})`,
          userSelect: 'none',
        }}
      />
    </div>
  )
}
