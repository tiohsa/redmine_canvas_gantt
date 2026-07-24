# 祝日カレンダー生成ツール

このスタンドアロンのRubyバンドルは、`holidays` gemを使用して業務カレンダー用のYAMLファイルを生成します。Redmineの本番用バンドルとは意図的に分離されており、外部APIも使用しません。

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