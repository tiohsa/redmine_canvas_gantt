# AGENTS.md

## プロジェクト概要 (Project Overview)

Redmine Canvas Gantt は、Ruby on Rails バックエンドと `spa/` ディレクトリ内の React SPA（シングルページアプリケーション）で構成された Redmine プラグインです。

- **使用言語**: バックエンドは Ruby、フロントエンドは TypeScript
- **フレームワーク/ライブラリ**: Redmine 6.x, React 19, Vite 7
- **アーキテクチャ**: Redmine プラグインバックエンド ＋ SPA フロントエンド

## 信頼できる情報源 (Source of Truth)

- `README.md` および `README_ja.md` には、製品の動作、サポートされているワークフロー、ユーザー向けの期待される仕様が記載されています。
- `DESIGN.md` は、UI、レイアウト、余白、タイポグラフィ、カラー、コンポーネント、シャドウ、インタラクションに関する決定の標準リファレンス（規範）です。
  - ビジュアルやインタラクションの変更を行う場合は、常に `DESIGN.md` を最優先し、一貫性を保ってください。
  - `DESIGN.md` とローカルの慣習や簡略化手法が競合する場合、`DESIGN.md` が優先されます。
- `tasks/lessons.md` には、過去に発生した再発しやすい実装上の落とし穴や課題が記録されています。プロジェクト固有のガードレールとして扱ってください。
- `tasks/todo.md` は作業用のメモであり、決定された仕様書ではありません。

## 開発環境のセットアップ (Development Setup)

### バックエンド / Redmine

- 本リポジトリを Redmine アプリケーションの `plugins/redmine_canvas_gantt` としてマウントします。
- プラグインのルートディレクトリからローカル環境を起動します:
  ```bash
  docker compose up -d --wait
  ```
- Redmine の URL: `http://localhost:3000`
- 必要に応じてデフォルトデータをロードします:
  ```bash
  docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
  docker compose exec -T redmine bundle exec rake db:fixtures:load
  ```

### フロントエンド / SPA

- `spa/` ディレクトリ内で作業を行います。
- 依存関係のインストール:
  ```bash
  cd spa && npm ci
  ```
- Node.js 20 以上が必要です。
- Vite 開発サーバーの起動:
  ```bash
  cd spa && npm run dev
  ```
- フロントエンドのアセットをライブで読み込むには、プラグイン設定の `use_vite_dev_server` を有効にしてください。

## ビルドおよびテストコマンド (Build and Test Commands)

### フロントエンド (SPA)

- ビルド: `cd spa && npm run build`
- ビルド監視 (Watch): `cd spa && npm run build:watch`
- 型チェック (Type check): `cd spa && tsc -b`
- 構文チェック (Lint): `cd spa && npm run lint`
- ビルドプレビュー (Preview): `cd spa && npm run preview`

### フロントエンドテスト (SPA Tests)

- 単体テスト (Unit tests): `cd spa && npm run test -- --run`
- ウォッチモード (Watch mode): `cd spa && npm run test`
- 単一ファイルのテスト実行例:
  ```bash
  cd spa && npx vitest run src/components/GanttContainer.resize.test.tsx
  ```
- スタンドアロン E2E テスト: `cd spa && npm run test:e2e`
- 有効なヘッド（ブラウザ表示あり）での E2E テスト: `cd spa && npm run test:e2e:headed`
- Redmine 連携 Playwright テスト: `cd spa && npx playwright test -c playwright.redmine.config.ts`
- Redmine 6.0 スモークテスト:
  ```bash
  cd spa && npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/redmine-smoke.pw.ts
  ```

### バックエンドテスト (Backend Tests)

- プラグインディレクトリ内には `Gemfile` が存在しないため、直接 `bundle exec rspec` を実行しないでください。
- バックエンドのテスト（スペック）は Redmine の実行環境から実行する必要があります。
  - **Docker 環境の場合**:
    ```bash
    docker compose exec -T redmine bundle exec rspec plugins/redmine_canvas_gantt/spec
    ```
  - **非 Docker 環境の場合**: Redmine のルートディレクトリから実行します。
    ```bash
    bundle exec rspec plugins/redmine_canvas_gantt/spec
    ```

### ベンチマーク (Benchmark)

- ローカルベンチマーク: `cd spa && npm run benchmark`
- CI ベンチマークゲート: `cd spa && npm run benchmark:ci`

## CI/CD

- **CI ワークフロー**: `.github/workflows/ci.yml`
  - フロントエンドのビルド、静的解析 (Lint)、単体テスト、ベンチマークチェック、Redmine 6.1 完全 E2E テスト、および Redmine 6.0 互換性スモークテストを実行します。
- **リリースワークフロー**: `.github/workflows/release.yml`
  - `v*` 形式のタグがプッシュされたときにのみ実行されます。
  - 生成された変更ログを含めて GitHub リリースを作成します。
  - VSIX などの成果物のビルド、パッケージング、アップロードは行いません。

