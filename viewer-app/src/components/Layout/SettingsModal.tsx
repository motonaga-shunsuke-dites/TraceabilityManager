import { useCallback } from 'react'
import { toast } from 'sonner'
import { useViewerStore } from '../../store/viewerStore'
import type { Roots } from '../../types'

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const roots = useViewerStore((s) => s.roots)
  const setRoots = useViewerStore((s) => s.setRoots)
  const projectPath = useViewerStore((s) => s.projectPath)

  const changeRoot = useCallback(
    async (key: keyof Roots) => {
      const folder = await window.api.selectFolder()
      if (!folder) return
      const next: Roots = { ...roots, [key]: folder }
      setRoots(next)
      if (projectPath) {
        const nodes = useViewerStore.getState().nodes
        await window.api.writeToml(projectPath, { roots: next, nodes })
        const labels: Record<keyof Roots, string> = { spec: '仕様書', design: '設計書', source: 'ソースコード' }
        toast.success(`${labels[key]}のルートを変更しました`)
      }
    },
    [roots, setRoots, projectPath]
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[440px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">ルートフォルダ設定</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          {(['spec', 'design', 'source'] as const).map((key) => {
            const labels = { spec: '仕様書', design: '設計書', source: 'ソースコード' }
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-gray-500">{labels[key]}</span>
                <div className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 bg-gray-50 text-xs text-gray-700 truncate" title={roots[key]}>
                  {roots[key] || <span className="text-gray-300">未設定</span>}
                </div>
                <button onClick={() => changeRoot(key)} className="shrink-0 px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600">…</button>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600">閉じる</button>
        </div>
      </div>
    </div>
  )
}
