# 権限・設定・実行環境

確認日: 2026-11-13。基準: `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（コード上の 0.20.0）。公開マニュアル v0.19.0 との関係は [仕様書の入口](../README.md) を参照。

## 権限の責務

Canvas Gantt の画面・JSON API は、起点プロジェクトの `view_canvas_gantt` を必要とする。更新操作では、それに加えて操作対象の Issue のプロジェクトに対する Redmine 標準権限と Issue 自体の可否を検査する。

画面起点の権限だけで他プロジェクトの Issue を更新してはならない。フィルターに一致するかどうかと、更新を許可できるかどうかも同一ではない。表示範囲・操作範囲は [表示範囲仕様](query-scope.md) に従う。

| 対象・操作 | サーバー側の主な条件 |
| --- | --- |
| 画面・データ・編集 API | 起点の `view_canvas_gantt`。API に直接アクセスしても検査する |
| Issue の参照 | `Issue.visible`、対象のプロジェクト範囲 |
| Issue の編集 | 対象プロジェクトの `edit_issues` と `issue.editable?`。フィールドごとに safe attribute・ワークフローも反映 |
| Issue の削除 | 対象プロジェクトの `delete_issues` と `issue.deletable?` |
| 子 Issue の作成 | 親のプロジェクトの `add_issues` と `manage_subtasks`、親 Issue の可視性と範囲 |
| 関連の作成・更新・削除 | 両端 Issue の可視性・操作範囲・編集可否、関連の形式と整合性 |
| 時間記録 | `log_time` を用いた開始可否と、Redmine の標準時間記録フォームの検査 |
| ベースラインの保存・削除 | 起点の `view_canvas_gantt` と `manage_canvas_gantt_baseline` |
| 実績の集計 | Issue と TimeEntry の可視性・対象範囲。詳細は [ワークロード](workload.md) |

権限の共通判断は [MutationAuthorizationPolicy](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb) が担う。HTTP への変換や範囲検査は controller と各サービスが担う。UI の `permissions`／フィールド可否は操作の案内用であり、認可の代替にはしない。

[init.rb](../../init.rb) で定義する Canvas 固有権限は `view_canvas_gantt` と `manage_canvas_gantt_baseline`。旧 `edit_canvas_gantt` を現行の編集権限として扱わない。

## 認証と情報公開

- ブラウザーからの JSON 要求で Redmine のセッションユーザーが存在し、明示的な API 認証情報がない場合は、ページのセッション認証を維持する。
- `X-Redmine-API-Key`、`key` パラメーター、Authorization が指定された場合やセッションユーザーがいない場合は、Redmine 本来の API 認証判定に委ねる。`accept_api_auth` は API キー認証を受け付ける action を定義し、現行では `schedule_mutation` と `subtask_trackers` を含まない。ルートが存在することは API キー認証の許可を意味しない。一方、明示 API 認証情報のないブラウザーの JSON 要求には、前項のセッション認証が適用される。
- SPA の更新要求は画面から受け取った CSRF トークンをヘッダーに付ける。アセット配信だけは画面プロジェクトの解決・権限・CSRF 検査の対象から除外される。
- プロジェクト、Issue、時間記録、ベースライン、編集候補の可視性をサーバーで守る。フィルター候補やカレンダー割当からも不可視プロジェクトを漏らさない。
- カレンダー設定の診断詳細は管理者向けとし、一般利用者には一般化したエラー情報を返す。ファイルや不正入力の詳細を無条件に公開しない。

権限不足は原則 `403`、見えない／範囲外の対象は `404`、入力不正は `422`、revision 等の競合は `409` として扱う。個別 API の応答データと回復方法は各機能仕様で定義する。

## 固定 UI 設定と利用者の設定

現行 controller の `plugin_settings` は `CANVAS_GANTT_UI_SETTINGS` を返す。管理者が保存したプラグイン設定をそのまま UI 設定の正本として読む実装ではない。旧資料にある管理設定 UI の説明を現行機能として採用しない。

| キー | 固定値 |
| --- | --- |
| `inline_edit_subject` | `'1'` |
| `inline_edit_assigned_to` | `'1'` |
| `inline_edit_status` | `'1'` |
| `inline_edit_done_ratio` | `'1'` |
| `inline_edit_due_date` | `'1'` |
| `inline_edit_custom_fields` | `'1'` |
| `row_height` | `'36'` |

これらは権限・safe attribute の制約を解除しない。表示設定画面で利用者が選ぶ行高、列、フォント、パネル・ダイアログ等の設定と、その保存範囲は [表示設定](display-export.md) に定義する。カレンダーは [専用の設定ファイルと環境変数](calendars.md)、データ量は [共通契約](architecture.md) に従う。

## 実行環境と配信

- 対応対象の Redmine は 6.0、6.1、7.0。実際の検証組合せは [CI](../../.github/workflows/ci.yml) と各テストの前提条件で確認する。
- SPA は React 19、TypeScript 5.9、Vite 8、Zustand 5 を使用する。[spa/package.json](../../spa/package.json) の Node 要件は `^20.19.0 || >=22.12.0`。
- 公開マニュアルは独立した VitePress プロジェクト。[website/package.json](../../website/package.json) の Node 要件は `>=22`。SPA と依存関係を混在させない。
- `spa` の `npm run build` は TypeScript のビルドと Vite を実行し、`assets/build/` と `.vite/manifest.json` を生成する。生成物を直接編集しない。
- [ViteAssetHelper](../../lib/redmine_canvas_gantt/vite_asset_helper.rb) は manifest の `src/main.tsx` から JS と CSS のパスを解決する。
- Rails が development かつ `CANVAS_GANTT_USE_VITE_DEV_SERVER=1` の場合だけ `http://localhost:5173` を使用する。それ以外はビルド済みアセットを使う。
- `/plugin_assets/redmine_canvas_gantt/build/*asset_path` は静的配信が無効な場合も controller から配信できる。起動処理で `public/plugin_assets` を書き換えない。
- アセットパスは build ディレクトリ内の実ファイルへ制限する。相対パスの逸脱、絶対パス、build 外へ向くシンボリックリンクを拒否する。
- Redmine の相対 URL ルートを API と画面遷移に保持する。ホスト直下への固定 URL を新しく組み立てない。

