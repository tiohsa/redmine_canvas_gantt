# Holiday Calendar Generator

This standalone directory provides a tool to generate business calendar YAML files:

- **Generate from the `holidays` gem:** `generate.rb` generates regional holiday calendars from bundled holiday definitions.

The tooling is intentionally separate from Redmine's production bundle. The generator does not call an external API while generating calendars. It produces YAML files that the Redmine Canvas Gantt business calendar loader can read.

## Choose a configuration workflow

**Direct CSV configuration does not require this generator.** The Redmine plugin can load a `holiday.csv` file directly. Use the generator only when you need a named YAML calendar, project-specific assignments, inheritance, or working-day overrides.

| Behavior | Direct `holiday.csv` in Redmine | `generate.rb` to YAML |
| --- | --- | --- |
| Input | `holiday.csv` in the configured calendar directory | Region and year range |
| Header | First row always skipped | Not applicable |
| Data row | Date in first column; comma and name optional | Not applicable |
| Calendar ID | Fixed: `global` | `--calendar-id` |
| Holiday label | Fixed: `Holiday` | Name provided by the `holidays` gem |
| Non-working weekdays | Redmine's `Setting.non_working_week_days` | Saturday and Sunday (`[6, 7]` in YAML) |
| Project-specific calendars and overrides | Not supported | Supported through additional YAML configuration |
| Updates | Runtime checks `holiday.csv` changes | Rerun generator; use `--force` for a managed file |

**Current header behavior:** Direct CSV configuration skips the first row unconditionally, so provide a header. A headerless CSV loses its first holiday entry. Header detection and headerless loading are **not implemented**.

**Do not mix modes:** When using direct `holiday.csv` configuration, do not put `settings.yml` or any other calendar YAML files in the same configured directory. To use YAML calendars, generate YAML there and keep CSV files outside that directory (or remove `holiday.csv` from it).

For the direct CSV setup and its complete validation rules, see [Business calendars](../../README.md#business-calendars) or the [Japanese guide](../../README_ja.md#業務カレンダー).

## Generate regional YAML calendars with Ruby and Bundler

`generate.rb` uses the locally installed `holidays` gem. From `tools/holiday_generator/`:

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

The generated calendar uses Saturday and Sunday as non-working weekdays (`non_working_week_days: [6, 7]`). This setting is independent of Redmine's configured weekdays. To customize weekdays or add working-day overrides, use YAML.

## Configure the generated calendar in Redmine

Write the generated YAML under the configured calendar directory, which defaults to:

```text
<Rails.root>/config/redmine_canvas_gantt/business_calendars/
```

Set `REDMINE_CANVAS_GANTT_CALENDAR_DIR` to use a different directory. For a named or project-specific YAML calendar, add a `settings.yml` to that directory:

```yaml
schema_version: 1
default_calendar: JP
project_calendars:
  japan-project: JP
```

Replace `japan-project` with the Redmine project identifier. Child projects inherit the nearest parent project's assignment.

Keep company shutdown dates and substitute working days in a separate calendar that declares `calendar.base: JP`. See the [company Japan example](../../examples/business_calendars/custom/company-japan.yml).

Runtime configuration changes are checked every **60 seconds** by default. After the change is detected, reload the Gantt page to see it. A failed reload retains the last valid calendar snapshot. For more details, see [Business calendars](../../README.md#business-calendars).

## Generate regional YAML calendars with Docker

The provided Docker image runs **`generate.rb`**. The examples below use a POSIX shell on Linux/macOS; adjust the UID/GID and bind-mount syntax for Windows PowerShell.

From `tools/holiday_generator/`, build the image:

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

Generate a United States calendar:

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

## Safe regeneration and company overrides

By default, the generator creates new files only. An existing output can be replaced **only when both conditions are met**:

1. The command specifies `--force`.
2. The existing YAML declares `calendar.managed: true`.

Files with `managed: false` or no `managed` field are never overwritten by the generator. The replacement is performed by writing a temporary file in the output directory and atomically renaming it.

Keep company-specific holidays and substitute working days in separate files under `custom/`, and set `calendar.base` to the generated calendar ID. This prevents regeneration from discarding company-specific changes.
