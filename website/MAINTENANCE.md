# マニュアルの保守

`website/ja/` と `website/en/` を利用者マニュアルの正本とします。旧 `docs/manual_ja.md` と `QUERY_PARAMETERS*.md` はリンク互換のため保存した移行資料です。以後は同期しません。README は製品紹介、主要機能、デモ、導入条件、最小インストールと Quick Start、マニュアル・開発情報への入口です。操作・設定・運用の詳細は Website Docs のみで保守します。README からマニュアルへのリンクは日英トップページに限定し、インストール・機能・設定・トラブルシューティングの個別ページへのナビゲーションは VitePress 側で管理します。デモ素材と開発ガイドへのリンクは維持できます。利用者に見える変更では関連する日英ページを同じ変更で更新し、README は概要・導入条件・Quick Start が変わる場合だけ更新します。

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

## README 統合の保守範囲

| 移行前の内容 | 保守先 / README の扱い |
| --- | --- |
| 製品紹介、機能概要、デモ、要件、最小導入 | README に残し、詳細への入口はマニュアルトップに集約 |
| 更新、削除、REST API、モジュールと権限 | guide/installation.md。README に設定・ベースライン削除の短い警告を残す |
| ローカル Docker 起動、初期データ、有効化、停止 | administration/deployment.md。README は簡潔な概要と互換見出しを残す |
| YAML / CSV、検知と読込エラー、配置 | administration/calendars.md、administration/deployment.md。README に混在禁止を残す |
| 操作、タイマー、ベースライン、ワークロード、表示・出力 | guide/basic-operations.md と features/ の各ページ |
| 保存競合、フィルタ、共有 URL、設定上限 | troubleshooting/index.md、features/filters.md、features/query-parameters.md、administration/settings.md |
| 開発コマンド | README の Development / 開発セクション |
| 旧マニュアルと README 見出し | 旧ファイル本文・パスを保存。README の旧見出しアンカーは文書チェッカーで検証 |

仕様判断は対象版のコード・テスト・確認済み UI、対象リリースの仕様、Website Docs、README の概要、旧マニュアルの順で行います。README に独立した詳細仕様を再導入しないでください。`npm run check` は Website に加えて両 README のローカルリンク、マニュアルの言語、公開 URL の base、トップページへのリンク限定、GitHub の旧アンカーと日英切り替えを検証します。通常 CI は外部 URL のネットワーク検証に依存しません。

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

Japanese UI captures were added on 2026-10-12 from a separate disposable Redmine 7.0.0.stable database with Japanese default data. The plugin used the current checkout; its `app/`, `lib/`, `assets/`, and `config/` were verified unchanged from the v0.18.0 tag. They use the same 13 screenshot stems with `-ja.png`, plus `videos/schedule-edit-ja.mp4`, `videos/dependency-create-ja.mp4`, and the corresponding `*-poster-ja.png` files. The videos are H.264, 1280×380 / 1280×472, 17.84 / 15.64 seconds, silent, and approximately 179 / 145 KB. Some fixed plugin labels and permission names remain English in the actual Japanese UI.

README の `docs/demo-current.gif` は、この 2 本の MP4 を日程編集 → 依存関係作成の順に連結したものです。元の再生速度と末尾の静止時間を保ち、1280×472、12 fps のループ GIF に変換します。日程編集の下部は白い余白で揃えます。MP4 の更新後は `website/` から `node scripts/encode-readme-demo.mjs` を実行し、両 README のプレビューも確認してください。旧 `docs/demo.gif` は過去の記録として残し、README には掲載しません。

Prepare a fresh, disposable Redmine with the plugin enabled and its default data loaded in the capture language. Capture scripts and fixtures default to English; set `MANUAL_CAPTURE_LOCALE=ja` when seeding Japanese Redmine defaults and fictional project content. Run the fixture from the Redmine application root. It refuses to run unless its disposable-database guard is set:

```sh
read -rsp 'Temporary demo password: ' MANUAL_CAPTURE_PASSWORD; printf '\n'
export MANUAL_CAPTURE_PASSWORD
export MANUAL_CAPTURE_DISPOSABLE=1
export MANUAL_CAPTURE_LOCALE=ja # omit or set to en for English captures
bundle exec rails runner plugins/redmine_canvas_gantt/website/scripts/manual-demo.rb
unset MANUAL_CAPTURE_PASSWORD MANUAL_CAPTURE_DISPOSABLE MANUAL_CAPTURE_LOCALE
```

Use a temporary password and keep it out of shell history, logs, and repository files. From the plugin's `website/` directory, run the Playwright captures and encode the resulting silent recordings:

```sh
cd plugins/redmine_canvas_gantt/website
export REDMINE_CAPTURE_URL=http://127.0.0.1:3101
export REDMINE_CAPTURE_PASSWORD_FILE=/secure/path/to/demo-password
export REDMINE_CAPTURE_LOCALE=ja # omit or set to en for English captures
node scripts/capture-core.mjs overview
node scripts/capture-core.mjs date
node scripts/capture-core.mjs schedule
node scripts/capture-core.mjs comparison
node scripts/capture-core.mjs dependency
node scripts/capture-panels.mjs
node scripts/encode-recordings.mjs
```

