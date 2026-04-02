import { useCallback, useEffect, useRef, useState } from 'react'

interface ImageOverlayProps {
  url: string
  alt?: string
  onClose: () => void
}

export function ImageOverlay({ url, alt, onClose }: ImageOverlayProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  const clampScale = useCallback((v: number) => Math.min(Math.max(v, 0.2), 8), [])

  const resetView = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setTx(dragStart.current.tx + (e.clientX - dragStart.current.mx))
      setTy(dragStart.current.ty + (e.clientY - dragStart.current.my))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-2xl p-3 max-w-[95vw] max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-white/90 rounded border border-gray-200 px-1 py-0.5">
          <button
            onClick={() => setScale((s) => clampScale(s / 1.2))}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 text-gray-700"
            title="縮小"
          >
            －
          </button>
          <button
            onClick={resetView}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 text-gray-700"
            title="等倍に戻す"
          >
            100%
          </button>
          <button
            onClick={() => setScale((s) => clampScale(s * 1.2))}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 text-gray-700"
            title="拡大"
          >
            ＋
          </button>
          <span className="text-[11px] text-gray-500 min-w-10 text-right">{Math.round(scale * 100)}%</span>
        </div>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 shadow text-sm leading-none"
          title="閉じる (Esc)"
        >
          ✕
        </button>
        <div
          ref={viewportRef}
          className="w-[90vw] h-[88vh] overflow-hidden bg-white"
          onWheel={(e) => {
            e.preventDefault()
            const box = viewportRef.current
            if (!box) return
            const rect = box.getBoundingClientRect()
            const cx = e.clientX - rect.left
            const cy = e.clientY - rect.top
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
            setScale((prev) => {
              const next = clampScale(prev * factor)
              const ratio = next / prev
              setTx((x) => cx - (cx - x) * ratio)
              setTy((y) => cy - (cy - y) * ratio)
              return next
            })
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            dragging.current = true
            dragStart.current = { mx: e.clientX, my: e.clientY, tx, ty }
            e.preventDefault()
          }}
          style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
        >
          <img
            src={url}
            alt={alt ?? ''}
            className="block max-w-none max-h-none select-none"
            draggable={false}
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      </div>
    </div>
  )
}
