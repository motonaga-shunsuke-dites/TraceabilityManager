import type { ScreenItem, ScreenNode, DepthSepItem } from './types'

export function genId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function isSep(item: ScreenItem): item is DepthSepItem {
  return '__sep' in item && (item as DepthSepItem).__sep === true
}

export function computeDepths(items: ScreenItem[]): Map<string, number> {
  let depth = 0
  const m = new Map<string, number>()
  for (const item of items) {
    if (isSep(item)) {
      depth++
      continue
    }
    m.set(item.id, depth)
  }
  return m
}

export function screensToItems(screens: ScreenNode[]): ScreenItem[] {
  if (screens.length === 0) return []
  const sorted = [...screens].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
  const items: ScreenItem[] = []
  let lastDepth = -1
  for (const screen of sorted) {
    const d = screen.depth ?? 0
    if (d > lastDepth && items.length > 0) {
      items.push({ id: genId(), __sep: true })
    }
    items.push(screen)
    lastDepth = d
  }
  return items
}
