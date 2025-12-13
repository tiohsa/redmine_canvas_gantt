# AGENTS.md - AIエージェント向けリポジトリガイドライン

日本語で回答してください。

---

## 1. 目的（Intent / Purpose）

このリポジトリは **Redmine Canvas Gantt プラグイン** の開発を目的とする。
AIエージェントは以下の優先順位に従って行動すること：

1. **安全性**: 本番データ・認証情報の保護、既存機能の破壊防止
2. **品質**: テスト駆動開発、Clean Code原則の遵守
3. **速度**: 効率的な実装、不要な複雑さの回避

---

## 2. リポジトリの事実（Repository Facts）

| 項目 | 内容 |
|------|------|
| 言語 | Ruby (Rails/Redmine プラグイン) + TypeScript/React (SPA) |
| フレームワーク | Redmine 5.x + Vite + React 19 |
| パッケージマネージャ | pnpm (フロントエンド), Bundler (Ruby) |
| DB | MariaDB 10 (Docker) |
| 状態管理 | Zustand |
| テスト | Vitest + Testing Library (フロントエンド), RSpec (Ruby) |

### 推測禁止事項
- Redmine のバージョンや設定を勝手に推測しない
- API エンドポイントの仕様を推測しない（実コードを確認すること）
- 権限設定を推測しない（`init.rb` の定義を参照）

---

## 3. セットアップ（Setup）

### 前提条件
- Docker & Docker Compose
- Node.js 18+ & pnpm
- Git

### 初期セットアップ

```bash
# 1. リポジトリ直下で Docker を起動
docker compose up -d

# 2. (初回のみ) Redmine に初期データをロード
docker compose exec -e REDMINE_LANG=ja redmine bundle exec rake redmine:load_default_data

# 3. フロントエンド依存関係をインストール
cd plugins/redmine_canvas_gantt/spa
pnpm install
```

---

## 4. 実行・テストコマンド（Run & Test）

> [!IMPORTANT]
> 以下のコマンドのみを使用すること。他のコマンドは禁止。

### 開発サーバー

```bash
# Docker スタック起動（リポジトリルート）
docker compose up -d

# フロントエンド開発サーバー（plugins/redmine_canvas_gantt/spa/）
pnpm run dev
```

### ビルド・テスト

```bash
# フロントエンドビルド
pnpm run build

# Lint
pnpm run lint

# 単体テスト
pnpm run test

# Ruby 側マイグレーション（DB変更時のみ）
docker compose exec redmine bundle exec rake redmine:plugins:migrate
```

---

## 5. コーディング規約（Code Conventions）

### Ruby (Redmine プラグイン)
- インデント: 2スペース
- メソッド名: `snake_case`
- コントローラは薄く保ち、ロジックはモデル/サービスに委譲
- 国際化: `l(:label_key)` を使用

### TypeScript/React (SPA)
- strict モード有効 (`tsconfig.app.json`)
- 関数コンポーネント + Hooks のみ使用
- 状態管理: Zustand stores を `src/stores/` に配置
- レンダラー: `src/renderers/` に分離
- エンジン: `src/engines/` に分離
- ESLint 設定に従う（Prettier は未使用）

### 禁止事項
- ハードコードされたURL（Vite base path 以外）
- `any` 型の安易な使用
- AIが勝手に新しいコーディングスタイルを導入すること

---

## 6. TDDポリシー（Test-Driven Development）

> [!IMPORTANT]
> 全ての機能変更は Red → Green → Refactor サイクルに従うこと。

### テスト粒度
1. **ユニットテスト**: 各関数・コンポーネント
2. **統合テスト**: API通信・状態管理フロー
3. **E2Eテスト**: 主要ユーザーフロー（手動検証も可）

### 例外
- 純粋なCSSの変更
- ドキュメントのみの変更

---

## 7. Clean Code 原則

以下の原則を遵守すること：

| 原則 | 説明 |
|------|------|
| 単一責任 | 1つのクラス/関数は1つの責務のみ |
| 意図明確な命名 | 変数・関数名から目的が分かること |
| 小さな関数 | 1関数は20行以内を目安に |
| 重複排除 | DRY原則を守る |
| テスト容易性 | 依存性注入、モック可能な設計 |

---

## 8. プロジェクト構造（Project Structure）

```
redmine-gantt/
├── docker-compose.yml          # 開発用 Docker 設定
├── plugins/
│   └── redmine_canvas_gantt/
│       ├── init.rb             # プラグイン登録・権限定義
│       ├── app/
│       │   ├── controllers/    # Rails コントローラ
│       │   └── views/          # ERB テンプレート
│       ├── config/
│       │   └── routes.rb       # ルーティング定義
│       ├── lib/                # Vite アセットヘルパー
│       ├── spec/               # Ruby テスト（RSpec）
│       ├── assets/
│       │   └── build/          # ビルド成果物
│       └── spa/                # React SPA
│           ├── src/
│           │   ├── api/        # API クライアント
│           │   ├── components/ # React コンポーネント
│           │   ├── engines/    # ビジネスロジック
│           │   ├── renderers/  # 描画ロジック
│           │   └── stores/     # Zustand ストア
│           └── package.json
└── themes/                     # Redmine テーマ
```

