---
applyTo: "viewer-app/src/**"
---

# ファイル分割・責務分担ルール

## 基本方針

**1ファイル = 1責務**。コンポーネント、ユーティリティ、型定義は混在させない。

---

## ファイルサイズの上限

| 種類 | 目安の上限 |
|------|-----------|
| コンポーネントファイル（`.tsx`） | **200行** |
| ユーティリティ・ロジックファイル（`.ts`） | **150行** |

上限を超えた場合は責務ごとに分割する。

---

## 分割の判断基準

以下のいずれかに該当したら分割を検討する。

1. **サブコンポーネントが2つ以上存在する** → 別ファイルへ切り出す
2. **ユーティリティ関数が3つ以上存在する** → `xxxUtils.ts` へ切り出す
3. **カスタム hook が大きい** → `useXxx.ts` へ切り出す
4. **型定義が5つ以上ある** → `types.ts` へ切り出す

---

## ファイル命名規則

| 用途 | 命名パターン | 例 |
|------|------------|-----|
| Reactコンポーネント | `PascalCase.tsx` | `DocPreview.tsx` |
| カスタム hook | `useXxx.ts` | `useAutoSave.ts` ※ |
| ユーティリティ関数 | `xxxUtils.ts` | `contentUtils.ts` |
| 型定義のみ | `types.ts` | `types.ts` |
| 定数のみ | `constants.ts` | `constants.ts` |

※ 同じファイルに複数の小さいhookが入る場合は `SourcePane.tsx` のようにコンポーネント内にまとめてもよい

---

## ディレクトリ構成ルール

```
src/
  components/
    [機能名]/           ← 関連ファイルをひとまとめにするフォルダ
      index.ts          ← 公開APIのre-export（省略可）
      ComponentName.tsx ← メインコンポーネント（このファイルだけexport）
      SubComponent.tsx  ← サブコンポーネント
      contentUtils.ts   ← ロジック・ユーティリティ
      types.ts          ← 型定義
      constants.ts      ← 定数
```

**フォルダ対応表（このプロジェクト）:**

| フォルダ | 格納するもの |
|---------|------------|
| `ClassEditor/` | クラス図エディター関連 |
| `Viewer/` | ドキュメントプレビュー関連 |
| `Layout/` | 画面レイアウト・ツールバー・モーダル |
| `Tree/` | ファイルツリー関連 |
| `Settings/` | 紐づけ設定関連 |
| `Editor/` | テキストエディター関連 |
| `FilePicker/` | ファイル選択関連 |

---

## エクスポートルール

- **メインコンポーネントは named export**（`default export` は使わない）
- **ファイル内のサブコンポーネントは export しない**（同フォルダ内の別ファイルなら export OK）
- **ユーティリティ関数・型は使われる側に合わせて export**

```typescript
// ✅ Good
export function ContentViewer(): JSX.Element { ... }
export function useAutoSave(...): void { ... }
export interface SectionSplit { ... }

// ❌ Bad
export default function ContentViewer() { ... }
```

---

## 分割後のimport例

```typescript
// ContentViewer.tsx（メインコンポーネント）
import { DocPreview } from './DocPreview'           // サブコンポーネント
import { LinkTabs } from './LinkTabs'               // サブコンポーネント
import { SourcePane, useAutoSave } from './SourcePane' // コンポーネント+hook
import { isAdocPath, highlight } from './contentUtils' // ユーティリティ
```

---

## 分割してはいけないケース

- 20行以下の小さいコンポーネント（分割コストが高い）
- そのファイル内でしか使われない1〜2行のヘルパー関数
- 型が少ない（2〜3個程度）場合の型定義

---

## チェックリスト（新規ファイル作成時）

- [ ] 1ファイル200行以内か
- [ ] ファイル名はPascalCase（TSX）またはcamelCase（TS）か
- [ ] 適切なフォルダ配下か
- [ ] `default export` を使っていないか
- [ ] サブコンポーネントが大きくなりそうなら別ファイルに分けたか
