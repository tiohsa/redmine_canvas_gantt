<div align="center">

# Redmine Canvas Gantt

Redmine 向けの高性能 Canvas ガントチャートプラグイン。

Listed on Redmine Plugins Directory:
https://www.redmine.org/plugins/redmine_canvas_gantt

[![License](https://img.shields.io/github/license/tiohsa/redmine_canvas_gantt)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tiohsa/redmine_canvas_gantt/ci.yml?branch=main&label=CI)](https://github.com/tiohsa/redmine_canvas_gantt/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tiohsa/redmine_canvas_gantt)](https://github.com/tiohsa/redmine_canvas_gantt/releases)
[![Redmine](https://img.shields.io/badge/Redmine-6.x-red)](#requirements)
[![Ruby](https://img.shields.io/badge/Ruby-3.x-cc342d)](#requirements)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#requirements)

[English README](README.md) · [Releases](https://github.com/tiohsa/redmine_canvas_gantt/releases) · [Issues](https://github.com/tiohsa/redmine_canvas_gantt/issues)

</div>

---

## 概要

Redmine Canvas Gantt は、タイムラインを HTML5 Canvas で描画しつつ左側のチケット一覧を編集可能に保つ、Redmine 向けのガントチャートプラグインです。標準の Redmine ガントが見づらい、または重くなりやすいプロジェクト向けに設計されています。

## 主な特徴

- Canvas ベースの高速描画による滑らかなスクロールとズーム
- タスクの移動、期間変更、端点ドラッグによる依存関係作成
- 依存関係の作成、更新、削除に対応
- 題名、担当者、ステータス、進捗率、期日、カスタムフィールドのインライン編集
- サイドバーでのドラッグアンドドロップによる親子関係の変更
- 複数行入力による子チケット一括作成
- 現在のフィルタ結果またはプロジェクト全体を保存できるベースライン比較
- 保存済みクエリ、Redmine でのクエリ編集、チケット一覧との往復
- プロジェクト、担当者、ステータス、バージョン、題名によるフィルタとグループ化
- ワークロードパネル、PNG / CSV 出力、全画面表示、ズーム・行高・フォントサイズの操作
- プロジェクトごとの保存、または全プロジェクト共通化ができる表示設定
- バージョンヘッダー、進捗ライン、階層線、開始日のみ・期日のみタスク、依存関係ベースの整理

## デモ

![Canvas Gantt Demo](./docs/demo.gif)

## 必要環境

- Redmine 6.x
- Ruby 3.x
- SPA ビルドおよびフロントエンド開発用に Node.js 20+
- Redmine で REST API が有効化されていること

### セキュリティと影響

- データベースマイグレーション: なし
- 追加パーミッション: `view_canvas_gantt`, `edit_canvas_gantt`
- アンインストール: プラグインディレクトリを削除して Redmine を再起動

## インストール

1. プラグインを Redmine の `plugins/` ディレクトリに配置します。

   ```bash
   cd /path/to/redmine/plugins
   git clone https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Redmine を再起動します。

   配置後にアプリケーションサーバーを再起動してください。

## 使い方

1. REST API を有効化します。
   **管理** -> **設定** -> **API** で **REST による Web サービスを有効にする** を有効化します。

2. プロジェクトモジュールを有効化します。
   **プロジェクト** -> **設定** -> **モジュール** で **Canvas Gantt** を有効化します。

3. 権限を付与します。
   **管理** -> **ロールと権限** で `view_canvas_gantt` と `edit_canvas_gantt` を必要に応じて付与します。

4. チャートを開きます。
   プロジェクトメニューの **Canvas Gantt** をクリックします。

5. チャートとツールバーを操作します。
   - Ctrl/Cmd + マウスホイールまたはツールバーでズームします。
   - タスクをドラッグしてタイムライン上で移動します。
   - タスク端をドラッグして期間を変更します。
   - 端点ドットからドラッグして依存関係を作成します。
   - 依存関係編集で種別や delay を変更、または削除します。
   - サイドバーの行を別タスクへドラッグして子チケット化します。
   - 子チケット一括作成で複数の子チケットをまとめて追加します。
   - ワークロードパネルで稼働状況や絞り込み条件を確認します。
   - 表示設定で UI 設定を保存し、必要に応じて全プロジェクトで共有します。
   - 表示可能なレイアウトでは PNG または CSV として出力します。
   - 必要に応じて全画面表示に切り替えて作業領域を広げます。

### ベースライン snapshot

- ベースラインは比較専用機能であり、スケジューリングや CPM 計算の入力には使いません。
- プロジェクトごとに単一のベースライン snapshot を保持し、新しく保存すると既存 snapshot を置き換えます。
- ツールバーから `現在のフィルタ結果` または `プロジェクト全体` のどちらを保存するかを選べます。
- 保存範囲が `プロジェクト全体` でも、ゴーストバーと差分 popover は現在表示中のタスクに対してのみ表示されます。
- ベースラインの閲覧には `view_canvas_gantt`、保存には `edit_canvas_gantt` が必要です。

### ワークロード、表示設定、出力

- ワークロードパネルでは、1 日あたりの稼働上限、ピーク、合計、末端チケットのみ、完了チケットを含めるか、今日以降のみを対象にするかを切り替えられます。
- 表示設定はプロジェクトごとに保存することも、全プロジェクト共通化することもできます。共有対象には、ズームレベル、表示モード、チャート位置、進捗ライン、チケットタイトル、階層線、開始日のみ・期日のみタスク、バージョンヘッダー、ベースライン表示、表示列、列順、依存関係に基づく整理、列幅、サイドバー幅、カスタムズーム倍率、行の高さ、フォントサイズが含まれます。
- 自動保存の有無によって、変更を即時保存するか、手動保存まで保留するかを切り替えます。
- ヘルプダイアログには、現在のツールバー操作と編集フローがまとまっています。

## 共有ビューとクエリパラメータ

Canvas Gantt では、共有すべき業務条件と個人的な UI 状態を分離して扱います。

- 共有用の業務条件は URL パラメータと `query_id` から解決されます
- ズーム、表示位置、サイドバー幅などの個人的な UI 状態は `localStorage` に保存されます
- 表示列やソート順は、Redmine 標準クエリと同期される共有状態として扱われます
- プロジェクト選択、ステータス、担当者、バージョン、カスタムフィールド条件などのプロジェクト固有のクエリ／フィルタ状態は共有しません
- `Canvas Gantt` タブが bare `/canvas_gantt` を開いた場合に限り、共有クエリ条件はそのプロジェクトで最後に使った状態を `localStorage` から復元します
- 同じ共有条件が複数ソースにある場合の優先順位は次の通りです
  URL パラメータ -> 保存済みクエリ (`query_id`) -> プロジェクト単位の last-used shared state -> デフォルト値

### クエリ編集の流れ

Canvas Gantt は Redmine 標準のクエリ編集 UI を再実装しません。クエリの作成、編集、保存は Redmine 標準のチケット一覧で行い、Canvas Gantt は保存済みクエリと、対応済みの Redmine 標準 URL パラメータを受け取って表示に反映します。

- Canvas Gantt のツールバーにある **保存済みクエリ** メニューで、現在のプロジェクトで閲覧可能な保存済み Redmine クエリを選べます
- 保存済みクエリを選ぶと `query_id` を適用して Canvas Gantt を再読み込みします
- **保存済みクエリを解除** で `query_id` を外しつつ、現在解決済みの共有フィルタは URL に残せます
- **この条件を保存** で、現在の条件を Redmine 標準のチケット一覧を iframe ダイアログで開いて保存できます
- 同じメニューの **Redmineでクエリ編集** から、標準チケット一覧を現在のタブで開くこともできます
- Redmine 標準の一覧画面でフィルタ条件を調整し、標準の **Save** でクエリを保存します
- 一覧画面の **Canvas Ganttで開く** で、現在のチケット一覧 URL 状態を引き継いだまま Canvas Gantt に戻ります
- 保存済みクエリを表示している場合は、戻り先 URL に `query_id` が含まれます
- 未保存の標準フィルタを表示している場合は、対応している Redmine 標準 filter パラメータをそのまま引き継ぎます

iframe ダイアログが使いにくい環境向けに、**新しいタブで開く** fallback も用意しています。

現在の表示が保存済みクエリそのものと一致している場合は `query_id` だけで十分です。表示列やソート順も保存済みクエリの定義に従って復元されます。保存済みクエリを開いたあとに Canvas Gantt 側で共有条件（フィルタ、列表示、ソート）を追加変更した場合は、ツールバーから Redmine 一覧へ戻る際に `query_id` に加えて Redmine 標準のフィルタおよびカラム指定パラメータも付与し、可能な範囲で同じ表示条件を再現します。

プロジェクトメニューの `Canvas Gantt` タブが shared query なしの bare URL を開いた場合は、そのプロジェクトで最後に使った shared filter 状態を復元し、ブラウザ URL も canonical な shared query params に書き換えます。

### 対応している共有パラメータ

| パラメータ | 説明 |
| :--- | :--- |
| `query_id` | 既存の Redmine 保存済みチケットクエリを基底条件として使用 |
| `status_ids[]` | チケットのステータス ID で絞り込み |
| `assigned_to_ids[]` | 担当者 ID で絞り込み。未割当は `none` を指定 |
| `project_ids[]` | 現在の project / subproject スコープ内で表示する project を絞り込み |
| `fixed_version_ids[]` | 対象バージョン ID で絞り込み。バージョンなしは `none` を指定 |
| `group_by` | グループ化条件。`project` または `assigned_to` |
| `sort` | フロントエンドのソートキーと方向。例: `subject:asc`, `startDate:desc` |
| `c[]` | 表示列の指定（Redmine 標準の `c[]` と互換）。例: `c[]=subject&c[]=status` |
| `show_subprojects` | サブプロジェクトの表示。`0` で非表示、未指定または `1` で表示 |

### Redmine 標準チケット一覧との互換性

| 項目 | 内容 |
| :--- | :--- |
| **パラメータ** | `set_filter=1`, `f[]`, `op[field]`, `v[field][]`, `c[]`, `group_by`, `sort` |
| **対応フィールド** | `status_id`, `assigned_to_id`, `project_id`, `fixed_version_id`, `subproject_id` |
| **対応演算子** | `=` (等しい), `*` (すべて), `!*` (なし), `o` (未完了), `c` (完了) |

現在の互換性の制限:

- 未対応の Redmine field / operator は warning を出して無視します
- `assigned_to_id` の「特定担当者 + 未割当」を同時に Redmine 標準 URL へ完全に書き戻すことはできないため、未割当側を省略して warning を出します
- バージョンなしは Canvas 独自 URL では `fixed_version_ids[]=none` で表現できますが、Redmine 標準の一覧 URL へ戻すときは省略されます
- 既定ソート (`startDate:asc`) は Redmine 一覧 URL へ戻すときに省略されることがあります

### URL 例

保存済みクエリを基底にして開く:

```text
/projects/demo/canvas_gantt?query_id=12
```

保存済みクエリにステータスと担当者条件を上書きする:

```text
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&status_ids[]=2&assigned_to_ids[]=5
```

対応済みの Redmine 標準チケット一覧 URL から直接 Canvas Gantt を開く:

```text
/projects/demo/canvas_gantt?query_id=12&set_filter=1&f[]=status_id&op[status_id]==&v[status_id][]=1&group_by=assigned_to&sort=start_date:desc
```

ブラウザ保存状態に依存せず、特定プロジェクト・特定バージョンの共有ビューを開く:

```text
/projects/demo/canvas_gantt?project_ids[]=3&fixed_version_ids[]=7&group_by=project&sort=startDate:asc
```

サブプロジェクトを隠し、未割当チケットだけを表示する:

```text
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```

## 設定

Canvas Gantt にはプラグイン設定画面はありません。UI の既定値はコード内で固定され、ベースライン snapshot はデータベース移行なしで `Setting.plugin_redmine_canvas_gantt` に内部保存されます。

開発時に Vite dev server を使うには `CANVAS_GANTT_USE_VITE_DEV_SERVER=1` を設定します。

### 互換性メモ

`redmica_ui_extension` による Select2 の挙動が Canvas Gantt の操作に干渉する場合は、**管理** -> **プラグイン** -> **Redmica UI Extension** -> **設定** で検索可能セレクトボックスを無効化してください。

## Docker クイックスタート

このリポジトリには、Redmine 6.0 と MariaDB をローカルで起動するための `docker-compose.yml` が含まれています。

### スタックを起動

```bash
docker compose up -d --wait
```

[http://localhost:3000](http://localhost:3000) で Redmine を開けます。

### 初期データを投入

```bash
docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### プロジェクトで Canvas Gantt を有効化

1. 対象 project を開きます。
2. **設定** -> **モジュール** を開きます。
3. **Canvas Gantt** を有効化します。
4. 編集が必要な場合は、利用ロールに `view_canvas_gantt` と `edit_canvas_gantt` を付与します。

### スタックを停止

```bash
docker compose down
```

## 開発

SPA フロントエンドは `spa/` にあります。

```bash
cd spa
npm ci
npm run build
npm run lint
npm run test -- --run
```

フロントエンドをライブ開発する場合:

```bash
cd spa
npm run dev
```
