import type {
  ClassItem,
  DiagramClass,
  DiagramRelationship,
  RelType,
  ClassAnnotation,
  Visibility,
} from './types'
import { genId, isSep, computeDepths } from './utils'

// ---------------------------------------------------------------------------
// PlantUML コード生成
// ---------------------------------------------------------------------------

function classDeclaration(cls: DiagramClass): string {
  switch (cls.annotation) {
    case 'interface':
      return `interface ${cls.name}`
    case 'abstract':
      return `abstract class ${cls.name}`
    case 'enumeration':
      return `enum ${cls.name}`
    case 'service':
      return `class ${cls.name} <<service>>`
    default:
      return `class ${cls.name}`
  }
}

function renderPlantumlClassLines(cls: DiagramClass, indent = ''): string[] {
  const lines: string[] = []
  const hasContent = cls.attributes.length > 0 || cls.methods.length > 0

  if (!hasContent) {
    lines.push(`${indent}${classDeclaration(cls)}`)
    return lines
  }

  lines.push(`${indent}${classDeclaration(cls)} {`)
  for (const attr of cls.attributes) {
    const staticMod = attr.isStatic ? '{static} ' : ''
    lines.push(`${indent}  ${attr.visibility}${staticMod}${attr.type} ${attr.name}`)
  }
  for (const method of cls.methods) {
    const staticMod = method.isStatic ? '{static} ' : ''
    const abstractMod = method.isAbstract ? '{abstract} ' : ''
    const returnPart = method.returnType ? ` : ${method.returnType}` : ''
    lines.push(`${indent}  ${method.visibility}${abstractMod}${staticMod}${method.name}(${method.params})${returnPart}`)
  }
  lines.push(`${indent}}`)
  return lines
}

function annotationFromDeclaration(line: string): ClassAnnotation {
  if (/^interface\s+/i.test(line)) return 'interface'
  if (/^abstract\s+class\s+/i.test(line)) return 'abstract'
  if (/^enum\s+/i.test(line)) return 'enumeration'

  const stereotype = line.match(/<<\s*(\w+)\s*>>/)
  if (!stereotype) return ''

  const value = stereotype[1].toLowerCase()
  if (value === 'interface') return 'interface'
  if (value === 'abstract') return 'abstract'
  if (value === 'enumeration' || value === 'enum') return 'enumeration'
  if (value === 'service') return 'service'
  return ''
}

