import { parsePlantumlDiagram } from '../ClassEditor/plantuml'
import type { ScreenItem, ScreenNode, ScreenTransition } from './types'
import { computeDepths, isSep, genId, screensToItems } from './utils'

function safeName(raw: string): string {
  const t = raw.trim()
  if (!t) return 'Screen'
  return t.replace(/\s+/g, '_')
}

function encodeMeta(value: string): string {
  return encodeURIComponent(value)
}

function decodeMeta(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, '\\"')
}

function nodeAlias(idx: number): string {
  return `S${idx + 1}`
}

function renderScreenStateLine(screen: ScreenNode, alias: string): string {
  const parts: string[] = [screen.name.trim() || 'Screen']
  if (screen.description.trim()) {
    parts.push(screen.description.trim())
  }
  if (screen.imagePath.trim()) {
    const imagePath = screen.imagePath.trim()
    parts.push(`<img:${imagePath}{scale=0.25}>`)
  }
  return `state "${escapeLabel(parts.join('\\n'))}" as ${alias}`
}

export function generateScreenFlowPlantuml(screenItems: ScreenItem[], transitions: ScreenTransition[]): string {
  const screens = screenItems.filter((i): i is ScreenNode => !isSep(i))
  if (screens.length === 0) return ''

  const depthMap = computeDepths(screenItems)
  const aliasByScreenId = new Map<string, string>()
  for (let i = 0; i < screens.length; i++) {
    aliasByScreenId.set(screens[i].id, nodeAlias(i))
  }

  const lines: string[] = ['@startuml']
  lines.push('skinparam defaultFontName MS Gothic')
  lines.push('skinparam defaultFontSize 12')
  lines.push('left to right direction')
  lines.push('skinparam state {')
  lines.push('  BackgroundColor #F8FBFF')
  lines.push('  BorderColor #5B8FF9')
  lines.push('  ArrowColor #5B8FF9')
  lines.push('}')
  lines.push('')

  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i]
    const alias = aliasByScreenId.get(screen.id) ?? nodeAlias(i)
    const depth = depthMap.get(screen.id) ?? 0
    const name = encodeMeta(screen.name)
    const description = encodeMeta(screen.description)
    const imagePath = encodeMeta(screen.imagePath)
    const masterId = encodeMeta(screen.masterId ?? '')
    lines.push(`' screen:alias=${alias}|id=${encodeMeta(screen.id)}|name=${name}|desc=${description}|image=${imagePath}|depth=${depth}|master=${masterId}`)
  }
  lines.push('')

  const depthGroups = new Map<number, ScreenNode[]>()
  for (const item of screenItems) {
    if (isSep(item)) continue
    const d = depthMap.get(item.id) ?? 0
    if (!depthGroups.has(d)) depthGroups.set(d, [])
    depthGroups.get(d)!.push(item)
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b)

  for (const d of sortedDepths) {
    const group = depthGroups.get(d) ?? []
    if (group.length > 1) {
      lines.push('together {')
      for (const screen of group) {
        lines.push(`  ${renderScreenStateLine(screen, aliasByScreenId.get(screen.id) ?? 'S1')}`)
      }
      lines.push('}')
    } else if (group[0]) {
      lines.push(renderScreenStateLine(group[0], aliasByScreenId.get(group[0].id) ?? 'S1'))
    }
  }

  lines.push('')

  const byDepth = sortedDepths
    .map((d) => depthGroups.get(d) ?? [])
    .filter((arr) => arr.length > 0)

  for (let i = 0; i < byDepth.length - 1; i++) {
    const fromAlias = aliasByScreenId.get(byDepth[i][0].id)
    const toAlias = aliasByScreenId.get(byDepth[i + 1][0].id)
    if (!fromAlias || !toAlias) continue
    lines.push(`${fromAlias} -[hidden]-> ${toAlias}`)
  }

  for (const rel of transitions) {
    const from = screens.find((s) => s.id === rel.fromId)
    const to = screens.find((s) => s.id === rel.toId)
    if (!from || !to) continue

    const fDepth = depthMap.get(from.id) ?? 0
    const tDepth = depthMap.get(to.id) ?? 0
    const absDiff = Math.abs(tDepth - fDepth)

    // 深い側を右に置く（A>B かつ A->B の場合は B<--A の向きにする）
    const fromIsLeft = fDepth <= tDepth
    const left = fromIsLeft ? from : to
    const right = fromIsLeft ? to : from
    const leftAlias = aliasByScreenId.get(left.id)
    const rightAlias = aliasByScreenId.get(right.id)
    if (!leftAlias || !rightAlias) continue
    const dashes = '-'.repeat(absDiff + 1)
    const arrow = fromIsLeft ? `${dashes}>` : `<${dashes}`
    const label = rel.label.trim() ? ` : ${rel.label.trim()}` : ''
    lines.push(`${leftAlias} ${arrow} ${rightAlias}${label}`)
  }

  lines.push('')
  lines.push('@enduml')
  return lines.join('\n')
}

