import { useCallback, useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useViewerStore } from '../../store/viewerStore'
import type { ClassItem, DiagramClass, DiagramRelationship, Selection } from './types'
import { genId, isSep, classesToItems } from './utils'
import { generatePlantuml, parsePlantumlDiagram } from './plantuml'
import { LivePreview } from './LivePreview'
import { LeftPanel } from './LeftPanel'
import { Toast } from './Modals'

export function ClassEditorApp({ onClose }: { onClose: () => void }): JSX.Element {
  const [classItems, setClassItems] = useState<ClassItem[]>([])
  const [relationships, setRelationships] = useState<DiagramRelationship[]>([])
  const classes = useMemo(() => classItems.filter((i): i is DiagramClass => !isSep(i)), [classItems])
  const generatedCode = useMemo(() => generatePlantuml(classItems, relationships), [classItems, relationships])
  const [previewCode, setPreviewCode] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [showCode, setShowCode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState(false)

  const [linkedFile, setLinkedFile] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [autoSave, setAutoSave] = useState(false)
  const [mmdFiles, setMmdFiles] = useState<string[]>([])
  const [isFileListLoading, setIsFileListLoading] = useState(false)
  const [customDir, setCustomDir] = useState<string | null>(null)
  const [dirSource, setDirSource] = useState<'spec' | 'design' | 'custom'>(
    () => (localStorage.getItem('classEditor.dirSource') as 'spec' | 'design' | 'custom') ?? 'spec'
  )

  const content = useViewerStore((s) => s.content)

  const linkedDir = useMemo(() => {
    if (dirSource === 'custom') return customDir ? customDir.replace(/\\/g, '/') : null
    const p = dirSource === 'design' ? content.designPath : content.specPath
    if (!p) return null
    const norm = p.replace(/\\/g, '/')
    return norm.substring(0, norm.lastIndexOf('/'))
  }, [dirSource, customDir, content.specPath, content.designPath])

  const classDiagramDir = useMemo(() => {
    if (!linkedDir) return null
    return `${linkedDir}/class-diagrams`
  }, [linkedDir])

  useEffect(() => {
    if (!classDiagramDir) { setMmdFiles([]); return }
    const base = classDiagramDir
    setIsFileListLoading(true)
    window.api.listFiles(classDiagramDir, ['puml']).then((res) => {
      if (res.ok) {
        setMmdFiles((res.data ?? []).map((f) => f.replace(/\\/g, '/').slice(base.length + 1)))
      } else {
        setMmdFiles([])
      }
    }).finally(() => setIsFileListLoading(false))
  }, [classDiagramDir])

  useEffect(() => {
    localStorage.setItem('classEditor.dirSource', dirSource)
  }, [dirSource])

  useEffect(() => {
    if (!autoSave || !linkedFile || !classDiagramDir || !generatedCode) return
    const absPath = classDiagramDir + '/' + linkedFile
    const timer = setTimeout(() => { window.api.writeText(absPath, generatedCode) }, 600)
    return () => clearTimeout(timer)
  }, [generatedCode, autoSave, linkedFile, classDiagramDir])

  const packages = useMemo(() => {
    const pkgs = new Set<string>()
    for (const cls of classes) { if (cls.package) pkgs.add(cls.package) }
    return Array.from(pkgs)
  }, [classes])

  // クラス操作
  const handleAddClass = useCallback(() => {
    const cls: DiagramClass = {
      id: genId(), name: `NewClass${classes.length + 1}`, package: '',
      annotation: '', attributes: [], methods: [], depth: 0,
    }
    setClassItems((prev) => [...prev, cls])
    setSelection({ type: 'class', id: cls.id })
  }, [classes.length])

  const handleDeleteClass = useCallback((id: string) => {
    setClassItems((prev) => prev.filter((i) => i.id !== id))
    setRelationships((prev) => prev.filter((r) => r.fromId !== id && r.toId !== id))
    setSelection((prev) => (prev?.type === 'class' && prev.id === id ? null : prev))
  }, [])

  const handleUpdateClass = useCallback((updated: DiagramClass) => {
    setClassItems((prev) => prev.map((i) => (!isSep(i) && i.id === updated.id ? updated : i)))
  }, [])

  // 関連操作
  const handleAddRel = useCallback(() => {
    if (classes.length < 2) return
    const rel: DiagramRelationship = {
      id: genId(), fromId: classes[0].id, toId: classes[1].id,
      type: 'association', fromLabel: '', toLabel: '', label: '',
    }
    setRelationships((prev) => [...prev, rel])
    setSelection({ type: 'rel', id: rel.id })
  }, [classes])

  const handleDeleteRel = useCallback((id: string) => {
    setRelationships((prev) => prev.filter((r) => r.id !== id))
    setSelection((prev) => (prev?.type === 'rel' && prev.id === id ? null : prev))
  }, [])

  const handleUpdateRel = useCallback((updated: DiagramRelationship) => {
    setRelationships((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }, [])

  // ClassItem 操作（深さ区切り）
  const handleReorderItems = useCallback((items: ClassItem[]) => { setClassItems(items) }, [])

  const handleAddDepthSep = useCallback(() => {
    setClassItems((prev) => [...prev, { id: genId(), __sep: true as const }])
  }, [])

  const handleAddDepthSepAfterClass = useCallback((classId: string) => {
    setClassItems((prev) => {
      const idx = prev.findIndex((i) => !isSep(i) && i.id === classId)
      if (idx < 0) return [...prev, { id: genId(), __sep: true as const }]
      const next = [...prev]
      next.splice(idx + 1, 0, { id: genId(), __sep: true as const })
      return next
    })
  }, [])

  const handleDeleteDepthSep = useCallback((id: string) => {
    setClassItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  // リンクファイル操作
  const handleSelectLinkedFile = useCallback(async (fileName: string) => {
    if (!fileName || !classDiagramDir) return
    setLinkedFile(fileName)
    const res = await window.api.readText(classDiagramDir + '/' + fileName)
    if (!res.ok) { setToast('ファイルの読み込みに失敗しました'); return }
    const text = res.data ?? ''
    if (!text.trim()) {
      setClassItems([]); setRelationships([]); setSelection(null)
      setPreviewCode('')
      setToast(`${fileName} を開きました（空）`)
      return
    }
    const parsed = parsePlantumlDiagram(text)
    if (parsed) {
      setClassItems(classesToItems(parsed.classes))
      setRelationships(parsed.relationships)
      setSelection(null)
      setPreviewCode(text)
      setToast(`${fileName} を読み込みました`)
    } else {
      setToast('ファイルの解析に失敗しました（PlantUML 形式ではありません）')
    }
  }, [classDiagramDir])

  const handleCreateLinkedFile = useCallback(async () => {
    const name = newFileName.trim()
    if (!name || !classDiagramDir) return
    const fileName = name.endsWith('.puml') ? name : `${name}.puml`
    if (linkedFile && generatedCode) await window.api.writeText(classDiagramDir + '/' + linkedFile, generatedCode)
    setClassItems([]); setRelationships([]); setSelection(null)
    setPreviewCode('')
    const res = await window.api.writeText(classDiagramDir + '/' + fileName, '')
    if (res.ok) {
      setMmdFiles((prev) => [...prev.filter((f) => f !== fileName), fileName])
      setLinkedFile(fileName); setNewFileName(''); setAutoSave(true)
      setToast(`${fileName} を作成しました`)
    } else {
      setToast(`作成に失敗しました: ${res.error ?? ''}`)
    }
  }, [newFileName, classDiagramDir, linkedFile, generatedCode])

  const handleCopyCode = useCallback(async () => {
    const imageDir = 'images/class-diagrams'
    const rawBaseName = linkedFile
      ? linkedFile.replace(/\.puml$/i, '')
      : `diagram_${Date.now()}`
    const sanitizedBaseName = rawBaseName
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\.+$/g, '')
      .replace(/^_+|_+$/g, '')
    const baseName = sanitizedBaseName || `diagram_${Date.now()}`

    if (dirSource === 'design' && linkedDir && generatedCode.trim()) {
      const svgRelativePath = `./${imageDir}/${baseName}.svg`
      const svgAbsolutePath = `${linkedDir}/${imageDir}/${baseName}.svg`
      const exportRes = await window.api.exportPlantumlSvg(generatedCode, svgAbsolutePath)
      if (!exportRes.ok) {
        setToast(`SVG出力に失敗しました: ${exportRes.error ?? ''}`)
        return
      }
      const isMarkdownDesign = !!content.designPath && /\.md$/i.test(content.designPath)
      const text = isMarkdownDesign
        ? `![${baseName}](${svgRelativePath})`
        : `image::${svgRelativePath}[${baseName}]`
      try {
        await navigator.clipboard.writeText(text)
        setToast(`設計書向け画像参照コードをコピーしました（${isMarkdownDesign ? 'Markdown' : 'AsciiDoc'} / SVG出力済み）`)
      } catch {
        setToast('コピーに失敗しました')
      }
      return
    }

    const text = linkedFile
      ? `\`\`\`plantuml-include\n./class-diagrams/${linkedFile}\n\`\`\``
      : `\`\`\`plantuml\n${generatedCode}\n\`\`\``
    try {
      await navigator.clipboard.writeText(text)
      setToast(linkedFile ? '参照用コードをコピーしました' : 'PlantUMLコードをコピーしました')
    } catch { setToast('コピーに失敗しました') }
  }, [content.designPath, dirSource, linkedDir, linkedFile, generatedCode])

  const handleApplyPreview = useCallback(() => {
    setPreviewCode(generatedCode)
  }, [generatedCode])

  const previewDirty = previewCode !== generatedCode

  const selectedClass = selection?.type === 'class' ? classes.find((c) => c.id === selection.id) ?? null : null
  const selectedRel = selection?.type === 'rel' ? relationships.find((r) => r.id === selection.id) ?? null : null

  return (
    <div className={splitMode
      ? "fixed right-0 top-0 bottom-0 w-1/2 z-50 bg-white flex flex-col shadow-2xl border-l border-gray-300"
      : "fixed inset-0 z-50 bg-white flex flex-col"
    }>
      {/* ヘッダー行1 */}
      <div className="bg-gray-800 text-white flex items-center gap-2 px-4 py-2 shrink-0">
        <span className="font-semibold text-sm shrink-0">クラス図エディター</span>
        <div className="flex-1" />
        <button
          onClick={handleCopyCode}
          disabled={classes.length === 0}
          title={dirSource === 'design'
            ? 'SVGを出力し、image参照コードをコピー'
            : (linkedFile ? `\`\`\`plantuml-include\n./${linkedFile}\n\`\`\`` : 'PlantUMLコードをコピー')}
          className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          📋 {dirSource === 'design' ? 'SVG参照をコピー' : (linkedFile ? '参照用コードをコピー' : 'コードをコピー')}
        </button>
        <button
          onClick={() => setSplitMode((v) => !v)}
          className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
        >{splitMode ? '⛶ 全画面' : '⬜ 並べて表示'}</button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 shrink-0"
        >✕ 閉じる</button>
      </div>

      {/* ヘッダー行2: リンクファイル */}
      <div className="bg-gray-700 text-white flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap">
        <span className="text-xs text-gray-300 shrink-0">リンクファイル:</span>
        {(content.specPath || content.designPath) && (
          <div className="flex rounded overflow-hidden border border-gray-500 shrink-0">
            {content.specPath && (
              <button onClick={() => { setDirSource('spec'); setLinkedFile('') }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'spec' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >仕様書</button>
            )}
            {content.designPath && (
              <button onClick={() => { setDirSource('design'); setLinkedFile('') }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'design' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >設計書</button>
            )}
            <button
              onClick={async () => {
                const folder = await window.api.selectFolder()
                if (folder) { setCustomDir(folder); setDirSource('custom'); setLinkedFile('') }
              }}
              className={`px-2 py-0.5 text-xs ${dirSource === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
            >📁</button>
          </div>
        )}
        {!content.specPath && !content.designPath && !linkedDir && (
          <button
            onClick={async () => {
              const folder = await window.api.selectFolder()
              if (folder) { setCustomDir(folder); setDirSource('custom') }
            }}
            className="px-2 py-0.5 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 shrink-0"
          >📁 保存フォルダを選択</button>
        )}
        {linkedDir && (
          <>
            <span className="text-xs text-gray-400 max-w-[160px] truncate shrink-0" title={linkedDir}>
              {linkedDir.replace(/.*[\\/]/, '')}
            </span>
            <select
              value={linkedFile}
              onChange={(e) => {
                const v = e.target.value
                if (v) handleSelectLinkedFile(v)
                else { setLinkedFile(''); setPreviewCode('') }
              }}
              disabled={isFileListLoading}
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white outline-none max-w-[160px]"
            >
              <option value="">{isFileListLoading ? '読み込み中...' : '-- 未選択 --'}</option>
              {mmdFiles.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            {isFileListLoading && <span className="text-xs text-gray-300 shrink-0">ファイル一覧を読み込み中...</span>}
            <input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLinkedFile() }}
              placeholder="新規ファイル名.puml"
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white placeholder-gray-400 outline-none w-36"
            />
            <button
              onClick={handleCreateLinkedFile}
              disabled={!newFileName.trim()}
              className="px-2 py-0.5 text-xs rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 shrink-0"
            >作成</button>
            <label className="flex items-center gap-1 text-xs text-gray-200 cursor-pointer shrink-0">
              <input type="checkbox" checked={autoSave} disabled={!linkedFile}
                onChange={(e) => setAutoSave(e.target.checked)} className="cursor-pointer" />
              自動保存
            </label>
            {autoSave && linkedFile && (
              <span className="text-xs text-green-400 shrink-0">● {linkedFile} に自動保存中</span>
            )}
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-400 shrink-0">
          {dirSource === 'design'
            ? '設計書向け: SVGを出力して image:: 参照で貼り付け'
            : <>ビューアーで参照: <code className="bg-gray-600 px-1 rounded">```plantuml-include</code> ブロックにファイル名を記述</>}
        </span>
      </div>

      {/* メイン */}
      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize={35} minSize={20} maxSize={55}>
          <div className="h-full border-r border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
            <LeftPanel
              classItems={classItems} relationships={relationships} selection={selection}
              onSelect={setSelection} onDeleteClass={handleDeleteClass} onDeleteRel={handleDeleteRel}
              onAddClass={handleAddClass} onAddRel={handleAddRel} onReorderItems={handleReorderItems}
              onAddDepthSep={handleAddDepthSep} onAddDepthSepAfterClass={handleAddDepthSepAfterClass} onDeleteDepthSep={handleDeleteDepthSep}
              selectedClass={selectedClass} selectedRel={selectedRel} packages={packages}
              onUpdateClass={handleUpdateClass} onUpdateRel={handleUpdateRel}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize" />
        <Panel defaultSize={65} minSize={30}>
          <div className="h-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">プレビュー</span>
              <div className="flex items-center gap-2">
                {previewDirty && <span className="text-[11px] text-amber-600">未反映の変更あり</span>}
                <button
                  onClick={handleApplyPreview}
                  className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                >反映</button>
                <button onClick={() => setShowCode((v) => !v)}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
                >{showCode ? 'コードを非表示' : 'コードを表示'}</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col"><LivePreview code={previewCode} /></div>
            {showCode && (
              <div className="max-h-48 overflow-auto bg-gray-900 text-green-400 text-xs font-mono p-3 shrink-0">
                <pre>{generatedCode}</pre>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}