import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { ClassItem, DiagramClass, DiagramRelationship, Selection } from './types'
import { isSep } from './utils'
import { ClassForm } from './ClassForm'
import { RelationshipForm } from './RelationshipForm'

interface LeftPanelProps {
  classItems: ClassItem[]
  relationships: DiagramRelationship[]
  selection: Selection
  onSelect: (sel: Selection) => void
  onDeleteClass: (id: string) => void
  onDeleteRel: (id: string) => void
  onAddClass: () => void
  onAddRel: () => void
  onReorderItems: (items: ClassItem[]) => void
  onAddDepthSep: () => void
  onDeleteDepthSep: (id: string) => void
  selectedClass: DiagramClass | null
  selectedRel: DiagramRelationship | null
  packages: string[]
  onUpdateClass: (updated: DiagramClass) => void
  onUpdateRel: (updated: DiagramRelationship) => void
}

export function LeftPanel({
  classItems,
  relationships,
  selection,
  onSelect,
  onDeleteClass,
  onDeleteRel,
  onAddClass,
  onAddRel,
  onReorderItems,
  onAddDepthSep,
  onDeleteDepthSep,
  selectedClass,
  selectedRel,
  packages,
  onUpdateClass,
  onUpdateRel,
}: LeftPanelProps): JSX.Element {
  const classes = useMemo(() => classItems.filter((i): i is DiagramClass => !isSep(i)), [classItems])
  const [leftTab, setLeftTab] = useState<'class' | 'rel'>('class')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null)
  const draggedIdRef = useRef<string | null>(null)

  // 選択が変わったらタブを自動切り替え
  useEffect(() => {
    if (selection?.type === 'class') setLeftTab('class')
    else if (selection?.type === 'rel') setLeftTab('rel')
  }, [selection])

  const computeDropItem = useCallback(
    (dragId: string, beforeId: string | null): ClassItem[] => {
      const dragged = classItems.find((i) => i.id === dragId)
      if (!dragged) return classItems
      const without = classItems.filter((i) => i.id !== dragId)
      if (beforeId === null) return [...without, dragged]
      const targetIdx = without.findIndex((i) => i.id === beforeId)
      const arr = [...without]
      arr.splice(targetIdx >= 0 ? targetIdx : arr.length, 0, dragged)
      return arr
    },
    [classItems]
  )

  const clearDrag = useCallback(() => {
    setDraggedId(null)
    draggedIdRef.current = null
    setDropBeforeId(null)
  }, [])

  const setDragData = useCallback((e: React.DragEvent<HTMLElement>, id: string) => {
    setDraggedId(id)
    draggedIdRef.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const getDraggedId = useCallback((e: React.DragEvent<HTMLElement>): string | null => {
    return e.dataTransfer.getData('text/plain') || draggedIdRef.current || draggedId || null
  }, [draggedId])

  const detailLabel = selectedClass
    ? selectedClass.name
    : selectedRel
    ? `${classes.find((c) => c.id === selectedRel.fromId)?.name ?? '?'} → ${classes.find((c) => c.id === selectedRel.toId)?.name ?? '?'}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブバー */}
      <div className="flex items-center border-b border-gray-200 shrink-0 bg-gray-50">
        <button
          onClick={() => setLeftTab('class')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${leftTab === 'class' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          クラス
          <span className="text-gray-400 font-normal">({classes.length})</span>
        </button>
        <button
          onClick={() => setLeftTab('rel')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${leftTab === 'rel' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          関連
          <span className="text-gray-400 font-normal">({relationships.length})</span>
        </button>
        <div className="flex-1" />
        {leftTab === 'class' ? (
          <button
            onClick={onAddClass}
            className="text-xs px-2 py-1 mr-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
          >+ 追加</button>
        ) : (
          <button
            onClick={onAddRel}
            disabled={classes.length < 2}
            title={classes.length < 2 ? 'クラスが2つ以上必要です' : ''}
            className="text-xs px-2 py-1 mr-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >+ 追加</button>
        )}
      </div>

      {/* リスト + 詳細フォーム */}
      <PanelGroup direction="vertical" className="flex-1 min-h-0">
        <Panel defaultSize={45} minSize={20}>
          <div className="h-full overflow-y-auto">
            {leftTab === 'class' && (
              <>
                {classes.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">クラスがありません</p>
                )}

                {classItems.map((item) => {
                  if (isSep(item)) {
                    return (
                      <div key={item.id}>
                        {dropBeforeId === item.id && <div className="h-0.5 bg-blue-500 mx-3 rounded" />}
                        <div
                          draggable={true}
                          onDragStart={(e) => setDragData(e, item.id)}
                          onDragEnd={clearDrag}
                          onDragOver={(e) => {
                            e.preventDefault(); e.stopPropagation()
                            e.dataTransfer.dropEffect = 'move'
                            setDropBeforeId(item.id)
                          }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation()
                            const sourceId = getDraggedId(e)
                            if (sourceId && sourceId !== item.id) {
                              onReorderItems(computeDropItem(sourceId, item.id))
                              clearDrag()
                            }
                          }}
                          className={['flex items-center gap-1 px-2 py-1 cursor-grab group', draggedId === item.id ? 'opacity-40' : ''].join(' ')}
                          style={{ userSelect: 'none', WebkitUserDrag: 'element' } as React.CSSProperties}
                        >
                          <div className="flex-1 border-t-2 border-dashed border-blue-300" />
                          <span className="text-xs text-blue-400 px-1 select-none whitespace-nowrap">― 深さの区切り ―</span>
                          <div className="flex-1 border-t-2 border-dashed border-blue-300" />
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteDepthSep(item.id) }}
                            className="text-xs text-gray-300 hover:text-red-500 ml-1 shrink-0"
                            title="区切り線を削除"
                          >✕</button>
                        </div>
                      </div>
                    )
                  }

                  const cls = item
                  const isSelected = selection?.type === 'class' && selection.id === cls.id
                  const isDragging = draggedId === cls.id
                  return (
                    <div key={cls.id}>
                      {dropBeforeId === cls.id && <div className="h-0.5 bg-blue-500 mx-3 rounded" />}
                      <div
                        draggable={true}
                        onDragStart={(e) => setDragData(e, cls.id)}
                        onDragEnd={clearDrag}
                        onDragOver={(e) => {
                          e.preventDefault(); e.stopPropagation()
                          e.dataTransfer.dropEffect = 'move'
                          setDropBeforeId(cls.id)
                        }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation()
                          const sourceId = getDraggedId(e)
                          if (sourceId && sourceId !== cls.id) {
                            onReorderItems(computeDropItem(sourceId, cls.id))
                            clearDrag()
                          }
                        }}
                        onClick={() => onSelect({ type: 'class', id: cls.id })}
                        className={[
                          'flex items-center gap-1 py-1.5 px-3 cursor-pointer group transition-colors',
                          isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                          isDragging ? 'opacity-40' : '',
                        ].join(' ')}
                        style={{ userSelect: 'none', WebkitUserDrag: 'element' } as React.CSSProperties}
                      >
                        <span className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0 text-xs" title="ドラッグして並べ替え">⠿</span>
                        <span className="flex-1 text-xs truncate">{cls.name}</span>
                        {cls.annotation && (
                          <span className="text-xs text-gray-400 font-mono shrink-0 hidden group-hover:inline">
                            «{cls.annotation.slice(0, 4)}»
                          </span>
                        )}
                        {cls.package && (
                          <span className="text-xs text-gray-300 shrink-0 truncate max-w-[50px] hidden group-hover:inline" title={cls.package}>
                            {cls.package.split('.').pop()}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteClass(cls.id) }}
                          className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                          title="削除"
                        >✕</button>
                      </div>
                    </div>
                  )
                })}

                {/* 末尾ドロップゾーン */}
                <div
                  className="h-4 mx-3"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropBeforeId(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const sourceId = getDraggedId(e)
                    if (sourceId) { onReorderItems(computeDropItem(sourceId, null)); clearDrag() }
                  }}
                />
                <div className="px-3 pb-2">
                  <button
                    onClick={onAddDepthSep}
                    className="w-full text-xs py-1 rounded border border-dashed border-blue-300 text-blue-400 hover:bg-blue-50 hover:border-blue-400"
                  >
                    ＋ 深さの区切り線を追加
                  </button>
                </div>
              </>
            )}

            {leftTab === 'rel' && (
              <>
                {relationships.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">関連がありません</p>
                )}
                {relationships.map((rel) => {
                  const fromCls = classes.find((c) => c.id === rel.fromId)
                  const toCls = classes.find((c) => c.id === rel.toId)
                  const leftName = fromCls?.name ?? '?'
                  const rightName = toCls?.name ?? '?'
                  const label = rel.label ? ` : ${rel.label}` : ''
                  const display = `${leftName} → ${rightName}${label}`
                  const isSelected = selection?.type === 'rel' && selection.id === rel.id
                  return (
                    <div
                      key={rel.id}
                      className={[
                        'flex items-center gap-1 px-3 py-1.5 cursor-pointer group',
                        isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                      ].join(' ')}
                      onClick={() => onSelect({ type: 'rel', id: rel.id })}
                    >
                      <span className="flex-1 text-xs truncate font-mono" title={display}>{display}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteRel(rel.id) }}
                        className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                        title="削除"
                      >✕</button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="h-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-row-resize" />

        {/* 詳細フォーム */}
        <Panel defaultSize={55} minSize={25}>
          <div className="h-full flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-200 shrink-0">
              {detailLabel ?? '詳細'}
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedClass ? (
                <ClassForm cls={selectedClass} packages={packages} onChange={onUpdateClass} />
              ) : selectedRel ? (
                <RelationshipForm rel={selectedRel} classes={classes} onChange={onUpdateRel} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2 p-4 text-center">
                  <span>リストからクラスまたは関連を選択すると、ここで編集できます</span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
