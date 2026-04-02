export interface ScreenNode {
  id: string
  name: string
  description: string
  imagePath: string
  depth: number
  masterId?: string
}

export interface DepthSepItem {
  id: string
  __sep: true
}

export type ScreenItem = ScreenNode | DepthSepItem

export interface ScreenTransition {
  id: string
  fromId: string
  toId: string
  label: string
}

export type Selection =
  | { type: 'screen'; id: string }
  | { type: 'transition'; id: string }
  | null

export interface ScreenMasterEntry {
  id: string
  name: string
  imagePath: string
  description: string
}
