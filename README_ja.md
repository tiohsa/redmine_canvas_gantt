<div align="center">

# Redmine Canvas Gantt

Redmine 向けの高性能 Canvas ベース ガントチャートプラグイン。

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

## Overview

Redmine Canvas Gantt は、HTML5 Canvas を利用してタイムラインを高速描画しながら、左側サイドバーを直接編集できる Redmine 向けガントチャートプラグインです。

標準 Redmine ガントでは扱いづらい大規模スケジュールを、より高速・直感的・実用的に操作できるよう設計されています。

また、Redmine 標準クエリ連携、インライン編集、依存関係編集、ベースライン比較、共有ビュー機能などを備えつつ、Redmine の DB スキーマ変更なしで導入できます。

## 現在バージョン

- プラグインバージョン: `0.8.4`
- 対応 Redmine: Redmine 6.x
- DB マイグレーション: なし
- project module: `Canvas Gantt`
- 権限:
  - `view_canvas_gantt`
  - `edit_canvas_gantt`

## Features

### ガント・スケジュール操作

- Canvas ベースの高速タイムライン描画
- 滑らかな横・縦スクロール
- Ctrl/Cmd + マウスホイールによるズーム
- ドラッグによるタスク移動
- タスク端ドラッグによる開始日・期日変更
- バージョンヘッダー、進捗ライン、階層線、タスクタイトル、行高プリセット対応
- 高 DPI 環境向け devicePixelRatio 対応 Canvas 描画

### 依存関係管理

- タスク端点からのドラッグによる依存関係作成
- relation type と delay の編集
- 依存関係削除
- 依存関係ベースの並び替え表示

### チケット編集

- 件名、担当者、ステータス、進捗率、期日、カスタムフィールドのインライン編集
- サイドバーでのドラッグアンドドロップによる親子関係変更
- 複数行入力による子チケット一括作成
- プラグイン設定からインライン編集項目を切替可能

### フィルタ・クエリ・共有ビュー

- プロジェクト、担当者、ステータス、バージョン、題名によるフィルタ
- project / assigned_to によるグループ化
- `query_id` による Redmine 保存済みクエリ利用
- Redmine 保存済みクエリとの表示列・ソート同期
- Redmine 標準 issue list URL パラメータの一部に対応
- bare URL 起動時に project 単位の最後の shared state を復元
- 保存済みクエリやフィルタ有効時にツールバーへインジケータ表示

### 表示設定

- ズーム、表示位置、サイドバー幅などの UI 状態を `localStorage` に保存
- 表示設定を project 横断で共有可能
- 共有対象:
  - ズームレベル
  - view mode
  - chart position
  - progress line
  - task title
  - hierarchy lines
  - orphan point display
  - version headers
  - baseline visibility
  - visible columns
  - column order
  - dependency organization
  - column widths
  - sidebar width
  - custom zoom scales
  - row height
  - sidebar font size

### ベースライン比較

- 現在フィルタ範囲または project 全体を baseline 保存可能
- 現在スケジュールと baseline を比較表示
- ghost bar と diff popover による差分表示
- baseline は比較専用であり、スケジューリング入力には未使用

## Demo

![Canvas Gantt Demo](./docs/demo.gif)

![Canvas Gantt Demo](./docs/demo2.gif)

## Requirements

- Redmine 6.x
- Ruby 3.x
- SPA ビルドおよびフロントエンド開発用 Node.js 20+
- Redmine REST API 有効化

## Security and Impact

- DB マイグレーションなし
- 追加権限:
  - `view_canvas_gantt`
  - `edit_canvas_gantt`
- アンインストールはプラグイン削除 + Redmine 再起動のみ
- フロントエンド build は Redmine plugin assets 経由で配信

## Installation

1. プラグインを Redmine の `plugins/` 配下へ clone します。

```bash
cd /path/to/redmine/plugins
git clone https://github.com/tiohsa/redmine_canvas_gantt.git
```

2. release package に `assets/build/` が含まれていない場合は SPA を build します。

```bash
cd redmine_canvas_gantt/spa
npm ci
npm run build
```

3. Redmine を再起動します。

## Usage

1. REST API を有効化します。

**管理** -> **設定** -> **API** -> **REST による Web サービスを有効にする**

2. project module を有効化します。

**プロジェクト** -> **設定** -> **モジュール** -> **Canvas Gantt**

3. 権限を付与します。

**管理** -> **ロールと権限**

- `view_canvas_gantt`
- `edit_canvas_gantt`

4. project menu の **Canvas Gantt** を開きます。

5. タスクを操作します。

- Ctrl/Cmd + ホイールでズーム
- タスクドラッグで移動
- タスク端ドラッグで期間変更
- 端点ドットドラッグで依存関係作成
- relation 編集 UI から relation type / delay 編集
- sidebar row drag & drop による子チケット化
- bulk subtask create による複数子チケット追加

## ベースライン比較

baseline は現在スケジュールとの差分比較機能です。

