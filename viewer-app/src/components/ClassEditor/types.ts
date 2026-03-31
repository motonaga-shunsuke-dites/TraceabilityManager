// ---------------------------------------------------------------------------
// ClassEditor 共通型定義
// ---------------------------------------------------------------------------

export type Visibility = '+' | '-' | '#' | '~'

export interface ClassAttribute {
  id: string
  visibility: Visibility
  name: string
  type: string
  isStatic: boolean
}

export interface ClassMethod {
  id: string
  visibility: Visibility
  name: string
  params: string
  returnType: string
  isAbstract: boolean
  isStatic: boolean
}

export type ClassAnnotation = '' | 'interface' | 'abstract' | 'enumeration' | 'service'

export interface DiagramClass {
  id: string
  name: string
  package: string
  annotation: ClassAnnotation
  attributes: ClassAttribute[]
  methods: ClassMethod[]
  depth: number
}

export type RelType =
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'

export interface DiagramRelationship {
  id: string
  fromId: string
  toId: string
  type: RelType
  fromLabel: string
  toLabel: string
  label: string
}

export type Selection =
  | { type: 'class'; id: string }
  | { type: 'rel'; id: string }
  | null

export interface DepthSepItem {
  id: string
  __sep: true
}

export type ClassItem = DiagramClass | DepthSepItem

export type ExportTarget = 'spec' | 'design' | 'clipboard'

export interface PZTransform {
  x: number
  y: number
  scale: number
}
