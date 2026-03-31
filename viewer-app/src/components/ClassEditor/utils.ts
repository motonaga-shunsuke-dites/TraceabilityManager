import type { ClassItem, DiagramClass, DepthSepItem } from './types'

export function genId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function isSep(item: ClassItem): item is DepthSepItem {
  return '__sep' in item && (item as DepthSepItem).__sep === true
}

/** classItems の順番から各クラスの深さを計算（区切り線の数がそのまま深さに） */
export function computeDepths(items: ClassItem[]): Map<string, number> {
  let depth = 0
  const m = new Map<string, number>()
  for (const item of items) {
    if (isSep(item)) { depth++; continue }
    m.set(item.id, depth)
  }
  return m
}

/** depth 値を持つ DiagramClass[] から classItems を復元（ファイル読み込み時） */
export function classesToItems(classes: DiagramClass[]): ClassItem[] {
  if (classes.length === 0) return []
  const sorted = [...classes].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
  const items: ClassItem[] = []
  let lastDepth = -1
  for (const cls of sorted) {
    const d = cls.depth ?? 0
    if (d > lastDepth && items.length > 0) {
      items.push({ id: genId(), __sep: true })
    }
    items.push(cls)
    lastDepth = d
  }
  return items
}
