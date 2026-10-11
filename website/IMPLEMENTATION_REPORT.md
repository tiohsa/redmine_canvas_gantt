# 公式マニュアルサイト実装報告

GPT 6 Luna のサブエージェント 4 名でサイト基盤、利用者向け本文、管理者向け本文、検証・CI を実装し、親エージェントで実装照合と最終修正・ブラウザー検証を行いました。

## 変更範囲

- `website/.vitepress/`: VitePress 設定、日英ナビゲーション、ローカル検索、標準テーマの最小カスタマイズ、対象版表示。
- `website/package.json`、`package-lock.json`、`.gitignore`: SPA と独立した依存・コマンド・生成物管理。
- `website/index.md`、`website/{ja,en}/`: 日本語への入口と両言語のマニュアル。
- `website/public/images/`、`website/public/videos/`: 英語 UI の実画面 13 点、動画 2 本とポスター。
- `website/scripts/`、`website/tests/`、`website/playwright.config.ts`: 文書検査とブラウザースモークテスト。
- `.github/workflows/docs.yml`: PR 検証、main push 後の GitHub Pages 公開。
- `README.md`、`README_ja.md`、`docs/manual_ja.md`、`QUERY_PARAMETERS.md`、`QUERY_PARAMETERS_ja.md`: 新しい正本と移行方針への案内。
- `website/MAINTENANCE.md`、この文書: 保守手順、対応表、検証記録。

作業前からあった staged `AGENTS.md` は変更していません。プラグインの Ruby、SPA、既存 CI・リリースワークフロー、生成アセットは変更対象外です。コミット・push・PR 作成・公開は実施していません。

## サイト構成と移行

日本語と英語それぞれにトップ、ガイド 3 ページ、機能 8 ページ、管理者向け 4 ページ、トラブルシューティングを用意します。

ガイドは概要・対応環境、導入・更新・削除、基本操作。機能は親子関係、一括子チケット登録、依存関係、フィルター、クエリパラメータ、ベースライン、ワークロード、タイマー、表示・出力を扱います。管理者向けは設定、権限、YAML/CSV カレンダー、Docker/Kubernetes 配置を扱います。

README、既存操作マニュアル、クエリ仕様から内容を移行し、コード・テストとの照合で旧設定画面の説明などを修正しました。ファイルごとの対応は [保守手順](MAINTENANCE.md) に記録しています。

## 対象バージョンと画像

対象は [v0.18.0](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0)。2026-10-11 に GitHub API で最新安定版とタグ参照先を確認し、作業開始時 HEAD `41cb1db30c3f4275088f8ff7056106e76fa2715e` と一致しました。

画面領域の説明は日英のトップ・導入・基本操作ページで実画面に統一し、概念図 SVG は削除しました。旧 UI を示す `docs/demo.gif` は introduction から外し、古いキャプチャであることを明記します。`demo2.gif` はログイン中の admin が映るため掲載しません。2026-10-11 に Redmine 7.0.0.stable / Canvas Gantt 0.18.0 の英語 UI と架空データで、概要、日付セル編集、手動保存、一括子 Issue 作成、依存関係、フィルター、Baseline、ワークロード、タイマー、表示設定、エクスポート、権限の PNG 13 点を撮影しました。日程編集動画は無音の H.264、1280×380、16.40 秒、131,354 bytes。依存関係動画は無音の H.264、1280×472、15.68 秒、147,563 bytes です。両動画では操作を実行し、Redmine の保存応答を確認しました。再現用 fixture、capture/encode コマンド、各 PNG 寸法と動画メタデータは [保守手順](MAINTENANCE.md) に記録しています。今回の画像・動画追加後も文書検査、本番ビルド、ブラウザーテスト 16 件が成功しました。

## 検証記録

- `npm ci`: 成功。ロックファイルから再現可能なインストールを確認。
- `npm run check`: 成功。文書チェッカーの正常・異常フィクスチャ 2 件と 35 ページのリンク・アンカー・画像・動画・ポスター・日英対応・ナビゲーション・設定検証。
- `npm run docs:build`: 成功。VitePress 1.6.4 で静的成果物を生成。
- `npm run test:smoke`: Chromium で 16 件成功。日本語入口、日英の同一ページ切替、両言語の検索結果への遷移、ダークモード、390px 幅のナビゲーション・横溢れ、全 13 スクリーンショットの読み込み、日英両ページの PC・モバイル動画再生とポスター読み込み、日英 6 ページの画像重複なし・拡大リンク・390px/1280px 表示を確認。
- PC（1280px）とモバイル（390px）の画面画像を確認。対象版表示と実画面画像の配置を確認。
- 404 ページから日本語トップへのフォールバック: Chromium で成功。
- `git diff --check`: 成功。

