import { useCallback, useMemo, useState } from 'react'
import { Tree } from 'react-arborist'
import { toast } from 'sonner'
import { useViewerStore, initialContent } from '../../store/viewerStore'
import type { LinkNode, TreeNode } from '../../types'
import { loadLinkContent, loadSourceContent } from '../../utils/nodes'
import { ContextMenu, ContextMenuState, makeNodeRenderer } from './NodeRenderer'

function buildTree(nodes: LinkNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  for (const n of nodes) map.set(n.id, { id: n.id, name: n.label, children: [], linkNode: n })
  for (const n of nodes) {
    const treeNode = map.get(n.id)!
    if (n.parent && map.has(n.parent)) map.get(n.parent)!.children!.push(treeNode)
    else roots.push(treeNode)
  }
  const clean = (node: TreeNode): TreeNode => ({
    ...node, children: node.children && node.children.length > 0 ? node.children.map(clean) : undefined
  })
  return roots.map(clean)
}

function genId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function FileTree(): JSX.Element {
  const nodes = useViewerStore((s) => s.nodes)
  const roots = useViewerStore((s) => s.roots)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useViewerStore((s) => s.setSelectedNodeId)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)
  const addNode = useViewerStore((s) => s.addNode)
  const updateNode = useViewerStore((s) => s.updateNode)
  const removeNode = useViewerStore((s) => s.removeNode)
  const setNodes = useViewerStore((s) => s.setNodes)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const treeData = useMemo(() => buildTree(nodes), [nodes])

  const loadContent = useCallback(async (node: LinkNode) => {
    const links = node.links ?? []
    const sources = await loadSourceContent(node, roots)
    if (links.length === 0) {
      setContent({ ...initialContent, ...sources }); setEditingSpec(null); setEditingDesign(null); return
    }
    const state = await loadLinkContent(links[0], roots, { ...initialContent, ...sources })
    setContent({ ...state, ...sources }); setEditingSpec(state.specContent); setEditingDesign(state.designContent)
  }, [roots, setContent, setEditingSpec, setEditingDesign])

  const handleSelect = useCallback(async (selected: { data: TreeNode }[]) => {
    if (selected.length === 0) return
    const node = selected[0].data.linkNode
    setSelectedNodeId(node.id)
    await loadContent(node)
  }, [nodes, loadContent, setSelectedNodeId])

  const handleAddNode = useCallback((parentId: string) => {
    const newNode: LinkNode = { id: genId(), label: 'New Item', parent: parentId }
    addNode(newNode); setRenamingId(newNode.id)
  }, [addNode])

  const handleAddRootNode = useCallback(() => {
    const newNode: LinkNode = { id: genId(), label: 'New Item', parent: '' }
    addNode(newNode); setRenamingId(newNode.id)
  }, [addNode])

  const handleRenameCommit = useCallback((id: string, val: string) => {
    if (val) updateNode(id, { label: val }); setRenamingId(null)
  }, [updateNode])

  const handleDuplicate = useCallback((id: string) => {
    const currentNodes = useViewerStore.getState().nodes
    const original = currentNodes.find((n) => n.id === id)
    if (!original) return

    const getAllDescendants = (nodeId: string): LinkNode[] => {
      const children = currentNodes.filter((n) => n.parent === nodeId)
      return children.flatMap((child) => [child, ...getAllDescendants(child.id)])
    }
    const descendants = getAllDescendants(id)
    const idMap = new Map<string, string>()
    idMap.set(id, genId()); descendants.forEach((d) => idMap.set(d.id, genId()))

    const newOriginal: LinkNode = { ...original, id: idMap.get(id)!, label: `${original.label} (コピー)` }
    const newDescendants = descendants.map((d) => ({ ...d, id: idMap.get(d.id)!, parent: idMap.get(d.parent) ?? d.parent }))

    const subtreeIds = new Set([id, ...descendants.map((d) => d.id)])
    let lastIdx = 0
    currentNodes.forEach((n, i) => { if (subtreeIds.has(n.id)) lastIdx = i })

    setNodes([...currentNodes.slice(0, lastIdx + 1), newOriginal, ...newDescendants, ...currentNodes.slice(lastIdx + 1)])
    toast.success(`「${original.label}」を複製しました`)
  }, [setNodes])

  const handleDelete = useCallback((id: string) => {
    const target = nodes.find((n) => n.id === id)
    if (!target) return
    removeNode(id)
    if (selectedNodeId === id) { setSelectedNodeId(null); setContent(initialContent) }
    toast.success(`「${target.label}」を削除しました`)
  }, [nodes, removeNode, selectedNodeId, setSelectedNodeId, setContent])

  const handleMove = useCallback(({ dragIds, parentId, index }: { dragIds: string[]; parentId: string | null; index: number }) => {
    const currentNodes = useViewerStore.getState().nodes
    const newParent = parentId ?? ''
    const getAllDescendants = (nodeId: string): string[] => {
      const children = currentNodes.filter((n) => n.parent === nodeId).map((n) => n.id)
      return children.flatMap((cid) => [cid, ...getAllDescendants(cid)])
    }
    const dragSet = new Set(dragIds)
    dragIds.forEach((id) => getAllDescendants(id).forEach((did) => dragSet.add(did)))
    const draggedNodes = currentNodes.filter((n) => dragSet.has(n.id)).map((n) => (dragIds.includes(n.id) ? { ...n, parent: newParent } : n))
    const rest = currentNodes.filter((n) => !dragSet.has(n.id))
    const siblingIndices = rest.map((n, i) => ({ n, i })).filter(({ n }) => n.parent === newParent)
    let insertAt: number
    if (siblingIndices.length === 0) {
      const parentIdx = rest.findIndex((n) => n.id === newParent)
      insertAt = parentIdx >= 0 ? parentIdx + 1 : rest.length
    } else if (index >= siblingIndices.length) {
      insertAt = siblingIndices[siblingIndices.length - 1].i + 1
    } else {
      insertAt = siblingIndices[index].i
    }
    setNodes([...rest.slice(0, insertAt), ...draggedNodes, ...rest.slice(insertAt)])
  }, [setNodes])

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string, nodeLabel: string) => {
    e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, nodeId, nodeLabel })
  }, [])

  const NodeRenderer = useMemo(() => makeNodeRenderer({
    onContextMenu: handleContextMenu,
    renamingId,
    onStartRename: (id) => setRenamingId(id),
    onRenameCommit: handleRenameCommit,
    onRenameCancel: () => setRenamingId(null)
  }), [handleContextMenu, renamingId, handleRenameCommit])

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs px-4 text-center">ノードがありません</div>
        <div className="px-3 pb-3">
          <button onClick={handleAddRootNode} className="w-full py-1 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">+ ノードを追加</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto py-1">
        <Tree data={treeData} onSelect={handleSelect} onMove={handleMove} rowHeight={28} width="100%" height={600}>
          {NodeRenderer}
        </Tree>
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex gap-1 shrink-0">
        <button onClick={handleAddRootNode} className="flex-1 py-0.5 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">+ ルート追加</button>
        {selectedNodeId && (
          <button onClick={() => handleAddNode(selectedNodeId)} className="flex-1 py-0.5 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-500 transition-colors">+ 子追加</button>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          menu={contextMenu} onClose={() => setContextMenu(null)}
          onAddChild={handleAddNode} onStartRename={(id) => setRenamingId(id)}
          onDuplicate={handleDuplicate} onDelete={handleDelete}
        />
      )}
    </div>
  )
}