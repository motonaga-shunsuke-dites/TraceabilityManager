import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useViewerStore } from '../../store/viewerStore'
import { initialContent } from '../../store/viewerStore'
import { basename } from '../../utils/path'
import { extractHeadings, loadLinkContent, loadSourceContent } from '../../utils/nodes'
import { extractAdocHeadings } from '../../utils/adoc'
import type { DocLink, LinkNode } from '../../types'
import { FilePicker } from '../FilePicker/FilePicker'

// --- ユーティリティ ---

function toRelative(absPath: string, root: string): string {
  const normAbs = absPath.replace(/\\/g, '/')
  const normRoot = root.replace(/\\/g, '/').replace(/\/?$/, '/')
  return normAbs.startsWith(normRoot) ? normAbs.slice(normRoot.length) : absPath
}

function genLinkId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

const SOURCE_EXTS = ['cs', 'xaml', 'java', 'py', 'cpp', 'cc', 'h', 'ts', 'tsx', 'js', 'jsx']
const MD_EXTS = ['md', 'adoc']

// --- 1つの DocLink を編集するフォーム ---

function LinkEditor({
  link,
  specRoot,
  designRoot,
  onChange,
  onDelete
}: {
  link: DocLink
  specRoot: string
  designRoot: string
  onChange: (patch: Partial<DocLink>) => void
  onDelete: () => void
}): JSX.Element {
  const [specHeadings, setSpecHeadings] = useState<{ value: string; label: string }[]>([])
  const [designHeadings, setDesignHeadings] = useState<{ value: string; label: string }[]>([])
  const [showSpecPicker, setShowSpecPicker] = useState(false)
  const [showDesignPicker, setShowDesignPicker] = useState(false)
  const [renamingDesign, setRenamingDesign] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const handleDesignRenameStart = useCallback(() => {
    if (!link.design) return
    setRenameValue(basename(link.design))
    setRenamingDesign(true)
  }, [link.design])

  const handleDesignRenameCommit = useCallback(async () => {
    const newName = renameValue.trim()
    if (!newName || !link.design || !designRoot) { setRenamingDesign(false); return }
    const oldAbsPath = `${designRoot.replace(/\\/g, '/')}/${link.design}`.replace(/\/\//g, '/')
    const dirPart = link.design.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const newRel = dirPart ? `${dirPart}/${newName}` : newName
    const newAbsPath = `${designRoot.replace(/\\/g, '/')}/${newRel}`.replace(/\/\//g, '/')
    const res = await window.api.renameFile(
      oldAbsPath.replace(/\//g, '\\'),
      newAbsPath.replace(/\//g, '\\')
    )
    if (res.ok) {
      onChange({ design: newRel, designHeading: undefined })
      setDesignHeadings([])
      toast.success(`ファイル名を変更しました: ${newName}`)
    } else {
      toast.error(`名前変更に失敗しました: ${res.error}`)
    }
    setRenamingDesign(false)
  }, [renameValue, link.design, designRoot, onChange])

  // ファイルが変わったら即時に見出しをロード（onFocus では非同期完了前にドロップダウンが開くため）
  useEffect(() => {
    if (!link.spec || !specRoot) { setSpecHeadings([]); return }
    const absPath = `${specRoot.replace(/\\/g, '/').replace(/\/?$/, '/')}${link.spec}`
    window.api.readText(absPath).then((res) => {
      if (!res.ok || !res.data) return
      if (link.spec?.toLowerCase().endsWith('.adoc')) {
        setSpecHeadings(extractAdocHeadings(res.data))
      } else {
        setSpecHeadings(extractHeadings(res.data, link.spec).map((h) => ({ value: h, label: h })))
      }
    })
  }, [link.spec, specRoot])

  useEffect(() => {
    if (!link.design || !designRoot) { setDesignHeadings([]); return }
    const absPath = `${designRoot.replace(/\\/g, '/').replace(/\/?$/, '/')}${link.design}`
    window.api.readText(absPath).then((res) => {
      if (!res.ok || !res.data) return
      if (link.design?.toLowerCase().endsWith('.adoc')) {
        setDesignHeadings(extractAdocHeadings(res.data))
      } else {
        setDesignHeadings(extractHeadings(res.data, link.design).map((h) => ({ value: h, label: h })))
      }
    })
  }, [link.design, designRoot])

  const handleSpecConfirm = useCallback((paths: string[]) => {
    setShowSpecPicker(false)
    if (!paths.length) return
    const rel = toRelative(paths[0], specRoot)
    onChange({ spec: rel, specHeading: undefined })
  }, [specRoot, onChange])

  const handleDesignConfirm = useCallback((paths: string[]) => {
    setShowDesignPicker(false)
    if (!paths.length) return
    const rel = toRelative(paths[0], designRoot)
    onChange({ design: rel, designHeading: undefined })
  }, [designRoot, onChange])

  return (
    <>
      <div className="border border-gray-200 rounded p-2 flex flex-col gap-1.5 bg-gray-50">
        {/* ラベル */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0 w-10">名称</span>
          <input
            value={link.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 min-w-0"
            placeholder="紐づけの名称"
          />
          <button onClick={onDelete} className="shrink-0 text-gray-300 hover:text-red-400 text-xs" title="この紐づけを削除">✕</button>
        </div>

        {/* 仕様書ファイル */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 shrink-0 w-10">仕様書</span>
          <div className="flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-0.5 bg-white truncate text-xs text-gray-700" title={link.spec}>
            {link.spec ? basename(link.spec) : <span className="text-gray-300">未設定</span>}
          </div>
          {link.spec && (
            <button onClick={() => onChange({ spec: undefined, specHeading: undefined })} className="shrink-0 text-gray-300 hover:text-red-400 text-xs">✕</button>
          )}
          <button
            onClick={() => {
              if (!specRoot) { toast.error('仕様書のルートフォルダが未設定です'); return }
              setShowSpecPicker(true)
            }}
            className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
          >…</button>
        </div>

        {/* 仕様書の見出し */}
        {link.spec && (
          <div className="flex items-center gap-1 pl-10 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">見出し</span>
            <select
              value={link.specHeading ?? ''}
              onChange={(e) => onChange({ specHeading: e.target.value || undefined })}
              className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-blue-400 min-w-0"
            >
              <option value="">(全体を表示)</option>
              {specHeadings.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
              {link.specHeading && !specHeadings.find((h) => h.value === link.specHeading) && (
                <option value={link.specHeading}>{link.specHeading}</option>
              )}
            </select>
          </div>
        )}

        {/* 設計書ファイル */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 shrink-0 w-10">設計書</span>
          {renamingDesign ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDesignRenameCommit()
                if (e.key === 'Escape') setRenamingDesign(false)
              }}
              onBlur={handleDesignRenameCommit}
              className="flex-1 text-xs border border-blue-400 rounded px-1.5 py-0.5 outline-none min-w-0"
            />
          ) : (
            <div className="flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-0.5 bg-white truncate text-xs text-gray-700" title={link.design}>
              {link.design ? basename(link.design) : <span className="text-gray-300">未設定</span>}
            </div>
          )}
          {link.design && !renamingDesign && (
            <button onClick={handleDesignRenameStart} className="shrink-0 text-gray-300 hover:text-blue-400 text-xs" title="ファイル名を変更">✏</button>
          )}
          {link.design && !renamingDesign && (
            <button onClick={() => onChange({ design: undefined, designHeading: undefined })} className="shrink-0 text-gray-300 hover:text-red-400 text-xs">✕</button>
          )}
          {!renamingDesign && (
            <button
              onClick={() => {
                if (!designRoot) { toast.error('設計書のルートフォルダが未設定です'); return }
                setShowDesignPicker(true)
              }}
              className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
            >…</button>
          )}
        </div>

        {/* 設計書の見出し */}
        {link.design && (
          <div className="flex items-center gap-1 pl-10 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">見出し</span>
            <select
              value={link.designHeading ?? ''}
              onChange={(e) => onChange({ designHeading: e.target.value || undefined })}
              className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-blue-400 min-w-0"
            >
              <option value="">(全体を表示)</option>
              {designHeadings.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
              {link.designHeading && !designHeadings.find((h) => h.value === link.designHeading) && (
                <option value={link.designHeading}>{link.designHeading}</option>
              )}
            </select>
          </div>
        )}
      </div>

      {showSpecPicker && (
        <FilePicker
          baseDir={specRoot}
          extensions={MD_EXTS}
          onConfirm={handleSpecConfirm}
          onCancel={() => setShowSpecPicker(false)}
        />
      )}
      {showDesignPicker && (
        <FilePicker
          baseDir={designRoot}
          extensions={MD_EXTS}
          onConfirm={handleDesignConfirm}
          onCancel={() => setShowDesignPicker(false)}
        />
      )}
    </>
  )
}

// --- ノード紐づけ設定 ---

function NodeLinkSettings(): JSX.Element {
  const nodes = useViewerStore((s) => s.nodes)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const roots = useViewerStore((s) => s.roots)
  const updateNode = useViewerStore((s) => s.updateNode)
  const content = useViewerStore((s) => s.content)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )

  const links: DocLink[] = node?.links ?? []

  // 選択中ノードのコンテンツを再読み込みしてビューに即時反映する
  const reloadContent = useCallback(async (updatedNode: LinkNode) => {
    const sources = await loadSourceContent(updatedNode, roots)
    const updatedLinks = updatedNode.links ?? []
    if (updatedLinks.length === 0) {
      setContent({ ...initialContent, ...sources })
      setEditingSpec(null)
      setEditingDesign(null)
      return
    }
    const activeLink = updatedLinks.find((l) => l.id === content.activeLinkId) ?? updatedLinks[0]
    const state = await loadLinkContent(activeLink, roots, { ...initialContent, ...sources })
    setContent({ ...state, ...sources })
    setEditingSpec(state.specContent)
    setEditingDesign(state.designContent)
  }, [roots, content.activeLinkId, setContent, setEditingSpec, setEditingDesign])

  const handleAddLink = useCallback(() => {
    if (!node) return
    if (links.length > 0) {
      const last = links[links.length - 1]
      const newLink: DocLink = { ...last, id: genLinkId(), label: `${last.label} (コピー)` }
      updateNode(node.id, { links: [...links, newLink] })
    } else {
      const newLink: DocLink = { id: genLinkId(), label: 'リンク 1' }
      updateNode(node.id, { links: [newLink] })
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
    updateNode(node.id, { sources: merged })
    reloadContent({ ...node, sources: merged })
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
    updateNode(node.id, { sources: newSources })
    reloadContent({ ...node, sources: newSources })
  }, [node, updateNode, reloadContent])

  if (!node) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400 text-center">
        ノードを選択すると<br />紐づけを設定できます
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <div className="text-xs text-gray-400 truncate" title={node.label}>
          対象: <span className="text-gray-600 font-medium">{node.label}</span>
        </div>

        {/* 仕様書-設計書リンク一覧 */}
        {links.map((link) => (
          <LinkEditor
            key={link.id}
            link={link}
            specRoot={roots.spec}
            designRoot={roots.design}
            onChange={(patch) => handleChangeLink(link.id, patch)}
            onDelete={() => handleDeleteLink(link.id)}
          />
        ))}

        <button
          onClick={handleAddLink}
          className="w-full py-1 text-xs rounded border border-dashed border-blue-300 text-blue-400 hover:border-blue-500 hover:text-blue-600 transition-colors"
        >
          {links.length > 0 ? '+ 直前を複製して追加' : '+ 仕様書-設計書の紐づけを追加'}
        </button>

        {/* ソースコード */}
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
        <FilePicker
          baseDir={roots.source}
          extensions={SOURCE_EXTS}
          multiple
          onConfirm={handleSourceConfirm}
          onCancel={() => setShowSourcePicker(false)}
        />
      )}
    </>
  )
}

// --- 公開コンポーネント ---

export function LinkageSettings(): JSX.Element {
  const projectPath = useViewerStore((s) => s.projectPath)

  if (!projectPath) {
    return (
      <div className="border-t border-gray-200 px-3 py-3 text-xs text-gray-400 text-center">
        プロジェクトを開いてください
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 bg-white flex flex-col overflow-y-auto max-h-96">
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
        紐づけ設定
      </div>
      <NodeLinkSettings />
    </div>
  )
}