export function parseScreenFlowPlantuml(code: string): { screens: ScreenNode[]; transitions: ScreenTransition[] } | null {
  const lns = code.trim().split('\n').map((l) => l.trim())

  // 新形式: screen メタデータコメントを優先
  const metaScreens: ScreenNode[] = []
  const aliasToId = new Map<string, string>()
  for (const line of lns) {
    const m = line.match(/^'\s*screen:(.+)$/)
    if (!m) continue
    const fields = m[1].split('|')
    const rec = new Map<string, string>()
    for (const f of fields) {
      const p = f.indexOf('=')
      if (p <= 0) continue
      rec.set(f.slice(0, p).trim(), f.slice(p + 1))
    }
    const alias = rec.get('alias') ?? ''
    const id = decodeMeta(rec.get('id') ?? '') || genId()
    const name = decodeMeta(rec.get('name') ?? '')
    const description = decodeMeta(rec.get('desc') ?? '')
    const imagePath = decodeMeta(rec.get('image') ?? '')
    const depthRaw = Number(rec.get('depth') ?? '0')
    const masterRaw = decodeMeta(rec.get('master') ?? '')
    metaScreens.push({
      id,
      name,
      description,
      imagePath,
      depth: Number.isFinite(depthRaw) ? depthRaw : 0,
      masterId: masterRaw || undefined,
    })
    if (alias) aliasToId.set(alias, id)
  }

  if (metaScreens.length > 0) {
    const transitions: ScreenTransition[] = []
    for (const line of lns) {
      if (line.includes('[hidden]')) continue
      const tm = line.match(/^(S\d+)\s+(-*>|<-+)(-*)\s+(S\d+)(?:\s*:\s*(.*))?$/)
      if (tm) {
        // 通常の `--->` 形式
        const leftAlias = tm[1]
        const arrowHead = tm[2]  // `-->` か `<--`
        const rightAlias = tm[4]
        const label = (tm[5] ?? '').trim()
        const leftIsFrom = !arrowHead.startsWith('<')
        const fromAlias = leftIsFrom ? leftAlias : rightAlias
        const toAlias   = leftIsFrom ? rightAlias : leftAlias
        const fromId = aliasToId.get(fromAlias)
        const toId   = aliasToId.get(toAlias)
        if (fromId && toId) transitions.push({ id: genId(), fromId, toId, label })
        continue
      }
      // `-[hidden]->` はスキップ済みだが念のため
      const tm2 = line.match(/^(S\d+)\s+[-.o*|<>]{2,}\s+(S\d+)(?:\s*:\s*(.*))?$/)
      if (!tm2) continue
      // このケースは向き不明のため左→右として扱う
      const fromId = aliasToId.get(tm2[1])
      const toId   = aliasToId.get(tm2[2])
      if (fromId && toId) transitions.push({ id: genId(), fromId, toId, label: (tm2[3] ?? '').trim() })
    }
    return { screens: metaScreens, transitions }
  }

  // 旧形式: class ベースを後方互換で読む
  const parsed = parsePlantumlDiagram(code)
  if (!parsed) return null

  const imageMap = new Map<string, string>()
  const masterIdMap = new Map<string, string>()
  for (const line of lns) {
    const im = line.match(/^'\s*image:(\w+)=(.+)$/)
    if (im) {
      try { imageMap.set(im[1], decodeURIComponent(im[2])) } catch { imageMap.set(im[1], im[2]) }
      continue
    }
    const mi = line.match(/^'\s*masterId:(\w+)=(.+)$/)
    if (mi) {
      masterIdMap.set(mi[1], mi[2].trim())
    }
  }

  const screens: ScreenNode[] = parsed.classes.map((c) => {
    const firstAttr = c.attributes[0]
    const description = firstAttr ? `${firstAttr.type} ${firstAttr.name}`.trim() : ''
    const safe = safeName(c.name)
    return {
      id: genId(),
      name: c.name,
      description,
      imagePath: imageMap.get(safe) ?? '',
      depth: c.depth ?? 0,
      masterId: masterIdMap.get(safe),
    }
  })

  const nameToId = new Map<string, string>()
  for (const s of screens) {
    nameToId.set(s.name, s.id)
  }

  const transitions: ScreenTransition[] = []
  for (const r of parsed.relationships) {
    const fromName = parsed.classes.find((c) => c.id === r.fromId)?.name
    const toName = parsed.classes.find((c) => c.id === r.toId)?.name
    if (!fromName || !toName) continue
    const fromId = nameToId.get(fromName)
    const toId = nameToId.get(toName)
    if (!fromId || !toId) continue
    transitions.push({ id: genId(), fromId, toId, label: r.label ?? '' })
  }

  return { screens, transitions }
}

export function loadItemsFromPlantuml(code: string): { screenItems: ScreenItem[]; transitions: ScreenTransition[] } | null {
  const parsed = parseScreenFlowPlantuml(code)
  if (!parsed) return null
  return {
    screenItems: screensToItems(parsed.screens),
    transitions: parsed.transitions,
  }
}
