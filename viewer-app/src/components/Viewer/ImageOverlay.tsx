import { useEffect } from 'react'

interface ImageOverlayProps {
  url: string
  alt?: string
  onClose: () => void
}

export function ImageOverlay({ url, alt, onClose }: ImageOverlayProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-2xl p-3 max-w-[95vw] max-h-[95vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-800 shadow text-sm leading-none"
          title="閉じる (Esc)"
        >
          ✕
        </button>
        <img
          src={url}
          alt={alt ?? ''}
          className="block max-w-[90vw] max-h-[88vh] object-contain"
        />
      </div>
    </div>
  )
}
