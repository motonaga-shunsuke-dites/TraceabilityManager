# ログアウト機能 設計書

## 処理フロー

1. ログアウトボタン押下
2. `SessionManager.Invalidate()` を呼び出してセッション破棄
3. ログイン画面へ遷移

## クラス

```
SessionManager
└── Invalidate() : void
```
