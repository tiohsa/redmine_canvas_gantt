<div align="center">

# Redmine Canvas Gantt

Redmine 向けの高速・低リスクな Canvas ベースのガントチャートプラグイン。

## このプラグインを選ぶ理由

チケット数が多い Redmine でも快適に扱える、
**高速描画・直感的なスケジュール編集・DB マイグレーション不要**
を重視したガントチャートです。

## 主なメリット

**高速描画** — Canvas による滑らかなスクロールとズーム
**直接編集** — ドラッグ、リサイズ、依存関係、インライン編集
**導入・運用** — DB マイグレーション不要で、アンインストールも容易
**互換性** — Redmine 6.0 互換対応、Redmine 6.1 / 7.0 フルサポート

Redmine Plugins Directory に掲載されています:
https://www.redmine.org/plugins/redmine_canvas_gantt

[![License](https://img.shields.io/github/license/tiohsa/redmine_canvas_gantt)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tiohsa/redmine_canvas_gantt/ci.yml?branch=main\&label=CI)](https://github.com/tiohsa/redmine_canvas_gantt/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tiohsa/redmine_canvas_gantt)](https://github.com/tiohsa/redmine_canvas_gantt/releases)
[![Redmine](https://img.shields.io/badge/Redmine-6.0%20%7C%206.1%20%7C%207.0-red)](#必要環境)
[![Ruby](https://img.shields.io/badge/Ruby-Redmine公式要件に準拠-cc342d)](#必要環境)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#必要環境)

[English README](README.md) · [Releases](https://github.com/tiohsa/redmine_canvas_gantt/releases) · [Issues](https://github.com/tiohsa/redmine_canvas_gantt/issues)

</div>

---

## 概要

Redmine Canvas Gantt は、タイムラインを HTML5 Canvas で描画しながら、左側のチケット一覧を直接編集できる Redmine 向けガントチャートプラグインです。標準の Redmine ガントが見づらくなったり、チケット数の増加によって操作が重くなったりするプロジェクト向けに設計されています。

ベースラインスナップショットは、ブラウザや専用テーブルではなく Redmine の設定領域（`Setting.plugin_redmine_canvas_gantt`）に保存されます。プロジェクトごとに1件だけ保持され、新しく保存すると以前のスナップショットを置き換えます。

## 主な特徴

- Canvas ベースの高速描画による滑らかなスクロールとズーム
- タスクの移動、期間変更、端点ドラッグによる依存関係作成
- 依存関係の作成、更新、削除に対応
- 題名、担当者、ステータス、進捗率、期日、カスタムフィールドのインライン編集
- サイドバーでのドラッグアンドドロップによる親子関係の変更
- 複数行入力による子チケット一括作成
- 現在のフィルタ結果またはプロジェクト全体を保存できるベースライン比較
- 保存済みクエリ、Redmine でのクエリ編集、チケット一覧との往復
- 題名、プロジェクト、トラッカー、対象バージョン、担当者、ステータスによるフィルタ。トラッカー条件は保存済みクエリや Redmine クエリとの往復にも対応
- プロジェクトまたは担当者によるグループ化。対象バージョンのヘッダーはグループ化ではなく表示切り替え
- ワークロードパネル、PNG / CSV 出力、全画面表示、ズーム・行高・フォントサイズの操作
- 5・10・15・30・60分、任意の自動停止、複数タブ同期、Redmine標準の作業時間登録に対応したチケット単位の作業タイマー
- 同じブラウザプロファイル内で、プロジェクトごとまたは全プロジェクト共通に保存できる表示設定（Redmine ユーザー間では共有しない）
- バージョンヘッダー、進捗ライン、階層線、開始日のみ・期日のみタスク、依存関係ベースの整理

## デモ

![Canvas Gantt Demo](./docs/demo.gif)

## 必要環境

- Redmine 6.0（互換対応）、6.1、または 7.0
- 利用する Redmine バージョンが公式にサポートする Ruby
- Node.js 20+ は SPA のビルドまたはフロントエンド開発時のみ必要です。ビルド済みアセットを使う通常の Redmine 利用時には Node.js は必要ありません
- Redmine で REST API が有効化されていること

### 対応ブラウザ

HTML5 Canvas、ES modules、`localStorage` が有効な、現行のデスクトップ版 Chrome、
Edge、Firefox、Safari を使用してください。Internet Explorer は対応しません。モバイル
ブラウザと埋め込み WebView は、対応テスト対象外です。

### セキュリティと影響

- データベースマイグレーション: なし
- 追加パーミッション: `view_canvas_gantt`, `manage_canvas_gantt_baseline`
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
   **管理** -> **ロールと権限** で Canvas Gantt の利用には `view_canvas_gantt` を付与します。Issue 操作は対象IssueのProjectに対する Redmine 標準権限 `edit_issues`、`delete_issues`、`add_issues`、`manage_subtasks` で制御します。Baseline 保存を許可するロールにだけ `manage_canvas_gantt_baseline` を付与します。

   `edit_canvas_gantt` を使用していたバージョンから更新する場合は、該当ロールを確認してください。この廃止権限は自動移行されません。Baseline 保存を継続するロールだけに `manage_canvas_gantt_baseline` を付与し、通常のIssue操作にCanvas固有権限は不要です。

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

### 作業タイマー

- 列設定から **作業タイマー** 列を表示します。初期状態では非表示で、Redmineクエリの列には追加されません。
- Redmineの `log_time` 権限があるチケットで開始します。Redmineインスタンス・ユーザーごとに、実行中または未登録のタイマーは1件だけです。
- 5・10・15・30・60分から選択します。自動停止がOFFなら期限後も計測を続け、ONなら期限時刻ちょうどで停止します。
- 停止後は未登録状態となり、Redmine標準の作業時間フォームから登録します。フォームのキャンセルや入力エラーでは未登録状態を保持します。
- 画面上の作業時間は秒単位の表示に加えて `hh:mm` 形式でも表示します。登録時間はtimestampと計測Segmentから算出し、小数第2位へ丸めます。そのため極短時間は `0.00` でフォームが開く場合があり、入力可否はRedmine標準Validationに従います。
- タイマー由来の作業時間フォームを編集中・送信中はPending Sessionを予約し、別タブからの再開・延長・破棄・新規記録を禁止します。所有タブが閉じて予約だけが残った場合は、別タブから明示的に復旧できます。送信中の予約を復旧した場合は不明状態として扱い、Redmineを確認した後に「記録済み」または「未登録」として解決します。保存結果を確認できない場合もSessionを保持します。

[Timer Sessionアーキテクチャ図](docs/architecture/timer-session-architecture.png) に、Presentation、Application / State、Timer Domain、Browser Infrastructure、Redmine Serverの境界を示しています。

### ベースライン snapshot

- ベースラインは比較専用機能であり、スケジューリングや CPM 計算の入力には使いません。
- プロジェクトごとに単一のベースライン snapshot を保持し、新しく保存すると既存 snapshot を置き換えます。
- ツールバーから `現在のフィルタ結果` または `プロジェクト全体` のどちらを保存するかを選べます。
- 保存範囲が `プロジェクト全体` でも、ゴーストバーと差分 popover は現在表示中のタスクに対してのみ表示されます。
- ベースラインの閲覧には `view_canvas_gantt`、保存には `manage_canvas_gantt_baseline` が必要です。
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

### データ payload の安全上限

data endpoint は、タスクグラフを途中で切り詰めず、完全な payload が上限を超えた場合に HTTP 413 を返します。組み込みの有限上限は、チケット 10,000 件、関連 50,000 件、補助 collection 10,000 件、encode 後 JSON 25 MiB です。管理者は次の環境変数で上限を引き下げられますが、hard maximum を超えて引き上げることはできません。

- `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES`
- `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS`
- `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS`
- `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES`

### 業務カレンダー

Canvas Gantt は、週次非稼働日、国別祝日、会社休業日、振替稼働日を名前付き業務カレンダーで扱えます。解決済みの同じカレンダーを、依存関係検証、自動スケジュール、クリティカルパス計算、Canvas 背景描画、タスク日付の直接変更に使用します。Gantt のドラッグ・リサイズやサイドバーの日付編集で非稼働日が選ばれた場合、開始日は次の稼働日、終了日は直前の稼働日に補正されます。DB マイグレーションは不要です。休日データは外部 YAML を read-only の実行時設定として読み込み、`Setting.plugin_redmine_canvas_gantt` には保存しません。

既定ディレクトリは `<Rails.root>/config/redmine_canvas_gantt/business_calendars` です。別の場所を使う場合は `REDMINE_CANVAS_GANTT_CALENDAR_DIR` を設定します。[同梱サンプル](examples/business_calendars/)を初期ファイルとして利用できます。

```text
business_calendars/
├── settings.yml
├── generated/JP.yml
├── generated/US.yml
└── custom/company-japan.yml
```

`settings.yml` では Redmine 全体の既定カレンダーと、project identifier ごとの割当を指定します。子 project は最も近い親 project の割当を継承します。

```yaml
schema_version: 1
default_calendar: company-japan
project_calendars:
  japan-project: company-japan
  us-project: US
```

カスタムカレンダーは生成済み国別カレンダーを継承できます。`non_working` で会社休日を追加し、`working` で国別祝日や週次非稼働日を稼働日に上書きします。

```yaml
schema_version: 1
calendar:
  id: company-japan
  name: Japan Company Calendar
  base: JP
  managed: false
days:
  - date: 2027-08-12
    name: 会社夏季休業
    type: non_working
  - date: 2027-09-18
    name: 振替出勤日
    type: working
```

国別ファイルは、Redmine 本番 Bundle に `holidays` gem を追加せず生成できます。

```bash
cd tools/holiday_generator
bundle install
bundle exec ruby generate.rb --region jp --calendar-id JP --name Japan \
  --from 2026 --to 2030 \
  --output /path/to/business_calendars/generated/JP.yml
```

会社固有の変更は `custom/` に分離してください。`--force` で上書きできるのは `calendar.managed: true` のファイルだけです。ランタイムは相対パス・更新時刻・サイズを既定で60秒ごとに確認し、変更後の全ファイルが検証に成功してからスナップショットを原子的に差し替えます。間隔は `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` に0以上の秒数で指定できます。設定ルート外へ解決される symlink は拒否し、symlink のディレクトリは再帰探索しません。ディレクトリまたは `settings.yml` がなければ Redmine 標準の非稼働曜日へフォールバックします。不正な設定の場合も警告を記録し、同じ曜日設定へフォールバックしてカレンダー依存の関係変更と自動スケジュールを継続します。再読み込みが失敗した場合は警告を記録して直前の正常スナップショットを維持します。

Docker ではパスを明示してカレンダーディレクトリをマウントします。Redmine 公式イメージは
起動時に設定ディレクトリの所有者を変更するため、公式イメージを使う Compose では
`business_calendars` のマウントに `:ro` を付けないでください。アプリケーション起動後は
プラグインが休日データを読み取り専用で扱います。

```yaml
services:
  redmine:
    environment:
      REDMINE_CANVAS_GANTT_CALENDAR_DIR: /etc/redmine/business_calendars
    volumes:
      - ./business_calendars:/etc/redmine/business_calendars
```

Kubernetes では同じパスへ ConfigMap などを read-only でマウントし、同じ環境変数を設定します。各 Puma worker / Pod は独立したメモリスナップショットを持つため、すべての Pod が同一ファイルを参照する必要があります。ConfigMap の変更は次回確認時に検知され、リアルタイム Push は行いません。

プラグインをアンインストールしても、外部ディレクトリや ConfigMap は削除されません。休日データが不要になった場合だけ別途削除してください。既存の「DB マイグレーション不要」と簡単なアンインストール方針は維持されます。

### 互換性メモ

`redmica_ui_extension` による Select2 の挙動が Canvas Gantt の操作に干渉する場合は、**管理** -> **プラグイン** -> **Redmica UI Extension** -> **設定** で検索可能セレクトボックスを無効化してください。

## Docker クイックスタート

このリポジトリには、Redmine 7.0.0 と MariaDB 11.4 をローカルで起動するための `docker-compose.yml` が含まれています。互換バージョンを使う場合は `REDMINE_IMAGE=redmine:6.0.6` または `redmine:6.1.2` を指定します。

GitHub Actions では Redmine 6.0.6、6.1.2、7.0.0 の backend spec と Redmine E2E を継続検証します。Redmine 6.0.6 では targeted compatibility suite（smoke、business calendar、mutation contract、baseline permissions）を実行し、Redmine 6.1.2 と 7.0.0 では full Redmine Playwright suite を実行します。Redmine 7.0.0 は MariaDB 11.4 の Compose DBを使ったローカル検証も行います。

独自休日カレンダーを使用する場合は、`redmine` サービスに次の設定を追加します。`business_calendars/`
には `settings.yml` と、`generated/` および `custom/` 配下のカレンダー YAML を配置してください。

```yaml
services:
  redmine:
    environment:
      RAILS_ENV: production
      REDMINE_CANVAS_GANTT_CALENDAR_DIR: /usr/src/redmine/config/redmine_canvas_gantt/business_calendars
    volumes:
      - ./business_calendars:/usr/src/redmine/config/redmine_canvas_gantt/business_calendars
```

`RAILS_ENV: development` は、公式イメージに `listen` gem が含まれないため使用しないでください。

### スタックを起動

```bash
docker compose up -d --wait
```

Redmine 6.1.2 を起動する場合:

```bash
REDMINE_IMAGE=redmine:6.1.2 docker compose up -d --wait
```

Redmine 6.0.6 の場合は `REDMINE_IMAGE=redmine:6.0.6` を指定します。

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
4. 編集が必要な場合は、利用ロールに `view_canvas_gantt` と対象IssueのProjectに対する該当する Redmine 標準権限を付与します。Baseline 保存には `manage_canvas_gantt_baseline` も付与します。

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
