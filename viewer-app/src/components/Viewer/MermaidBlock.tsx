import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

let idCounter = 0

interface Transform { x: number; y: number; scale: number }

export function MermaidBlock({ code }: { code: string }): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
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
    if (!svgRef.current) return
    const id = `mermaid-${++idCounter}`
    setError(null)

    mermaid.render(id, code).then(({ svg }) => {
      if (!svgRef.current) return
      svgRef.current.innerHTML = svg
      // SVG が inline サイズを持つよう設定
      const svgEl = svgRef.current.querySelector('svg')
      if (svgEl) {
        svgEl.style.maxWidth = 'none'
        svgEl.style.display = 'block'
      }
      // 初期 fit
      requestAnimationFrame(() => {
        const fit = calcFit()
        setFitTransform(fit)
        applyTransform(fit)
      })
    }).catch((err) => {
      setError(String(err?.message ?? err))
    }).finally(() => {
      const el = document.getElementById(id)
      if (el && !svgRef.current?.contains(el)) el.remove()
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
      const newScale = Math.min(Math.max(t.scale * factor, 0.1), 20)
      // カーソル位置を中心にズーム
      const rect = wrapper.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const newX = cx - (cx - t.x) * (newScale / t.scale)
      const newY = cy - (cy - t.y) * (newScale / t.scale)
      applyTransform({ x: newX, y: newY, scale: newScale })
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  // ドラッグパン
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      tx: transformRef.current.x, ty: transformRef.current.y
    }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.mx
      const dy = e.clientY - dragStart.current.my
      applyTransform({
        ...transformRef.current,
        x: dragStart.current.tx + dx,
        y: dragStart.current.ty + dy
      })
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [applyTransform])

  const handleFitReset = useCallback(() => {
    const fit = calcFit()
    setFitTransform(fit)
    applyTransform(fit)
  }, [calcFit, applyTransform])

  if (error) {
    return (
      <div className="my-2 p-2 border border-red-300 rounded bg-red-50 text-red-600 text-xs font-mono whitespace-pre-wrap">
        Mermaid エラー: {error}
      </div>
    )
  }

  return (
    <div className="my-2 rounded border border-gray-200 bg-white">
      {/* ツールバー */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50">
        <button
          onClick={() => {
            const t = transformRef.current
            applyTransform({ ...t, scale: Math.min(t.scale * 1.2, 20) })
          }}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="拡大"
        >＋</button>
        <button
          onClick={() => {
            const t = transformRef.current
            applyTransform({ ...t, scale: Math.max(t.scale / 1.2, 0.1) })
          }}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="縮小"
        >－</button>
        <button
          onClick={handleFitReset}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-600 select-none"
          title="フィットリセット"
        >fit</button>
        <span className="ml-1 text-xs text-gray-400 select-none">
          ホイール: ズーム　ドラッグ: 移動
        </span>
      </div>
      {/* PanZoom エリア */}
      <div
        ref={wrapperRef}
        className="relative overflow-hidden bg-white"
        style={{ height: '360px', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
      >
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
    </div>
  )
}
