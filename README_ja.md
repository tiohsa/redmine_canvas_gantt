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

ベースライン snapshot はブラウザや専用テーブルではなく、Redmine の設定領域
（`Setting.plugin_redmine_canvas_gantt`）に保存されます。プロジェクトごとに 1 件だけ
保持され、新しく保存すると前の snapshot を置き換えます。

## 主な特徴

- Canvas ベースの高速描画による滑らかなスクロールとズーム
- タスクの移動、期間変更、端点ドラッグによる依存関係作成
- 依存関係の作成、更新、削除に対応
- 題名、担当者、ステータス、進捗率、期日、カスタムフィールドのインライン編集
- サイドバーでのドラッグアンドドロップによる親子関係の変更
- 複数行入力による子チケット一括作成
- 現在のフィルタ結果またはプロジェクト全体を保存できるベースライン比較
- 保存済みクエリ、Redmine でのクエリ編集、チケット一覧との往復
- 題名、プロジェクト、担当者、ステータス、対象バージョンによるフィルタ
- プロジェクトまたは担当者によるグループ化。対象バージョンのヘッダーはグループ化ではなく表示切り替え
- ワークロードパネル、PNG / CSV 出力、全画面表示、ズーム・行高・フォントサイズの操作
- 同じブラウザプロファイル内で、プロジェクトごとまたは全プロジェクト共通に保存できる表示設定（Redmine ユーザー間では共有しない）
- バージョンヘッダー、進捗ライン、階層線、開始日のみ・期日のみタスク、依存関係ベースの整理

## デモ

![Canvas Gantt Demo](./docs/demo.gif)

## 必要環境

- Redmine 6.x
- Ruby 3.x
- Node.js 20+ は SPA のビルドまたはフロントエンド開発時のみ必要です。ビルド済みアセットを使う通常の Redmine 利用時には Node.js は必要ありません
- Redmine で REST API が有効化されていること

### 対応ブラウザ

HTML5 Canvas、ES modules、`localStorage` が有効な、現行のデスクトップ版 Chrome、
Edge、Firefox、Safari を使用してください。Internet Explorer は対応しません。モバイル
ブラウザと埋め込み WebView は、対応テスト対象外です。

### セキュリティと影響

- データベースマイグレーション: なし
- 追加パーミッション: `view_canvas_gantt`, `edit_canvas_gantt`
- アンインストール: プラグインディレクトリを削除する前に、Redmine の実行環境からクリーンアップタスクを実行します。Docker Compose の場合は `redmine` サービスのコンテナ内で実行します。このタスクは保存済みベースラインを含む Redmine のプラグイン設定行全体を削除します。各ユーザーのブラウザ `localStorage` はサーバー側タスクでは削除されません。

## インストール

