# 全体構成・共通契約

確認日: 2026-11-13。基準: `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（コード上の 0.20.0）。公開マニュアル v0.19.0 との関係は [仕様書の入口](../README.md) を参照。

## 目的と責務

Redmine の可視チケットを Canvas のタイムラインと React の一覧・操作パネルで表示する Rails プラグインである。サーバーが権限・可視性・永続化・親日付の導出を担い、SPA が表示、ローカル編集、プレビュー、保存操作の進行を管理する。

| 層 | 責務 | 主要実装 |
| --- | --- | --- |
| Rails の画面・API | 起動設定、認証、HTTP、表示範囲と権限の検査 | [controller](../../app/controllers/canvas_gantts_controller.rb)、[routes](../../config/routes.rb) |
| Ruby の機能サービス | 抽出、編集評価、日程更新、カレンダー、ベースライン、実績集計 | [lib](../../lib/redmine_canvas_gantt/) |
| API クライアント | URL・ヘッダー、JSON の検査、日付と ID の変換、エラー分類 | [client](../../spa/src/api/client.ts)、[mutationDecoders](../../spa/src/api/mutationDecoders.ts) |
| 状態・サービス | サーバー状態、ドラフト、読込世代、保存・競合・回復 | [stores](../../spa/src/stores/)、[services](../../spa/src/services/) |
| 表示・入力・出力 | React の操作 UI、Canvas 描画、入力解釈、エクスポート | [components](../../spa/src/components/)、[engines](../../spa/src/engines/)、[export](../../spa/src/export/) |

## 起動と取得

1. プロジェクトの Canvas Gantt 画面を開くと、controller が表示権限を確認して画面を返す。
2. [Rails view](../../app/views/canvas_gantts/index.html.erb) が `window.RedmineCanvasGantt` を生成する。プロジェクト ID、プロジェクト・Issue・API のパス、Redmine のサブパス、CSRF トークン、翻訳、固定設定、非稼働曜日、ユーザー ID、言語・日付形式を含む。
3. Vite の manifest に従ってビルド済み JS／CSS を読み込み、[main](../../spa/src/main.tsx) が React アプリをマウントする。開発サーバー使用条件は [実行環境](permissions-settings.md) に定義する。
4. データ取得ではサーバーが表示範囲、Issue の可視性、フィルター・保存クエリを解決し、表示に必要な状態を返す。クライアントは応答を変換・検証して既存 store の経路から反映する。

初期 HTML の設定は表示対象の全 Issue データではない。データ・編集候補・ワークロード等はそれぞれの API と状態管理を通して取得する。

## API の境界

プロジェクト側の基本パスは `/projects/:project_id/canvas_gantt`。SPA の更新系は `/canvas_gantt` 側のルートも利用し、その場合は `canvas_project_id` で画面のプロジェクトを指定する。Redmine をサブパスに配置したときは、その接頭辞を保つ。

| 機能 | HTTP と相対パス | 契約の所有先 |
| --- | --- | --- |
| 画面、データ、クエリ一覧 | `GET` 画面、`/data`、`/queries` | [表示範囲・クエリ](query-scope.md) |
| 編集候補とプレビュー | `GET /tasks/:id/edit_meta`、`POST /tasks/:id/edit_meta/preview` | [チケット編集](issue-editing.md) |
| Issue 更新・削除 | `PATCH`／`DELETE /tasks/:id` | [チケット編集](issue-editing.md)、[保存](persistence.md) |
| 日程更新と関連 | `POST /schedule_mutation`、`POST /relations`、`PATCH`／`DELETE /relations/:id` | [日程変更](scheduling.md) |
| 子 Issue 作成候補と一括作成 | `GET /subtasks/trackers`、`POST /subtasks/bulk` | [子チケット](bulk-subtasks.md) |
| ベースライン | `POST`／`DELETE /baseline`（プロジェクト側のみ） | [ベースライン](baseline.md) |
| 実績ワークロード | `GET /actual_workload`（プロジェクト側のみ） | [ワークロード](workload.md) |

JSON の主要応答には `tasks`、`relations`、`versions`、`custom_fields`、`filter_options`、`statuses`、`project`、`permissions`、`initial_state`、`query_context`、`baseline`、`warnings`、`project_scope` がある。`baseline` 等の nil 値や空の `warnings` は省略され得る。カレンダー情報の wire キーは `businessCalendar` である。API クライアントが snake_case 等を SPA の型へ変換するため、wire のキーと store のプロパティ名を同一視しない。

更新要求は CSRF トークンを付け、カレンダー revision が取得済みならそのヘッダーも送る。サーバーはカレンダー依存の要求について、ヘッダーがある場合に revision を比較する。未指定の要求を一律に拒否する契約ではない。表示範囲と操作対象の検査はサーバーで行い、クライアントの表示・編集可否だけを信用しない。

## 日付の共通契約

[dateOnly](../../spa/src/utils/dateOnly.ts) を暦日計算と変換の所有先とする。

| 型・表現 | 意味 | 境界 |
| --- | --- | --- |
| `YYYY-MM-DD` | Redmine の日付だけの値 | API／カレンダー／保存 |
| `CalendarDate` | UTC 午前0時の数値で符号化した暦日 | タイムゾーン非依存の計算 |
| `TimelineDate` | Canvas の一定幅の日付軸 | `toTimelineDate`／`timelineToCalendarDate` |
| `Instant` | 経過時間上の時刻 | タイマー等。暦日と直接混ぜない |

- `parseDateOnly` は日付形式と実在する年月日を検証し、不正値・空値は `null` にする。
- `formatDateOnly` は UTC の年月日から日付文字列を生成する。UTC 符号化をローカル時刻として表示しない。
- 日付差と加減算は `diffCalendarDays`／`addCalendarDays` 等を使う。DST による一日の実時間の長さを暦日差へ持ち込まない。
- 日付ピッカー・ローカライズ表示の境界は `toLocalDisplayDate`／`fromLocalDate`、今日の境界は `todayCalendarDate` を使う。
- `new Date('YYYY-MM-DD')` や `toISOString()` を date-only の独自変換として追加しない。

営業日、後続タスクのカレンダー、日付配置モードは [カレンダー](calendars.md) と [日程変更](scheduling.md) に定義する。

## 保存・非同期処理の共通契約

- サーバー由来の確定状態とローカルパッチを分離し、表示はその投影とする。保存モデルの正本は [保存・競合回復](persistence.md)。
- 更新の成否、確定データの完全性、revision、無効化対象を解釈して状態を収束させる。HTTP が成功しただけでローカル編集を消去しない。
- 読込世代、画面コンテキスト、Issue／操作の revision を保護する。古い画面、失効した要求、後続の編集より古い応答で現在の状態を上書きしない。
- 通常データ、編集メタ情報、ベースライン、実績データにはそれぞれ取得境界がある。横断した直接 store 書換えや別の保存パイプラインを追加しない。
- 派生する親 Issue の日付は Redmine が決める。クライアントが子の投影から親の日付更新を合成して送らない。

[async contract checker](../../spa/scripts/check-async-contract.mjs) は既存の境界を静的に確認する。機能ごとの競合・回復テストと併用する。

## データ量と失敗

[DataPayloadBudget](../../lib/redmine_canvas_gantt/data_payload_budget.rb) がデータ取得の件数と JSON バイト数を制限する。

| 環境変数 | 既定値兼上限 |
| --- | --- |
| `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES` | 10,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS` | 50,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS` | 10,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES` | 25 × 1024 × 1024 bytes |

