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
| 状態管理 | Zustand (`TaskStore`, `UIStore` 等) |
| レンダリング | HTML5 Canvas (`TaskRenderer`, `OverlayRenderer` 等) |
| ロジック集約 | `TaskLogicService.ts` (制約、日付伝播、バリデーション) |
| 設定永続化 | `localStorage` (行の高さ、表示モード、フィルタ、カラム幅等) |
| テスト | Vitest + Testing Library (フロントエンド), RSpec (Ruby) |

### 推測禁止事項
- Redmine のバージョンや設定を勝手に推測しない
- API エンドポイントの仕様を推測しない（実コード `src/api/client.ts` を確認すること）
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

> **注意**: スタンドアロンで開発サーバーを動作させる場合、`window.RedmineCanvasGantt` オブジェクト（Backend URLやトークン）を `main.tsx` 等でモックする必要がある。

### ビルド・テスト

```bash
# フロントエンドビルド
pnpm run build

# Lint
pnpm run lint

# 単体テスト
pnpm run test

# Ruby 側マイグレーション（原則禁止だが、既存マイグレーション実行用）
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
- レンダラー: `src/renderers/` に分離（Canvas操作はここに集約）
- エンジン: `src/engines/` に分離（インタラクション、レイアウト）
- ESLint 設定に従う（Prettier は未使用）

### 禁止事項
- ハードコードされたURL（Vite base path 以外）
- `any` 型の安易な使用
- AIが勝手に新しいコーディングスタイルを導入すること
- **既存のディレクトリ構造やアーキテクチャの変更**

---

## 6. TDDポリシー（Test-Driven Development）

> [!IMPORTANT]
> 全ての機能変更は Red → Green → Refactor サイクルに従うこと。

### テスト粒度
1. **ユニットテスト**: 各関数・コンポーネント (Vitest)
2. **統合テスト**: API通信・状態管理フロー
3. **検証**: フロントエンドの変更は Playwright スクリプト（使い捨て）を作成して視覚的に検証することを推奨。

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
├── AGENTS.md                   # このファイル
├── README.md                   # インストール・利用ガイド
├── plugins/
│   └── redmine_canvas_gantt/
│       ├── init.rb             # プラグイン登録
│       ├── spa/                # React SPA
│           ├── src/
│           │   ├── api/        # API クライアント
│           │   ├── components/ # React コンポーネント
│           │   │   ├── HtmlOverlay.tsx      # ツールチップ等（絶対配置）
│           │   │   ├── ...
│           │   ├── engines/    # ビジネスロジック
│           │   ├── renderers/  # Canvas 描画ロジック
│           │   │   ├── TaskRenderer.ts      # タスクバー、件名描画
│           │   │   ├── DependencyRenderer.ts # 依存関係線
│           │   │   ├── BackgroundRenderer.ts # グリッド
│           │   │   └── OverlayRenderer.ts   # 依存関係（Manhattan Paths）
│           │   ├── stores/     # Zustand ストア
│           │   ├── services/   # ビジネスサービス
│           │   │   └── TaskLogicService.ts  # 日付計算・制約ロジック
│           │   └── ...
```

---

## 9. 依存関係・ツール（Dependencies & Tooling）

### フロントエンド
- **パッケージマネージャ**: pnpm（npm/yarn は禁止）
- **ビルドツール**: Vite 7.x
- **主要ライブラリ**:
  - React 19.2.x
  - Zustand 5.x
  - classnames
- **テスト**: Vitest 4.x

### バックエンド
- **Redmine**: 公式 Docker イメージ
- **DB**: MariaDB 10

---

## 10. 安全境界（Safety & Boundaries）

> [!CAUTION]
> 以下の規則は絶対に遵守すること。

### データベース制約
- **DBスキーマの変更（テーブル・カラム追加等）は厳禁**
- データの永続化は既存のAPIエンドポイントまたは `localStorage`（ユーザー設定等）を使用すること。

### 削除禁止ファイル
- `init.rb`
- `docker-compose.yml`
- `package.json`, `pnpm-lock.yaml`

### 禁止事項
- `rm -rf` コマンドの実行
- 認証情報・APIキーのハードコード
- 既存のフォルダ構造の変更

---

## 11. 技術的詳細と注意点（Technical Details & Pitfalls）

### レンダリングとロジック
- **依存関係の描画**: ガントチャート上の依存線は `OverlayRenderer` で処理され、マンハッタンパス（直角に折れ曲がる線）として描画されなければならない。
- **タスクのグループ化**: 
  - フロントエンドでの処理時に仮想的なヘッダータスクを注入し、`rowIndex` と `depth` を再計算することでプロジェクトごとのグループ化を実現している。
  - プロジェクトフィルタで選択されたプロジェクトがタスクを持っていない場合でも、`allTasks` から名称を取得してヘッダーのみを表示させるフォールバックロジックを持つ。
  - プロジェクトを跨ぐ親子関係がある場合、親タスクとプロジェクトが異なる子タスクは、自身のプロジェクト枠内のルートタスクとして表示を切り離すことで、フィルタ選択時に確実に表示されるように制御している。
- **サイドバー（左ペイン）のUI描画**:
  - `UiSidebar.tsx` で実装。
  - 件名の横に表示されていたプロジェクト名・バージョン名のテキストは、視認性を高めるため削除されている（階層構造のコンテキストに依存）。
  - 各セルは `display: flex; height: 100%` で描画され、空のセルでもクリックして編集を開始しやすいようにしている。
- **統合UI**: プロジェクト(PJ)とバージョン(Ver)のフィルタメニュー内に、それぞれの表示モード（階層表示、バージョンバー等）のトグルが集約されている。これによりツールバーを簡素化している。
- **行の高さ設定**: ツールバーのセレクターから20px（極小）〜52px（大）の間で変更可能。全画面ボタンの左側に配置されている。
- **インライン編集の制御**: 
  - `shouldEnableField(field, task, meta?)` により、Redmineの権限、プラグイン設定、および業務ロジック（親タスクのロック等）に基づいた多層的なガードを実装している。
  - セレクトボックス形式の項目は `ensureEditMeta(taskId)` を通じて事前に選択肢を取得し、メタデータが利用可能な場合のみエディタを開く。
  - 未設定の項目にはハイフン (`-`) を表示し、セル全体を `display: flex; height: 100%` にすることで、空の状態でもダブルクリックしやすいようにUIを最適化している。
- **視覚的表現 (Badges)**:
  - ステータスと優先度は `src/utils/styles.ts` の定義に基づきバッジ形式で描画される。
  - 優先度は「至急」「高」などの重要項目のみ色付きで強調し、「通常」以下は無彩色のグレーで表示することで、注意を引くべきタスクを際立たせている。
- **件名の描画**: パフォーマンス向上のため、DOMではなく `TaskRenderer.ts` 内でCanvas APIを使ってバーの左側に直接描画される。
- **ツールチップ**: `HtmlOverlay.tsx` で実装されており、絶対配置を使用してマウス座標を動的に追跡する。

### 過去に発生した問題
- **Dockerボリューム**: シンボリックリンクが失敗する場合があるため、ビルド成果物の配置には `FileUtils.cp_r` へのフォールバックが必要（`init.rb` 参照）。
- **CORS**: iframe内外の通信でのオリジン問題に注意。
- **ドラッグ操作**: 日付変更失敗時は、楽観的更新をロールバックする必要がある。

---

## 12. 参照・連絡先（References & Contacts）

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
```
