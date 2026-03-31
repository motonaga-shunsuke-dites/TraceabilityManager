# PlantUML JAR ファイル

このディレクトリには `plantuml.jar` が含まれています。

## インストーラーでの配置

electron-builder でインストーラーを作成する場合、このファイルは以下の場所に自動的にコピーされます：

```
インストール先\resources\plantuml\plantuml.jar
```

## 開発環境での配置

開発時には、以下のいずれかの場所に `plantuml.jar` を配置してください：

1. **推奨**: `viewer-app/resources/plantuml/plantuml.jar` ← 現在の場所
2. `ビューワー/tools/plantuml/plantuml.jar`
3. `resources/plantuml/plantuml.jar`

アプリケーションは起動時に上記のパスを順番に確認します。

## エラー対応

「plantuml.jar が見つかりません」というエラーが表示された場合、上記のいずれかの場所に `plantuml.jar` を配置してください。

### エラーメッセージの読み方

エラー画面には候補パスが表示されます。いずれかの場所に `plantuml.jar` を配置してください。

```
plantuml.jar が見つかりません。以下のいずれかの場所に plantuml.jar を配置してください：
  • C:\Program Files\ドキュメントビューワー\..\tools\plantuml\plantuml.jar
  • C:\Program Files\ドキュメントビューワー\tools\plantuml\plantuml.jar
  • C:\Program Files\ドキュメントビューワー\resources\plantuml\plantuml.jar

推奨: resources/plantuml/plantuml.jar へ配置してください。
```

## 関連情報

- PlantUML 公式サイト: https://plantuml.com/
- アプリケーション側の jar 探索ロジック: `electron/main.ts` の `getJarPath()` 関数参照
