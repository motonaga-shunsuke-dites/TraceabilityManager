import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Tree, NodeRendererProps } from 'react-arborist'
import { toast } from 'sonner'
import { useViewerStore, initialContent } from '../../store/viewerStore'
import type { LinkNode, TreeNode } from '../../types'
import { loadLinkContent, loadSourceContent } from '../../utils/nodes'

/** LinkNode のフラットリストを react-arborist 用のツリーに変換 */
function buildTree(nodes: LinkNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const n of nodes) {
    map.set(n.id, { id: n.id, name: n.label, children: [], linkNode: n })
  }
  for (const n of nodes) {
    const treeNode = map.get(n.id)!
    if (n.parent && map.has(n.parent)) {
      map.get(n.parent)!.children!.push(treeNode)
    } else {
      roots.push(treeNode)
    }
  }
  const clean = (node: TreeNode): TreeNode => ({
    ...node,
    children: node.children && node.children.length > 0 ? node.children.map(clean) : undefined
  })
  return roots.map(clean)
}

function genId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// --- コンテキストメニュー ---

interface ContextMenuState {
  x: number
  y: number
  nodeId: string
  nodeLabel: string
}

function ContextMenu({
  menu,
  onClose,
  onAddChild,
  onStartRename,
  onDuplicate,
  onDelete
}: {
  menu: ContextMenuState
  onClose: () => void
  onAddChild: (parentId: string) => void
  onStartRename: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ top: menu.y, left: menu.x, position: 'fixed' }}
      className="z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-36"
    >
      <button
        onClick={() => { onAddChild(menu.nodeId); onClose() }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700"
      >
        子ノードを追加
      </button>
      <button
        onClick={() => { onStartRename(menu.nodeId); onClose() }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700"
      >
        名前を変更
      </button>
      <button
        onClick={() => { onDuplicate(menu.nodeId); onClose() }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700"
      >
        複製
      </button>
      <div className="my-1 border-t border-gray-100" />
      <button
        onClick={() => { onDelete(menu.nodeId); onClose() }}
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-600"
      >
        削除
      </button>
    </div>
  )
}

// --- インラインリネーム入力 ---

function RenameInput({
  defaultValue,
  onCommit,
  onCancel
}: {
  defaultValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      defaultValue={defaultValue}
      className="flex-1 text-xs border border-blue-400 rounded px-1 outline-none min-w-0"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value.trim())
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={(e) => onCommit(e.target.value.trim())}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

// --- 単一ノードのレンダラー（コールバックを外部から注入） ---

type NodeRendererExtras = {
  onContextMenu: (e: React.MouseEvent, nodeId: string, label: string) => void
  renamingId: string | null
  onStartRename: (id: string) => void
  onRenameCommit: (id: string, val: string) => void
  onRenameCancel: () => void
}

function makeNodeRenderer(extras: NodeRendererExtras) {
  return function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNode>): JSX.Element {
    const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
    const isSelected = selectedNodeId === node.data.id
    const isFolder = node.children !== null && node.children !== undefined

    if (extras.renamingId === node.data.id) {
      return (
        <div style={style} className="flex items-center gap-1 px-2 py-0.5" ref={dragHandle}>
          <span className="text-gray-400 shrink-0">○</span>
          <RenameInput
            defaultValue={node.data.name}
            onCommit={(val) => extras.onRenameCommit(node.data.id, val)}
            onCancel={extras.onRenameCancel}
          />
        </div>
      )
    }

    return (
      <div
        ref={dragHandle}
        style={style}
        onClick={() => node.select()}
        onDoubleClick={(e) => { e.stopPropagation(); extras.onStartRename(node.data.id) }}
        onContextMenu={(e) => extras.onContextMenu(e, node.data.id, node.data.name)}
        className={[
          'flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer select-none text-sm',
          isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-800'
        ].join(' ')}
      >
        {isFolder ? (
          <span className={isSelected ? 'text-yellow-300' : 'text-yellow-500'}>
            {node.isOpen ? '▾' : '▸'}
          </span>
        ) : (
          <span className={isSelected ? 'text-blue-200' : 'text-gray-400 ml-3'}>○</span>
        )}
        <span className="truncate flex-1">{node.data.name}</span>
      </div>
    )
  }
}

// --- FileTree 本体 ---

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

  // ノード選択時のコンテンツ読み込み
  const loadContent = useCallback(
    async (node: LinkNode) => {
      const links = node.links ?? []
      const sources = await loadSourceContent(node, roots)

      if (links.length === 0) {
        setContent({ ...initialContent, ...sources })
        setEditingSpec(null)
        setEditingDesign(null)
        return
      }

      const state = await loadLinkContent(links[0], roots, { ...initialContent, ...sources })
      setContent({ ...state, ...sources })
      setEditingSpec(state.specContent)
      setEditingDesign(state.designContent)
    },
    [roots, setContent, setEditingSpec, setEditingDesign]
  )

  const handleSelect = useCallback(
    async (selected: { data: TreeNode }[]) => {
      if (selected.length === 0) return
      const node = selected[0].data.linkNode
      setSelectedNodeId(node.id)
      await loadContent(node)
    },
    [nodes, loadContent, setSelectedNodeId]
  )

  // ノード追加
  const handleAddNode = useCallback(
    (parentId: string) => {
      const newNode: LinkNode = { id: genId(), label: 'New Item', parent: parentId }
      addNode(newNode)
      setRenamingId(newNode.id)
    },
    [addNode]
  )

  const handleAddRootNode = useCallback(() => {
    const newNode: LinkNode = { id: genId(), label: 'New Item', parent: '' }
    addNode(newNode)
    setRenamingId(newNode.id)
  }, [addNode])

  // リネーム確定
  const handleRenameCommit = useCallback(
    (id: string, val: string) => {
      if (val) updateNode(id, { label: val })
      setRenamingId(null)
    },
    [updateNode]
  )

  // ノード複製（子孫ごと）
  const handleDuplicate = useCallback(
    (id: string) => {
      const currentNodes = useViewerStore.getState().nodes
      const original = currentNodes.find((n) => n.id === id)
      if (!original) return

      const getAllDescendants = (nodeId: string): LinkNode[] => {
        const children = currentNodes.filter((n) => n.parent === nodeId)
        return children.flatMap((child) => [child, ...getAllDescendants(child.id)])
      }

      const descendants = getAllDescendants(id)
      const idMap = new Map<string, string>()
      idMap.set(id, genId())
      descendants.forEach((d) => idMap.set(d.id, genId()))

      const newOriginal: LinkNode = {
        ...original,
        id: idMap.get(id)!,
        label: `${original.label} (コピー)`
      }
      const newDescendants = descendants.map((d) => ({
        ...d,
        id: idMap.get(d.id)!,
        parent: idMap.get(d.parent) ?? d.parent
      }))

      // サブツリーの最後のノードの直後に挿入
      const subtreeIds = new Set([id, ...descendants.map((d) => d.id)])
      let lastIdx = 0
      currentNodes.forEach((n, i) => { if (subtreeIds.has(n.id)) lastIdx = i })

      const result = [
        ...currentNodes.slice(0, lastIdx + 1),
        newOriginal,
        ...newDescendants,
        ...currentNodes.slice(lastIdx + 1)
      ]

      setNodes(result)
      toast.success(`「${original.label}」を複製しました`)
    },
    [setNodes]
  )

  // ノード削除
  const handleDelete = useCallback(
    (id: string) => {
      const target = nodes.find((n) => n.id === id)
      if (!target) return
      removeNode(id)
      if (selectedNodeId === id) {
        setSelectedNodeId(null)
        setContent(initialContent)
      }
      toast.success(`「${target.label}」を削除しました`)
    },
    [nodes, removeNode, selectedNodeId, setSelectedNodeId, setContent]
  )

  // ドラッグ＆ドロップで並び替え
  const handleMove = useCallback(
    ({ dragIds, parentId, index }: { dragIds: string[]; parentId: string | null; index: number }) => {
      const currentNodes = useViewerStore.getState().nodes
      const newParent = parentId ?? ''

      // dragged ノードとその全子孫を収集
      const getAllDescendants = (nodeId: string): string[] => {
        const children = currentNodes.filter((n) => n.parent === nodeId).map((n) => n.id)
        return children.flatMap((cid) => [cid, ...getAllDescendants(cid)])
      }
      const dragSet = new Set(dragIds)
      dragIds.forEach((id) => getAllDescendants(id).forEach((did) => dragSet.add(did)))

      const draggedNodes = currentNodes
        .filter((n) => dragSet.has(n.id))
        .map((n) => (dragIds.includes(n.id) ? { ...n, parent: newParent } : n))

      const rest = currentNodes.filter((n) => !dragSet.has(n.id))

      // 新しい親の兄弟ノードの位置から挿入先を決定
      const siblingIndices = rest
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.parent === newParent)

      let insertAt: number
      if (siblingIndices.length === 0) {
        // 子がいない親ノードの直後に挿入
        const parentIdx = rest.findIndex((n) => n.id === newParent)
        insertAt = parentIdx >= 0 ? parentIdx + 1 : rest.length
      } else if (index >= siblingIndices.length) {
        insertAt = siblingIndices[siblingIndices.length - 1].i + 1
      } else {
        insertAt = siblingIndices[index].i
      }

      setNodes([...rest.slice(0, insertAt), ...draggedNodes, ...rest.slice(insertAt)])
    },
    [setNodes]
  )

  // コンテキストメニュー
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string, nodeLabel: string) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId, nodeLabel })
    },
    []
  )

  // ノードレンダラー
  const NodeRenderer = useMemo(
    () => makeNodeRenderer({
      onContextMenu: handleContextMenu,
      renamingId,
      onStartRename: (id) => setRenamingId(id),
      onRenameCommit: handleRenameCommit,
      onRenameCancel: () => setRenamingId(null)
    }),
    [handleContextMenu, renamingId, handleRenameCommit]
  )

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs px-4 text-center">
          ノードがありません
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={handleAddRootNode}
            className="w-full py-1 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            + ノードを追加
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto py-1">
        <Tree
          data={treeData}
          onSelect={handleSelect}
          onMove={handleMove}
          rowHeight={28}
          width="100%"
          height={600}
        >
          {NodeRenderer}
        </Tree>
      </div>

      {/* 下部ボタン */}
      <div className="px-3 py-2 border-t border-gray-100 flex gap-1 shrink-0">
        <button
          onClick={handleAddRootNode}
          className="flex-1 py-0.5 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          + ルート追加
        </button>
        {selectedNodeId && (
          <button
            onClick={() => handleAddNode(selectedNodeId)}
            className="flex-1 py-0.5 text-xs rounded border border-dashed border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-500 transition-colors"
          >
            + 子追加
          </button>
        )}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddChild={handleAddNode}
          onStartRename={(id) => setRenamingId(id)}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