function parseClassDeclaration(line: string): { name: string; annotation: ClassAnnotation; hasBrace: boolean } | null {
  const m = line.match(/^(?:abstract\s+class|class|interface|enum)\s+(\w+)(?:\s+<<\w+>>)?(?:\s*\{)?$/i)
  if (!m) return null
  return {
    name: m[1],
    annotation: annotationFromDeclaration(line),
    hasBrace: line.includes('{'),
  }
}

export function generatePlantuml(classItems: ClassItem[], relationships: DiagramRelationship[]): string {
  const classes = classItems.filter((i): i is DiagramClass => !isSep(i))
  if (classes.length === 0) return ''
  const depthMap = computeDepths(classItems)

  const lines: string[] = ['@startuml']
  lines.push('skinparam defaultFontName MS Gothic')
  lines.push('skinparam defaultFontSize 12')
  lines.push('')

  // depth コメント（全クラス分）
  for (const cls of classes) {
    lines.push(`' depth:${cls.name}=${depthMap.get(cls.id) ?? 0}`)
  }
  lines.push('')

  // depth ごとにグループ（classItems の順番を保持）
  const depthGroups = new Map<number, DiagramClass[]>()
  for (const item of classItems) {
    if (isSep(item)) continue
    const d = depthMap.get(item.id) ?? 0
    if (!depthGroups.has(d)) depthGroups.set(d, [])
    depthGroups.get(d)!.push(item)
  }
  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b)

  // パッケージなしクラス: depth ごとに together {} でまとめる
  for (const d of sortedDepths) {
    const dClasses = (depthGroups.get(d) ?? []).filter((c) => !c.package)
    if (dClasses.length === 0) continue
    if (dClasses.length > 1) {
      lines.push('together {')
      for (const cls of dClasses) {
        lines.push(...renderPlantumlClassLines(cls, '  '))
      }
      lines.push('}')
    } else {
      lines.push(...renderPlantumlClassLines(dClasses[0], ''))
    }
  }

  // パッケージあり: namespace ブロック
  const pkgMap = new Map<string, DiagramClass[]>()
  for (const cls of classes) {
    if (!cls.package) continue
    if (!pkgMap.has(cls.package)) pkgMap.set(cls.package, [])
    pkgMap.get(cls.package)!.push(cls)
  }
  for (const [pkg, pkgClasses] of pkgMap) {
    lines.push(`namespace ${pkg} {`)
    for (const cls of pkgClasses) {
      lines.push(...renderPlantumlClassLines(cls, '  '))
    }
    lines.push('}')
  }

  lines.push('')

  // depth 順の hidden 矢印（レイアウト制御）
  const noPackageByDepth = sortedDepths
    .map((d) => (depthGroups.get(d) ?? []).filter((c) => !c.package))
    .filter((arr) => arr.length > 0)
  for (let i = 0; i < noPackageByDepth.length - 1; i++) {
    const fromCls = noPackageByDepth[i][0]
    const toCls = noPackageByDepth[i + 1][0]
    lines.push(`${fromCls.name} -[hidden]-> ${toCls.name}`)
  }

  // 実関連（深さの差で矢印の長さ・向きを決定、関係タイプを保持）
  for (const rel of relationships) {
    const fromClass = classes.find((c) => c.id === rel.fromId)
    const toClass = classes.find((c) => c.id === rel.toId)
    if (!fromClass || !toClass) continue

    const fDepth = depthMap.get(fromClass.id) ?? 0
    const tDepth = depthMap.get(toClass.id) ?? 0
    const absDiff = Math.abs(tDepth - fDepth)
    const fromIsLeft = fDepth >= tDepth
    const leftClass = fromIsLeft ? fromClass : toClass
    const rightClass = fromIsLeft ? toClass : fromClass
    const leftCard = fromIsLeft ? rel.fromLabel : rel.toLabel
    const rightCard = fromIsLeft ? rel.toLabel : rel.fromLabel

    const dashes = '-'.repeat(absDiff + 1)  // min '-'
    const dots = '.'.repeat(absDiff + 1)    // min '.'

    let arrow: string
    if (fromIsLeft) {
      switch (rel.type) {
        case 'dependency':  arrow = `${dots}>`; break
        case 'inheritance': arrow = `${dashes}|>`; break
        case 'realization': arrow = `${dots}|>`; break
        case 'aggregation': arrow = `o${dashes}`; break
        case 'composition': arrow = `*${dashes}`; break
        default:            arrow = `${dashes}>`; break
      }
    } else {
      switch (rel.type) {
        case 'dependency':  arrow = `<${dots}`; break
        case 'inheritance': arrow = `<|${dashes}`; break
        case 'realization': arrow = `<|${dots}`; break
        case 'aggregation': arrow = `${dashes}o`; break
        case 'composition': arrow = `${dashes}*`; break
        default:            arrow = `<${dashes}`; break
      }
    }

    const fromCardStr = leftCard ? ` "${leftCard}"` : ''
    const toCardStr = rightCard ? ` "${rightCard}"` : ''
    const labelPart = rel.label ? ` : ${rel.label}` : ''
    lines.push(`${leftClass.name}${fromCardStr} ${arrow}${toCardStr} ${rightClass.name}${labelPart}`)
  }

  lines.push('')
  lines.push('@enduml')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// PlantUML パーサー
// ---------------------------------------------------------------------------

function parsePlantumlClassBodyLine(line: string, cls: DiagramClass): void {
  const trimmed = line.trim()
  if (!trimmed || trimmed === '{' || trimmed === '}') return
  const annotMatch = trimmed.match(/^<<(\w+)>>$/)
  if (annotMatch) { cls.annotation = annotMatch[1] as ClassAnnotation; return }
  const visMap: Record<string, Visibility> = { '+': '+', '-': '-', '#': '#', '~': '~' }
  let visibility: Visibility = '+'
  let rest = trimmed
  if (trimmed[0] in visMap) { visibility = visMap[trimmed[0]] as Visibility; rest = trimmed.slice(1).trim() }
  let isStatic = false, isAbstract = false
  if (rest.startsWith('{static}')) { isStatic = true; rest = rest.slice(8).trim() }
  if (rest.startsWith('{abstract}')) { isAbstract = true; rest = rest.slice(10).trim() }
  if (rest.startsWith('{static}')) { isStatic = true; rest = rest.slice(8).trim() }
  if (rest.includes('(')) {
    const mm = rest.match(/^(\w+)\(([^)]*)\)(?:\s*:\s*(.+))?$/)
    if (mm) cls.methods.push({ id: genId(), visibility, name: mm[1], params: mm[2].trim(), returnType: mm[3]?.trim() ?? '', isAbstract, isStatic })
  } else {
    const parts = rest.split(/\s+/)
    if (parts.length >= 2) cls.attributes.push({ id: genId(), visibility, type: parts.slice(0, -1).join(' '), name: parts[parts.length - 1], isStatic })
    else if (parts.length === 1) cls.attributes.push({ id: genId(), visibility, name: parts[0], type: '', isStatic })
  }
}

