/** 仕様書の特定セクションと設計書の特定セクションを紐づける1エントリ */
export interface DocLink {
  id: string
  /** 紐づけの名称（タブに表示） */
  label: string
  /** 仕様書の相対パス（spec ルートからの相対） */
  spec?: string
  /** 仕様書内で対応する見出し（例: "## 機能要件"）。省略時は先頭から表示 */
  specHeading?: string
  /** 設計書の相対パス（design ルートからの相対） */
  design?: string
  /** 設計書内で対応する見出し（例: "## シーケンス"）。省略時は先頭から表示 */
  designHeading?: string
}

/** ツリーのノード（TOML の [[nodes]] エントリに対応） */
export interface LinkNode {
  id: string
  label: string
  parent: string
  /** 仕様書-設計書の紐づけエントリ一覧 */
  links?: DocLink[]
  /** ソースコードの相対パス一覧（source ルートからの相対） */
  sources?: string[]
  // --- 旧フォーマット互換フィールド（ロード時に links へ自動変換） ---
  spec?: string
  design?: string
}

/** ルートフォルダ設定 */
export interface Roots {
  spec: string
  design: string
  source: string
}

/** viewer.toml のスキーマ */
export interface ViewerProject {
  roots: Roots
  nodes: LinkNode[]
}

/** IPC レスポンスの共通型 */
export interface IpcResult<T = undefined> {
  ok: boolean
  data?: T
  error?: string
}

/** react-arborist が要求するツリーノードの型 */
export interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  linkNode: LinkNode
}

/** 表示中のコンテンツ */
export interface ContentState {
  /** 現在表示中の DocLink ID */
  activeLinkId: string | null
  specPath: string | null
  specContent: string | null
  /** 仕様書内でスクロールする見出し（"## xxx" 形式） */
  specHeading: string | null
  designPath: string | null
  designContent: string | null
  /** 設計書内でスクロールする見出し */
  designHeading: string | null
  sourcePaths: string[]
  sourceContents: { path: string; content: string }[]
}