## コードスタイル (Code Style)

- Ruby コードは、Redmine および Rails の規約に従い、慣習的 (idiomatic) に記述してください。
- インデントは半角スペース 2 つを使用し、メソッド名やファイル名には `snake_case`、クラスやモジュール名には `CamelCase` を使用します。
- フロントエンドコードは、小さくテスト可能に保ちます。巨大なインラインブロックを作成するよりも、単一の目的に特化したヘルパー関数を好んで使用してください。
- `spa/eslint.config.js` および TypeScript のプロジェクト設定で定義されている、既存の Lint ルールと厳格な TypeScript チェックに従ってください。
- 明確に要求されない限り、広範囲の自動リファクタリングは避け、目的の変更にスコープを絞った最小限の修正を行ってください。

## デザイン・ガバナンス (Design Governance)

- DOM UI、キャンバスレンダラー、ダイアログ、ポップオーバー、ヘルプ画面全体にわたり、`DESIGN.md` を一貫して適用してください。
- タイポグラフィ、余白、角丸 (radius)、シャドウ、およびカラーの使用は、独自のデザインパターンを導入するのではなく、定義されているデザイントークンに従ってください。
- フォントを変更する場合は、CSS、インラインスタイル、キャンバスの `ctx.font`、および `measureText` に基づくサイズ計測処理を同時に更新してください。
- キャンバスベースのガントチャート描画領域は、周囲の SPA UI と視覚的に調和させる必要があります。キャンバス内のテキストや配色を、独立した別のデザインシステムとして扱わないでください。

## 実装上の重要なルール (Implementation Rules)

- 新しいフロントエンドの国際化 (i18n) キーを追加する場合は、SPA が正しく受信できるように、`config/locales/*.yml` と `app/controllers/canvas_gantts_controller.rb` の両方に必ず追加してください。
- 日付のみを扱う UI フローでは、ローカル日付 (local-date)セマンティクスを維持してください。ローカル日付処理と `toISOString()` や `new Date('YYYY-MM-DD')` を混在させないでください。
- クエリ、フィルター、URL、および localStorage の状態変更は、共有状態の優先順位が崩れやすいため、回帰テスト (regression coverage) による保護が必須です。
- プロジェクトフィルターの表示制御やその他の権限に依存する UI は、タスクデータから非表示のオプションを推測して再構築するのではなく、バックエンドから提供される候補リストに従ってください。

## セキュリティと安全性 (Security and Safety)

- API キー、トークン、機密情報をコミットしないでください。
- 機密設定は環境変数または Redmine の設定機能内に保持してください。
- Redmine の権限設定である `view_canvas_gantt` および `edit_canvas_gantt` を尊重し、正しく適用してください。
- `/plugin_assets/redmine_canvas_gantt/build/*` 周辺のアセットパスの安全検証処理を維持し、壊さないようにしてください。

## リポジトリのレイアウト (Repository Layout)

```text
redmine_canvas_gantt/
├── init.rb
├── app/
│   ├── controllers/
│   └── views/
├── config/
│   ├── locales/
│   └── routes.rb
├── lib/redmine_canvas_gantt/
├── spec/
├── assets/build/
├── spa/
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

- `app/controllers/canvas_gantts_controller.rb`: メインページ、JSON エンドポイント、編集エンドポイント、関連エンドポイントの提供、およびアセット配信のフォールバック処理を担います。
- `lib/redmine_canvas_gantt/data_payload_builder.rb`: SPA 用のタスク、関連、バージョン、ステータス、およびプロジェクトのペイロードを作成します。
- `spa/`: React アプリ、ストア、レンダラー、API クライアント、Vitest テスト、および Playwright テストを含みます。
- `npm run build` はフロントエンドのアセットを `assets/build/` に書き出します。
- Redmine の起動時に、`init.rb` がビルドアセットを `public/plugin_assets/redmine_canvas_gantt/build` にリンクまたはコピーします。

## 作業ルールとエージェントのワークフロー (Working Rules & Agent Workflow)

- コードを編集する前に、必ず関連するソースファイルを調査・確認してください。
- 変更は要求されたタスクの範囲内に抑え、関連のない無駄なコードの書き換えは避けてください。
- 動作を変更した際は、作業を完了する前に必ず関連するテストまたは検証コマンドを実行してください。
- バグを修正したり、繰り返されるパターンを変更した場合は、該当するタスクの一環として `tasks/lessons.md` に教訓を記録してください。
- フロントエンドの変更を行う際は、可能な限り CI と同じ検証順序に従ってください: `npm run build` -> `npm run lint` -> `npm run test -- --run` を実行し、パフォーマンスや Redmine 統合に影響する場合はベンチマークや Playwright のテストも行います。
- 互換性に影響する変更を行う場合は、ローカルの Redmine 6.0 Docker 環境および CI でカバーされている Redmine 6.1 完全 E2E ＋ Redmine 6.0 互換スモークテストの仕様を考慮してください。


<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
