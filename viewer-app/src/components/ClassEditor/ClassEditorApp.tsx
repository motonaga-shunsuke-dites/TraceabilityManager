import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useViewerStore } from '../../store/viewerStore'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Visibility = '+' | '-' | '#' | '~'

interface ClassAttribute {
  id: string
  visibility: Visibility
  name: string
  type: string
  isStatic: boolean
}

interface ClassMethod {
  id: string
  visibility: Visibility
  name: string
  params: string
  returnType: string
  isAbstract: boolean
  isStatic: boolean
}

type ClassAnnotation = '' | 'interface' | 'abstract' | 'enumeration' | 'service'

interface DiagramClass {
  id: string
  name: string
  package: string
  annotation: ClassAnnotation
  attributes: ClassAttribute[]
  methods: ClassMethod[]
}

type RelType = 'inheritance' | 'realization' | 'composition' | 'aggregation' | 'association' | 'dependency'

interface DiagramRelationship {
  id: string
  fromId: string
  toId: string
  type: RelType
  fromLabel: string
  toLabel: string
  label: string
}

type Selection =
  | { type: 'class'; id: string }
  | { type: 'rel'; id: string }
  | null

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const REL_ARROWS: Record<RelType, string> = {
  inheritance: '--|>',
  realization: '..|>',
  composition: '*--',   // ◆ は起点（from）側
  aggregation: 'o--',   // ◇ は起点（from）側
  association: '-->',
  dependency: '..>',
}

const REL_LABELS: Record<RelType, string> = {
  inheritance: '継承 (--|>)',
  realization: '実現/implements (..|>)',
  composition: 'コンポジション (*--)',
  aggregation: '集約 (o--)',
  association: '関連 (-->)',
  dependency: '依存 (..>)',
}

const VIS_LABELS: Record<Visibility, string> = {
  '+': '+ 公開',
  '-': '- 非公開',
  '#': '# 保護',
  '~': '~ パッケージ',
}

