import { useEffect, useRef } from 'react'
import { NodeRendererProps } from 'react-arborist'
import { useViewerStore } from '../../store/viewerStore'
import type { TreeNode } from '../../types'

export interface ContextMenuState {
  x: number
  y: number
  nodeId: string
  nodeLabel: string
}

export function ContextMenu({
  menu, onClose, onAddChild, onStartRename, onDuplicate, onDelete
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
    <div ref={ref} style={{ top: menu.y, left: menu.x, position: 'fixed' }}
      className="z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-36">
      <button onClick={() => { onAddChild(menu.nodeId); onClose() }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700">子ノードを追加</button>
      <button onClick={() => { onStartRename(menu.nodeId); onClose() }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700">名前を変更</button>
      <button onClick={() => { onDuplicate(menu.nodeId); onClose() }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 text-gray-700">複製</button>
      <div className="my-1 border-t border-gray-100" />
      <button onClick={() => { onDelete(menu.nodeId); onClose() }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-600">削除</button>
    </div>
  )
}

function RenameInput({ defaultValue, onCommit, onCancel }: {
  defaultValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <input
      ref={ref} defaultValue={defaultValue}
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

export type NodeRendererExtras = {
  onContextMenu: (e: React.MouseEvent, nodeId: string, label: string) => void
  renamingId: string | null
  onStartRename: (id: string) => void
  onRenameCommit: (id: string, val: string) => void
  onRenameCancel: () => void
}

export function makeNodeRenderer(extras: NodeRendererExtras) {
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
        ref={dragHandle} style={style}
        onClick={() => node.select()}
        onDoubleClick={(e) => { e.stopPropagation(); extras.onStartRename(node.data.id) }}
        onContextMenu={(e) => extras.onContextMenu(e, node.data.id, node.data.name)}
        className={['flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer select-none text-sm',
          isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-800'].join(' ')}
      >
        {isFolder ? (
          <span className={isSelected ? 'text-yellow-300' : 'text-yellow-500'}>{node.isOpen ? '▾' : '▸'}</span>
        ) : (
          <span className={isSelected ? 'text-blue-200' : 'text-gray-400 ml-3'}>○</span>
        )}
        <span className="truncate flex-1">{node.data.name}</span>
      </div>
    )
  }
}
