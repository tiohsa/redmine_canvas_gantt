# 営業日カレンダーの現行仕様

対象: HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`、2026-11-13 時点の実装（プラグイン 0.20.0）。公開マニュアルは v0.19.0 を対象とするため、この文書はそのリリースの操作説明ではない。

## 目的と参照先

プロジェクトごとの休日と営業日を、日付操作、依存関係のスケジュール計算、工数の予定配分で共有する。日付のみの値は暦日として扱う。[スケジューリング](scheduling.md)、[工数](workload.md)、[権限と設定](permissions-settings.md)も参照。

主な実装は [ローダー](../../lib/redmine_canvas_gantt/business_calendar_loader.rb)、[リポジトリ](../../lib/redmine_canvas_gantt/business_calendar_repository.rb)、[プロジェクト解決器](../../lib/redmine_canvas_gantt/project_calendar_resolver.rb)、[SPA の営業日計算](../../spa/src/utils/businessCalendar.ts)。

## 設定と解決

- 既定ディレクトリは Redmine の `config/redmine_canvas_gantt/business_calendars`。環境変数 `REDMINE_CANVAS_GANTT_CALENDAR_DIR` で変更できる。
- `settings.yml` は `schema_version: 1`、任意の `default_calendar` と、プロジェクト識別子からカレンダー ID への `project_calendars` を持つ。設定例は [settings.yml](../../examples/business_calendars/settings.yml)。
- 対象プロジェクト自身、最も近い祖先、さらにその祖先の順に割当を探し、見つからなければデフォルトを使う。割当もデフォルトもなければ Redmine の非稼働曜日がフォールバックとなる。
- YAML 定義ファイルは再帰的に探索する。`schema_version: 1`、`calendar.id`、`calendar.name` が必要で、`base`、`non_working_week_days`、`managed` と `days` を指定できる。例は [company-japan.yml](../../examples/business_calendars/custom/company-japan.yml)。
- `base` は他のカレンダー ID。日付別の指定は親の指定に子の指定を重ね、曜日は子の指定、親の指定、Redmine 設定の順で選ぶ。同じ日付の明示指定は曜日設定より優先する。
- 非稼働曜日は ISO 曜日 1〜7 の重複しない配列で、少なくとも週に 1 営業日が必要。明示日付は `YYYY-MM-DD`、名前と `working` または `non_working` が必要。
- 不明なキー、存在しない参照、循環継承、重複日付、不正な日付などは設定エラー。ファイルは 1 MiB 以下、カレンダーは最大 100、解決後の日付は最大 10,000、継承は最大 20 階層。外部に解決されるシンボリックリンクも拒否する。

最小構成の例（`settings.yml` と別の `office.yml`）:

```yaml
# settings.yml
schema_version: 1
default_calendar: office
project_calendars:
  sample-project: office
```

```yaml
# office.yml
schema_version: 1
calendar:
  id: office
  name: Office
  non_working_week_days: [6, 7]
days:
  - date: 2027-01-01
    name: Holiday
    type: non_working
  - date: 2027-01-02
    name: Working Saturday
    type: working
```

`source` は任意の mapping、`managed` は任意の真偽値として受け付ける。カレンダーの ID は英数字、`_`、`-` の 1〜64 文字。`days` は任意の配列で、同一ファイル内の同一日付は重複できない。これらは設定の例であり、自動的にファイルを生成する機能の説明ではない。

## CSV モード

ルートの `holiday.csv` が存在する場合は単一の `global` カレンダーをデフォルトにする。YAML ファイルと同じディレクトリで併用できない。サンプルは [holiday.csv](../../examples/business_calendars_csv/holiday.csv)。

- **現行実装は先頭行を内容に関係なく常に読み飛ばす。** ヘッダー行を用意する必要があり、ヘッダーなしのデータは先頭の休日が失われる。ヘッダーの有無や内容は検証しない。
- 2 行目以降の第 1 列は `YYYY/M/D` 形式の実在日付。その他の列と休日名は無視され、名前 `Holiday` の非稼働日になる。
- 空行は無視するが、有効な休日が 1 件もなければエラー。日付の重複、不正形式、不正な CSV、10,000 件超もエラーとなる。
- 曜日は Redmine の非稼働曜日を使う。CSV ではプロジェクト別の割当や稼働日の上書きは指定できない。

```csv
date,name
2027/1/1,New Year
2027/2/11,Holiday
```

ヘッダー名自体は検証しない。例えば `2027/1/1,New Year` を先頭行に置くとそれは休日として登録されず、残りがなければ空 CSV 扱いとなる。

## 読み込み、API、競合

リポジトリは変更を定期的に検査する。既定間隔は 60 秒で、`REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` により変更できる。YAML はファイルの更新時刻とサイズ、CSV は内容ハッシュを含む fingerprint を revision とする。

初回の不正設定は `status: error` として返る。稼働中の再読込が失敗した場合は前回の有効なスナップショットを保持し、`validationStatus: stale` と診断を返す。修正後の検査が成功すると新しい設定に切り替わる。診断は安全な相対ファイル名や行番号を含み得るが、絶対パスを露出しないよう整形される。

間隔は単調時計で計測し、読み出し時に期限が来ていれば mutex 内で再検査する。設定値が空、不正、負数なら 60 秒に戻り、0 は毎回検査する。存在しないディレクトリは空の有効スナップショットとなり、Redmine の曜日設定へフォールバックする。失敗した変更の fingerprint は確定せず、後の検査で再試行する。

ガントデータの `businessCalendar` は `status`、`validationStatus`、`validationMessage`、`revision`、`defaultCalendarId`、`projectCalendarIds`、`calendars`、`warnings` を含む。詳細な `diagnostic` は管理者にのみ返し、非管理者の応答からは除去する。各カレンダーには `id`、`name`、`nonWorkingWeekDays`、日付をキーとする `days` がある。対象プロジェクトは可視性を考慮して選ばれる。

カレンダーに依存する日付更新、スケジュール変更、一部の関係変更などは、送信された `X-Redmine-Canvas-Gantt-Calendar-Revision` が現在値と違えば HTTP 409 を返す。対象はスケジュール mutation、開始日・期日を含む更新または編集プレビュー、`precedes` / `follows` の関係作成・更新である。ヘッダーがない場合はこの比較を行わない。競合応答には期待値と現在値が入り、再読込が必要となる。日付配置が営業日モードなら開始日は前方、期日は後方の営業日に正規化される。暦日モードではその移動をしない。

## 検証と制約

- [ローダーのテスト](../../spec/lib/redmine_canvas_gantt/business_calendar_loader_spec.rb)、[再読込のテスト](../../spec/lib/redmine_canvas_gantt/business_calendar_repository_spec.rb)、[SPA の計算テスト](../../spa/src/utils/businessCalendar.test.ts)、[スケジュール変更のテスト](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_spec.rb)が関係する。
- 変更検知は常時監視ではなく検査間隔に依存する。YAML fingerprint は内容そのもののハッシュではない。
- 非稼働日の連続指定によって、週に営業日があっても実際の対象期間に営業日がない場合がある。工数予定には配分されない。
