import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useViewerStore, initialContent, type ViewMode, type PaneVisible } from '../../store/viewerStore'
import { FileTree } from '../Tree/FileTree'
import { ContentViewer } from '../Viewer/ContentViewer'
import { LinkageSettings } from '../Settings/LinkageSettings'
import type { ViewerProject, Roots } from '../../types'
import { migrateNodes, loadLinkContent, loadSourceContent } from '../../utils/nodes'
import { path as joinPath, basename } from '../../utils/path'
import { ClassEditorApp } from '../ClassEditor/ClassEditorApp'

// --- ルートフォルダ設定モーダル ---

function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
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
      <div
        className="bg-white rounded-lg shadow-xl w-[440px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
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
                <div
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 bg-gray-50 text-xs text-gray-700 truncate"
                  title={roots[key]}
                >
                  {roots[key] || <span className="text-gray-300">未設定</span>}
                </div>
                <button
                  onClick={() => changeRoot(key)}
                  className="shrink-0 px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                >
                  …
                </button>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

// --- 新規ファイル作成モーダル ---

interface DirNode {
  name: string
  fullPath: string
  children: DirNode[]
}

function buildDirTree(rootPath: string, allDirs: string[]): DirNode {
  const root: DirNode = { name: rootPath.split(/[\\/]/).pop() ?? rootPath, fullPath: rootPath, children: [] }
  const nodeMap = new Map<string, DirNode>([[rootPath, root]])

  // sort to ensure parents come before children
  const sorted = [...allDirs].sort()
  for (const dir of sorted) {
    const parts = dir.split(/[\\/]/)
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join('/')
    // Normalize separators for lookup
    const normalizedDir = dir.replace(/\\/g, '/')
    const normalizedRoot = rootPath.replace(/\\/g, '/')

    // Find parent node
    let parentNode: DirNode | undefined
    const dirNorm = dir.replace(/\\/g, '/')
    // Walk up to find closest known parent
    const dirParts = dirNorm.split('/')
    for (let i = dirParts.length - 1; i >= 1; i--) {
      const candidate = dirParts.slice(0, i).join('/')
      // try both slash variants
      const found = nodeMap.get(candidate) ?? nodeMap.get(candidate.replace(/\//g, '\\'))
      if (found) {
        parentNode = found
        break
      }
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
  node,
  selectedPath,
  onSelect,
  depth = 0
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
        className={[
          'flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded text-xs select-none',
          isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
        ].join(' ')}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => { onSelect(node.fullPath); if (hasChildren) setOpen((o) => !o) }}
      >
        <span className="shrink-0 w-3 text-gray-400">
          {hasChildren ? (open ? '▾' : '▸') : ' '}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      {open && hasChildren && node.children.map((child) => (
        <DirTreeNode key={child.fullPath} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

function NewFileModal({ onClose }: { onClose: () => void }): JSX.Element {
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
      if (res.ok) {
        setDirTree(buildDirTree(baseDir, res.data ?? []))
      }
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
    if (!baseDir) {
      toast.error(`${typeLabel}のルートフォルダが未設定です`)
      return
    }
    const absPath = joinPath(targetDir, finalName)
    const res = await window.api.createFile(absPath, '')
    if (res.ok) {
      toast.success(`作成しました: ${finalName}`)
      onClose()
    } else {
      toast.error(`作成に失敗しました: ${res.error}`)
    }
  }, [finalName, targetDir, baseDir, typeLabel, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[500px] flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-700">新規ファイル作成</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4 overflow-y-auto flex-1">
          {/* 種別 */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 w-16 shrink-0">種別</span>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={type === 'spec'} onChange={() => setType('spec')} />
              仕様書
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={type === 'design'} onChange={() => setType('design')} />
              設計書
            </label>
          </div>

          {/* フォルダツリー */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">保存フォルダ</span>
            {!baseDir ? (
              <div className="text-xs text-amber-500 bg-amber-50 rounded px-2 py-1.5">
                未設定（設定ボタンからルートフォルダを設定してください）
              </div>
            ) : loading ? (
              <div className="text-xs text-gray-400 px-2 py-2">読み込み中...</div>
            ) : dirTree ? (
              <div className="border border-gray-200 rounded overflow-y-auto max-h-40 bg-gray-50 py-1">
                <DirTreeNode node={dirTree} selectedPath={selectedDir} onSelect={setSelectedDir} depth={0} />
              </div>
            ) : null}
          </div>

          {/* ファイル名入力 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">ファイル名</label>
            <input
              autoFocus
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="例: login_spec.md"
              className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          {/* プレビュー */}
          {previewPath && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5 break-all">
              <span className="font-medium text-gray-500">作成先: </span>{previewPath}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleCreate}
            disabled={!finalName || !targetDir || !baseDir}
            className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
          >
            作成
          </button>
        </div>
      </div>
    </div>
  )
}

// --- ツールバー ---

function Toolbar(): JSX.Element {
  const mode = useViewerStore((s) => s.mode)
  const setMode = useViewerStore((s) => s.setMode)
  const projectPath = useViewerStore((s) => s.projectPath)
  const setProjectPath = useViewerStore((s) => s.setProjectPath)
  const setNodes = useViewerStore((s) => s.setNodes)
  const setRoots = useViewerStore((s) => s.setRoots)
  const resetProject = useViewerStore((s) => s.resetProject)
  const setContent = useViewerStore((s) => s.setContent)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)
  const setSelectedNodeId = useViewerStore((s) => s.setSelectedNodeId)
  const paneVisible = useViewerStore((s) => s.paneVisible)
  const togglePane = useViewerStore((s) => s.togglePane)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [classEditorOpen, setClassEditorOpen] = useState(false)

  const handleModeToggle = useCallback(() => {
    const next: ViewMode = mode === 'view' ? 'edit' : 'view'
    // 編集→閲覧切り替え時: 編集中の内容を即時 content に反映
    if (next === 'view') {
      const { editingSpec, editingDesign, content } = useViewerStore.getState()
      setContent({
        ...content,
        ...(editingSpec !== null ? { specContent: editingSpec } : {}),
        ...(editingDesign !== null ? { designContent: editingDesign } : {})
      })
    }
    setMode(next)
    toast.info(next === 'edit' ? '編集モードに切り替えました' : '閲覧モードに切り替えました')
  }, [mode, setMode, setContent])

  const handleOpenProject = useCallback(async () => {
    const filePath = await window.api.openToml()
    if (!filePath) return

    const res = await window.api.readToml(filePath)
    if (!res.ok) {
      toast.error(`プロジェクトを開けませんでした: ${res.error}`)
      return
    }

    const project = res.data as ViewerProject
    const roots = project.roots ?? { spec: '', design: '', source: '' }
    const nodes = migrateNodes(project.nodes ?? [])
    setProjectPath(filePath)
    setRoots(roots)
    setNodes(nodes)
    await window.api.storeSet('lastProjectPath', filePath)

    // 前回選択していたノードを復元
    const lastNodeId = await window.api.storeGet(`selectedNode_${filePath}`)
    if (lastNodeId && typeof lastNodeId === 'string') {
      const node = nodes.find((n) => n.id === lastNodeId)
      if (node) {
        setSelectedNodeId(node.id)
        const sources = await loadSourceContent(node, roots)
        const links = node.links ?? []
        if (links.length > 0) {
          const state = await loadLinkContent(links[0], roots, { ...initialContent, ...sources })
          setContent({ ...state, ...sources })
          setEditingSpec(state.specContent)
          setEditingDesign(state.designContent)
        } else {
          setContent({ ...initialContent, ...sources })
          setEditingSpec(null)
          setEditingDesign(null)
        }
      }
    }

    toast.success('プロジェクトを開きました')
  }, [setProjectPath, setRoots, setNodes, setSelectedNodeId, setContent, setEditingSpec, setEditingDesign])

  const handleNewProject = useCallback(async () => {
    const savePath = await window.api.saveToml()
    if (!savePath) return

    const spec = await window.api.selectFolder()
    if (!spec) return
    const design = await window.api.selectFolder()
    if (!design) return
    const source = await window.api.selectFolder()
    if (!source) return

    const project: ViewerProject = {
      roots: { spec, design, source },
      nodes: []
    }

    const res = await window.api.writeToml(savePath, project)
    if (!res.ok) {
      toast.error(`保存に失敗しました: ${res.error}`)
      return
    }

    resetProject()
    setProjectPath(savePath)
    setRoots(project.roots)
    setNodes([])
    await window.api.storeSet('lastProjectPath', savePath)
    toast.success('新しいプロジェクトを作成しました')
  }, [resetProject, setProjectPath, setRoots, setNodes])

  const handleSaveProject = useCallback(async () => {
    if (!projectPath) {
      toast.error('プロジェクトが開かれていません')
      return
    }
    const nodes = useViewerStore.getState().nodes
    const roots = useViewerStore.getState().roots
    const project: ViewerProject = { roots, nodes }
    const res = await window.api.writeToml(projectPath, project)
    if (res.ok) {
      toast.success('プロジェクトを保存しました')
    } else {
      toast.error(`保存に失敗しました: ${res.error}`)
    }
  }, [projectPath])

  const paneLabels: Record<keyof PaneVisible, string> = {
    spec: '仕様書',
    design: '設計書',
    source: 'ソース'
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shadow-sm flex-wrap">
        {/* ロゴ */}
        <span className="font-bold text-gray-700 text-sm mr-1">ドキュメントビューワー</span>

        {/* プロジェクト操作 */}
        <button
          onClick={handleNewProject}
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          新規
        </button>
        <button
          onClick={handleOpenProject}
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          開く
        </button>
        <button
          onClick={handleSaveProject}
          disabled={!projectPath}
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40"
        >
          保存
        </button>

        <div className="w-px h-5 bg-gray-200" />

        {/* 設定 */}
        <button
          onClick={() => setSettingsOpen(true)}
          disabled={!projectPath}
          title="ルートフォルダ設定"
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40"
        >
          ⚙ 設定
        </button>

        {/* 新規ファイル作成 */}
        <button
          onClick={() => setNewFileOpen(true)}
          disabled={!projectPath}
          title="仕様書・設計書を新規作成"
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40"
        >
          + ファイル
        </button>

        {/* クラス図エディター */}
        <button
          onClick={() => setClassEditorOpen(true)}
          title="クラス図を作成・編集"
          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          クラス図
        </button>

        <div className="w-px h-5 bg-gray-200" />

        {/* ペイン表示切替 */}
        {(['spec', 'design', 'source'] as const).map((key) => (
          <button
            key={key}
            onClick={() => togglePane(key)}
            title={`${paneLabels[key]}の表示切替`}
            className={[
              'px-2 py-1 text-xs rounded border transition-colors',
              paneVisible[key]
                ? 'bg-blue-50 text-blue-600 border-blue-300 hover:bg-blue-100'
                : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
            ].join(' ')}
          >
            {paneLabels[key]}
          </button>
        ))}

        <div className="flex-1" />

        {/* プロジェクトパス表示 */}
        {projectPath && (
          <span className="text-xs text-gray-400 shrink-0" title={projectPath}>
            {basename(projectPath)}
          </span>
        )}

        <div className="w-px h-5 bg-gray-200" />

        {/* モード切り替え */}
        <button
          onClick={handleModeToggle}
          className={[
            'px-3 py-1 text-xs rounded font-semibold transition-colors',
            mode === 'edit'
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          ].join(' ')}
        >
          {mode === 'edit' ? '✏️ 編集中' : '👁 閲覧中'}
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {newFileOpen && <NewFileModal onClose={() => setNewFileOpen(false)} />}
      {classEditorOpen && <ClassEditorApp onClose={() => setClassEditorOpen(false)} />}
    </>
  )
}

export function MainLayout(): JSX.Element {
  const paneVisible = useViewerStore((s) => s.paneVisible)
  const setPaneVisible = useViewerStore((s) => s.setPaneVisible)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const projectPath = useViewerStore((s) => s.projectPath)

  // 起動時に paneVisible を復元
  const paneLoadedRef = useRef(false)
  useEffect(() => {
    window.api.storeGet('paneVisible').then((val) => {
      if (val && typeof val === 'object') {
        const pv = val as Record<string, unknown>
        if (typeof pv.spec === 'boolean' && typeof pv.design === 'boolean' && typeof pv.source === 'boolean') {
          setPaneVisible({ spec: pv.spec, design: pv.design, source: pv.source })
        }
      }
      paneLoadedRef.current = true
    })
  }, [setPaneVisible])

  // paneVisible 変更時に保存
  useEffect(() => {
    if (!paneLoadedRef.current) return
    window.api.storeSet('paneVisible', paneVisible)
  }, [paneVisible])

  // selectedNodeId 変更時に保存（プロジェクトパスと紐づける）
  useEffect(() => {
    if (!projectPath) return
    window.api.storeSet(`selectedNode_${projectPath}`, selectedNodeId ?? null)
  }, [selectedNodeId, projectPath])

  return (
    <div className="flex flex-col h-screen bg-white">
      <Toolbar />
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* サイドバー（ツリー） */}
          <Panel defaultSize={22} minSize={14} maxSize={45}>
            <div className="h-full border-r border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 shrink-0">
                ドキュメント構成
              </div>
              <div className="flex-1 overflow-hidden">
                <FileTree />
              </div>
              <LinkageSettings />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />

          {/* メインコンテンツ */}
          <Panel>
            <ContentViewer />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
