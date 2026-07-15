# Holiday Calendar Generator

This standalone Ruby bundle generates business calendar YAML files using the `holidays` gem. It is intentionally kept separate from Redmine's production bundle and does not use any external APIs.

## Using Ruby and Bundler

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

To generate a calendar for the United States, specify `--region us --calendar-id US --name "United States"`.

## Using Docker

Build the Docker image:

```bash
docker build -t holiday-generator .
```

Generate a Japanese calendar in the host-side `generated/` directory:

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

To generate a calendar for the United States, run the same Docker image as follows:

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

By default, the generator creates new files only. An existing file can be replaced only when it contains `calendar.managed: true` and the `--force` option is supplied. Files with `managed: false`, or without a `managed` field, are never overwritten even when `--force` is specified.

Replacement is performed by writing a temporary file in the output directory and then atomically renaming it.

Store company holidays and substitute working days in a separate file under `custom/`, and specify the generated calendar as `calendar.base`. This prevents regeneration from discarding company-specific changes.