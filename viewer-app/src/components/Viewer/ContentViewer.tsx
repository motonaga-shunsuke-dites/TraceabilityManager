import { useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useViewerStore } from '../../store/viewerStore'
import { MarkdownEditor, type MarkdownEditorHandle } from '../Editor/MarkdownEditor'
import { DocPreview } from './DocPreview'
import { LinkTabs } from './LinkTabs'
import { MarkdownToolbar } from './MarkdownToolbar'
import { PaneHeader } from './PaneHeader'
import { SourcePane, useAutoSave } from './SourcePane'

export function ContentViewer(): JSX.Element {
  const mode = useViewerStore((s) => s.mode)
  const content = useViewerStore((s) => s.content)
  const editingSpec = useViewerStore((s) => s.editingSpec)
  const editingDesign = useViewerStore((s) => s.editingDesign)
  const setEditingSpec = useViewerStore((s) => s.setEditingSpec)
  const setEditingDesign = useViewerStore((s) => s.setEditingDesign)
  const paneVisible = useViewerStore((s) => s.paneVisible)

  const [specHighlight, setSpecHighlight] = useState(true)
  const [designHighlight, setDesignHighlight] = useState(true)

  const specEditorRef = useRef<MarkdownEditorHandle>(null)
  const designEditorRef = useRef<MarkdownEditorHandle>(null)

  useAutoSave(content.specPath, content.specContent, editingSpec)
  useAutoSave(content.designPath, content.designContent, editingDesign)

  const headingLabel = (h: string | null): string | undefined =>
    h ? h.replace(/^[#=]{1,6}\s+/, '').replace(/^\.\s*/, '') : undefined

  const visibleCount = Object.values(paneVisible).filter(Boolean).length
  const defaultPaneSize = visibleCount > 0 ? Math.floor(100 / visibleCount) : 33
  const visibleKey = `${paneVisible.spec}-${paneVisible.design}-${paneVisible.source}`

  return (
    <div className="flex flex-col h-full">
      <LinkTabs />
      {visibleCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">
          表示するペインを選択してください
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <PanelGroup key={visibleKey} direction="horizontal" className="h-full">

            {paneVisible.spec && (
              <>
                <Panel defaultSize={defaultPaneSize} minSize={15}>
                  <div className="flex flex-col h-full border-r border-gray-200">
                    <PaneHeader
                      title="仕様書"
                      subtitle={headingLabel(content.specHeading)}
                      highlighted={content.specHeading ? specHighlight : undefined}
                      onToggleHighlight={content.specHeading ? () => setSpecHighlight((v) => !v) : undefined}
                    />
                    {mode === 'edit' && <MarkdownToolbar editorRef={specEditorRef} filePath={content.specPath} />}
                    <div className="flex-1 overflow-hidden">
                      {mode === 'edit' ? (
                        <MarkdownEditor ref={specEditorRef} value={editingSpec ?? ''} onChange={setEditingSpec} />
                      ) : (
                        <DocPreview path={content.specPath} content={content.specContent} heading={content.specHeading} highlightOn={specHighlight} />
                      )}
                    </div>
                  </div>
                </Panel>
                {(paneVisible.design || paneVisible.source) && (
                  <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />
                )}
              </>
            )}

            {paneVisible.design && (
              <>
                <Panel defaultSize={defaultPaneSize} minSize={15}>
                  <div className="flex flex-col h-full border-r border-gray-200">
                    <PaneHeader
                      title="設計書"
                      subtitle={headingLabel(content.designHeading)}
                      highlighted={content.designHeading ? designHighlight : undefined}
                      onToggleHighlight={content.designHeading ? () => setDesignHighlight((v) => !v) : undefined}
                    />
                    {mode === 'edit' && <MarkdownToolbar editorRef={designEditorRef} filePath={content.designPath} />}
                    <div className="flex-1 overflow-hidden">
                      {mode === 'edit' ? (
                        <MarkdownEditor ref={designEditorRef} value={editingDesign ?? ''} onChange={setEditingDesign} />
                      ) : (
                        <DocPreview path={content.designPath} content={content.designContent} heading={content.designHeading} highlightOn={designHighlight} />
                      )}
                    </div>
                  </div>
                </Panel>
                {paneVisible.source && (
                  <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors" />
                )}
              </>
            )}

            {paneVisible.source && (
              <Panel defaultSize={defaultPaneSize} minSize={15}>
                <div className="flex flex-col h-full">
                  <PaneHeader title="ソースコード" />
                  <div className="flex-1 overflow-hidden"><SourcePane /></div>
                </div>
              </Panel>
            )}

          </PanelGroup>
        </div>
      )}
    </div>
  )
}