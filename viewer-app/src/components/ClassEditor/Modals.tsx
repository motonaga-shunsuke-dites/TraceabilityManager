import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportTarget } from './types'
import { extractClassDiagramFromMarkdown } from './plantuml'

// ---------------------------------------------------------------------------
// ImportModal
// ---------------------------------------------------------------------------

interface ImportModalProps {
  specContent: string | null
  designContent: string | null
  onImport: (code: string) => void
  onClose: () => void
}

export function ImportModal({ specContent, designContent, onImport, onClose }: ImportModalProps): JSX.Element {
  const specCode = specContent ? extractClassDiagramFromMarkdown(specContent) : null
  const designCode = designContent ? extractClassDiagramFromMarkdown(designContent) : null
  const hasAny = specCode !== null || designCode !== null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[440px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">ビューアーから読み込み</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          {!hasAny && (
            <p className="text-sm text-gray-500">
              現在表示中のドキュメントにクラス図（PlantUML）が見つかりませんでした。
            </p>
          )}
          {specCode && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">仕様書</span>
              <button
                onClick={() => { onImport(specCode); onClose() }}
                className="px-3 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 text-left"
              >
                仕様書からクラス図を読み込む
              </button>
            </div>
          )}
          {!specCode && specContent && (
            <p className="text-xs text-gray-400">仕様書にクラス図が見つかりませんでした</p>
          )}
          {designCode && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">設計書</span>
              <button
                onClick={() => { onImport(designCode); onClose() }}
                className="px-3 py-2 text-sm rounded bg-green-500 text-white hover:bg-green-600 text-left"
              >
                設計書からクラス図を読み込む
              </button>
            </div>
          )}
          {!designCode && designContent && (
            <p className="text-xs text-gray-400">設計書にクラス図が見つかりませんでした</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

interface ExportModalProps {
  code: string
  hasSpec: boolean
  hasDesign: boolean
  isEditMode: boolean
  onInsert: (target: ExportTarget) => void
  onClose: () => void
}

export function ExportModal({ code, hasSpec, hasDesign, isEditMode, onInsert, onClose }: ExportModalProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (textareaRef.current) {
        textareaRef.current.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }, [code])

  const bothDocs = isEditMode && hasSpec && hasDesign

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[480px] flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-700">ビューアーへ転記</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 overflow-y-auto flex-1">
          {bothDocs && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-600">どちらのドキュメントの末尾に挿入しますか？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onInsert('spec')}
                  className="flex-1 px-3 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                  仕様書に挿入
                </button>
                <button
                  onClick={() => onInsert('design')}
                  className="flex-1 px-3 py-2 text-sm rounded bg-green-500 text-white hover:bg-green-600"
                >
                  設計書に挿入
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">または</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                {copied ? 'コピーしました!' : 'クリップボードにコピー'}
              </button>
            </div>
          )}
          {!bothDocs && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-600">生成された PlantUML コード:</p>
              <textarea
                ref={textareaRef}
                readOnly
                value={`\`\`\`plantuml\n${code}\n\`\`\``}
                rows={8}
                className="text-xs font-mono border border-gray-200 rounded p-2 bg-gray-50 resize-none w-full outline-none"
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                {copied ? 'コピーしました!' : 'クリップボードにコピー'}
              </button>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastProps {
  message: string
  onDone: () => void
}

export function Toast({ message, onDone }: ToastProps): JSX.Element {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-800 text-white text-sm px-4 py-2 rounded shadow-lg">
      {message}
    </div>
  )
}
