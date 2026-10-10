# 祝日カレンダー生成ツール

このスタンドアロンのRubyバンドルは、`holidays` gemを使用して業務カレンダー用のYAMLファイルを生成します。Redmineの本番用バンドルとは意図的に分離されており、外部APIも使用しません。

## CSV読込フォーマット

先頭行はヘッダーとして読み飛ばします。空行以外の各データ行には、`YYYY/M/D`または`YYYY/MM/DD`形式の引用符なしの日付と、その後のカンマが必要です。最初のカンマ以降の列はすべて無視します。改行はLFとCRLFに対応します。

```csv
date,name
2026/1/1,Holiday
2026/01/12,Holiday
```

日付の重複、無効な日付、不正な形式のデータ行、有効な日付がないファイルは拒否します。

```bash
ruby import_cabinet_office.rb \
  --input /path/to/holidays.csv \
  --calendar-id JP \
  --name Japan \
  --output /path/to/business_calendars/generated/JP.yml
```

入力はバイナリとして読み込み、最初のカンマ以降の列をすべて無視します。そのため、日本語の祝日名を文字コード変換しません。CSVにある日付をすべて取り込み、日付順に並べた完全なカレンダーを生成します。各日は`non_working`、名称は固定値`Japanese public holiday`です。入力ファイルは1 MiB以下、生成YAMLはruntimeの1 MiBおよび10,000日制限以内である必要があります。

#### 生成したカレンダーをRedmineで設定する

`--output`にはRedmineのカレンダーディレクトリ内のパスを指定します。既定は`<Rails.root>/config/redmine_canvas_gantt/business_calendars`です。`REDMINE_CANVAS_GANTT_CALENDAR_DIR`を設定した場合は、そのディレクトリを使います。同じディレクトリに`settings.yml`を置き、`JP`を既定カレンダーにし、projectへ割り当てます。

```yaml
schema_version: 1
default_calendar: JP
project_calendars:
  japan-project: JP
```

`japan-project`はRedmineのproject identifierに置き換えてください。子projectは最も近い親projectの割当を継承します。会社独自の振替稼働日は`JP`をbaseとする別カレンダーに記述します。[日本語向けcompany calendar例](../../examples/business_calendars/custom/company-japan.yml)を参照してください。

ランタイムは設定間隔内にファイル変更を検知します。既定は60秒です。検知後、更新したカレンダーを画面に反映するにはGanttページを再読み込みしてください。CSVを変更してもYAMLは自動生成されません。importコマンドを`--force`付きで再実行してください。既存YAMLの`calendar.managed: true`が確認できる場合だけ置き換えます。詳細は[業務カレンダー](../../README_ja.md#業務カレンダー)を参照してください。

## RubyとBundlerを使用する場合

```bash
bundle install
bundle exec ruby generate.rb \
  --region jp \
  --calendar-id JP \
  --name Japan \
  --from 2026 \
  --to 2030 \
  --output /path/to/business_calendars/generated/JP.yml
```

米国のカレンダーを生成する場合は、`--region us --calendar-id US --name "United States"`を指定します。

## Dockerを使用する場合

Dockerイメージをビルドします。

```bash
docker build -t holiday-generator .
```

ホスト側の`generated/`ディレクトリに日本のカレンダーを生成します。

```bash
mkdir -p generated
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" \
  holiday-generator \
  --region jp \
  --calendar-id JP \
  --name Japan \
  --from 2026 \
  --to 2030 \
  --output /app/generated/JP.yml
```

米国のカレンダーを生成する場合は、同じDockerイメージを次のように実行します。

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" \
  holiday-generator \
  --region us \
  --calendar-id US \
  --name "United States" \
  --from 2026 \
  --to 2030 \
  --output /app/generated/US.yml
```

生成ツールは、既定では新規ファイルのみを作成します。既存ファイルを置き換えられるのは、そのファイルに`calendar.managed: true`が設定されており、かつ`--force`オプションを指定した場合だけです。`managed: false`が設定されているファイル、または`managed`フィールドが存在しないファイルは、`--force`を指定しても上書きされません。

ファイルの置き換えでは、出力ディレクトリ内に一時ファイルを作成した後、アトミックリネームを実行します。

会社独自の休日や振替稼働日は、`custom/`配下の別ファイルに保存し、生成済みカレンダーを`calendar.base`として指定してください。これにより、カレンダーを再生成しても会社固有の変更が失われません。