### 触ってよい場所
- `plugins/redmine_canvas_gantt/` 配下全般
- `themes/` 配下（テーマカスタマイズ時）

### 触ってはいけない場所
- `docker-compose.yml` の本番設定値
- `.git/` ディレクトリ
- `node_modules/`, `pnpm-lock.yaml`（自動生成）

---

## 9. 依存関係・ツール（Dependencies & Tooling）

### フロントエンド
- **パッケージマネージャ**: pnpm（npm/yarn は禁止）
- **ビルドツール**: Vite
- **主要ライブラリ**: React 19, Zustand, classnames

### バックエンド
- **Redmine**: 公式 Docker イメージ
- **DB**: MariaDB 10

### 禁止ライブラリ
- jQuery（React との混在を避ける）
- moment.js（代わりに native Date または dayjs）
- lodash 全体インポート（必要な関数のみ個別インポート可）

---

## 10. 安全境界（Safety & Boundaries）

> [!CAUTION]
> 以下の規則は絶対に遵守すること。

### 削除禁止ファイル
- `init.rb`
- `docker-compose.yml`
- `package.json`, `pnpm-lock.yaml`
- `.gitignore`

### 禁止事項
- 本番データベースへの直接操作
- 認証情報・APIキーのハードコード
- `REDMINE_SECRET_KEY_BASE` の変更
- `rm -rf` コマンドの実行
- 外部サービスへの認証情報送信

### 機密情報の扱い
- 環境変数経由でのみ設定
- ログへの出力禁止
- コミットへの含有禁止

---

## 11. レビュー・検証（Review & Verification）

### 提出前チェックリスト
- [ ] `pnpm run lint` がエラーなしで通過
- [ ] `pnpm run test` が全て成功
- [ ] `pnpm run build` が成功
- [ ] 既存機能が壊れていないことを確認
- [ ] 新規追加コードにはテストを追加

### 人間レビュー
- 全ての変更は人間レビューを前提とする
- 特に権限・認証・API変更は必ずレビューを受けること

---

## 12. CI/CD 連携

> [!WARNING]
> CI で失敗する変更を作成してはならない。

### AIが想定すべきパイプライン
1. `pnpm install`
2. `pnpm run lint`
3. `pnpm run test`
4. `pnpm run build`

### 変更前に確認
- TypeScript 型エラーがないこと
- ESLint エラーがないこと
- テストが全て通過すること

---

## 13. よくあるタスク（Common Tasks）

### 機能追加
1. 要件を確認し、影響範囲を特定
2. テストを先に書く（Red）
3. 最小限の実装（Green）
4. リファクタリング
5. lint/test を実行して確認

### リファクタリング
1. 既存テストが通ることを確認
2. 小さなステップで変更
3. 各ステップでテスト実行
4. 機能が変わっていないことを確認

### バグ修正
1. バグを再現するテストを作成
2. 修正を実装
3. テストが通ることを確認
4. 回帰テストを追加

### テスト追加
1. 既存コードの動作を理解
2. ハッピーパスのテストを追加
3. エッジケース・エラーパスを追加
4. カバレッジを確認

---

## 14. 既知の問題・落とし穴（Pitfalls）

### 過去に発生した問題
- Docker ボリュームでシンボリックリンクが失敗する → `FileUtils.cp_r` にフォールバック
- アセットマニフェストの JSON パースエラー → ビルド成果物の整合性を確認
- iframe 内の SPA と親ページ間の CORS 問題 → 同一オリジンまたは postMessage を使用

### AIが特に注意すべき点
- Vite の base path 設定：`/plugin_assets/redmine_canvas_gantt/build/`
- Redmine の権限システム：`init.rb` で定義された権限を使用
- 楽観的ロック：チケット更新時の競合処理
- 日本語対応：i18n キーを使用し、ハードコードした日本語を避ける

---

## 15. 参照・連絡先（References & Contacts）

### 関連ドキュメント
- [Redmine Plugin Tutorial](https://www.redmine.org/projects/redmine/wiki/Plugin_Tutorial)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

### エスカレーション
判断不能な場合は、必ず以下を行うこと：
1. 不明点を明確にリストアップ
2. 可能な選択肢を提示
3. 人間の判断を仰ぐ

---

## コミット & PR ガイドライン

### コミットメッセージ
```
<type>: <subject> (日本語可)

例:
feat: ガントチャートのドラッグ＆ドロップ機能を追加
fix: 依存関係削除時のエラーハンドリングを修正
refactor: レンダラーのコード整理
chore: 依存関係のアップデート
```

### PR に含めるべき情報
- 問題の説明
- 変更内容の概要
- テスト結果（`pnpm run test`, `pnpm run lint`）
- スクリーンショット（UI 変更時）
- 関連する Redmine Issue へのリンク
- マージ後に必要な手順（`pnpm run build` など）