正の整数の設定値は上限までに制限する。不正値・非正数は既定値へ戻す。`load_records` を使う取得では上限+1件まで読み、超過を判定する。他のコレクションには構築後に件数を検査する経路もあり、すべての読込が上限+1件に制限されるわけではない。JSON サイズも検査する。超過時は `413` と `code: canvas_gantt_payload_limit`、`resource`、`limit` を返す。上限は動作速度の保証や全 API 共通のページング仕様ではない。

権限不足・対象消失・競合・入力不正・通信障害は区別する。各 API の詳細は機能仕様、更新失敗の分類と回復は [保存仕様](persistence.md) に従う。機密情報を通知やログへ転記しない。

## 根拠と回帰確認

- 日付: [dateOnly.test](../../spa/src/utils/dateOnly.test.ts)。今日・表示境界とタイマーの実時刻を区別し、Asia/Tokyo と America/Los_Angeles／DST を意識する。
- API の変換: [client.test](../../spa/src/api/client.test.ts)、[mutationDecoders.test](../../spa/src/api/mutationDecoders.test.ts)。
- 件数・サイズ: [data_payload_budget_spec](../../spec/lib/redmine_canvas_gantt/data_payload_budget_spec.rb)、[controller spec](../../spec/controllers/canvas_gantts_controller_spec.rb)。
- 起動・画面境界: [App.test](../../spa/src/App.test.tsx)、[アセット helper spec](../../spec/lib/redmine_canvas_gantt/vite_asset_helper_spec.rb)。
- 実行コマンドと前提条件は [AGENTS.md](../../AGENTS.md) と [CI](../../.github/workflows/ci.yml) を参照する。ここに示す根拠はコード・テストの読解であり、全対応 Redmine 上の統合検証を代替しない。