function parsePlantumlRelLine(line: string): {
  from: string; to: string; type: RelType; fromCard: string; toCard: string; label: string
} | null {
  if (line.includes('[hidden]')) return null
  const m = line.match(/^(\w+)\s*(?:"([^"]*)"\s*)?([-.o*|<>]{2,})\s*(?:"([^"]*)"\s*)?(\w+)(?:\s*:\s*(.*))?$/)
  if (!m) return null
  const [, rawLeft, leftCard = '', arrowStr, rightCard = '', rawRight, lbl = ''] = m
  let type: RelType | null = null
  // 可変長矢印に対応（深さ差で長さが変わるため正規表現で判定）
  if      (/^-+\|>$/.test(arrowStr))   type = 'inheritance'
  else if (/^<\|-+$/.test(arrowStr))   type = 'inheritance'
  else if (/^\.+\|>$/.test(arrowStr)) type = 'realization'
  else if (/^<\|\.+$/.test(arrowStr)) type = 'realization'
  else if (/^\*-+$/.test(arrowStr))   type = 'composition'
  else if (/^-+\*$/.test(arrowStr))   type = 'composition'
  else if (/^o-+$/.test(arrowStr))    type = 'aggregation'
  else if (/^-+o$/.test(arrowStr))    type = 'aggregation'
  else if (/^-+>$/.test(arrowStr))    type = 'association'
  else if (/^<-+$/.test(arrowStr))    type = 'association'
  else if (/^\.+>$/.test(arrowStr))  type = 'dependency'
  else if (/^<\.+$/.test(arrowStr))  type = 'dependency'
  if (!type) return null
  return { from: rawLeft, to: rawRight, type, fromCard: leftCard, toCard: rightCard, label: lbl.trim() }
}

export function parsePlantumlDiagram(code: string): { classes: DiagramClass[]; relationships: DiagramRelationship[] } | null {
  const trimmed = code.trim()
  if (!trimmed.startsWith('@startuml')) return null
  const classes: DiagramClass[] = []
  const relationships: DiagramRelationship[] = []
  const depthMap = new Map<string, number>()

  function ensureClass(name: string, pkg = '', annotation: ClassAnnotation = ''): DiagramClass {
    const existing = classes.find((c) => c.name === name)
    if (existing) {
      if (pkg && !existing.package) existing.package = pkg
      if (annotation && !existing.annotation) existing.annotation = annotation
      return existing
    }
    const cls: DiagramClass = { id: genId(), name, package: pkg, annotation, attributes: [], methods: [], depth: 0 }
    classes.push(cls); return cls
  }

  function parseClassBlock(className: string, pkg: string, annotation: ClassAnnotation, lns: string[], start: number): number {
    const cls = ensureClass(className, pkg, annotation)
    let j = start
    while (j < lns.length && lns[j] !== '}') { parsePlantumlClassBodyLine(lns[j], cls); j++ }
    return j + 1
  }

  const lns = trimmed.split('\n').map((l) => l.trim())
  let i = 0
  while (i < lns.length) {
    const line = lns[i]
    if (line.startsWith('@') || line.startsWith('skinparam') || line === '') { i++; continue }
    const dm = line.match(/^'\s*depth:(\w+)=(\d+)$/)
    if (dm) { depthMap.set(dm[1], parseInt(dm[2], 10)); i++; continue }
    if (line === 'together {') {
      i++
      while (i < lns.length && lns[i] !== '}') {
        const cm = parseClassDeclaration(lns[i])
        if (cm) { i++; i = cm.hasBrace ? parseClassBlock(cm.name, '', cm.annotation, lns, i) : (ensureClass(cm.name, '', cm.annotation), i) }
        else i++
      }
      i++; continue
    }
    const nsMatch = line.match(/^namespace\s+(\S+)\s*\{?$/)
    if (nsMatch) {
      const pkgName = nsMatch[1]; i++
      while (i < lns.length && lns[i] !== '}') {
        const cm = parseClassDeclaration(lns[i])
        if (cm) { i++; i = cm.hasBrace ? parseClassBlock(cm.name, pkgName, cm.annotation, lns, i) : (ensureClass(cm.name, pkgName, cm.annotation), i) }
        else i++
      }
      i++; continue
    }
    const classMatch = parseClassDeclaration(line)
    if (classMatch) {
      i++
      i = classMatch.hasBrace
        ? parseClassBlock(classMatch.name, '', classMatch.annotation, lns, i)
        : (ensureClass(classMatch.name, '', classMatch.annotation), i)
      continue
    }
    const relMatch = parsePlantumlRelLine(line)
    if (relMatch) {
      const fromCls = ensureClass(relMatch.from), toCls = ensureClass(relMatch.to)
      relationships.push({ id: genId(), fromId: fromCls.id, toId: toCls.id, type: relMatch.type, fromLabel: relMatch.fromCard, toLabel: relMatch.toCard, label: relMatch.label })
    }
    i++
  }
  for (const [name, depth] of depthMap) { const cls = classes.find((c) => c.name === name); if (cls) cls.depth = depth }
  return { classes, relationships }
}

export function extractClassDiagramFromMarkdown(markdown: string): string | null {
  const blockPattern = /```plantuml\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(markdown)) !== null) {
    const code = match[1].trim()
    if (code.startsWith('@startuml')) return code
  }
  return null
}
