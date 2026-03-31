import type { RelType, Visibility, ClassAnnotation } from './types'

export const REL_LABELS: Record<RelType, string> = {
  inheritance: '継承 (--|>)',
  realization: '実現/implements (..|>)',
  composition: 'コンポジション (*--)',
  aggregation: '集約 (o--)',
  association: '関連 (-->)',
  dependency:  '依存 (..>)',
}

export const VIS_LABELS: Record<Visibility, string> = {
  '+': '+ 公開',
  '-': '- 非公開',
  '#': '# 保護',
  '~': '~ パッケージ',
}

export const ANNOTATION_LABELS: Record<ClassAnnotation, string> = {
  '':            'なし（通常クラス）',
  'interface':   '<<interface>> インターフェース',
  'abstract':    '<<abstract>> 抽象クラス',
  'enumeration': '<<enumeration>> 列挙型',
  'service':     '<<service>> サービス',
}

export const REL_HELP: Record<RelType, string> = {
  inheritance: '継承: 子クラスが親クラスの属性・操作を引き継ぐ。is-a 関係。\n例: Dog --|> Animal',
  realization: '実現/実装: クラスがインターフェースの契約を満たす。\n例: PayPal ..|> PaymentMethod',
  composition: 'コンポジション ◆: 起点クラスが終点クラスを所有し、起点が消えると終点も消える（強い所有）。\n例: House *-- Room（家がなければ部屋も存在しない）',
  aggregation: '集約 ◇: 起点クラスが終点クラスを含むが、起点が消えても終点は存在できる（弱い所有）。\n例: Team o-- Player（チームが解散しても選手は残る）',
  association: '関連: 一方が他方を参照する一般的な関係。\n例: User --> Order',
  dependency:  '依存: 一時的な使用関係。メソッドの引数・戻り値など。\n例: Report ..> Database',
}
