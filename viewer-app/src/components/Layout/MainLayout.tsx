import { useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useViewerStore } from '../../store/viewerStore'
import { FileTree } from '../Tree/FileTree'
import { ContentViewer } from '../Viewer/ContentViewer'
import { LinkageSettings } from '../Settings/LinkageSettings'
import { Toolbar } from './Toolbar'

export function MainLayout(): JSX.Element {
  const paneVisible = useViewerStore((s) => s.paneVisible)
  const setPaneVisible = useViewerStore((s) => s.setPaneVisible)
  const selectedNodeId = useViewerStore((s) => s.selectedNodeId)
  const projectPath = useViewerStore((s) => s.projectPath)

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

  useEffect(() => {
    if (!paneLoadedRef.current) return
    window.api.storeSet('paneVisible', paneVisible)
  }, [paneVisible])

  useEffect(() => {
    if (!projectPath) return
    window.api.storeSet(`selectedNode_${projectPath}`, selectedNodeId ?? null)
  }, [selectedNodeId, projectPath])

  return (
    <div className="flex flex-col h-screen bg-white">
      <Toolbar />
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={22} minSize={14} maxSize={45}>
            <div className="h-full border-r border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 shrink-0">
                ドキュメント構成
              </div>
              <div className="flex-1 overflow-hidden"><FileTree /></div>
              <LinkageSettings />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />
          <Panel defaultSize={78} minSize={50}>
            <ContentViewer />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}