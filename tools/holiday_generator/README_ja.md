# 祝日カレンダー生成ツール

このディレクトリには、業務カレンダー用のYAMLファイルを生成するツールがあります。

- **`holidays` gemから生成：** `generate.rb` がgemに同梱された祝日定義から、国・地域別のYAMLカレンダーを生成します。

このツールはRedmine本番用のBundler環境から独立しています。生成処理中に外部APIを呼び出しません。生成したYAMLはRedmine Canvas Ganttの業務カレンダーLoaderで読み込めます。

## 利用方式の選択

**CSVを直接読み込ませる場合、この生成ツールは不要です。** Redmineの設定ディレクトリに`holiday.csv`を置くだけで読み込めます。名前付きカレンダー、プロジェクト別設定、継承、稼働日の上書きが必要な場合にYAML生成ツールを使用してください。

| 項目 | Redmineで`holiday.csv`を直接読込 | `generate.rb`でYAMLを生成 |
| --- | --- | --- |
| 入力 | 設定ディレクトリの`holiday.csv` | 国・地域と対象年 |
| ヘッダー | 先頭行を無条件で読み飛ばす | 対象外 |
| データ行 | 第1列の日付が必要。カンマ・休日名は任意 | 対象外 |
| カレンダーID | `global`固定 | `--calendar-id`で指定 |
| 休日の表示名 | `Holiday`固定 | `holidays` gemの休日名 |
| 週次非稼働日 | Redmineの`Setting.non_working_week_days` | 土日固定（YAML内で`[6, 7]`） |
| プロジェクト別設定・上書き | 非対応 | 追加のYAML設定で対応 |
| 更新 | 実行時に`holiday.csv`の変更を検知 | コマンドを再実行。管理対象の上書きは`--force` |

**現行のヘッダー仕様：** CSV直接読込では先頭行を無条件で読み飛ばすため、必ずヘッダーを付けてください。ヘッダーを省略すると最初の休日が失われます。**ヘッダーの自動判定・省略対応は未実装**です。

**設定方式は混在不可：** `holiday.csv`を直接使用する場合、同じカレンダー設定ディレクトリに`settings.yml`などのYAMLを置かないでください。YAML方式を使う場合は、生成したYAMLを配置し、CSVは設定ディレクトリの外に保管するか、そこから`holiday.csv`を取り除いてください。

CSV直接読込の詳細は、[業務カレンダー](../../README_ja.md#業務カレンダー)を参照してください。

## RubyとBundlerで国別YAMLを生成する

`generate.rb`はローカルにインストールした`holidays` gemを使用します。`tools/holiday_generator/`で実行してください。

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

生成するYAMLの週次非稼働日は土日（`non_working_week_days: [6, 7]`）に固定されています。Redmineの週次非稼働日設定とは独立しています。曜日や振替稼働日を変更したい場合はYAMLで設定してください。

## 生成したカレンダーをRedmineへ設定する

生成YAMLは、既定では次のカレンダー設定ディレクトリの下に配置します。

```text
<Rails.root>/config/redmine_canvas_gantt/business_calendars/
```

別の場所を使用する場合は`REDMINE_CANVAS_GANTT_CALENDAR_DIR`を設定します。名前付き・プロジェクト別のYAMLカレンダーを使用する場合は、同じ設定ディレクトリに`settings.yml`を用意します。

```yaml
schema_version: 1
default_calendar: JP
project_calendars:
  japan-project: JP
```

`japan-project`をRedmineのプロジェクト識別子に置き換えてください。子プロジェクトは最も近い親プロジェクトの割り当てを継承します。

会社独自の休業日や振替稼働日は、`calendar.base: JP`を指定した別ファイルに記述してください。[会社カレンダーの例](../../examples/business_calendars/custom/company-japan.yml)を参照してください。

ランタイムは既定で**60秒ごと**に設定ファイルの変更を確認します。変更検知後、Gantt画面を再読込すると反映されます。再読み込みに失敗した場合は直前の正常なカレンダー設定を維持します。詳細は[業務カレンダー](../../README_ja.md#業務カレンダー)を参照してください。

## Dockerで国別YAMLを生成する

このDockerイメージは**`generate.rb`**を実行します。以下の例はLinux/macOSのPOSIXシェル用です。Windows PowerShellではUID/GIDやボリュームマウント構文を調整してください。

`tools/holiday_generator/`でDockerイメージをビルドします。

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

米国のカレンダーを生成します。

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

## 安全な再生成と会社独自の休日

YAML生成ツールは、既定では新しいファイルだけを作成します。既存YAMLの上書きには、**次の2条件が両方必要**です。

1. コマンドに`--force`を付ける。
2. 既存YAMLに`calendar.managed: true`が設定されている。

`managed: false`または`managed`がないファイルは、`--force`を付けても上書きしません。出力ディレクトリ内に一時ファイルを書き込み、アトミックリネームによって置き換えます。

会社独自の休日や振替稼働日は`custom/`以下の別ファイルへ分離し、生成YAMLのカレンダーIDを`calendar.base`に設定してください。これにより、国別カレンダーを再生成しても会社独自の変更が失われません。
