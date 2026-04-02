import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useViewerStore, initialContent, type ViewMode, type PaneVisible } from '../../store/viewerStore'
import { migrateNodes, loadLinkContent, loadSourceContent } from '../../utils/nodes'
import { basename } from '../../utils/path'
import { ClassEditorApp } from '../ClassEditor/ClassEditorApp'
import { ScreenFlowEditorApp } from '../ScreenFlowEditor/ScreenFlowEditorApp'
import type { ViewerProject } from '../../types'
import { SettingsModal } from './SettingsModal'
import { NewFileModal } from './NewFileModal'

export function Toolbar(): JSX.Element {
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
  const [screenFlowEditorOpen, setScreenFlowEditorOpen] = useState(false)

  const handleModeToggle = useCallback(() => {
    const next: ViewMode = mode === 'view' ? 'edit' : 'view'
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
    if (!res.ok) { toast.error(`プロジェクトを開けませんでした: ${res.error}`); return }

    const project = res.data as ViewerProject
    const roots = project.roots ?? { spec: '', design: '', source: '' }
    const nodes = migrateNodes(project.nodes ?? [])
    setProjectPath(filePath); setRoots(roots); setNodes(nodes)
    await window.api.storeSet('lastProjectPath', filePath)

    const lastNodeId = await window.api.storeGet(`selectedNode_${filePath}`)
    if (lastNodeId && typeof lastNodeId === 'string') {
      const node = nodes.find((n) => n.id === lastNodeId)
      if (node) {
        setSelectedNodeId(node.id)
        const sources = await loadSourceContent(node, roots)
        const links = node.links ?? []
        if (links.length > 0) {
          const state = await loadLinkContent(links[0], roots, { ...initialContent, ...sources })
          setContent({ ...state, ...sources }); setEditingSpec(state.specContent); setEditingDesign(state.designContent)
        } else {
          setContent({ ...initialContent, ...sources }); setEditingSpec(null); setEditingDesign(null)
        }
      }
    }
    toast.success('プロジェクトを開きました')
  }, [setProjectPath, setRoots, setNodes, setSelectedNodeId, setContent, setEditingSpec, setEditingDesign])

  const handleNewProject = useCallback(async () => {
    const savePath = await window.api.saveToml()
    if (!savePath) return
    const spec = await window.api.selectFolder(); if (!spec) return
    const design = await window.api.selectFolder(); if (!design) return
    const source = await window.api.selectFolder(); if (!source) return

    const project: ViewerProject = { roots: { spec, design, source }, nodes: [] }
    const res = await window.api.writeToml(savePath, project)
    if (!res.ok) { toast.error(`保存に失敗しました: ${res.error}`); return }

    resetProject(); setProjectPath(savePath); setRoots(project.roots); setNodes([])
    await window.api.storeSet('lastProjectPath', savePath)
    toast.success('新しいプロジェクトを作成しました')
  }, [resetProject, setProjectPath, setRoots, setNodes])

  const handleSaveProject = useCallback(async () => {
    if (!projectPath) { toast.error('プロジェクトが開かれていません'); return }
    const nodes = useViewerStore.getState().nodes
    const roots = useViewerStore.getState().roots
    const res = await window.api.writeToml(projectPath, { roots, nodes } as ViewerProject)
    if (res.ok) toast.success('プロジェクトを保存しました')
    else toast.error(`保存に失敗しました: ${res.error}`)
  }, [projectPath])

  const paneLabels: Record<keyof PaneVisible, string> = { spec: '仕様書', design: '設計書', source: 'ソース' }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shadow-sm flex-wrap">
        <span className="font-bold text-gray-700 text-sm mr-1">ドキュメントビューワー</span>
        <button onClick={handleNewProject} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700">新規</button>
        <button onClick={handleOpenProject} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700">開く</button>
        <button onClick={handleSaveProject} disabled={!projectPath} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40">保存</button>
        <div className="w-px h-5 bg-gray-200" />
        <button onClick={() => setSettingsOpen(true)} disabled={!projectPath} title="ルートフォルダ設定" className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40">⚙ 設定</button>
        <button onClick={() => setNewFileOpen(true)} disabled={!projectPath} title="仕様書・設計書を新規作成" className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40">+ ファイル</button>
        <button onClick={() => setClassEditorOpen(true)} title="クラス図を作成・編集" className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700">クラス図</button>
        <button onClick={() => setScreenFlowEditorOpen(true)} title="画面遷移図を作成・編集" className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700">画面遷移図</button>
        <div className="w-px h-5 bg-gray-200" />
        {(['spec', 'design', 'source'] as const).map((key) => (
          <button
            key={key} onClick={() => togglePane(key)} title={`${paneLabels[key]}の表示切替`}
            className={['px-2 py-1 text-xs rounded border transition-colors',
              paneVisible[key] ? 'bg-blue-50 text-blue-600 border-blue-300 hover:bg-blue-100' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'].join(' ')}
          >{paneLabels[key]}</button>
        ))}
        <div className="flex-1" />
        {projectPath && <span className="text-xs text-gray-400 shrink-0" title={projectPath}>{basename(projectPath)}</span>}
        <div className="w-px h-5 bg-gray-200" />
        <button
          onClick={handleModeToggle}
          className={['px-3 py-1 text-xs rounded font-semibold transition-colors',
            mode === 'edit' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-blue-500 text-white hover:bg-blue-600'].join(' ')}
        >{mode === 'edit' ? '✏️ 編集中' : '👁 閲覧中'}</button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {newFileOpen && <NewFileModal onClose={() => setNewFileOpen(false)} />}
      {classEditorOpen && <ClassEditorApp onClose={() => setClassEditorOpen(false)} />}
      {screenFlowEditorOpen && <ScreenFlowEditorApp onClose={() => setScreenFlowEditorOpen(false)} />}
    </>
  )
}
