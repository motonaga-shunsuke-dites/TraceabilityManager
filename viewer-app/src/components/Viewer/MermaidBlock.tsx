import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

let idCounter = 0

export function MermaidBlock({ code }: { code: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const id = `mermaid-${++idCounter}`
    setError(null)

    mermaid.render(id, code).then(({ svg }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = svg
      }
    }).catch((err) => {
      setError(String(err?.message ?? err))
    }).finally(() => {
      // mermaid が body に挿入した一時要素を削除
      document.getElementById(id)?.remove()
    })
  }, [code])

  if (error) {
    return (
      <div className="my-2 p-2 border border-red-300 rounded bg-red-50 text-red-600 text-xs font-mono whitespace-pre-wrap">
        Mermaid エラー: {error}
      </div>
    )
  }

  return <div ref={containerRef} className="my-2 overflow-x-auto bg-white rounded p-2" />
}