ローカル環境では未使用ポートへの初回接続がタイムアウトするため、プレビューを先に起動してブラウザー検証しました。Chromium は `/tmp/canvas-gantt-docs-browsers` に導入し、`PLAYWRIGHT_BROWSERS_PATH` で指定しました。CI は通常の Playwright インストールと自動プレビュー起動を使用します。

Redmine のバックエンド・SPA 本体を変更していないため、Redmine 環境の RSpec、プラグイン E2E、SPA 全体の再ビルドは対象外です。実画面の表示確認とキャプチャ、日程変更・関係作成の保存結果の確認は行いましたが、包括的な実環境の機能再検証は行っていません。GitHub Actions と実際の Pages デプロイは未実行です。

## 起動・公開・今後の更新

[保守手順](MAINTENANCE.md) にローカル起動コマンド、Pages の Settings 操作、機能変更と同じ PR での両言語更新、リリース版ラベル更新を記載しました。

初回文書は AI 作成・コード照合済みのため、公開前には保守者による用語と文章のレビューも推奨します。機能変更時の素材更新と、公開後の README 詳細節の整理が残る運用作業です。サイトそのものは静的生成し、Redmine の認証・API に接続しません。

## 残る確認・依存リスク

- 日本語・英語の文章と専門用語に対する保守者の最終レビューが残っています。全 13 枚のスクリーンショットと 2 本の動画は撮影済みです。今回の変更に対するサイト検査・ビルド・ブラウザーテスト 16 件は成功しました。
- `npm audit` は間接依存の Vite / esbuild / VitePress に high 1 件、moderate 2 件を報告し、互換な修正版を提示していません。開発サーバーを外部公開せず、安定版更新時に再確認します。詳細は MAINTENANCE.md に記録しています。
- GitHub 側の Pages 設定と production 公開は未実施。公開後に README を短い導入文書へ整理する作業も残ります。

## 作成・変更ファイル一覧

- `.github/workflows/docs.yml`
- `QUERY_PARAMETERS.md`
- `QUERY_PARAMETERS_ja.md`
- `README.md`
- `README_ja.md`
- `docs/manual_ja.md`
- `website/.gitignore`
- `website/.vitepress/config.ts`
- `website/.vitepress/theme/custom.css`
- `website/.vitepress/theme/index.ts`
- `website/IMPLEMENTATION_REPORT.md`
- `website/MAINTENANCE.md`
- `website/en/administration/calendars.md`
- `website/en/administration/deployment.md`
- `website/en/administration/permissions.md`
- `website/en/administration/settings.md`
- `website/en/features/baseline.md`
- `website/en/features/dependencies.md`
- `website/en/features/display-export.md`
- `website/en/features/filters.md`
- `website/en/features/hierarchy.md`
- `website/en/features/query-parameters.md`
- `website/en/features/work-timer.md`
- `website/en/features/workload.md`
- `website/en/guide/basic-operations.md`
- `website/en/guide/installation.md`
- `website/en/guide/introduction.md`
- `website/en/index.md`
- `website/en/troubleshooting/index.md`
- `website/index.md`
- `website/ja/administration/calendars.md`
- `website/ja/administration/deployment.md`
- `website/ja/administration/permissions.md`
- `website/ja/administration/settings.md`
- `website/ja/features/baseline.md`
- `website/ja/features/dependencies.md`
- `website/ja/features/display-export.md`
- `website/ja/features/filters.md`
- `website/ja/features/hierarchy.md`
- `website/ja/features/query-parameters.md`
- `website/ja/features/work-timer.md`
- `website/ja/features/workload.md`
- `website/ja/guide/basic-operations.md`
- `website/ja/guide/installation.md`
- `website/ja/guide/introduction.md`
- `website/ja/index.md`
- `website/ja/troubleshooting/index.md`
- `website/package-lock.json`
- `website/package.json`
- `website/playwright.config.ts`
- `website/public/images/demo-historical.gif`
- `website/scripts/manual-demo.rb`
- `website/scripts/capture-core.mjs`
- `website/scripts/capture-panels.mjs`
- `website/scripts/encode-recordings.mjs`
- `website/scripts/check-docs.mjs`
- `website/tests/check-docs.test.mjs`
- `website/tests/manual.smoke.spec.ts`
