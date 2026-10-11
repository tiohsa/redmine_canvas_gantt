# 営業日カレンダー

営業日カレンダーは週次の非稼働日、祝日、会社休業日、振替稼働日を定義します。解決済みカレンダーは依存関係の検証、自動スケジュール、クリティカルパス計算、チャート表示、日付変更に使われます。ドラッグ・リサイズやサイドバーの日付編集で非稼働日を選ぶと、開始日は次の稼働日、期日は直前の稼働日に補正されます。

設定ファイルは Redmine のデータベースやブラウザーには保存されません。DB マイグレーションも不要です。

## 設定ディレクトリ

既定の場所は `<Rails.root>/config/redmine_canvas_gantt/business_calendars` です。別の場所を使う場合は Redmine プロセスに `REDMINE_CANVAS_GANTT_CALENDAR_DIR` を設定します。形式は **詳細な YAML** または **全プロジェクト共通の `holiday.csv`** のどちらか一方です。

::: warning CSV と YAML を混在させない
`holiday.csv` と `settings.yml` またはカレンダー YAML が同じ設定ルートにあると、設定全体が無効になります。形式を切り替える際は、古い形式のファイルを設定ルートの外へ移動してから再読み込みしてください。
:::

## YAML: 複数カレンダー、プロジェクト割当、例外日

YAML は複数の名前付きカレンダー、Project identifier による割当、カレンダー継承、週次非稼働曜日、日ごとの稼働・非稼働上書きを設定できます。子プロジェクトは最も近い親プロジェクトの割当を継承し、割当がなければ既定カレンダーを使います。

最小構成の配置例です。`settings.yml`、`generated/JP.yml`、`custom/company.yml` を以下の内容で作ると、すべての参照先が揃った YAML 構成になります。

```text
business_calendars/
├── settings.yml
├── generated/JP.yml
└── custom/company.yml
```

`settings.yml`:

```yaml
schema_version: 1
default_calendar: JP
project_calendars:
  japan-project: company
```

`generated/JP.yml`:

```yaml
schema_version: 1
calendar:
  id: JP
  name: Japan
  non_working_week_days: [6, 7]
  managed: true
days:
  - date: 2027-01-01
    name: New Year's Day
    type: non_working
  - date: 2027-02-11
    name: National Foundation Day
    type: non_working
```

`custom/company.yml`:

```yaml
schema_version: 1
calendar:
  id: company
  name: Japan Company Calendar
  base: JP
  managed: false
source:
  provider: custom
  based_on: JP
days:
  - date: 2027-08-12
    name: Company summer holiday
    type: non_working
  - date: 2027-09-18
    name: Substitute workday
    type: working
```

`base` は同じ設定ルートにある別カレンダー ID を参照します。この例では `company` が `generated/JP.yml` の `JP` を継承します。`generated/JP.yml` の祝日行は形式例であり、完全な祝日一覧ではありません。完全な国別データが必要な場合は、リポジトリの [`examples/business_calendars`](https://github.com/tiohsa/redmine_canvas_gantt/tree/main/examples/business_calendars) と [`tools/holiday_generator`](https://github.com/tiohsa/redmine_canvas_gantt/tree/main/tools/holiday_generator) を参照してください。`schema_version` は `1` を指定します。

## CSV: 全プロジェクト共通の休日リスト

設定ルートの直下に `holiday.csv` を 1 つ置くと、全プロジェクトで使う `global` カレンダーになります。先頭行は必ずヘッダーとして読み飛ばされます。その後の空でない行では、第 1 列に `YYYY/M/D` または `YYYY/MM/DD` の日付を記載します。第 2 列の名前は任意で、名前も後続列も読み込みません。リストにある日付はすべて非稼働日です。

```csv
date,name
2026/1/1,New Year
2026/01/12,Holiday
```

::: warning ヘッダー行は必須
読み込み処理は先頭行を常にヘッダーとして読み飛ばします。ヘッダーなしの CSV は最初の休日データが失われるため、1 行目には `date,name` などのヘッダーを必ず置いてください。
:::

週次非稼働日は Redmine の**管理 → 設定 → 表示**で設定した曜日を使います。CSV では国・プロジェクト別割当、継承、曜日変更、振替稼働日の指定はできません。必要なら YAML を使ってください。日付欄を読むため、UTF-8 や Windows-31J など ASCII 互換の文字コードを使用します。

CSV は設定ルート内の通常ファイルで、1〜10,000 件の有効かつ重複のない日付を含めます。上限サイズは 1 MiB です。

## 変更の反映とエラー時の動作

ランタイムは既定で 60 秒ごとに相対パス、更新時刻、ファイルサイズを確認します。間隔は `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` に 0 以上の秒数で指定できます。変更を検知したら、Gantt 画面を再読み込みして新しい状態を確認してください。

新しいファイル群はすべての検証に成功した後でまとめて適用されます。CSV の有効な置換では削除済みの日付も反映されます。不正な再読み込みでは警告を記録し、直前の正常なスナップショットを維持します。初回起動時に設定が不正な場合やディレクトリ / YAML 設定がない場合は、Redmine 標準の非稼働曜日にフォールバックします。設定ルート外へ解決するシンボリックリンクは拒否され、シンボリックリンク先のディレクトリは探索されません。

コンテナー環境のマウント手順は[デプロイ環境](/ja/administration/deployment)を参照してください。
