import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useViewerStore, initialContent } from '../../store/viewerStore'
import { basename } from '../../utils/path'
import { loadLinkContent, loadSourceContent } from '../../utils/nodes'
import type { DocLink, LinkNode } from '../../types'
import { FilePicker } from '../FilePicker/FilePicker'
import { LinkEditor, toRelative } from './LinkEditor'

const SOURCE_EXTS = ['cs', 'xaml', 'java', 'py', 'cpp', 'cc', 'h', 'ts', 'tsx', 'js', 'jsx']

function genLinkId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function NodeLinkSettings(): JSX.Element {
  const nodes = useViewerStore((s) => s.nodes)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const roots = useViewerStore((s) => s.roots)
  const updateNode = useViewerStore((s) => s.updateNode)
  const content = useViewerStore((s) => s.content)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)

  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const links: DocLink[] = node?.links ?? []

  const reloadContent = useCallback(async (updatedNode: LinkNode) => {
    const sources = await loadSourceContent(updatedNode, roots)
    const updatedLinks = updatedNode.links ?? []
    if (updatedLinks.length === 0) {
      setContent({ ...initialContent, ...sources }); setEditingSpec(null); setEditingDesign(null); return
    }
    const activeLink = updatedLinks.find((l) => l.id === content.activeLinkId) ?? updatedLinks[0]
    const state = await loadLinkContent(activeLink, roots, { ...initialContent, ...sources })
    setContent({ ...state, ...sources }); setEditingSpec(state.specContent); setEditingDesign(state.designContent)
  }, [roots, content.activeLinkId, setContent, setEditingSpec, setEditingDesign])

  const handleAddLink = useCallback(() => {
    if (!node) return
    if (links.length > 0) {
      const last = links[links.length - 1]
      updateNode(node.id, { links: [...links, { ...last, id: genLinkId(), label: `${last.label} (コピー)` }] })
    } else {
      updateNode(node.id, { links: [{ id: genLinkId(), label: 'リンク 1' }] })
    }
  }, [node, links, updateNode])

  const handleChangeLink = useCallback((id: string, patch: Partial<DocLink>) => {
    if (!node) return
    const updatedLinks = links.map((l) => (l.id === id ? { ...l, ...patch } : l))
    updateNode(node.id, { links: updatedLinks })
    reloadContent({ ...node, links: updatedLinks })
  }, [node, links, updateNode, reloadContent])

  const handleDeleteLink = useCallback((id: string) => {
    if (!node) return
    updateNode(node.id, { links: links.filter((l) => l.id !== id) })
  }, [node, links, updateNode])

  const [showSourcePicker, setShowSourcePicker] = useState(false)

  const handleSourceConfirm = useCallback((files: string[]) => {
    setShowSourcePicker(false)
    if (!node || !files.length) return
    const newRels = files.map((f) => toRelative(f, roots.source))
    const merged = [...new Set([...(node.sources ?? []), ...newRels])]
    updateNode(node.id, { sources: merged }); reloadContent({ ...node, sources: merged })
    toast.success(`ソースコード ${files.length} 件を追加しました`)
  }, [node, roots.source, updateNode, reloadContent])

  const handleAddSources = useCallback(() => {
    if (!node) return
    if (!roots.source) { toast.error('ソースコードのルートフォルダが未設定です'); return }
    setShowSourcePicker(true)
  }, [node, roots.source])

  const handleRemoveSource = useCallback((rel: string) => {
    if (!node) return
    const newSources = (node.sources ?? []).filter((s) => s !== rel)
    updateNode(node.id, { sources: newSources }); reloadContent({ ...node, sources: newSources })
  }, [node, updateNode, reloadContent])

  if (!node) {
    return <div className="px-3 py-2 text-xs text-gray-400 text-center">ノードを選択すると<br />紐づけを設定できます</div>
  }

  return (
    <>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <div className="text-xs text-gray-400 truncate" title={node.label}>
          対象: <span className="text-gray-600 font-medium">{node.label}</span>
        </div>
        {links.map((link) => (
          <LinkEditor
            key={link.id} link={link} specRoot={roots.spec} designRoot={roots.design}
            onChange={(patch) => handleChangeLink(link.id, patch)} onDelete={() => handleDeleteLink(link.id)}
          />
        ))}
        <button onClick={handleAddLink}
          className="w-full py-1 text-xs rounded border border-dashed border-blue-300 text-blue-400 hover:border-blue-500 hover:text-blue-600 transition-colors">
          {links.length > 0 ? '+ 直前を複製して追加' : '+ 仕様書-設計書の紐づけを追加'}
        </button>
        <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">ソースコード</span>
            <button onClick={handleAddSources} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600">+ 追加</button>
          </div>
          {(node.sources ?? []).length === 0 ? (
            <div className="text-xs text-gray-300 pl-1">未設定</div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {(node.sources ?? []).map((rel) => (
                <li key={rel} className="flex items-center gap-1 text-xs border border-gray-100 rounded px-1.5 py-0.5 bg-gray-50">
                  <span className="flex-1 truncate text-gray-700" title={rel}>{basename(rel)}</span>
                  <button onClick={() => handleRemoveSource(rel)} className="shrink-0 text-gray-300 hover:text-red-400 leading-none">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {showSourcePicker && (
        <FilePicker baseDir={roots.source} extensions={SOURCE_EXTS} multiple onConfirm={handleSourceConfirm} onCancel={() => setShowSourcePicker(false)} />
      )}
    </>
  )
}

export function LinkageSettings(): JSX.Element {
  const projectPath = useViewerStore((s) => s.projectPath)

  if (!projectPath) {
    return <div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-400 text-center">プロジェクトを開いてください</div>
  }

  return (
    <div className="border-t border-gray-200 bg-white flex flex-col overflow-y-auto max-h-96">
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">紐づけ設定</div>
      <NodeLinkSettings />
    </div>
  )
}