Set `REDMINE_CAPTURE_PASSWORD_FILE` to a secure file containing the same temporary demo password used to seed the account. `capture-core.mjs` uses a 1900×700 viewport and Asia/Tokyo timezone; its browser locale follows `REDMINE_CAPTURE_LOCALE` (`en` by default, `ja` for Japanese). It writes raw recordings and metadata under `/tmp/canvas-gantt-manual-recordings` by default. `capture-panels.mjs` uses a 1900×900 viewport. Set `REDMINE_CAPTURE_RAW_DIR` to change the raw output directory. `REDMINE_CAPTURE_CHROMIUM_PATH` may point to an installed Chromium-compatible browser when Playwright's downloaded browser is unavailable. `encode-recordings.mjs` requires `ffmpeg` and `ffprobe`; it crops and encodes the two silent MP4s, retaining the existing English filenames and adding `-ja` to Japanese filenames. The dependency recording shows a `Precedes` relation from fictional issue 2 to issue 6 with a delay of 7 working days. The dimensions above are read from the captured files. The fixture uses October 2026 dates; adjust the visible range when reproducing captures at a later date. Use fictional issue titles and exclude account headers, credentials, personal information, internal URLs, and error states. The videos have no audio, autoplay, or loop. The historical demo GIF is no longer embedded in the introduction and must remain labeled historical wherever referenced.

## バージョン

初回の対象は [v0.18.0](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0) です。2026-10-11 に GitHub 公開 API で最新安定版を確認しました（公開日時 2026-10-10T17:28:03Z）。注釈付きタグの参照先は `41cb1db30c3f4275088f8ff7056106e76fa2715e` です。README 統合の作業開始時（2026-10-12）の HEAD は `9800ebb` で、対象タグ以降にプラグイン本体の変更がないことをローカル差分で確認しました。これは初回公開時の記録です。

リリース時は対象タグのコード・テストと本文を照合し、サイト共通バナーと両言語トップの対象版・確認日を更新します。単に `init.rb` の数字を転記して公開済みと扱わないでください。過去版の説明が必要になった場合だけ安定した別パスを追加し、既存 URL は維持します。

## GitHub Pages

今回の作業では公開しません。準備が整ったらリポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にします。必要に応じて `github-pages` environment の保護ルールと main のデプロイ許可を設定してください。

`.github/workflows/docs.yml` は PR で検証し、main への push のみで公開します。サイトの base は `/redmine_canvas_gantt/`、予定 URL は https://tiohsa.github.io/redmine_canvas_gantt/ です。プラグインの `ci.yml` と `release.yml` は独立したまま維持します。PR のビルドを production に公開しないでください。

README の詳細は Website Docs に集約済みです。README は公開状態に依存せず参照できる日英トップページのソース Markdown (`website/ja/index.md`、`website/en/index.md`) へリンクします。公開 URL を追加する場合も、設定済み base 以下の各言語トップページに限定してください。GitHub 側の設定と本番デプロイの成功は、ローカル検証とは別に確認してください。

## 依存パッケージの注意

安定版 VitePress 1.6.4 の間接依存 esbuild / Vite に対し、初回 `npm audit` で 3 件（high 1、moderate 2）の通知があり、互換な修正版は提示されませんでした。主な対象は開発サーバーです。開発サーバーはローカルでのみ使用し、外部公開しないでください。Pages には生成済み静的ファイルだけを配信します。VitePress の安定版更新時に依存と通知を再確認してください。

## v0.19.0 への更新（2026-10-21）

対象を v0.19.0 に更新しました。ローカルのタグ参照先と HEAD はともに `31a674c1f30919c2657e9d3d5f72f86bfb2dffc8` です。依存関係の手動保存、保存結果の確認、親日付の扱い、全体 PNG 出力、ダイアログ設定、ベースライン削除をリリース済みの手順として整理しました。画像の撮影記録は下記を参照してください。旧素材の撮影バージョンは維持し、現行 UI と異なる場合があることを日英トップページに明記しています。公開サイトへのデプロイはこのローカル作業には含まれません。

### 表示設定・出力メニューの再撮影

2026-10-21 に Redmine 7.0.2 / Canvas Gantt v0.19.0 で日英の `display-settings-*.png` と `export-menu-*.png` を更新し、`issue-dialog-settings-*.png` を追加しました。独立した一時コンテナの SQLite に `manual-demo.rb` の架空データを投入し、共有 DB は使用していません。設定パネルはスクロール位置を変えて撮影しています。ダイアログの幅・高さ・画面全体表示と、全体 PNG のメニュー項目を実画面で確認し、両言語で全体 PNG のダウンロード成功・ブラウザーエラーなしを確認しました。動画は更新していません。

準備済みの撮影環境で、表示言語とアカウントの言語を揃えて実行します（URL・パスワードファイルの指定は上記と同じ）。

```sh
REDMINE_CAPTURE_LOCALE=en node scripts/capture-display.mjs
REDMINE_CAPTURE_LOCALE=ja node scripts/capture-display.mjs
```

ダウンロードした検証用 PNG は `/tmp/manual-full-export-en.png` と `/tmp/manual-full-export-ja.png` に保存されます。その他の画像・動画は従来の撮影記録のままです。
