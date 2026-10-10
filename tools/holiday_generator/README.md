# Holiday Calendar Generator

This standalone Ruby bundle generates business calendar YAML files using the `holidays` gem. It is intentionally kept separate from Redmine's production bundle and does not use any external APIs.

## CSV input format

The importer skips the first line as a header. Each non-empty data line must contain an unquoted date in `YYYY/M/D` or `YYYY/MM/DD` form, followed by a comma. Columns after the first comma are ignored. LF and CRLF line endings are supported.

```csv
date,name
2026/1/1,Holiday
2026/01/12,Holiday
```

Duplicate dates, invalid dates, malformed data lines, and files with no valid dates are rejected.

```bash
ruby import_cabinet_office.rb \
  --input /path/to/holidays.csv \
  --calendar-id JP \
  --name Japan \
  --output /path/to/business_calendars/generated/JP.yml
```

The importer reads the file as binary and ignores every column after the first comma, so it does not decode the Japanese holiday names. It imports every listed date, sorts them, and replaces the generated calendar as a whole. Every date is `non_working` and has the fixed name `Japanese public holiday`. The input must be at most 1 MiB and the generated YAML must fit within the runtime's 1 MiB file limit and 10,000-day limit.

#### Configure the generated calendar in Redmine

Set `--output` to a path under Redmine's configured calendar directory. The default is `<Rails.root>/config/redmine_canvas_gantt/business_calendars`; when `REDMINE_CANVAS_GANTT_CALENDAR_DIR` is set, use that directory instead. Place a `settings.yml` in the same directory to select `JP` as the default and assign it to a project:

```yaml
schema_version: 1
default_calendar: JP
project_calendars:
  japan-project: JP
```

Replace `japan-project` with the Redmine project identifier. Child projects inherit the nearest parent project's assignment. For company-specific working-day overrides, create a separate calendar based on `JP`, as in the [company Japan example](../../examples/business_calendars/custom/company-japan.yml).

The runtime detects file changes within the configured reload interval, which defaults to 60 seconds. Reload the Gantt page after detection to use the updated calendar. Changes to the CSV do not regenerate YAML automatically: rerun the import command with `--force`. This replaces the snapshot only when the existing YAML has `calendar.managed: true`. See [Business calendars](../../README.md#business-calendars) for runtime details.

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
