import { useState, useEffect, useCallback, useRef } from 'react'

interface FilePickerProps {
  baseDir: string
  extensions?: string[]
  multiple?: boolean
  onConfirm: (paths: string[]) => void
  onCancel: () => void
}

interface DirContents {
  dirs: string[]
  files: string[]
}

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function toRelative(abs: string, baseDir: string): string {
  const norm = abs.replace(/\\/g, '/')
  const normBase = baseDir.replace(/\\/g, '/').replace(/\/?$/, '/')
  return norm.startsWith(normBase) ? norm.slice(normBase.length) : abs
}

// --- ディレクトリノード ---

function DirNode({
  dir,
  baseDir,
  extensions,
  multiple,
  selected,
  onToggleFile,
  onConfirm,
  depth
}: {
  dir: string
  baseDir: string
  extensions?: string[]
  multiple?: boolean
  selected: Set<string>
  onToggleFile: (path: string) => void
  onConfirm: (paths: string[]) => void
  depth: number
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const [contents, setContents] = useState<DirContents | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || contents !== null) return
    setLoading(true)
    window.api.listDirShallow(dir, extensions).then((res) => {
      setContents(res.ok && res.data ? res.data : { dirs: [], files: [] })
      setLoading(false)
    })
  }, [open, dir, extensions, contents])

  const dirName = depth === 0 ? toRelative(dir, baseDir) || fileName(dir) : fileName(dir)
  const indent = depth * 12

  return (
    <div>
      {/* ディレクトリ行 */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-100 select-none text-xs text-gray-600"
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shrink-0 w-3 text-gray-400 text-xs">
          {loading ? '…' : open ? '▾' : '▸'}
        </span>
        <span className="truncate font-medium">{dirName}/</span>
      </div>

      {/* 内容 */}
      {open && contents && (
        <>
          {/* ファイル */}
          {contents.files.map((f) => {
            const isSelected = selected.has(f)
            return (
              <div
                key={f}
                className={[
                  'flex items-center gap-2 px-2 py-0.5 cursor-pointer text-xs',
                  isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-blue-50 text-gray-700'
                ].join(' ')}
                style={{ paddingLeft: `${8 + indent + 16}px` }}
                onClick={() => onToggleFile(f)}
                onDoubleClick={() => onConfirm([f])}
                title={toRelative(f, baseDir)}
              >
                {multiple && (
                  <span className={[
                    'w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center leading-none',
                    isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'
                  ].join(' ')}>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                <span className={['truncate', isSelected ? 'font-medium' : ''].join(' ')}>
                  {fileName(f)}
                </span>
              </div>
            )
          })}
          {/* サブディレクトリ（再帰） */}
          {contents.dirs.map((d) => (
            <DirNode
              key={d}
              dir={d}
              baseDir={baseDir}
              extensions={extensions}
              multiple={multiple}
              selected={selected}
              onToggleFile={onToggleFile}
              onConfirm={onConfirm}
              depth={depth + 1}
            />
          ))}
        </>
      )}
    </div>
  )
}

// --- FilePicker 本体 ---

export function FilePicker({ baseDir, extensions, multiple, onConfirm, onCancel }: FilePickerProps): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<string[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // 検索（入力から 400ms 後に再帰スキャン）
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!search.trim()) {
      setSearchResults(null)
      return
    }
    setSearchLoading(true)
    searchTimer.current = setTimeout(async () => {
      const res = await window.api.listFiles(baseDir, extensions)
      const q = search.toLowerCase()
      const filtered = (res.ok ? res.data ?? [] : []).filter((f) =>
        f.replace(/\\/g, '/').toLowerCase().includes(q)
      )
      setSearchResults(filtered)
      setSearchLoading(false)
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, baseDir, extensions])

  const toggleFile = useCallback((path: string) => {
    if (!multiple) {
      setSelected(new Set([path]))
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [multiple])

  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return
    onConfirm([...selected])
  }, [selected, onConfirm])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && selected.size > 0) handleConfirm()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[500px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
          <span className="text-sm font-semibold text-gray-700">
            ファイルを選択{multiple ? '（複数可）' : ''}
          </span>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        {/* 検索 */}
        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ファイル名で検索（全体スキャン）..."
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400"
          />
        </div>

        {/* ファイルリスト */}
        <div className="flex-1 overflow-y-auto">
          {search.trim() ? (
            // 検索モード
            searchLoading ? (
              <div className="p-6 text-xs text-gray-400 text-center">検索中...</div>
            ) : searchResults?.length === 0 ? (
              <div className="p-6 text-xs text-gray-400 text-center">見つかりません</div>
            ) : (
              searchResults?.map((f) => {
                const rel = toRelative(f, baseDir)
                const isSelected = selected.has(f)
                return (
                  <div
                    key={f}
                    className={[
                      'flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer border-b border-gray-50',
                      isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-blue-50 text-gray-700'
                    ].join(' ')}
                    onClick={() => toggleFile(f)}
                    onDoubleClick={() => onConfirm([f])}
                    title={rel}
                  >
                    {multiple && (
                      <span className={[
                        'w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center leading-none',
                        isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'
                      ].join(' ')}>
                        {isSelected ? '✓' : ''}
                      </span>
                    )}
                    <span className="truncate">{rel}</span>
                  </div>
                )
              })
            )
          ) : (
            // ツリーモード
            <DirNode
              dir={baseDir}
              baseDir={baseDir}
              extensions={extensions}
              multiple={multiple}
              selected={selected}
              onToggleFile={toggleFile}
              onConfirm={onConfirm}
              depth={0}
            />
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg shrink-0">
          <span className="text-xs text-gray-400">
            {selected.size > 0 ? `${selected.size} 件選択中` : 'ツリーから選択 / 上で検索'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
            >
              選択
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