## 保存データと削除の境界

プラグインの Setting 行にはベースラインも保存される。設定削除は見た目の設定だけの初期化ではない。[uninstall task](../../lib/tasks/redmine_canvas_gantt.rake) は `plugin_redmine_canvas_gantt` の Setting 行を削除し、キャッシュをクリアする。[SettingsCleanup](../../lib/redmine_canvas_gantt/settings_cleanup.rb) と [ベースライン仕様](baseline.md) を参照する。

本仕様の整理や検証のために、この削除タスクを実行しない。タイマー・表示設定等のブラウザー保存とは別のライフサイクルである。

## 根拠と回帰確認

| 論点 | 根拠となるテスト |
| --- | --- |
| 対象プロジェクトごとの標準権限 | [mutation_authorization_policy_spec](../../spec/lib/redmine_canvas_gantt/mutation_authorization_policy_spec.rb) |
| 直接 API、認証、CSRF・可視性、アセットパス | [controller spec](../../spec/controllers/canvas_gantts_controller_spec.rb) |
| カレンダー割当のプロジェクト可視性 | [controller patch spec](../../spec/lib/redmine_canvas_gantt/canvas_gantts_controller_patch_spec.rb) |
| manifest と開発サーバーの切替 | [vite_asset_helper_spec](../../spec/lib/redmine_canvas_gantt/vite_asset_helper_spec.rb) |
| 設定とベースラインの削除対象 | [settings_cleanup_spec](../../spec/lib/redmine_canvas_gantt/settings_cleanup_spec.rb) |
| Redmine 上のベースライン権限 | [baseline-permissions](../../spa/tests/e2e-redmine/baseline-permissions.pw.ts) |

各 Redmine バージョンの実環境試験を、この仕様書作成時にすべて実行したという意味ではない。セキュリティや権限を変更するときは、許可ケースに加え、API 直アクセス、他プロジェクト、不可視 Issue・TimeEntry、権限失効を確認する。
