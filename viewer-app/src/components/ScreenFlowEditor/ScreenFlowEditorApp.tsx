import { useCallback, useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useViewerStore } from '../../store/viewerStore'
import { LivePreview } from '../ClassEditor/LivePreview'
import { Toast } from '../ClassEditor/Modals'
import type { ScreenItem, ScreenMasterEntry, ScreenNode, ScreenTransition, Selection } from './types'
import { genId, isSep } from './utils'
import { generateScreenFlowPlantuml, loadItemsFromPlantuml } from './plantuml'

function moveItem(items: ScreenItem[], id: string, dir: -1 | 1): ScreenItem[] {
  const idx = items.findIndex((i) => i.id === id)
  if (idx < 0) return items
  const target = idx + dir
  if (target < 0 || target >= items.length) return items
  const arr = [...items]
  const [picked] = arr.splice(idx, 1)
  arr.splice(target, 0, picked)
  return arr
}

function normalizeImagePath(raw: string, linkedDir: string | null): string {
  const v = raw.trim().replace(/\\/g, '/')
  if (!v) return ''
  if (/^(https?:|data:|file:)/i.test(v)) return v

  const isAbs = /^[a-zA-Z]:\//.test(v) || v.startsWith('/')
  if (!isAbs) {
    if (v.startsWith('./') || v.startsWith('../')) return v
    return `./${v}`
  }

  if (!linkedDir) return v
  const base = linkedDir.replace(/\\/g, '/')
  const lv = v.toLowerCase()
  const lb = base.toLowerCase()
  if (lv === lb) return './'
  if (lv.startsWith(`${lb}/`)) {
    return `.${v.slice(base.length)}`
  }
  return v
}

