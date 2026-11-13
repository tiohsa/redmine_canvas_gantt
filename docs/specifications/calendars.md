<a id="営業日カレンダーの現行仕様"></a>

# Business Calendars

Reference: HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`, implementation as of 2026-11-13 (plugin 0.20.0). This is a development specification; the specification index identifies the public manual's current target.

<a id="目的と参照先"></a>

## Purpose and references

Share project-specific holidays and working days across date operations, dependency scheduling, and planned workload allocation. Treat date-only values as calendar dates. See [scheduling](scheduling.md), [workload](workload.md), and [permissions and settings](permissions-settings.md).

Main implementations are the [loader](../../lib/redmine_canvas_gantt/business_calendar_loader.rb), [repository](../../lib/redmine_canvas_gantt/business_calendar_repository.rb), [project resolver](../../lib/redmine_canvas_gantt/project_calendar_resolver.rb), and [SPA working-day calculations](../../spa/src/utils/businessCalendar.ts).

<a id="設定と解決"></a>

## Configuration and resolution

- The default directory is Redmine's `config/redmine_canvas_gantt/business_calendars`, overridable with `REDMINE_CANVAS_GANTT_CALENDAR_DIR`.
- `settings.yml` contains `schema_version: 1`, optional `default_calendar`, and `project_calendars` mapping project identifiers to calendar IDs. See [settings.yml](../../examples/business_calendars/settings.yml).
- Search assignments from the project itself to its nearest ancestor and upward, then use the default. Without either an assignment or default, fall back to Redmine non-working weekdays.
- YAML definitions are discovered recursively. `schema_version: 1`, `calendar.id`, and `calendar.name` are required; `base`, `non_working_week_days`, `managed`, and `days` are supported. See [company-japan.yml](../../examples/business_calendars/custom/company-japan.yml).
- `base` references another calendar ID. Child date overrides overlay parent dates. Weekdays use child settings, then parent settings, then Redmine settings. Explicit date overrides take precedence over weekdays.
- Non-working weekdays are a unique array of ISO weekday numbers 1–7, leaving at least one working weekday. Explicit dates require `YYYY-MM-DD`, a name, and `working` or `non_working`.
- Unknown keys, missing references, inheritance cycles, duplicate dates, invalid dates, and similar conditions are configuration errors. Limits: 1 MiB per file, 100 calendars, 10,000 resolved dates, and inheritance depth 20. Symlinks resolving outside the directory are rejected.

Minimal configuration (`settings.yml` and a separate `office.yml`):

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

`source` accepts an optional mapping; `managed` an optional boolean. Calendar IDs contain 1–64 alphanumeric, `_`, or `-` characters. `days` is an optional array; dates cannot repeat within a file. These examples describe configuration, not automatic file generation.

<a id="csv-モード"></a>

## CSV mode

A root `holiday.csv` creates one `global` calendar as the default. It cannot coexist with YAML files in the same directory. See [holiday.csv](../../examples/business_calendars_csv/holiday.csv).

- **The current implementation always skips the first row regardless of its content.** A header is required; headerless data loses its first holiday. Header presence/content is not validated.
- From row two onward, the first column must be a real date in `YYYY/M/D` format. Other columns and holiday names are ignored; each date becomes a non-working day named `Holiday`.
- Blank rows are ignored, but zero valid holidays is an error. Duplicate dates, invalid formats, malformed CSV, and more than 10,000 entries are also errors.
- Weekdays use Redmine settings. CSV cannot specify project assignments or working-day overrides.

```csv
date,name
2027/1/1,New Year
2027/2/11,Holiday
```

Header names are not validated. For example, a first row of `2027/1/1,New Year` is not registered as a holiday; with no remaining data, the CSV is considered empty.

<a id="読み込みapi競合"></a>

## Loading, API, and conflicts

The repository checks changes periodically: default 60 seconds, configurable with `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL`. Revisions use fingerprints of YAML modification times/sizes, and CSV fingerprints include a content hash.

Invalid initial configuration returns `status: error`. If a runtime reload fails, retain the last valid snapshot and return `validationStatus: stale` with diagnostics. A successful later check activates corrected settings. Diagnostics may contain safe relative filenames and line numbers; formatting avoids exposing absolute paths.

Intervals use a monotonic clock. When a read finds the interval elapsed, recheck under a mutex. Empty, invalid, or negative settings fall back to 60 seconds; zero checks on every read. A missing directory produces an empty valid snapshot and falls back to Redmine weekdays. A failed change's fingerprint is not committed, allowing later retries.

Gantt data's `businessCalendar` includes `status`, `validationStatus`, `validationMessage`, `revision`, `defaultCalendarId`, `projectCalendarIds`, `calendars`, and `warnings`. Detailed `diagnostic` is returned only to administrators and removed from other responses. Each calendar has `id`, `name`, `nonWorkingWeekDays`, and date-keyed `days`. Target projects are selected with visibility checks.

Calendar-dependent updates, schedule mutations, and some relation changes return HTTP 409 when a supplied `X-Redmine-Canvas-Gantt-Calendar-Revision` differs from the current revision. This covers schedule mutations, updates/edit previews containing start/due dates, and `precedes` / `follows` relation creates/updates. Without the header, this comparison is skipped. Conflict responses include expected/current values and require reloading. Working-day placement normalizes starts forward and due dates backward to working days; calendar-day placement does not shift them.

<a id="検証と制約"></a>

## Verification and limitations

- Relevant tests: [loader](../../spec/lib/redmine_canvas_gantt/business_calendar_loader_spec.rb), [reloads](../../spec/lib/redmine_canvas_gantt/business_calendar_repository_spec.rb), [SPA calculations](../../spa/src/utils/businessCalendar.test.ts), [schedule mutations](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_spec.rb).
- Change detection depends on the check interval, not continuous watching. YAML fingerprints are not hashes of file contents.
- Consecutive date overrides may leave no working days in a specific period even when working weekdays exist. Planned workload receives no allocation in that period.
