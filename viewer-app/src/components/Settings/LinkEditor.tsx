import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { basename } from '../../utils/path'
import { extractHeadings } from '../../utils/nodes'
import { extractAdocHeadings } from '../../utils/adoc'
import type { DocLink } from '../../types'
import { FilePicker } from '../FilePicker/FilePicker'

export const MD_EXTS = ['md', 'adoc']

export function toRelative(absPath: string, root: string): string {
  const normAbs = absPath.replace(/\\/g, '/')
  const normRoot = root.replace(/\\/g, '/').replace(/\/?$/, '/')
  return normAbs.startsWith(normRoot) ? normAbs.slice(normRoot.length) : absPath
}

export function LinkEditor({
  link, specRoot, designRoot, onChange, onDelete
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
    setRenameValue(basename(link.design)); setRenamingDesign(true)
  }, [link.design])

  const handleDesignRenameCommit = useCallback(async () => {
    const newName = renameValue.trim()
    if (!newName || !link.design || !designRoot) { setRenamingDesign(false); return }
    const oldAbsPath = `${designRoot.replace(/\\/g, '/')}/${link.design}`.replace(/\/\//g, '/')
    const dirPart = link.design.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const newRel = dirPart ? `${dirPart}/${newName}` : newName
    const newAbsPath = `${designRoot.replace(/\\/g, '/')}/${newRel}`.replace(/\/\//g, '/')
    const res = await window.api.renameFile(oldAbsPath.replace(/\//g, '\\'), newAbsPath.replace(/\//g, '\\'))
    if (res.ok) {
      onChange({ design: newRel, designHeading: undefined }); setDesignHeadings([])
      toast.success(`ファイル名を変更しました: ${newName}`)
    } else {
      toast.error(`名前変更に失敗しました: ${res.error}`)
    }
    setRenamingDesign(false)
  }, [renameValue, link.design, designRoot, onChange])

  useEffect(() => {
    if (!link.spec || !specRoot) { setSpecHeadings([]); return }
    const absPath = `${specRoot.replace(/\\/g, '/').replace(/\/?$/, '/')}${link.spec}`
    window.api.readText(absPath).then((res) => {
      if (!res.ok || !res.data) return
      if (link.spec?.toLowerCase().endsWith('.adoc')) setSpecHeadings(extractAdocHeadings(res.data))
      else setSpecHeadings(extractHeadings(res.data, link.spec).map((h) => ({ value: h, label: h })))
    })
  }, [link.spec, specRoot])

  useEffect(() => {
    if (!link.design || !designRoot) { setDesignHeadings([]); return }
    const absPath = `${designRoot.replace(/\\/g, '/').replace(/\/?$/, '/')}${link.design}`
    window.api.readText(absPath).then((res) => {
      if (!res.ok || !res.data) return
      if (link.design?.toLowerCase().endsWith('.adoc')) setDesignHeadings(extractAdocHeadings(res.data))
      else setDesignHeadings(extractHeadings(res.data, link.design).map((h) => ({ value: h, label: h })))
    })
  }, [link.design, designRoot])

  const handleSpecConfirm = useCallback((paths: string[]) => {
    setShowSpecPicker(false)
    if (!paths.length) return
    onChange({ spec: toRelative(paths[0], specRoot), specHeading: undefined })
  }, [specRoot, onChange])

  const handleDesignConfirm = useCallback((paths: string[]) => {
    setShowDesignPicker(false)
    if (!paths.length) return
    onChange({ design: toRelative(paths[0], designRoot), designHeading: undefined })
  }, [designRoot, onChange])

  return (
    <>
      <div className="border border-gray-200 rounded p-2 flex flex-col gap-1.5 bg-gray-50">
        {/* ラベル */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0 w-10">名称</span>
          <input value={link.label} onChange={(e) => onChange({ label: e.target.value })}
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 min-w-0" placeholder="紐づけの名称" />
          <button onClick={onDelete} className="shrink-0 text-gray-300 hover:text-red-400 text-xs" title="この紐づけを削除">✕</button>
        </div>

        {/* 仕様書ファイル */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-gray-500 shrink-0 w-10">仕様書</span>
          <div className="flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-0.5 bg-white truncate text-xs text-gray-700" title={link.spec}>
            {link.spec ? basename(link.spec) : <span className="text-gray-300">未設定</span>}
          </div>
          {link.spec && <button onClick={() => onChange({ spec: undefined, specHeading: undefined })} className="shrink-0 text-gray-300 hover:text-red-400 text-xs">✕</button>}
          <button onClick={() => { if (!specRoot) { toast.error('仕様書のルートフォルダが未設定です'); return } setShowSpecPicker(true) }}
            className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600">…</button>
        </div>

        {/* 仕様書の見出し */}
        {link.spec && (
          <div className="flex items-center gap-1 pl-10 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">見出し</span>
            <select value={link.specHeading ?? ''} onChange={(e) => onChange({ specHeading: e.target.value || undefined })}
              className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-blue-400 min-w-0">
              <option value="">(全体を表示)</option>
              {specHeadings.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
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
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDesignRenameCommit(); if (e.key === 'Escape') setRenamingDesign(false) }}
              onBlur={handleDesignRenameCommit}
              className="flex-1 text-xs border border-blue-400 rounded px-1.5 py-0.5 outline-none min-w-0" />
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
            <button onClick={() => { if (!designRoot) { toast.error('設計書のルートフォルダが未設定です'); return } setShowDesignPicker(true) }}
              className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600">…</button>
          )}
        </div>

        {/* 設計書の見出し */}
        {link.design && (
          <div className="flex items-center gap-1 pl-10 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">見出し</span>
            <select value={link.designHeading ?? ''} onChange={(e) => onChange({ designHeading: e.target.value || undefined })}
              className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-blue-400 min-w-0">
              <option value="">(全体を表示)</option>
              {designHeadings.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              {link.designHeading && !designHeadings.find((h) => h.value === link.designHeading) && (
                <option value={link.designHeading}>{link.designHeading}</option>
              )}
            </select>
          </div>
        )}
      </div>

      {showSpecPicker && (
        <FilePicker baseDir={specRoot} extensions={MD_EXTS} onConfirm={handleSpecConfirm} onCancel={() => setShowSpecPicker(false)} />
      )}
      {showDesignPicker && (
        <FilePicker baseDir={designRoot} extensions={MD_EXTS} onConfirm={handleDesignConfirm} onCancel={() => setShowDesignPicker(false)} />
      )}
    </>
  )
}