function toAbsoluteImagePath(raw: string, linkedDir: string | null): string {
  const v = raw.trim().replace(/\\/g, '/')
  if (!v) return ''
  if (/^(https?:|data:|file:)/i.test(v)) return v
  if (/^[a-zA-Z]:\//.test(v) || v.startsWith('/')) return v
  if (!linkedDir) return v
  const base = linkedDir.replace(/\\/g, '/')
  const rel = v.replace(/^\.\//, '')
  return `${base}/${rel}`.replace(/\/+/g, '/')
}

export function ScreenFlowEditorApp({ onClose }: { onClose: () => void }): JSX.Element {
  const [screenItems, setScreenItems] = useState<ScreenItem[]>([])
  const [transitions, setTransitions] = useState<ScreenTransition[]>([])
  const screens = useMemo(() => screenItems.filter((i): i is ScreenNode => !isSep(i)), [screenItems])
  const generatedCode = useMemo(() => generateScreenFlowPlantuml(screenItems, transitions), [screenItems, transitions])
  const [previewCode, setPreviewCode] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [leftTab, setLeftTab] = useState<'screen' | 'transition' | 'master'>('screen')
  const [showCode, setShowCode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // --- master ---
  const [masterEntries, setMasterEntries] = useState<ScreenMasterEntry[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [showMasterPicker, setShowMasterPicker] = useState(false)
  const [masterLoaded, setMasterLoaded] = useState(false)

  const [linkedFile, setLinkedFile] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [autoSave, setAutoSave] = useState(false)
  const [pumlFiles, setPumlFiles] = useState<string[]>([])
  const [isFileListLoading, setIsFileListLoading] = useState(false)
  const [customDir, setCustomDir] = useState<string | null>(null)
  const [dirSource, setDirSource] = useState<'spec' | 'design' | 'custom'>(
    () => (localStorage.getItem('screenFlowEditor.dirSource') as 'spec' | 'design' | 'custom') ?? 'design'
  )

  const content = useViewerStore((s) => s.content)
  const roots = useViewerStore((s) => s.roots)

  const linkedDir = useMemo(() => {
    if (dirSource === 'custom') return customDir ? customDir.replace(/\\/g, '/') : null
    const p = dirSource === 'design' ? content.designPath : content.specPath
    if (!p) return null
    const norm = p.replace(/\\/g, '/')
    return norm.substring(0, norm.lastIndexOf('/'))
  }, [dirSource, customDir, content.specPath, content.designPath])

  const screenFlowDir = useMemo(() => {
    if (!linkedDir) return null
    return `${linkedDir}/screen-flows`
  }, [linkedDir])

  const sharedMasterBaseDir = useMemo(() => {
    if (roots.design?.trim()) return roots.design.replace(/\\/g, '/')
    if (dirSource === 'custom' && customDir) return customDir.replace(/\\/g, '/')
    return linkedDir
  }, [roots.design, dirSource, customDir, linkedDir])

  const screenMasterPath = useMemo(() => {
    if (!sharedMasterBaseDir) return null
    return `${sharedMasterBaseDir}/screen-master.json`
  }, [sharedMasterBaseDir])

  useEffect(() => {
    if (!screenFlowDir) {
      setPumlFiles([])
      return
    }
    const base = screenFlowDir
    setIsFileListLoading(true)
    window.api
      .listFiles(screenFlowDir, ['puml'])
      .then((res) => {
        if (res.ok) {
          setPumlFiles((res.data ?? []).map((f) => f.replace(/\\/g, '/').slice(base.length + 1)))
        } else {
          setPumlFiles([])
        }
      })
      .finally(() => setIsFileListLoading(false))
  }, [screenFlowDir])

  useEffect(() => {
    localStorage.setItem('screenFlowEditor.dirSource', dirSource)
  }, [dirSource])

  // master load
  useEffect(() => {
    setMasterLoaded(false)
    if (!screenMasterPath) {
      setMasterEntries([])
      setMasterLoaded(true)
      return
    }
    void (async () => {
      const rootRes = await window.api.readText(screenMasterPath)
      let text = rootRes.ok ? (rootRes.data ?? '') : ''

      // 旧保存先（screen-flows/screen-master.json）を後方互換で読む
      if (!text.trim() && screenFlowDir) {
        const legacyRes = await window.api.readText(`${screenFlowDir}/screen-master.json`)
        if (legacyRes.ok && legacyRes.data?.trim()) {
          text = legacyRes.data
        }
      }

      if (text.trim()) {
        try {
          const raw = JSON.parse(text) as ScreenMasterEntry[]
          setMasterEntries(raw.map((e) => ({ ...e, imagePath: normalizeImagePath(e.imagePath ?? '', sharedMasterBaseDir) })))
        } catch {
          setMasterEntries([])
        }
      } else {
        setMasterEntries([])
      }
      setMasterLoaded(true)
    })()
  }, [screenMasterPath, screenFlowDir, sharedMasterBaseDir])

  // master save (debounced)
  useEffect(() => {
    if (!screenMasterPath || !masterLoaded) return
    const timer = setTimeout(() => {
      window.api.writeText(screenMasterPath, JSON.stringify(masterEntries, null, 2))
    }, 600)
    return () => clearTimeout(timer)
  }, [masterEntries, screenMasterPath, masterLoaded])

  // マスター変更時: 各 puml ファイルのマスター参照画面を一括更新
  useEffect(() => {
    if (!screenFlowDir || !masterLoaded || masterEntries.length === 0 || pumlFiles.length === 0) return
    const masterMap = new Map(masterEntries.map((e) => [e.id, { ...e, imagePath: normalizeImagePath(e.imagePath, sharedMasterBaseDir) }]))

    // 現在 in-memory のファイルも同期
    setScreenItems((prev) =>
      prev.map((item) => {
        if (isSep(item) || !item.masterId) return item
        const m = masterMap.get(item.masterId)
        if (!m) return item
        return {
          ...item,
          name: m.name,
          description: m.description,
          imagePath: toAbsoluteImagePath(m.imagePath, sharedMasterBaseDir),
        }
      })
    )

    // 他のすべての puml ファイルを読み込んで書き戻す
    const dir = screenFlowDir
    void (async () => {
      for (const f of pumlFiles) {
        if (f === linkedFile) continue // 現在開いているファイルは in-memory 経由で保存される
        const absPath = `${dir}/${f}`
        const res = await window.api.readText(absPath)
        if (!res.ok || !res.data?.trim()) continue
        const parsed = loadItemsFromPlantuml(res.data)
        if (!parsed) continue
        let changed = false
        const updatedItems = parsed.screenItems.map((item) => {
          if (isSep(item) || !item.masterId) return item
          const m = masterMap.get(item.masterId)
          if (!m) return item
          changed = true
          return {
            ...item,
            name: m.name,
            description: m.description,
            imagePath: toAbsoluteImagePath(m.imagePath, sharedMasterBaseDir),
          }
        })
        if (changed) {
          const updatedCode = generateScreenFlowPlantuml(updatedItems, parsed.transitions)
          await window.api.writeText(absPath, updatedCode)
        }
      }
    })()
  }, [masterEntries, masterLoaded, screenFlowDir, pumlFiles, linkedFile, sharedMasterBaseDir])

  useEffect(() => {
    if (!autoSave || !linkedFile || !screenFlowDir || !generatedCode) return
    const absPath = `${screenFlowDir}/${linkedFile}`
    const timer = setTimeout(() => {
      window.api.writeText(absPath, generatedCode)
    }, 600)
    return () => clearTimeout(timer)
  }, [generatedCode, autoSave, linkedFile, screenFlowDir])

  useEffect(() => {
    if (selection?.type === 'screen') setLeftTab('screen')
    if (selection?.type === 'transition') setLeftTab('transition')
  }, [selection])

  const selectedScreen = selection?.type === 'screen' ? screens.find((s) => s.id === selection.id) ?? null : null
  const selectedTransition =
    selection?.type === 'transition' ? transitions.find((t) => t.id === selection.id) ?? null : null

  const selectedMaster = masterEntries.find((e) => e.id === selectedMasterId) ?? null

  const handleAddMasterEntry = useCallback(() => {
    const next: ScreenMasterEntry = { id: genId(), name: `画面${masterEntries.length + 1}`, imagePath: '', description: '' }
    setMasterEntries((prev) => [...prev, next])
    setSelectedMasterId(next.id)
  }, [masterEntries.length])

  const handleDeleteMasterEntry = useCallback((id: string) => {
    setMasterEntries((prev) => prev.filter((e) => e.id !== id))
    setSelectedMasterId((prev) => (prev === id ? null : prev))
  }, [])

  const handleUpdateMasterEntry = useCallback((patch: Partial<ScreenMasterEntry>) => {
    const normalizedPatch: Partial<ScreenMasterEntry> = {
      ...patch,
      ...(patch.imagePath !== undefined ? { imagePath: normalizeImagePath(patch.imagePath, sharedMasterBaseDir) } : {}),
    }
    setSelectedMasterId((prevId) => {
      if (!prevId) return prevId
      setMasterEntries((prev) => prev.map((e) => (e.id === prevId ? { ...e, ...normalizedPatch } : e)))
      return prevId
    })
  }, [sharedMasterBaseDir])

  const handleAddScreenFromMaster = useCallback((master: ScreenMasterEntry) => {
    const next: ScreenNode = {
      id: genId(),
      name: master.name,
      description: master.description,
      imagePath: toAbsoluteImagePath(master.imagePath, sharedMasterBaseDir),
      masterId: master.id,
      depth: 0,
    }
    setScreenItems((prev) => [...prev, next])
    setSelection({ type: 'screen', id: next.id })
    setShowMasterPicker(false)
  }, [sharedMasterBaseDir])

  const handleAddScreen = useCallback(() => {
    const next: ScreenNode = {
      id: genId(),
      name: `Screen${screens.length + 1}`,
      description: '',
      imagePath: '',
      depth: 0,
    }
    setScreenItems((prev) => [...prev, next])
    setSelection({ type: 'screen', id: next.id })
  }, [screens.length])

  const handleDeleteScreen = useCallback((id: string) => {
    setScreenItems((prev) => prev.filter((i) => i.id !== id))
    setTransitions((prev) => prev.filter((t) => t.fromId !== id && t.toId !== id))
    setSelection((prev) => (prev?.type === 'screen' && prev.id === id ? null : prev))
  }, [])

  const handleUpdateScreen = useCallback((patch: Partial<ScreenNode>) => {
    if (!selectedScreen) return
    setScreenItems((prev) =>
      prev.map((i) => {
        if (isSep(i)) return i
        return i.id === selectedScreen.id ? { ...i, ...patch } : i
      })
    )
  }, [selectedScreen])

  const handleAddTransition = useCallback(() => {
    if (screens.length < 2) return
    const next: ScreenTransition = {
      id: genId(),
      fromId: screens[0].id,
      toId: screens[1].id,
      label: '',
    }
    setTransitions((prev) => [...prev, next])
    setSelection({ type: 'transition', id: next.id })
  }, [screens])

  const handleDeleteTransition = useCallback((id: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== id))
    setSelection((prev) => (prev?.type === 'transition' && prev.id === id ? null : prev))
  }, [])

  const handleUpdateTransition = useCallback((patch: Partial<ScreenTransition>) => {
    if (!selectedTransition) return
    setTransitions((prev) => prev.map((t) => (t.id === selectedTransition.id ? { ...t, ...patch } : t)))
  }, [selectedTransition])

  const handleAddDepthSepAtEnd = useCallback(() => {
    setScreenItems((prev) => [...prev, { id: genId(), __sep: true }])
  }, [])

  const handleDeleteDepthSep = useCallback((id: string) => {
    setScreenItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const handleSelectLinkedFile = useCallback(async (fileName: string) => {
    if (!fileName || !screenFlowDir) return
    setLinkedFile(fileName)
    const res = await window.api.readText(`${screenFlowDir}/${fileName}`)
    if (!res.ok) {
      setToast('ファイルの読み込みに失敗しました')
      return
    }
    const text = res.data ?? ''
    if (!text.trim()) {
      setScreenItems([])
      setTransitions([])
      setSelection(null)
      setPreviewCode('')
      setToast(`${fileName} を開きました（空）`)
      return
    }

    const parsed = loadItemsFromPlantuml(text)
    if (!parsed) {
      setToast('ファイルの解析に失敗しました（PlantUML 形式ではありません）')
      return
    }

    setScreenItems(parsed.screenItems)
    setTransitions(parsed.transitions)
    setSelection(null)
    setPreviewCode(text)
    setToast(`${fileName} を読み込みました`)
  }, [screenFlowDir])

  const handleCreateLinkedFile = useCallback(async () => {
    const name = newFileName.trim()
    if (!name || !screenFlowDir) return
    const fileName = name.endsWith('.puml') ? name : `${name}.puml`
    if (linkedFile && generatedCode) {
      await window.api.writeText(`${screenFlowDir}/${linkedFile}`, generatedCode)
    }
    setScreenItems([])
    setTransitions([])
    setSelection(null)
    setPreviewCode('')

    const res = await window.api.writeText(`${screenFlowDir}/${fileName}`, '')
    if (!res.ok) {
      setToast(`作成に失敗しました: ${res.error ?? ''}`)
      return
    }

    setPumlFiles((prev) => [...prev.filter((f) => f !== fileName), fileName])
    setLinkedFile(fileName)
    setNewFileName('')
    setAutoSave(true)
    setToast(`${fileName} を作成しました`)
  }, [newFileName, screenFlowDir, linkedFile, generatedCode])

  const handleCopyCode = useCallback(async () => {
    const imageDir = 'images/screen-flows'
    const rawBaseName = linkedFile ? linkedFile.replace(/\.puml$/i, '') : `screen_flow_${Date.now()}`
    const sanitizedBaseName = rawBaseName
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\.+$/g, '')
      .replace(/^_+|_+$/g, '')
    const baseName = sanitizedBaseName || `screen_flow_${Date.now()}`

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
        setToast(`画面遷移図の画像参照コードをコピーしました（${isMarkdownDesign ? 'Markdown' : 'AsciiDoc'} / SVG出力済み）`)
      } catch {
        setToast('コピーに失敗しました')
      }
      return
    }

    const text = linkedFile
      ? `\`\`\`plantuml-include\n./screen-flows/${linkedFile}\n\`\`\``
      : `\`\`\`plantuml\n${generatedCode}\n\`\`\``
    try {
      await navigator.clipboard.writeText(text)
      setToast(linkedFile ? '参照用コードをコピーしました' : 'PlantUMLコードをコピーしました')
    } catch {
      setToast('コピーに失敗しました')
    }
  }, [content.designPath, dirSource, linkedDir, linkedFile, generatedCode])

  const previewDirty = previewCode !== generatedCode

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="bg-gray-800 text-white flex items-center gap-2 px-4 py-2 shrink-0">
        <span className="font-semibold text-sm shrink-0">画面遷移図エディター</span>
        <div className="flex-1" />
        <button
          onClick={handleCopyCode}
          disabled={screens.length === 0}
          className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          📋 {dirSource === 'design' ? 'SVG参照をコピー' : linkedFile ? '参照用コードをコピー' : 'コードをコピー'}
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 shrink-0"
        >
          ✕ 閉じる
        </button>
      </div>

      <div className="bg-gray-700 text-white flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap">
        <span className="text-xs text-gray-300 shrink-0">リンクファイル:</span>
        {(content.specPath || content.designPath) && (
          <div className="flex rounded overflow-hidden border border-gray-500 shrink-0">
            {content.specPath && (
              <button
                onClick={() => {
                  setDirSource('spec')
                  setLinkedFile('')
                }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'spec' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >
                仕様書
              </button>
            )}
            {content.designPath && (
              <button
                onClick={() => {
                  setDirSource('design')
                  setLinkedFile('')
                }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'design' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >
                設計書
              </button>
            )}
            <button
              onClick={async () => {
                const folder = await window.api.selectFolder()
                if (folder) {
                  setCustomDir(folder)
                  setDirSource('custom')
                  setLinkedFile('')
                }
              }}
              className={`px-2 py-0.5 text-xs ${dirSource === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
            >
              📁
            </button>
          </div>
        )}

        {linkedDir && (
          <>
            <span className="text-xs text-gray-400 max-w-[160px] truncate shrink-0" title={screenFlowDir ?? ''}>
              {screenFlowDir ? screenFlowDir.replace(/.*[\\/]/, '') : ''}
            </span>
            <select
              value={linkedFile}
              onChange={(e) => {
                const v = e.target.value
                if (v) handleSelectLinkedFile(v)
                else {
                  setLinkedFile('')
                  setPreviewCode('')
                }
              }}
              disabled={isFileListLoading}
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white outline-none max-w-[180px]"
            >
              <option value="">{isFileListLoading ? '読み込み中...' : '-- 未選択 --'}</option>
              {pumlFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateLinkedFile()
              }}
              placeholder="新規ファイル名.puml"
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white placeholder-gray-400 outline-none w-40"
            />
            <button
              onClick={handleCreateLinkedFile}
              disabled={!newFileName.trim()}
              className="px-2 py-0.5 text-xs rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 shrink-0"
            >
              作成
            </button>
            <label className="flex items-center gap-1 text-xs text-gray-200 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoSave}
                disabled={!linkedFile}
                onChange={(e) => setAutoSave(e.target.checked)}
                className="cursor-pointer"
              />
              自動保存
            </label>
          </>
        )}
      </div>

      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize={36} minSize={25} maxSize={60}>
          <div className="h-full border-r border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
            <div className="flex items-center border-b border-gray-200 shrink-0 bg-gray-50">
              <button
                onClick={() => setLeftTab('screen')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${leftTab === 'screen' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                画面
                <span className="text-gray-400 font-normal">({screens.length})</span>
              </button>
              <button
                onClick={() => setLeftTab('transition')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${leftTab === 'transition' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                遷移
                <span className="text-gray-400 font-normal">({transitions.length})</span>
              </button>
              <button
                onClick={() => setLeftTab('master')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${leftTab === 'master' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                マスター
                <span className="text-gray-400 font-normal">({masterEntries.length})</span>
              </button>
              <div className="flex-1" />
              {leftTab === 'screen' && (
                <div className="relative flex items-center gap-1 mr-2">
                  <button
                    onClick={handleAddScreen}
                    className="text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
                  >
                    + 空白
                  </button>
                  {masterEntries.length > 0 && (
                    <button
                      onClick={() => setShowMasterPicker((v) => !v)}
                      className="text-xs px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200"
                      title="マスターから追加"
                    >
                      📋
                    </button>
                  )}
                  {showMasterPicker && (
                    <div className="absolute top-8 right-0 z-30 bg-white border border-gray-200 rounded shadow-lg min-w-[180px] max-h-60 overflow-y-auto">
                      <div className="px-2 py-1 text-[10px] text-gray-400 border-b border-gray-100 font-semibold">マスターから追加</div>
                      {masterEntries.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleAddScreenFromMaster(m)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-gray-700 border-b border-gray-50"
                        >
                          <div className="font-medium">{m.name}</div>
                          {m.description && <div className="text-gray-400 text-[10px] truncate">{m.description}</div>}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowMasterPicker(false)}
                        className="w-full text-center px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                    </div>
                  )}
                </div>
              )}
              {leftTab === 'transition' && (
                <button
                  onClick={handleAddTransition}
                  disabled={screens.length < 2}
                  className="text-xs px-2 py-1 mr-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + 追加
                </button>
              )}
              {leftTab === 'master' && (
                <button
                  onClick={handleAddMasterEntry}
                  className="text-xs px-2 py-1 mr-2 rounded bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200"
                >
                  + 追加
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {leftTab === 'screen' && (
                <>
                  {screenItems.map((item) => {
                    if (isSep(item)) {
                      return (
                        <div key={item.id} className="flex items-center gap-1 px-2 py-1 group">
                          <div className="flex-1 border-t-2 border-dashed border-blue-300" />
                          <button
                            onClick={() => handleDeleteDepthSep(item.id)}
                            className="text-xs text-gray-300 hover:text-red-500 ml-1 shrink-0"
                            title="区切り線を削除"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    }

                    const screen = item
                    const isSelected = selection?.type === 'screen' && selection.id === screen.id
                    return (
                      <div key={screen.id} className="border-b border-gray-100">
                        <div
                          onClick={() => setSelection({ type: 'screen', id: screen.id })}
                          className={[
                            'flex items-center gap-1 py-1.5 px-3 cursor-pointer group transition-colors',
                            isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                          ].join(' ')}
                        >
                          <span className="flex-1 text-xs truncate">{screen.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setScreenItems((prev) => moveItem(prev, screen.id, -1))
                            }}
                            className="text-xs text-gray-300 hover:text-gray-600 px-1"
                            title="上へ"
                          >
                            ↑
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setScreenItems((prev) => moveItem(prev, screen.id, 1))
                            }}
                            className="text-xs text-gray-300 hover:text-gray-600 px-1"
                            title="下へ"
                          >
                            ↓
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelection({ type: 'screen', id: screen.id })
                              setScreenItems((prev) => {
                                const idx = prev.findIndex((i) => !isSep(i) && i.id === screen.id)
                                if (idx < 0) return [...prev, { id: genId(), __sep: true }]
                                const arr = [...prev]
                                arr.splice(idx + 1, 0, { id: genId(), __sep: true })
                                return arr
                              })
                            }}
                            className="text-xs text-gray-300 hover:text-blue-600 hover:bg-blue-50 px-1 rounded"
                            title="この画面の下に区切り線を追加"
                          >
                            ⤵
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteScreen(screen.id)
                            }}
                            className="text-xs text-gray-300 hover:text-red-500 px-1"
                            title="削除"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  <div className="px-3 py-2">
                    <button
                      onClick={handleAddDepthSepAtEnd}
                      className="w-full text-xs py-1 rounded border border-dashed border-blue-300 text-blue-400 hover:bg-blue-50 hover:border-blue-400"
                    >
                      ＋ 深さの区切り線を末尾に追加
                    </button>
                  </div>
                </>
              )}

              {leftTab === 'transition' && (
                <>
                  {transitions.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">遷移がありません</p>}
                  {transitions.map((tr) => {
                    const from = screens.find((s) => s.id === tr.fromId)?.name ?? '?'
                    const to = screens.find((s) => s.id === tr.toId)?.name ?? '?'
                    const isSelected = selection?.type === 'transition' && selection.id === tr.id
                    return (
                      <div
                        key={tr.id}
                        onClick={() => setSelection({ type: 'transition', id: tr.id })}
                        className={[
                          'flex items-center gap-1 px-3 py-1.5 cursor-pointer group',
                          isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                        ].join(' ')}
                      >
                        <span className="flex-1 text-xs truncate font-mono">{`${from} → ${to}${tr.label ? ` : ${tr.label}` : ''}`}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTransition(tr.id)
                          }}
                          className="text-xs text-gray-300 hover:text-red-500 px-1"
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </>
              )}

              {leftTab === 'master' && (
                <>
                  {masterEntries.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">マスターがありません。「+ 追加」で登録してください。</p>
                  )}
                  {masterEntries.map((entry) => {
                    const isSelected = entry.id === selectedMasterId
                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedMasterId(entry.id)}
                        className={[
                          'flex items-center gap-1 px-3 py-1.5 cursor-pointer border-b border-gray-100 group',
                          isSelected ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-100 text-gray-700',
                        ].join(' ')}
                      >
                        <span className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{entry.name}</div>
                          {entry.description && (
                            <div className="text-[10px] text-gray-400 truncate">{entry.description}</div>
                          )}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteMasterEntry(entry.id) }}
                          className="text-xs text-gray-300 hover:text-red-500 px-1 shrink-0"
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            <div className="border-t border-gray-200 p-3 bg-white">
              {leftTab === 'master' && selectedMaster && (
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">画面名</label>
                    <input
                      value={selectedMaster.name}
                      onChange={(e) => handleUpdateMasterEntry({ name: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">説明（任意）</label>
                    <input
                      value={selectedMaster.description}
                      onChange={(e) => handleUpdateMasterEntry({ description: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-purple-400"
                      placeholder="画面内で実施する処理"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">画像パス</label>
                    <input
                      value={selectedMaster.imagePath}
                      onChange={(e) => handleUpdateMasterEntry({ imagePath: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-purple-400"
                      placeholder="例: ./images/screens/import-select.png"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">設計書フォルダからの相対パスで入力してください（どのファイルから参照しても同じパスが使われます）</p>
                  </div>
                </div>
              )}
              {leftTab === 'master' && !selectedMaster && (
                <p className="text-xs text-gray-400">エントリーを選択すると編集できます。</p>
              )}
              {leftTab !== 'master' && selectedScreen && (
                <div className="flex flex-col gap-2">
                  {selectedScreen.masterId && (() => {
                    const m = masterEntries.find((e) => e.id === selectedScreen.masterId)
                    return m ? (
                      <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded px-2 py-1">
                        <span className="text-[10px] text-purple-600">📋 マスター参照: {m.name}</span>
                        <button
                          onClick={() => {
                            handleUpdateScreen({
                              name: m.name,
                              description: m.description,
                              imagePath: toAbsoluteImagePath(m.imagePath, sharedMasterBaseDir),
                            })
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-700"
                          title="マスターの最新値を反映"
                        >
                          再同期
                        </button>
                      </div>
                    ) : null
                  })()}
                  <div>
                    <label className="text-xs font-medium text-gray-600">画面名</label>
                    <input
                      value={selectedScreen.name}
                      onChange={(e) => handleUpdateScreen({ name: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">説明（任意）</label>
                    <input
                      value={selectedScreen.description}
                      onChange={(e) => handleUpdateScreen({ description: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                      placeholder="画面内で実施する処理"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">画面画像パス（紐づけ保存）</label>
                    <input
                      value={selectedScreen.imagePath}
                      onChange={(e) => handleUpdateScreen({ imagePath: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                      placeholder="例: ./images/screens/import-select.png"
                    />
                  </div>
                </div>
              )}

              {selectedTransition && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600">遷移元</label>
                      <select
                        value={selectedTransition.fromId}
                        onChange={(e) => handleUpdateTransition({ fromId: e.target.value })}
                        className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        {screens.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">遷移先</label>
                      <select
                        value={selectedTransition.toId}
                        onChange={(e) => handleUpdateTransition({ toId: e.target.value })}
                        className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        {screens.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">ラベル</label>
                    <input
                      value={selectedTransition.label}
                      onChange={(e) => handleUpdateTransition({ label: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                      placeholder="例: 次へ / 戻る"
                    />
                  </div>
                </div>
              )}

              {!selectedScreen && !selectedTransition && leftTab !== 'master' && (
                <p className="text-xs text-gray-400">画面名と画像パスを先に保存しておき、後で遷移を追加して遷移図として利用できます。</p>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize" />

        <Panel defaultSize={64} minSize={30}>
          <div className="h-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">プレビュー</span>
              <div className="flex items-center gap-2">
                {previewDirty && <span className="text-[11px] text-amber-600">未反映の変更あり</span>}
                <button
                  onClick={() => setPreviewCode(generatedCode)}
                  className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                >
                  反映
                </button>
                <button
                  onClick={() => setShowCode((v) => !v)}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
                >
                  {showCode ? 'コードを非表示' : 'コードを表示'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <LivePreview code={previewCode} baseDir={linkedDir ?? undefined} />
            </div>
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
