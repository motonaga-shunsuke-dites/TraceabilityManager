# ログイン機能 設計書

## クラス構成

```
LoginService
├── Authenticate(userId, password) : bool
├── LockAccount(userId) : void
└── IsAccountLocked(userId) : bool

LoginViewModel
├── UserId : string
├── Password : string
├── ErrorMessage : string
└── LoginCommand : ICommand
```

## シーケンス

1. ユーザーがログインボタンを押下
2. `LoginViewModel.LoginCommand` が実行される
3. `LoginService.Authenticate()` を呼び出し
4. DB でハッシュ比較
5. 成功 → ホーム画面へ遷移
6. 失敗 → `ErrorMessage` に「ユーザーIDまたはパスワードが違います」をセット

## データベース

```sql
CREATE TABLE users (
    user_id   VARCHAR(50)  PRIMARY KEY,
    pass_hash VARCHAR(256) NOT NULL,
    lock_flag TINYINT(1)   NOT NULL DEFAULT 0,
    fail_count INT         NOT NULL DEFAULT 0
);
```