1. プラグインを Redmine の `plugins/` ディレクトリに配置します。

   ```bash
   cd /path/to/redmine/plugins
   git clone https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Redmine を再起動します。

   配置後にアプリケーションサーバーを再起動してください。

### アップグレード

1. Redmine データベースとプラグインディレクトリをバックアップします。
2. Git の更新またはリリースの展開で、プラグインディレクトリを目的のバージョンに置き換えます。
3. SPA をソースからビルドする場合は、Node.js 20+ で `cd spa && npm ci && npm run build` を実行します。
4. Redmine を再起動し、プラグインのモジュールと権限を確認します。

データベースマイグレーションはありません。Redmine 設定内のベースラインとブラウザの
表示設定は、アップグレード時には保持されます。

### アンインストール

1. 保存済みベースラインやプラグイン設定を後で利用する可能性がある場合は、Redmine データベースをバックアップします。
2. プラグインディレクトリが存在する状態で、冪等なクリーンアップタスクを実行します。

   **通常インストール** — `Gemfile` が存在する Redmine 本体ディレクトリで実行します。

   ```bash
   cd /path/to/redmine
   bundle exec rake redmine_canvas_gantt:uninstall RAILS_ENV=production
   ```

   **Docker Compose** — Redmine サービスのコンテナ内で実行します。

   ```bash
   docker compose exec -T redmine \
     bundle exec rake redmine_canvas_gantt:uninstall
   ```

   このリポジトリの Compose 設定では `RAILS_ENV=production` が設定済みです。明示する場合は次のように実行します。

   ```bash
   docker compose exec -T -e RAILS_ENV=production redmine \
     bundle exec rake redmine_canvas_gantt:uninstall
   ```

   Redmine 本体が Docker 内だけで動作している場合、ホスト側のプラグインディレクトリでは `bundle exec` を実行しないでください。ホスト側には Redmine の `Gemfile` がないため、Bundler が `Could not locate Gemfile or .bundle/ directory` を出力します。

3. `plugins/redmine_canvas_gantt` ディレクトリを削除します。Docker の場合は、対応するプラグインの volume または bind mount もコンテナ設定から削除します。
4. Redmine を再起動します。

クリーンアップタスクは Redmine の `settings` テーブルから `plugin_redmine_canvas_gantt` 行を削除し、保存済みベースラインと同じ行に保存されたプラグイン設定をすべて削除します。ブラウザの `localStorage` は削除しません。

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
- ベースラインは Redmine の設定領域 `Setting.plugin_redmine_canvas_gantt` に保存されます。プラグインディレクトリを削除するだけでは残るため、先にアンインストール用クリーンアップタスクを実行してください。

### ワークロード、表示設定、出力

- ワークロードパネルでは、1 日あたりの稼働上限、ピーク、合計、末端チケットのみ、完了チケットを含めるか、今日以降のみを対象にするかを切り替えられます。
- 表示設定は Redmine のユーザー情報ではなく、ブラウザの `localStorage` に保存されます。プロジェクト単位ではそのプロジェクトに適用され、全プロジェクト共通化では同じブラウザプロファイルの全プロジェクトに適用されます。他のブラウザプロファイルには影響しませんが、同じプロファイルを使う人には表示されます。対象には、ズームレベル、表示モード、チャート位置、進捗ライン、チケットタイトル、階層線、開始日のみ・期日のみタスク、バージョンヘッダー、ベースライン表示、表示列、列順、依存関係に基づく整理、列幅、サイドバー幅、カスタムズーム倍率、行の高さ、フォントサイズが含まれます。
- 自動保存の有無によって、変更を即時保存するか、手動保存まで保留するかを切り替えます。
- ヘルプダイアログには、現在のツールバー操作と編集フローがまとまっています。

## 共有ビュー、フィルタ、クエリパラメータ

URL パラメータと保存済み Redmine クエリが、共有可能な業務条件の契約です。
ステータス、担当者、プロジェクト、対象バージョン、サブプロジェクト表示、
グループ化、ソート、表示列を共有できます。題名テキストフィルタとワークロードの
フォーカスフィルタは個人用ブラウザ状態であり、共有されません。直前に解決した
クエリ状態も、共有ではなく、bare な Canvas Gantt URL を開いたときの個人用
`localStorage` フォールバックとして保存されます。

表示設定も Redmine ユーザー単位ではなくブラウザプロファイル単位の設定です。
「全プロジェクトで共有」は同じブラウザプロファイル内で全プロジェクトに適用する意味で
あり、Redmine の全ユーザーへの共有ではありません。同じプロファイルを使う人には表示
されます。パラメータ一覧、Redmine 互換性、優先順位、例は
[URL とクエリパラメータ](QUERY_PARAMETERS_ja.md) を参照してください。

保存済みクエリの作成・編集は Redmine 標準のチケット一覧で行います。Canvas Gantt の
ツールバーから現在のクエリを iframe または新しいタブで開け、**Canvas Ganttで開く**で
対応する URL 状態を引き継いで戻れます。

## 設定

Canvas Gantt にはプラグイン設定画面はありません。UI の既定値はコード内で固定され、ベースライン snapshot はデータベース移行なしで `Setting.plugin_redmine_canvas_gantt` に内部保存されます。この設定は Redmine 全体の保存領域ですが、ベースライン操作自体は前述のプロジェクト権限で制限されます。

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
