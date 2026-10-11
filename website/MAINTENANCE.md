# マニュアルの保守

`website/ja/` と `website/en/` を利用者マニュアルの正本とします。旧 `docs/manual_ja.md` と `QUERY_PARAMETERS*.md` はリンク互換のため保存した移行資料です。以後は同期しません。README の詳細説明は公開までの移行資料とし、公開後に概要・導入・サイトへのリンクに整理します。

## ローカル作業

Node.js 22 以上と npm を使用します。Redmine は不要です。

```sh
cd website
npm ci
npm run docs:dev
```

変更の検証:

```sh
npm run check
npm run docs:build
npx playwright install chromium
npm run test:smoke
```

実装・テストを根拠に日本語と英語の同じパスを同時に更新してください。翻訳の用語・操作ラベル・警告は双方で揃えます。自動検証は文章の正しさや翻訳品質を保証しません。初回の AI 作成文は実装との照合に加え、公開前に保守者による文章・用語のレビューを行ってください。

## コードとページの対応

以下のパスは各言語ディレクトリからの相対パスです。

| 機能 / 主な根拠 | ページ |
| --- | --- |
| README、init.rb、CI の Redmine matrix | guide/introduction.md、guide/installation.md |
| SPA のツールバー、タスク一覧、TaskStore と保存・競合テスト | guide/basic-operations.md、troubleshooting/index.md |
| 子チケット作成・階層変更 API と E2E | features/hierarchy.md |
| relation API、schedule mutation、calendar resolver | features/dependencies.md |
| query parser、フィルタ UI、QUERY_PARAMETERS の移行内容 | features/filters.md、features/query-parameters.md |
| baseline API、baseline permission spec | features/baseline.md |
| workload API、可視性 spec、workload E2E | features/workload.md |
| Work Timer UI、多タブ・タイマー E2E | features/work-timer.md |
| export、表示設定、progress line UI | features/display-export.md |
| init.rb、CanvasGanttsController の固定 UI 設定、権限 API | administration/settings.md、administration/permissions.md |
| business_calendar_loader/repository、project_calendar_resolver、spec | administration/calendars.md、administration/deployment.md |

既存画像・デモの権利は元のリポジトリのライセンスに従います。図解と実画面のキャプチャを区別してください。新しい英語 UI 素材は 2026-10-11 に専用の Redmine 7.0.0.stable / Canvas Gantt 0.18.0 環境と架空データで撮影しました。素材一覧は次のとおりです。

| Asset | Use | Dimensions / media details |
| --- | --- | --- |
| `images/canvas-gantt-overview-en.png` | Locale home, introduction and basic operations overview | 1862×552 PNG |
| `images/date-cell-edit-en.png` | Inline date-cell editing | 260×355 PNG |
| `images/pending-save-en.png` | Manual save with pending edits | 1862×455 PNG |
| `images/bulk-subtasks-en.png` | Bulk child-issue form | 1234×844 PNG |
| `images/relation-editor-en.png` | Dependency relation editor | 380×375 PNG |
| `images/status-filter-en.png` | Status filter | 251×387 PNG |
| `images/baseline-save-en.png` | Saving a baseline | 282×215 PNG |
| `images/baseline-compare-en.png` | Comparing a baseline | 730×403 PNG |
| `images/workload-en.png` | Workload pane | 1880×719 PNG |
| `images/work-timer-en.png` | Work timer start dialog and target choices | 500×326 PNG |
| `images/display-settings-en.png` | Display preferences and administration settings | 339×427 PNG |
| `images/export-menu-en.png` | Export choices | 222×149 PNG |
| `images/permissions-en.png` | Role permission settings | 573×71 PNG; Canvas Gantt View and Manage baseline permissions |
| `videos/schedule-edit.mp4` | Move and resize a task bar | H.264, 1280×380, 16.40 s, 131,354 bytes, no audio |
| `videos/dependency-create.mp4` | Create a dependency | H.264, 1280×472, 15.68 s, 147,563 bytes, no audio |

The video poster images are separate from the 13 manual screenshots: `images/schedule-edit-poster.png` is 1862×552 PNG and `images/dependency-create-poster.png` is 1900×700 PNG. The schedule video ends before its final baseline comparison and holds its final frame for four seconds. The dependency video shows the new relation after saving and ends with a two-second still.