- scheduling / CPM 計算入力には利用しません
- project ごとに単一 baseline snapshot を保持
- 新規保存時に既存 snapshot を置換
- toolbar から「現在フィルタ」または「project 全体」を保存可能
- ghost bar と diff 表示は現在表示中タスクのみ描画
- baseline 閲覧には `view_canvas_gantt`
- baseline 保存には `edit_canvas_gantt`

## Shared Views と Query Parameters

Canvas Gantt は、共有すべき業務条件と個人 UI 状態を分離して管理します。

- shared business condition は URL と `query_id` から解決
- zoom / viewport / sidebar width などの個人 UI 状態は `localStorage` 保存
- display columns と sorting は shared state として Redmine query と同期
- `query_id` や filter 条件は global display preference としては共有しない
- bare `/canvas_gantt` 起動時は project ごとの last-used shared state を復元
- 優先順位:

```text
URL parameters -> saved query (`query_id`) -> project-scoped last-used shared state -> defaults
```

### クエリ編集フロー

Canvas Gantt は Redmine 標準 query editor を再実装しません。

クエリ作成・編集・保存は Redmine 標準 issue list 側で行い、Canvas Gantt は保存済み query と対応済み URL parameter を解釈します。

- toolbar の **Saved Queries** から query 選択
- `query_id` により saved query を適用
- **Clear saved query** で `query_id` のみ解除
- **Save custom query** で iframe dialog から Redmine 標準 query 保存
- **Edit Query in Redmine** で標準 issue list を開く
- issue list 側の **Open in Canvas Gantt** で戻る
- saved query 時は `query_id` を引き継ぐ
- unsaved filter 時は Redmine 標準 parameter を引き継ぐ

iframe query editor dialog には **Open in new tab** fallback もあります。

### 対応 shared parameters

| Parameter | 内容 |
| :--- | :--- |
| `query_id` | Redmine 保存済み query を基底条件として利用 |
| `status_ids[]` | ステータス絞り込み |
| `assigned_to_ids[]` | 担当者絞り込み (`none` で未割当) |
| `project_ids[]` | project 絞り込み |
| `fixed_version_ids[]` | version 絞り込み (`none` で未設定) |
| `group_by` | `project` または `assigned_to` |
| `sort` | frontend sort 指定 |
| `c[]` | visible columns 指定 |
| `show_subprojects` | subproject 表示制御 |

### Redmine issue list 互換

| Category | Supported |
| :--- | :--- |
| Parameters | `set_filter=1`, `f[]`, `op[field]`, `v[field][]`, `c[]`, `group_by`, `sort` |
| Fields | `status_id`, `assigned_to_id`, `project_id`, `fixed_version_id`, `subproject_id` |
| Operators | `=`, `*`, `!*`, `o`, `c` |

現在の制限:

- 未対応 field/operator は warning 表示して無視
- `assigned_to_id` の「担当者 + 未割当」同時表現は完全再現不可
- `fixed_version_ids[]=none` は Redmine 標準 URL export 時に省略
- default sort は export 時に省略される場合あり

## Configuration

**管理** -> **プラグイン** -> **Canvas Gantt** -> **設定**

| Setting | 内容 |
| :--- | :--- |
| `inline_edit_subject` | 件名インライン編集 |
| `inline_edit_assigned_to` | 担当者インライン編集 |
| `inline_edit_status` | ステータスインライン編集 |
| `inline_edit_done_ratio` | 進捗率インライン編集 |
| `inline_edit_due_date` | 期日インライン編集 |
| `inline_edit_custom_fields` | カスタムフィールド編集 |
| `row_height` | デフォルト行高 |
| `use_vite_dev_server` | 開発時 Vite dev server 使用 |

### Compatibility note

`redmica_ui_extension` の Select2 が干渉する場合:

**管理** -> **プラグイン** -> **Redmica UI Extension** -> **設定**

で searchable select box を無効化してください。

## Docker Quick Start

この repository には Redmine 6 + MariaDB 用 `docker-compose.yml` が含まれています。

### 起動

```bash
docker compose up -d --wait
```

Redmine:

```text
http://localhost:3000
```

### 初期データ投入

```bash
docker compose exec -T -e REDMINE_LANG=ja redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### Canvas Gantt 有効化

1. project を開く
2. **設定** -> **モジュール**
3. **Canvas Gantt** を有効化
4. role に権限付与

### 停止

```bash
docker compose down
```

## Development

SPA frontend は `spa/` 配下です。

```bash
cd spa
npm ci
npm run build
npm run lint
npm run test -- --run
```

live frontend development:

```bash
cd spa
npm run dev
```

その後 plugin setting の `use_vite_dev_server` を有効化してください。

### Redmine integration tests

```bash
npx playwright test -c playwright.redmine.config.ts
```

## Build Output

- `npm run build` 出力先: `assets/build/`
- Redmine 起動時に `public/plugin_assets/redmine_canvas_gantt/build` へ link/copy
- fallback route:

```text
/plugin_assets/redmine_canvas_gantt/build/*
```

## Release

`v*` tag push 時に GitHub Release が自動生成されます。

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

release workflow は GitHub Release 作成のみ行い、SPA build artifact packaging は行いません。

## License

GNU General Public License v2.0 (GPL v2)

詳細は [LICENSE](LICENSE) を参照してください。