const ANNOTATION_LABELS: Record<ClassAnnotation, string> = {
  '': 'なし（通常クラス）',
  'interface': '<<interface>> インターフェース',
  'abstract': '<<abstract>> 抽象クラス',
  'enumeration': '<<enumeration>> 列挙型',
  'service': '<<service>> サービス',
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function genId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ---------------------------------------------------------------------------
// Mermaid コード生成
// ---------------------------------------------------------------------------

function generateMermaid(classes: DiagramClass[], relationships: DiagramRelationship[]): string {
  if (classes.length === 0) return ''
  const lines: string[] = ['classDiagram']

  // パッケージなしクラス
  const noPackage = classes.filter((c) => !c.package)
  for (const cls of noPackage) {
    lines.push(...renderClassLines(cls))
  }

  // パッケージごとにグループ化
  const pkgMap = new Map<string, DiagramClass[]>()
  for (const cls of classes) {
    if (!cls.package) continue
    const arr = pkgMap.get(cls.package) ?? []
    arr.push(cls)
    pkgMap.set(cls.package, arr)
  }
  for (const [pkg, pkgClasses] of pkgMap) {
    lines.push(`  namespace ${pkg} {`)
    for (const cls of pkgClasses) {
      lines.push(...renderClassLines(cls, 2))
    }
    lines.push('  }')
  }

  // 関連
  for (const rel of relationships) {
    const fromClass = classes.find((c) => c.id === rel.fromId)
    const toClass = classes.find((c) => c.id === rel.toId)
    if (!fromClass || !toClass) continue
    const arrow = REL_ARROWS[rel.type]
    const fromCard = rel.fromLabel ? ` "${rel.fromLabel}"` : ''
    const toCard = rel.toLabel ? ` "${rel.toLabel}"` : ''
    const labelPart = rel.label ? ` : ${rel.label}` : ''
    lines.push(`  ${fromClass.name}${fromCard} ${arrow}${toCard} ${toClass.name}${labelPart}`)
  }

  return lines.join('\n')
}

function renderClassLines(cls: DiagramClass, indent = 0): string[] {
  const pad = ' '.repeat(indent)
  const lines: string[] = []
  const hasContent = !!cls.annotation || cls.attributes.length > 0 || cls.methods.length > 0
  if (!hasContent) {
    // 中身なしのときはブレースを省略（mermaid v11 が空ブレースをエラーにするため）
    lines.push(`${pad}  class ${cls.name}`)
    return lines
  }
  lines.push(`${pad}  class ${cls.name} {`)
  if (cls.annotation) {
    lines.push(`${pad}    <<${cls.annotation}>>`)
  }
  for (const attr of cls.attributes) {
    const staticSuffix = attr.isStatic ? '$' : ''
    lines.push(`${pad}    ${attr.visibility}${attr.type} ${attr.name}${staticSuffix}`)
  }
  for (const method of cls.methods) {
    const abstractMod = method.isAbstract ? '*' : ''
    const staticMod = method.isStatic ? '$' : ''
    const mods = abstractMod + staticMod
    const returnPart = method.returnType ? ` ${method.returnType}` : ''
    lines.push(`${pad}    ${method.visibility}${method.name}(${method.params})${mods}${returnPart}`)
  }
  lines.push(`${pad}  }`)
  return lines
}

// ---------------------------------------------------------------------------
// Mermaid パーサー
// ---------------------------------------------------------------------------

function parseMermaidClassDiagram(code: string): { classes: DiagramClass[]; relationships: DiagramRelationship[] } | null {
  const trimmed = code.trim()
  if (!trimmed.startsWith('classDiagram')) return null

  const classes: DiagramClass[] = []
  const relationships: DiagramRelationship[] = []

  // クラス名 → id マップ
  const classNameToId = new Map<string, string>()

  function ensureClass(name: string, pkg = ''): DiagramClass {
    const existing = classes.find((c) => c.name === name)
    if (existing) return existing
    const cls: DiagramClass = {
      id: genId(),
      name,
      package: pkg,
      annotation: '',
      attributes: [],
      methods: [],
    }
    classes.push(cls)
    classNameToId.set(name, cls.id)
    return cls
  }

  const lines = trimmed.split('\n').map((l) => l.trim())

  // namespace ブロックを展開
  let i = 1
  while (i < lines.length) {
    const line = lines[i]

    // namespace ブロック
    const nsMatch = line.match(/^namespace\s+(\S+)\s*\{?$/)
    if (nsMatch) {
      const pkgName = nsMatch[1]
      i++
      // namespace 内のクラスを解析
      while (i < lines.length && lines[i] !== '}') {
        const innerLine = lines[i]
        const classMatch = innerLine.match(/^class\s+(\w+)(?:\s*\{)?$/)
        if (classMatch) {
          const cls = ensureClass(classMatch[1], pkgName)
          i++
          if (lines[i - 1].includes('{')) {
            // クラスブロック内
            while (i < lines.length && lines[i] !== '}') {
              parseClassBodyLine(lines[i], cls)
              i++
            }
            i++ // 閉じ括弧をスキップ
          }
        } else {
          i++
        }
      }
      i++ // namespace の閉じ括弧をスキップ
      continue
    }

    // class ブロック
    const classMatch = line.match(/^class\s+(\w+)(?:\s*\{)?$/)
    if (classMatch) {
      const cls = ensureClass(classMatch[1])
      i++
      if (line.includes('{')) {
        while (i < lines.length && lines[i] !== '}') {
          parseClassBodyLine(lines[i], cls)
          i++
        }
        i++ // 閉じ括弧をスキップ
      }
      continue
    }

    // アノテーション単体行 (class ブロック外)
    const annotMatch = line.match(/^(\w+)\s*:\s*<<(\w+)>>$/)
    if (annotMatch) {
      const cls = ensureClass(annotMatch[1])
      cls.annotation = annotMatch[2] as ClassAnnotation
      i++
      continue
    }

    // 関連行
    const relMatch = parseRelationLine(line)
    if (relMatch) {
      const fromCls = ensureClass(relMatch.from)
      const toCls = ensureClass(relMatch.to)
      relationships.push({
        id: genId(),
        fromId: fromCls.id,
        toId: toCls.id,
        type: relMatch.type,
        fromLabel: relMatch.fromCard,
        toLabel: relMatch.toCard,
        label: relMatch.label,
      })
      i++
      continue
    }

    i++
  }

  return { classes, relationships }
}

function parseClassBodyLine(line: string, cls: DiagramClass): void {
  const trimmed = line.trim()
  if (!trimmed || trimmed === '{' || trimmed === '}') return

  // アノテーション行
  const annotMatch = trimmed.match(/^<<(\w+)>>$/)
  if (annotMatch) {
    cls.annotation = annotMatch[1] as ClassAnnotation
    return
  }

  // 可視性プレフィックス
  const visMap: Record<string, Visibility> = { '+': '+', '-': '-', '#': '#', '~': '~' }
  let visibility: Visibility = '+'
  let rest = trimmed
  if (trimmed[0] in visMap) {
    visibility = visMap[trimmed[0]] as Visibility
    rest = trimmed.slice(1).trim()
  }

  if (rest.includes('(')) {
    // メソッド
    const methodMatch = rest.match(/^(\w+)\(([^)]*)\)([*$]*)(?:\s+(\S+))?$/)
    if (methodMatch) {
      const mods = methodMatch[3] ?? ''
      cls.methods.push({
        id: genId(),
        visibility,
        name: methodMatch[1],
        params: methodMatch[2].trim(),
        returnType: methodMatch[4] ?? '',
        isAbstract: mods.includes('*'),
        isStatic: mods.includes('$'),
      })
    }
  } else {
    // 属性: type name または name type
    const parts = rest.split(/\s+/)
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1]
      const isStatic = lastName.endsWith('$')
      const name = isStatic ? lastName.slice(0, -1) : lastName
      const type = parts.slice(0, parts.length - 1).join(' ')
      cls.attributes.push({
        id: genId(),
        visibility,
        name,
        type,
        isStatic,
      })
    } else if (parts.length === 1) {
      cls.attributes.push({
        id: genId(),
        visibility,
        name: parts[0],
        type: '',
        isStatic: false,
      })
    }
  }
}

interface RelMatch {
  from: string
  to: string
  type: RelType
  fromCard: string
  toCard: string
  label: string
}

const ARROW_MAP: Array<[string, RelType]> = [
  ['--|>', 'inheritance'],
  ['..|>', 'realization'],
  ['*--', 'composition'],   // 正方向
  ['o--', 'aggregation'],   // 正方向
  ['--*', 'composition'],   // 逆向き互換
  ['--o', 'aggregation'],   // 逆向き互換
  ['-->', 'association'],
  ['..>', 'dependency'],
  ['--', 'association'],
  ['..', 'dependency'],
]

function parseRelationLine(line: string): RelMatch | null {
  // パターン: ClassA "card" arrow "card" ClassB : label
  // 矢印部分を動的に検出
  for (const [arrow, relType] of ARROW_MAP) {
    const escaped = arrow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(
      `^(\\w+)\\s*(?:"([^"]*)"\\s*)?${escaped}\\s*(?:"([^"]*)"\\s*)?(\\w+)(?:\\s*:\\s*(.*))?$`
    )
    const m = line.match(pattern)
    if (m) {
      return {
        from: m[1],
        to: m[4],
        type: relType,
        fromCard: m[2] ?? '',
        toCard: m[3] ?? '',
        label: m[5]?.trim() ?? '',
      }
    }
  }
  return null
}

function extractClassDiagramFromMarkdown(markdown: string): string | null {
  const blockPattern = /```mermaid\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(markdown)) !== null) {
    const code = match[1].trim()
    if (code.startsWith('classDiagram')) {
      return code
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// LivePreview
// ---------------------------------------------------------------------------

let previewCounter = 0

function LivePreview({ code }: { code: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const counterRef = useRef(0)

  useEffect(() => {
    if (!code.trim()) {
      setError(null)
      setRendering(false)
      if (containerRef.current) containerRef.current.innerHTML = ''
      return
    }

    const current = ++counterRef.current
    setError(null)
    setRendering(true)

    const timer = setTimeout(async () => {
      if (current !== counterRef.current) return
      const id = `class-editor-preview-${++previewCounter}`
      try {
        const { svg } = await mermaid.render(id, code)
        if (current !== counterRef.current) return
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
        setRendering(false)
      } catch (err) {
        if (current !== counterRef.current) return
        setError(String((err as Error)?.message ?? err))
        setRendering(false)
      } finally {
        const el = document.getElementById(id)
        if (el && !containerRef.current?.contains(el)) el.remove()
      }
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  }, [code])

  if (!code.trim()) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-white">
        クラスを追加すると図が表示されます
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-4 bg-white">
        <div className="p-2 border border-red-300 rounded bg-red-50 text-red-600 text-xs font-mono whitespace-pre-wrap">
          プレビューエラー: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-4 relative">
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs bg-white/80">
          描画中...
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClassForm
// ---------------------------------------------------------------------------

function ClassForm({
  cls,
  packages,
  onChange,
}: {
  cls: DiagramClass
  packages: string[]
  onChange: (updated: DiagramClass) => void
}): JSX.Element {
  const updateAttr = useCallback(
    (attrId: string, patch: Partial<ClassAttribute>) => {
      onChange({
        ...cls,
        attributes: cls.attributes.map((a) => (a.id === attrId ? { ...a, ...patch } : a)),
      })
    },
    [cls, onChange]
  )

  const updateMethod = useCallback(
    (methodId: string, patch: Partial<ClassMethod>) => {
      onChange({
        ...cls,
        methods: cls.methods.map((m) => (m.id === methodId ? { ...m, ...patch } : m)),
      })
    },
    [cls, onChange]
  )

  const addAttr = useCallback(() => {
    onChange({
      ...cls,
      attributes: [
        ...cls.attributes,
        { id: genId(), visibility: '+', name: 'attribute', type: 'String', isStatic: false },
      ],
    })
  }, [cls, onChange])

  const removeAttr = useCallback(
    (attrId: string) => {
      onChange({ ...cls, attributes: cls.attributes.filter((a) => a.id !== attrId) })
    },
    [cls, onChange]
  )

  const addMethod = useCallback(() => {
    onChange({
      ...cls,
      methods: [
        ...cls.methods,
        { id: genId(), visibility: '+', name: 'method', params: '', returnType: 'void', isAbstract: false, isStatic: false },
      ],
    })
  }, [cls, onChange])

  const removeMethod = useCallback(
    (methodId: string) => {
      onChange({ ...cls, methods: cls.methods.filter((m) => m.id !== methodId) })
    },
    [cls, onChange]
  )

  const listId = `pkg-list-${cls.id}`

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      {/* クラス名 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">クラス名</label>
        <input
          value={cls.name}
          onChange={(e) => onChange({ ...cls, name: e.target.value })}
          placeholder="例: UserAccount"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* パッケージ */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">パッケージ / 名前空間</label>
        <input
          list={listId}
          value={cls.package}
          onChange={(e) => onChange({ ...cls, package: e.target.value })}
          placeholder="例: com.example.domain（空欄でなし）"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
        <datalist id={listId}>
          {packages.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {/* 種別 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">種別</label>
        <select
          value={cls.annotation}
          onChange={(e) => onChange({ ...cls, annotation: e.target.value as ClassAnnotation })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {(Object.keys(ANNOTATION_LABELS) as ClassAnnotation[]).map((key) => (
            <option key={key} value={key}>
              {ANNOTATION_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* 属性 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">属性（フィールド）</span>
          <button
            onClick={addAttr}
            className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
          >
            + 追加
          </button>
        </div>
        {cls.attributes.length === 0 && (
          <p className="text-xs text-gray-400">属性がありません</p>
        )}
        {cls.attributes.map((attr) => (
          <div key={attr.id} className="flex items-center gap-1 flex-wrap">
            <select
              value={attr.visibility}
              onChange={(e) => updateAttr(attr.id, { visibility: e.target.value as Visibility })}
              title="可視性"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none w-24"
            >
              {(Object.keys(VIS_LABELS) as Visibility[]).map((v) => (
                <option key={v} value={v}>{VIS_LABELS[v]}</option>
              ))}
            </select>
            <input
              value={attr.type}
              onChange={(e) => updateAttr(attr.id, { type: e.target.value })}
              placeholder="型（例: String）"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-20 min-w-0"
            />
            <input
              value={attr.name}
              onChange={(e) => updateAttr(attr.id, { name: e.target.value })}
              placeholder="名前"
              className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
            />
            <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={attr.isStatic}
                onChange={(e) => updateAttr(attr.id, { isStatic: e.target.checked })}
              />
              static
            </label>
            <button
              onClick={() => removeAttr(attr.id)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
              title="削除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* メソッド */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">メソッド</span>
          <button
            onClick={addMethod}
            className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
          >
            + 追加
          </button>
        </div>
        {cls.methods.length === 0 && (
          <p className="text-xs text-gray-400">メソッドがありません</p>
        )}
        {cls.methods.map((method) => (
          <div key={method.id} className="flex flex-col gap-0.5 border border-gray-100 rounded p-1.5 bg-gray-50">
            {/* 1段目 */}
            <div className="flex items-center gap-1">
              <select
                value={method.visibility}
                onChange={(e) => updateMethod(method.id, { visibility: e.target.value as Visibility })}
                title="可視性"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none w-24"
              >
                {(Object.keys(VIS_LABELS) as Visibility[]).map((v) => (
                  <option key={v} value={v}>{VIS_LABELS[v]}</option>
                ))}
              </select>
              <input
                value={method.name}
                onChange={(e) => updateMethod(method.id, { name: e.target.value })}
                placeholder="メソッド名"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
              />
              <button
                onClick={() => removeMethod(method.id)}
                className="text-xs text-red-400 hover:text-red-600 px-1"
                title="削除"
              >
                ✕
              </button>
            </div>
            {/* 2段目 */}
            <div className="flex items-center gap-1 flex-wrap pl-1">
              <input
                value={method.params}
                onChange={(e) => updateMethod(method.id, { params: e.target.value })}
                placeholder="引数（例: name: String, age: int）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
              />
              <input
                value={method.returnType}
                onChange={(e) => updateMethod(method.id, { returnType: e.target.value })}
                placeholder="戻り値型（例: void）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-24"
              />
              <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={method.isAbstract}
                  onChange={(e) => updateMethod(method.id, { isAbstract: e.target.checked })}
                />
                abstract
              </label>
              <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={method.isStatic}
                  onChange={(e) => updateMethod(method.id, { isStatic: e.target.checked })}
                />
                static
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelationshipForm
// ---------------------------------------------------------------------------

const REL_HELP: Record<RelType, string> = {
  inheritance:  '継承: 子クラスが親クラスの属性・操作を引き継ぐ。is-a 関係。\n例: Dog --|> Animal',
  realization:  '実現/実装: クラスがインターフェースの契約を満たす。\n例: PayPal ..|> PaymentMethod',
  composition:  'コンポジション ◆: 起点クラスが終点クラスを所有し、起点が消えると終点も消える（強い所有）。\n例: House *-- Room（家がなければ部屋も存在しない）',
  aggregation:  '集約 ◇: 起点クラスが終点クラスを含むが、起点が消えても終点は存在できる（弱い所有）。\n例: Team o-- Player（チームが解散しても選手は残る）',
  association:  '関連: 一方が他方を参照する一般的な関係。\n例: User --> Order',
  dependency:   '依存: 一時的な使用関係。メソッドの引数・戻り値など。\n例: Report ..> Database',
}

function RelationshipForm({
  rel,
  classes,
  onChange,
}: {
  rel: DiagramRelationship
  classes: DiagramClass[]
  onChange: (updated: DiagramRelationship) => void
}): JSX.Element {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto">
      {/* 種類 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-600">関連の種類</span>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="ml-1 w-4 h-4 text-[10px] rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 leading-none flex items-center justify-center shrink-0"
            title="各関連の説明を表示"
          >?</button>
        </div>
        {showHelp && (
          <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-gray-700 space-y-1.5">
            {(Object.keys(REL_HELP) as RelType[]).map((type) => (
              <div key={type}>
                <span className="font-semibold text-blue-700">{REL_LABELS[type]}</span>
                <br />
                <span className="whitespace-pre-line text-gray-600">{REL_HELP[type]}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {(Object.keys(REL_LABELS) as RelType[]).map((type) => (
            <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`rel-type-${rel.id}`}
                value={type}
                checked={rel.type === type}
                onChange={() => onChange({ ...rel, type })}
              />
              <span>{REL_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 起点クラス */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">起点クラス</label>
        <select
          value={rel.fromId}
          onChange={(e) => onChange({ ...rel, fromId: e.target.value })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.package ? ` (${c.package})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 起点の多重度 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">起点の多重度</label>
        <input
          value={rel.fromLabel}
          onChange={(e) => onChange({ ...rel, fromLabel: e.target.value })}
          placeholder="例: 1, 0..*, 1..*"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* 終点クラス */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">終点クラス</label>
        <select
          value={rel.toId}
          onChange={(e) => onChange({ ...rel, toId: e.target.value })}
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.package ? ` (${c.package})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 終点の多重度 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">終点の多重度</label>
        <input
          value={rel.toLabel}
          onChange={(e) => onChange({ ...rel, toLabel: e.target.value })}
          placeholder="例: 1, 0..*, 1..*"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>

      {/* 関連ラベル */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">ラベル（関連名）</label>
        <input
          value={rel.label}
          onChange={(e) => onChange({ ...rel, label: e.target.value })}
          placeholder="例: uses, contains"
          className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LeftPanel（ツリー表示 + ドラッグ並べ替え）
// ---------------------------------------------------------------------------

function LeftPanel({
  classes,
  relationships,
  selection,
  onSelect,
  onDeleteClass,
  onDeleteRel,
  onAddClass,
  onAddRel,
  onReorderClasses,
}: {
  classes: DiagramClass[]
  relationships: DiagramRelationship[]
  selection: Selection
  onSelect: (sel: Selection) => void
  onDeleteClass: (id: string) => void
  onDeleteRel: (id: string) => void
  onAddClass: () => void
  onAddRel: () => void
  onReorderClasses: (newClasses: DiagramClass[]) => void
}): JSX.Element {
  const [collapsedPkgs, setCollapsedPkgs] = useState<Set<string>>(new Set())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null)
  const [dropEndPkg, setDropEndPkg] = useState<string | null>(null)

  const togglePkg = useCallback((pkg: string) => {
    setCollapsedPkgs((prev) => {
      const next = new Set(prev)
      if (next.has(pkg)) next.delete(pkg)
      else next.add(pkg)
      return next
    })
  }, [])

  // パッケージ別グループ（no-package が常に先頭）
  const groups = useMemo(() => {
    const noPackage: DiagramClass[] = []
    const pkgMap = new Map<string, DiagramClass[]>()
    const pkgOrder: string[] = []
    for (const cls of classes) {
      if (!cls.package) {
        noPackage.push(cls)
      } else {
        if (!pkgMap.has(cls.package)) {
          pkgMap.set(cls.package, [])
          pkgOrder.push(cls.package)
        }
        pkgMap.get(cls.package)!.push(cls)
      }
    }
    const result: { pkg: string; items: DiagramClass[] }[] = []
    if (noPackage.length > 0) result.push({ pkg: '', items: noPackage })
    for (const pkg of pkgOrder) result.push({ pkg, items: pkgMap.get(pkg)! })
    return result
  }, [classes])

  const computeDrop = useCallback(
    (dragId: string, beforeId: string | null, toPkg: string): DiagramClass[] => {
      const dragged = classes.find((c) => c.id === dragId)
      if (!dragged) return classes
      const updated = { ...dragged, package: toPkg }
      const without = classes.filter((c) => c.id !== dragId)
      if (beforeId === null) {
        let insertAfter = -1
        for (let i = without.length - 1; i >= 0; i--) {
          if ((without[i].package || '') === toPkg) { insertAfter = i; break }
        }
        const arr = [...without]
        arr.splice(insertAfter + 1, 0, updated)
        return arr
      } else {
        const targetIdx = without.findIndex((c) => c.id === beforeId)
        const arr = [...without]
        arr.splice(targetIdx >= 0 ? targetIdx : arr.length, 0, updated)
        return arr
      }
    },
    [classes]
  )

  const clearDrag = useCallback(() => {
    setDraggedId(null)
    setDropBeforeId(null)
    setDropEndPkg(null)
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* クラスセクション */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">クラス</span>
        <button
          onClick={onAddClass}
          className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
        >
          + 追加
        </button>
      </div>

      <div className="flex-1 overflow-y-auto select-none">
        {classes.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-2">クラスがありません</p>
        )}

        {groups.map(({ pkg, items }) => {
          const isPkg = pkg !== ''
          const isCollapsed = isPkg && collapsedPkgs.has(pkg)
          const isPkgDropTarget = dropEndPkg === pkg && dropBeforeId === null

          return (
            <div key={pkg}>
              {/* パッケージヘッダー */}
              {isPkg && (
                <div
                  className={[
                    'flex items-center gap-1 px-2 py-1 cursor-pointer text-xs border-y border-gray-100 transition-colors',
                    isPkgDropTarget
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600',
                  ].join(' ')}
                  onClick={() => togglePkg(pkg)}
                  onDragOver={(e) => { e.preventDefault(); setDropBeforeId(null); setDropEndPkg(pkg) }}
                  onDrop={(e) => { e.preventDefault(); if (draggedId && draggedId !== pkg) { onReorderClasses(computeDrop(draggedId, null, pkg)); clearDrag() } }}
                >
                  <span className="w-3 text-gray-400 shrink-0">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="font-medium flex-1 truncate" title={pkg}>{pkg}</span>
                  {isPkgDropTarget && <span className="text-blue-500 text-xs shrink-0">ここへ移動</span>}
                </div>
              )}

              {/* クラスアイテム */}
              {!isCollapsed && items.map((cls) => {
                const isSelected = selection?.type === 'class' && selection.id === cls.id
                const isDragging = draggedId === cls.id
                const showDropBefore = dropBeforeId === cls.id

                return (
                  <div key={cls.id}>
                    {showDropBefore && (
                      <div className={isPkg ? 'ml-6 mr-3' : 'mx-3'}>
                        <div className="h-0.5 bg-blue-500 rounded" />
                      </div>
                    )}
                    <div
                      draggable
                      onDragStart={() => setDraggedId(cls.id)}
                      onDragEnd={clearDrag}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropBeforeId(cls.id); setDropEndPkg(null) }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        if (draggedId && draggedId !== cls.id) {
                          onReorderClasses(computeDrop(draggedId, cls.id, cls.package))
                          clearDrag()
                        }
                      }}
                      onClick={() => onSelect({ type: 'class', id: cls.id })}
                      className={[
                        'flex items-center gap-1 py-1.5 cursor-pointer group transition-colors',
                        isPkg ? 'pl-6 pr-3' : 'px-3',
                        isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                        isDragging ? 'opacity-40' : '',
                      ].join(' ')}
                    >
                      <span
                        className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0 text-xs"
                        title="ドラッグして並べ替え"
                      >⠿</span>
                      <span className="flex-1 text-xs truncate">{cls.name}</span>
                      {cls.annotation && (
                        <span className="text-xs text-gray-400 font-mono shrink-0 hidden group-hover:inline">
                          «{cls.annotation.slice(0, 4)}»
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteClass(cls.id) }}
                        className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                        title="削除"
                      >✕</button>
                    </div>
                  </div>
                )
              })}

              {/* パッケージ末尾ドロップゾーン */}
              {!isCollapsed && isPkg && (
                <div
                  className={[
                    'h-2 mx-3 rounded transition-colors',
                    dropEndPkg === pkg && !dropBeforeId ? 'bg-blue-200' : '',
                  ].join(' ')}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropBeforeId(null); setDropEndPkg(pkg) }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (draggedId) { onReorderClasses(computeDrop(draggedId, null, pkg)); clearDrag() } }}
                />
              )}
            </div>
          )
        })}

        {/* パッケージなし末尾ドロップゾーン */}
        <div
          className={[
            'h-4 mx-3 rounded transition-colors',
            dropEndPkg === '' && !dropBeforeId ? 'bg-blue-100' : '',
          ].join(' ')}
          onDragOver={(e) => { e.preventDefault(); setDropBeforeId(null); setDropEndPkg('') }}
          onDrop={(e) => { e.preventDefault(); if (draggedId) { onReorderClasses(computeDrop(draggedId, null, '')); clearDrag() } }}
        />
      </div>

      {/* 関連セクション */}
      <div className="flex flex-col border-t border-gray-200" style={{ maxHeight: '40%', minHeight: '120px' }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">関連</span>
          <button
            onClick={onAddRel}
            disabled={classes.length < 2}
            title={classes.length < 2 ? 'クラスが2つ以上必要です' : ''}
            className="text-xs px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + 追加
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {relationships.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-2">関連がありません</p>
          )}
          {relationships.map((rel) => {
            const fromCls = classes.find((c) => c.id === rel.fromId)
            const toCls = classes.find((c) => c.id === rel.toId)
            const arrow = REL_ARROWS[rel.type]
            const label = rel.label ? ` : ${rel.label}` : ''
            const display = `${fromCls?.name ?? '?'} ${arrow} ${toCls?.name ?? '?'}${label}`
            const isSelected = selection?.type === 'rel' && selection.id === rel.id
            return (
              <div
                key={rel.id}
                className={[
                  'flex items-center gap-1 px-3 py-1.5 cursor-pointer group',
                  isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700',
                ].join(' ')}
                onClick={() => onSelect({ type: 'rel', id: rel.id })}
              >
                <span className="flex-1 text-xs truncate font-mono" title={display}>{display}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteRel(rel.id) }}
                  className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                  title="削除"
                >✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ImportModal
// ---------------------------------------------------------------------------

function ImportModal({
  specContent,
  designContent,
  onImport,
  onClose,
}: {
  specContent: string | null
  designContent: string | null
  onImport: (code: string) => void
  onClose: () => void
}): JSX.Element {
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
              現在表示中のドキュメントにクラス図（classDiagram）が見つかりませんでした。
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

type ExportTarget = 'spec' | 'design' | 'clipboard'

function ExportModal({
  code,
  hasSpec,
  hasDesign,
  isEditMode,
  onInsert,
  onClose,
}: {
  code: string
  hasSpec: boolean
  hasDesign: boolean
  isEditMode: boolean
  onInsert: (target: ExportTarget) => void
  onClose: () => void
}): JSX.Element {
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
              <p className="text-sm text-gray-600">生成された Mermaid コード:</p>
              <textarea
                ref={textareaRef}
                readOnly
                value={`\`\`\`mermaid\n${code}\n\`\`\``}
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

function Toast({ message, onDone }: { message: string; onDone: () => void }): JSX.Element {
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

// ---------------------------------------------------------------------------
// ClassEditorApp (メイン)
// ---------------------------------------------------------------------------

export function ClassEditorApp({ onClose }: { onClose: () => void }): JSX.Element {
  const [classes, setClasses] = useState<DiagramClass[]>([])
  const [relationships, setRelationships] = useState<DiagramRelationship[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [showCode, setShowCode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState(false)

  // リンクファイル機能
  const [linkedFile, setLinkedFile] = useState('')       // 選択中の .mmd ファイル名
  const [newFileName, setNewFileName] = useState('')     // 新規作成用入力
  const [autoSave, setAutoSave] = useState(false)        // 自動保存 on/off
  const [mmdFiles, setMmdFiles] = useState<string[]>([]) // 同ディレクトリの .mmd 一覧
  const [customDir, setCustomDir] = useState<string | null>(null) // 手動指定フォルダ
  const [dirSource, setDirSource] = useState<'spec' | 'design' | 'custom'>('spec') // どのディレクトリを使うか

  const content = useViewerStore((s) => s.content)

  const code = useMemo(() => generateMermaid(classes, relationships), [classes, relationships])

  // リンクファイルのベースディレクトリ
  const linkedDir = useMemo(() => {
    if (dirSource === 'custom') return customDir ? customDir.replace(/\\/g, '/') : null
    const p = dirSource === 'design' ? content.designPath : content.specPath
    if (!p) return null
    const norm = p.replace(/\\/g, '/')
    return norm.substring(0, norm.lastIndexOf('/'))
  }, [dirSource, customDir, content.specPath, content.designPath])

  // 同ディレクトリの .mmd ファイル一覧を読み込む
  useEffect(() => {
    if (!linkedDir) { setMmdFiles([]); return }
    window.api.listFiles(linkedDir, ['mmd']).then((res) => {
      if (res.ok) {
        setMmdFiles((res.data ?? []).map((f) => f.replace(/\\/g, '/').split('/').pop() ?? f))
      }
    })
  }, [linkedDir])

  // 自動保存
  useEffect(() => {
    if (!autoSave || !linkedFile || !linkedDir || !code) return
    const absPath = linkedDir + '/' + linkedFile
    const timer = setTimeout(() => {
      window.api.writeText(absPath, code)
    }, 600)
    return () => clearTimeout(timer)
  }, [code, autoSave, linkedFile, linkedDir])

  const packages = useMemo(() => {
    const pkgs = new Set<string>()
    for (const cls of classes) {
      if (cls.package) pkgs.add(cls.package)
    }
    return Array.from(pkgs)
  }, [classes])

  // クラス操作
  const handleAddClass = useCallback(() => {
    const name = `NewClass${classes.length + 1}`
    const cls: DiagramClass = {
      id: genId(),
      name,
      package: '',
      annotation: '',
      attributes: [],
      methods: [],
    }
    setClasses((prev) => [...prev, cls])
    setSelection({ type: 'class', id: cls.id })
  }, [classes.length])

  const handleDeleteClass = useCallback((id: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== id))
    setRelationships((prev) => prev.filter((r) => r.fromId !== id && r.toId !== id))
    setSelection((prev) => (prev?.type === 'class' && prev.id === id ? null : prev))
  }, [])

  const handleUpdateClass = useCallback((updated: DiagramClass) => {
    setClasses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }, [])

  // 関連操作
  const handleAddRel = useCallback(() => {
    if (classes.length < 2) return
    const rel: DiagramRelationship = {
      id: genId(),
      fromId: classes[0].id,
      toId: classes[1].id,
      type: 'association',
      fromLabel: '',
      toLabel: '',
      label: '',
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

  const handleReorderClasses = useCallback((newClasses: DiagramClass[]) => {
    setClasses(newClasses)
  }, [])

  // リンクファイル: ファイルを選択して読み込む
  const handleSelectLinkedFile = useCallback(async (fileName: string) => {
    if (!fileName || !linkedDir) return
    setLinkedFile(fileName)
    const absPath = linkedDir + '/' + fileName
    const res = await window.api.readText(absPath)
    if (!res.ok) { setToast('ファイルの読み込みに失敗しました'); return }
    const text = res.data ?? ''
    if (!text.trim()) {
      // 空ファイル → 新規として扱う
      setClasses([])
      setRelationships([])
      setSelection(null)
      setToast(`${fileName} を開きました（空）`)
      return
    }
    const parsed = parseMermaidClassDiagram(text)
    if (parsed) {
      setClasses(parsed.classes)
      setRelationships(parsed.relationships)
      setSelection(null)
      setToast(`${fileName} を読み込みました`)
    } else {
      setToast('ファイルの解析に失敗しました（classDiagram 形式ではありません）')
    }
  }, [linkedDir])

  // リンクファイル: 新規 .mmd ファイルを作成してリンク
  const handleCreateLinkedFile = useCallback(async () => {
    const name = newFileName.trim()
    if (!name || !linkedDir) return
    const fileName = name.endsWith('.mmd') ? name : `${name}.mmd`
    const absPath = linkedDir + '/' + fileName
    // 現在のファイルを保存してからエディターをクリア
    if (linkedFile && code) {
      await window.api.writeText(linkedDir + '/' + linkedFile, code)
    }
    setClasses([])
    setRelationships([])
    setSelection(null)
    const res = await window.api.writeText(absPath, '')
    if (res.ok) {
      setMmdFiles((prev) => [...prev.filter((f) => f !== fileName), fileName])
      setLinkedFile(fileName)
      setNewFileName('')
      setAutoSave(true)
      setToast(`${fileName} を作成しました`)
    } else {
      setToast(`作成に失敗しました: ${res.error ?? ''}`)
    }
  }, [newFileName, linkedDir, linkedFile, code])

  // 参照用コードをクリップボードにコピー
  const handleCopyCode = useCallback(async () => {
    const text = linkedFile
      ? `\`\`\`mermaid-include\n./${linkedFile}\n\`\`\``
      : `\`\`\`mermaid\n${code}\n\`\`\``
    try {
      await navigator.clipboard.writeText(text)
      setToast(linkedFile ? '参照用コードをコピーしました' : 'Mermaidコードをコピーしました')
    } catch {
      setToast('コピーに失敗しました')
    }
  }, [linkedFile, code])

  // 選択中アイテム
  const selectedClass = selection?.type === 'class'
    ? classes.find((c) => c.id === selection.id) ?? null
    : null
  const selectedRel = selection?.type === 'rel'
    ? relationships.find((r) => r.id === selection.id) ?? null
    : null

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
          title={linkedFile ? `\`\`\`mermaid-include\n./${linkedFile}\n\`\`\` をコピー` : 'Mermaidコードをコピー'}
          className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          📋 {linkedFile ? '参照用コードをコピー' : 'コードをコピー'}
        </button>
        <button
          onClick={() => setSplitMode((v) => !v)}
          title={splitMode ? '全画面表示に切り替え' : 'ビューアーと並べて表示'}
          className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
        >
          {splitMode ? '⛶ 全画面' : '⬜ 並べて表示'}
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 shrink-0"
        >
          ✕ 閉じる
        </button>
      </div>

      {/* ヘッダー行2: .mmd ファイルリンク */}
      <div className="bg-gray-700 text-white flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap">
        <span className="text-xs text-gray-300 shrink-0">リンクファイル:</span>
        {/* spec / design / custom 切り替え */}
        {(content.specPath || content.designPath) && (
          <div className="flex rounded overflow-hidden border border-gray-500 shrink-0">
            {content.specPath && (
              <button
                onClick={() => { setDirSource('spec'); setLinkedFile('') }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'spec' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >仕様書</button>
            )}
            {content.designPath && (
              <button
                onClick={() => { setDirSource('design'); setLinkedFile('') }}
                className={`px-2 py-0.5 text-xs ${dirSource === 'design' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              >設計書</button>
            )}
            <button
              onClick={async () => {
                const folder = await window.api.selectFolder()
                if (folder) { setCustomDir(folder); setDirSource('custom'); setLinkedFile('') }
              }}
              className={`px-2 py-0.5 text-xs ${dirSource === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
              title="フォルダを手動選択"
            >📁</button>
          </div>
        )}

        {/* フォルダ選択（プロジェクト未選択のとき） */}
        {!content.specPath && !content.designPath && !linkedDir && (
          <button
            onClick={async () => {
              const folder = await window.api.selectFolder()
              if (folder) { setCustomDir(folder); setDirSource('custom') }
            }}
            className="px-2 py-0.5 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 shrink-0"
          >
            📁 保存フォルダを選択
          </button>
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
                else setLinkedFile('')
              }}
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white outline-none max-w-[160px]"
            >
              <option value="">-- 未選択 --</option>
              {mmdFiles.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLinkedFile() }}
              placeholder="新規ファイル名.mmd"
              className="text-xs bg-gray-600 border border-gray-500 rounded px-2 py-0.5 text-white placeholder-gray-400 outline-none w-36"
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
            {autoSave && linkedFile && (
              <span className="text-xs text-green-400 shrink-0">● {linkedFile} に自動保存中</span>
            )}
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-400 shrink-0">
          ビューアーで参照するには: <code className="bg-gray-600 px-1 rounded">```mermaid-include</code> ブロックにファイル名を記述
        </span>
      </div>

      {/* メイン */}
      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* 左パネル */}
        <Panel defaultSize={18} minSize={12} maxSize={35}>
          <div className="h-full border-r border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
            <LeftPanel
              classes={classes}
              relationships={relationships}
              selection={selection}
              onSelect={setSelection}
              onDeleteClass={handleDeleteClass}
              onDeleteRel={handleDeleteRel}
              onAddClass={handleAddClass}
              onAddRel={handleAddRel}
              onReorderClasses={handleReorderClasses}
            />
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize" />

        {/* 中央: プレビュー */}
        <Panel defaultSize={52} minSize={30}>
          <div className="h-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">プレビュー</span>
              <button
                onClick={() => setShowCode((v) => !v)}
                className="text-xs px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-600"
              >
                {showCode ? 'コードを非表示' : 'コードを表示'}
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <LivePreview code={code} />
            </div>
            {showCode && (
              <div className="max-h-48 overflow-auto bg-gray-900 text-green-400 text-xs font-mono p-3 shrink-0">
                <pre>{code}</pre>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize" />

        {/* 右パネル: フォーム */}
        <Panel defaultSize={30} minSize={20} maxSize={55}>
          <div className="h-full border-l border-gray-200 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
              <span className="text-xs font-semibold text-gray-500">
                {selectedClass
                  ? selectedClass.name
                  : selectedRel
                  ? `関連: ${classes.find((c) => c.id === selectedRel.fromId)?.name ?? '?'} → ${classes.find((c) => c.id === selectedRel.toId)?.name ?? '?'}`
                  : '詳細'}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedClass ? (
                <ClassForm
                  cls={selectedClass}
                  packages={packages}
                  onChange={handleUpdateClass}
                />
              ) : selectedRel ? (
                <RelationshipForm
                  rel={selectedRel}
                  classes={classes}
                  onChange={handleUpdateRel}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2 p-4 text-center">
                  <span>左のリストからクラスまたは関連を選択すると、ここで編集できます</span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Toast */}
      {toast && (
        <Toast message={toast} onDone={() => setToast(null)} />
      )}
    </div>
  )
}