Prepare a fresh, disposable Redmine with the plugin enabled and its default English data loaded. Seed fictional project content from the Redmine application root. The fixture refuses to run unless its disposable-database guard is set:

```sh
read -rsp 'Temporary demo password: ' MANUAL_CAPTURE_PASSWORD; printf '\n'
export MANUAL_CAPTURE_PASSWORD
export MANUAL_CAPTURE_DISPOSABLE=1
bundle exec rails runner plugins/redmine_canvas_gantt/website/scripts/manual-demo.rb
unset MANUAL_CAPTURE_PASSWORD MANUAL_CAPTURE_DISPOSABLE
```

Use a temporary password and keep it out of shell history, logs, and repository files. From the plugin's `website/` directory, run the Playwright captures and encode the resulting silent recordings:

```sh
cd plugins/redmine_canvas_gantt/website
export REDMINE_CAPTURE_URL=http://127.0.0.1:3101
export REDMINE_CAPTURE_PASSWORD_FILE=/secure/path/to/demo-password
node scripts/capture-core.mjs overview
node scripts/capture-core.mjs date
node scripts/capture-core.mjs schedule
node scripts/capture-core.mjs comparison
node scripts/capture-core.mjs dependency
node scripts/capture-panels.mjs
node scripts/encode-recordings.mjs
```

Set `REDMINE_CAPTURE_PASSWORD_FILE` to a secure file containing the same temporary demo password used to seed the account. `capture-core.mjs` uses a 1900×700 viewport, English locale, and Asia/Tokyo timezone; it writes raw recordings and metadata under `/tmp/canvas-gantt-manual-recordings` by default. `capture-panels.mjs` uses a 1900×900 viewport. Set `REDMINE_CAPTURE_RAW_DIR` to change the raw output directory. `encode-recordings.mjs` requires `ffmpeg` and `ffprobe`; it crops and encodes the two silent MP4s. The dependency recording shows a `Precedes` relation from fictional issue 2 to issue 6 with a delay of 7 working days. The dimensions above are read from the captured files. The fixture uses October 2026 dates; adjust the visible range when reproducing captures at a later date. Use fictional issue titles and exclude account headers, credentials, personal information, internal URLs, and error states. The videos have no audio, autoplay, or loop. Use the real English UI screenshot for screen-area explanations; the historical demo GIF is no longer embedded in the introduction and must remain labeled historical wherever referenced.

## バージョン

初回の対象は [v0.18.0](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0) です。2026-10-11 に GitHub 公開 API で最新安定版を確認しました（公開日時 2026-10-10T17:28:03Z）。注釈付きタグの参照先 `41cb1db30c3f4275088f8ff7056106e76fa2715e` と作業開始時の HEAD が一致しています。

リリース時は対象タグのコード・テストと本文を照合し、サイト共通バナーと両言語トップの対象版・確認日を更新します。単に `init.rb` の数字を転記して公開済みと扱わないでください。過去版の説明が必要になった場合だけ安定した別パスを追加し、既存 URL は維持します。

## GitHub Pages

今回の作業では公開しません。準備が整ったらリポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にします。必要に応じて `github-pages` environment の保護ルールと main のデプロイ許可を設定してください。

`.github/workflows/docs.yml` は PR で検証し、main への push のみで公開します。サイトの base は `/redmine_canvas_gantt/`、予定 URL は https://tiohsa.github.io/redmine_canvas_gantt/ です。プラグインの `ci.yml` と `release.yml` は独立したまま維持します。PR のビルドを production に公開しないでください。

公開後は README のリンクを実際の公開 URL に切り替え、重複する詳細を整理します。GitHub 側の設定と本番デプロイの成功は、ローカル検証とは別に確認してください。

## 依存パッケージの注意

安定版 VitePress 1.6.4 の間接依存 esbuild / Vite に対し、初回 `npm audit` で 3 件（high 1、moderate 2）の通知があり、互換な修正版は提示されませんでした。主な対象は開発サーバーです。開発サーバーはローカルでのみ使用し、外部公開しないでください。Pages には生成済み静的ファイルだけを配信します。VitePress の安定版更新時に依存と通知を再確認してください。
