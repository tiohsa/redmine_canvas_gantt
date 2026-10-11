# Business calendars

Business calendars define weekly non-working days, holidays, company shutdowns, and substitute workdays. The resolved calendar is used for relation validation, automatic scheduling, critical-path calculations, chart rendering, and date changes. If a drag, resize, or sidebar date edit selects a non-working day, the start date moves forward to the next working day and the due date moves backward to the previous working day.

Calendar files are not stored in Redmine's database or in the browser. No database migration is required.

## Configuration directory

The default directory is `<Rails.root>/config/redmine_canvas_gantt/business_calendars`. To use another directory, set `REDMINE_CANVAS_GANTT_CALENDAR_DIR` in the Redmine process environment. Choose either **detailed YAML** or **one global `holiday.csv`**. Do not mix the formats in the same directory.

## YAML: multiple calendars, project mapping, and exceptions

YAML supports named calendars, assignment by project identifier, calendar inheritance, weekly non-working weekdays, and per-date working or non-working overrides. A child project inherits the nearest assigned parent project's calendar; if no assignment applies, it uses the default calendar.

Here is a minimal directory layout. Creating `settings.yml`, `generated/JP.yml`, and `custom/company.yml` with the contents below gives the YAML configuration a complete set of references.

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

`base` references another calendar ID in the same configuration root. In this example, `company` inherits from `JP` in `generated/JP.yml`. The holiday rows in `generated/JP.yml` illustrate the format; they are not a complete national holiday list. For complete country data, see the repository's [`examples/business_calendars`](https://github.com/tiohsa/redmine_canvas_gantt/tree/main/examples/business_calendars) and [`tools/holiday_generator`](https://github.com/tiohsa/redmine_canvas_gantt/tree/main/tools/holiday_generator). Set `schema_version` to `1`.

## CSV: one global holiday list

Place one `holiday.csv` directly in the configured root to create the `global` calendar for every project. The first row is always skipped as a header. Each subsequent non-empty row must have a date in its first column using `YYYY/M/D` or `YYYY/MM/DD`. The optional second-column name and all later columns are ignored. Every listed date is non-working.

```csv
date,name
2026/1/1,New Year
2026/01/12,Holiday
```

::: warning The header row is required
The loader always skips the first row as the header. A headerless CSV therefore loses its first holiday entry. Put a header such as `date,name` on the first line.
:::

Weekly non-working days come from the weekdays configured in Redmine under **Administration → Settings → Display**. CSV cannot define country or project assignments, inheritance, weekdays, or substitute workdays. Use YAML for those requirements. Use an ASCII-compatible encoding such as UTF-8 or Windows-31J so the date column can be read.

The CSV must be a regular file inside the configured root and contain 1–10,000 valid, unique dates. The maximum file size is 1 MiB. Symlinks resolving outside the root are rejected.

## Reloads and invalid configuration

By default, the runtime checks relative paths, modification times, and file sizes every 60 seconds. Set `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` to a non-negative number of seconds to change the interval. After a change is detected, reload the Gantt page to see the updated state.

The runtime applies a changed file set only after all files validate. Replacing a valid CSV also removes dates deleted from the file. A failed reload logs a warning and retains the last valid snapshot. On initial load, an invalid configuration or a missing directory / YAML settings file falls back to Redmine's standard non-working weekdays. Symlinks pointing outside the root are rejected, and symlinked directories are not traversed.

::: warning Do not mix CSV and YAML
If `holiday.csv` sits beside `settings.yml` or calendar YAML files, the configuration is invalid. When changing formats, move the old files out of the configured root before reloading.
:::

For container mounts, see [Deployment environments](/en/administration/deployment).
