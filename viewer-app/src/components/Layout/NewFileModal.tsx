import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useViewerStore } from '../../store/viewerStore'
import { path as joinPath } from '../../utils/path'

interface DirNode {
  name: string
  fullPath: string
  children: DirNode[]
}

function buildDirTree(rootPath: string, allDirs: string[]): DirNode {
  const root: DirNode = { name: rootPath.split(/[\\/]/).pop() ?? rootPath, fullPath: rootPath, children: [] }
  const nodeMap = new Map<string, DirNode>([[rootPath, root]])

  const sorted = [...allDirs].sort()
  for (const dir of sorted) {
    const parts = dir.split(/[\\/]/)
    const name = parts[parts.length - 1]
    const dirNorm = dir.replace(/\\/g, '/')

    let parentNode: DirNode | undefined
    const dirParts = dirNorm.split('/')
    for (let i = dirParts.length - 1; i >= 1; i--) {
      const candidate = dirParts.slice(0, i).join('/')
      const found = nodeMap.get(candidate) ?? nodeMap.get(candidate.replace(/\//g, '\\'))
      if (found) { parentNode = found; break }
    }
    if (!parentNode) parentNode = root

    const newNode: DirNode = { name, fullPath: dir, children: [] }
    parentNode.children.push(newNode)
    nodeMap.set(dirNorm, newNode)
    nodeMap.set(dir, newNode)
  }
  return root
}

function DirTreeNode({
  node, selectedPath, onSelect, depth = 0
}: {
  node: DirNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const isSelected = node.fullPath === selectedPath
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={['flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded text-xs select-none',
          isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'].join(' ')}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => { onSelect(node.fullPath); if (hasChildren) setOpen((o) => !o) }}
      >
        <span className="shrink-0 w-3 text-gray-400">{hasChildren ? (open ? '▾' : '▸') : ' '}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {open && hasChildren && node.children.map((child) => (
        <DirTreeNode key={child.fullPath} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

export function NewFileModal({ onClose }: { onClose: () => void }): JSX.Element {
  const roots = useViewerStore((s) => s.roots)
  const [type, setType] = useState<'spec' | 'design'>('spec')
  const [fileName, setFileName] = useState('')
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [dirTree, setDirTree] = useState<DirNode | null>(null)
  const [loading, setLoading] = useState(false)

  const baseDir = type === 'spec' ? roots.spec : roots.design
  const typeLabel = type === 'spec' ? '仕様書' : '設計書'

  useEffect(() => {
    if (!baseDir) { setDirTree(null); setSelectedDir(null); return }
    setLoading(true)
    setSelectedDir(baseDir)
    window.api.listDirs(baseDir).then((res) => {
      if (res.ok) setDirTree(buildDirTree(baseDir, res.data ?? []))
      setLoading(false)
    })
  }, [baseDir, type])

  const targetDir = selectedDir ?? baseDir
  const trimmedName = fileName.trim()
  const finalName = trimmedName
    ? (trimmedName.endsWith('.md') || trimmedName.endsWith('.adoc') ? trimmedName : `${trimmedName}.md`)
    : ''
  const previewPath = targetDir && finalName ? joinPath(targetDir, finalName) : null

  const handleCreate = useCallback(async () => {
    if (!finalName || !targetDir) return
    if (!baseDir) { toast.error(`${typeLabel}のルートフォルダが未設定です`); return }
    const absPath = joinPath(targetDir, finalName)
    const res = await window.api.createFile(absPath, '')
    if (res.ok) { toast.success(`作成しました: ${finalName}`); onClose() }
    else toast.error(`作成に失敗しました: ${res.error}`)
  }, [finalName, targetDir, baseDir, typeLabel, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[500px] flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-700">新規ファイル作成</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 overflow-y-auto flex-1">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 w-16 shrink-0">種別</span>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={type === 'spec'} onChange={() => setType('spec')} />仕様書
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={type === 'design'} onChange={() => setType('design')} />設計書
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">保存フォルダ</span>
            {!baseDir ? (
              <div className="text-xs text-amber-500 bg-amber-50 rounded px-2 py-1.5">未設定（設定ボタンからルートフォルダを設定してください）</div>
            ) : loading ? (
              <div className="text-xs text-gray-400 px-2 py-2">読み込み中...</div>
            ) : dirTree ? (
              <div className="border border-gray-200 rounded overflow-y-auto max-h-40 bg-gray-50 py-1">
                <DirTreeNode node={dirTree} selectedPath={selectedDir} onSelect={setSelectedDir} depth={0} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">ファイル名</label>
            <input
              autoFocus value={fileName} onChange={(e) => setFileName(e.target.value)}
              placeholder="例: login_spec.md"
              className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>
          {previewPath && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5 break-all">
              <span className="font-medium text-gray-500">作成先: </span>{previewPath}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50">キャンセル</button>
          <button onClick={handleCreate} disabled={!finalName || !targetDir || !baseDir}
            className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40">作成</button>
        </div>
      </div>
    </div>
  )
}
