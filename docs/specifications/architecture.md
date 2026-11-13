<a id="全体構成共通契約"></a>

# Architecture and Shared Contracts

Reviewed: 2026-11-13. Reference: `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (code version 0.20.0). See the [specification index](../README.md) for the public manual's target version.

<a id="目的と責務"></a>

## Purpose and responsibilities

This Rails plugin displays visible Redmine issues on a Canvas timeline with a React issue list and controls. The server owns authorization, visibility, persistence, and derived parent dates. The SPA manages display, local edits, previews, and save progress.

| Layer | Responsibilities | Main implementation |
| --- | --- | --- |
| Rails pages and APIs | Bootstrap configuration, authentication, HTTP, scope and permission checks | [controller](../../app/controllers/canvas_gantts_controller.rb), [routes](../../config/routes.rb) |
| Ruby feature services | Selection, draft evaluation, schedule updates, calendars, baselines, actual effort aggregation | [lib](../../lib/redmine_canvas_gantt/) |
| API client | URLs and headers, JSON validation, date and ID conversion, error classification | [client](../../spa/src/api/client.ts), [mutationDecoders](../../spa/src/api/mutationDecoders.ts) |
| State and services | Server state, drafts, load generations, saving, conflicts, recovery | [stores](../../spa/src/stores/), [services](../../spa/src/services/) |
| Display, input, and output | React controls, Canvas rendering, input interpretation, exports | [components](../../spa/src/components/), [engines](../../spa/src/engines/), [export](../../spa/src/export/) |

<a id="起動と取得"></a>

## Bootstrap and loading

1. Opening a project's Canvas Gantt page makes the controller check view permission and return the page.
2. The [Rails view](../../app/views/canvas_gantts/index.html.erb) creates `window.RedmineCanvasGantt`. It includes the project ID, project/issue/API paths, Redmine subpath, CSRF token, translations, fixed settings, non-working weekdays, user ID, language, and date format.
3. Built JS/CSS loads according to the Vite manifest, and [main](../../spa/src/main.tsx) mounts React. Conditions for using the development server are defined in [runtime settings](permissions-settings.md).
4. For data requests, the server resolves project scope, issue visibility, filters, and saved queries and returns display state. The client converts and validates the response and applies it through existing store paths.

The initial HTML configuration is not the complete issue dataset. Data, edit options, workload, and other resources load through their respective APIs and state management.

<a id="api-の境界"></a>

## API boundaries

The project base path is `/projects/:project_id/canvas_gantt`. SPA mutations also use routes under `/canvas_gantt`, specifying the view's project with `canvas_project_id`. Preserve Redmine's subpath prefix when deployed under a relative URL root.

| Feature | HTTP and relative path | Contract owner |
| --- | --- | --- |
| Page, data, query list | `GET` page, `/data`, `/queries` | [Scope and queries](query-scope.md) |
| Edit options and preview | `GET /tasks/:id/edit_meta`, `POST /tasks/:id/edit_meta/preview` | [Issue editing](issue-editing.md) |
| Issue update and deletion | `PATCH` / `DELETE /tasks/:id` | [Issue editing](issue-editing.md), [persistence](persistence.md) |
| Schedule updates and relations | `POST /schedule_mutation`, `POST /relations`, `PATCH` / `DELETE /relations/:id` | [Scheduling](scheduling.md) |
| Child issue tracker options and bulk creation | `GET /subtasks/trackers`, `POST /subtasks/bulk` | [Child issues](bulk-subtasks.md) |
| Baselines | `POST` / `DELETE /baseline` (project routes only) | [Baselines](baseline.md) |
| Actual workload | `GET /actual_workload` (project routes only) | [Workload](workload.md) |

Main JSON response fields include `tasks`, `relations`, `versions`, `custom_fields`, `filter_options`, `statuses`, `project`, `permissions`, `initial_state`, `query_context`, `baseline`, `warnings`, and `project_scope`. Nil values such as `baseline` and empty `warnings` may be omitted. The calendar wire key is `businessCalendar`. The API client converts snake_case and other wire representations to SPA types; wire keys and store property names are not interchangeable.

Mutations include a CSRF token and, when available, a calendar revision header. For calendar-dependent requests, the server compares revisions if the header is present. This does not mean all requests without the header are rejected. Scope and target checks belong on the server; client display and editability alone are not trusted.

<a id="日付の共通契約"></a>

## Shared date contract

[dateOnly](../../spa/src/utils/dateOnly.ts) owns calendar-date calculations and conversions.

| Type or representation | Meaning | Boundary |
| --- | --- | --- |
| `YYYY-MM-DD` | Redmine date-only value | APIs, calendars, persistence |
| `CalendarDate` | Calendar date encoded as a UTC-midnight number | Timezone-independent calculation |
| `TimelineDate` | Canvas date axis with uniform day widths | `toTimelineDate` / `timelineToCalendarDate` |
| `Instant` | A point on the elapsed-time axis | Timers and similar features; do not mix directly with calendar dates |

- `parseDateOnly` validates the format and actual year/month/day; invalid or empty values become `null`.
- `formatDateOnly` generates a date string from UTC date components. Do not display the UTC encoding as local time.
- Use `diffCalendarDays`, `addCalendarDays`, and related utilities for date differences and arithmetic. DST changes to elapsed day length must not affect calendar-day differences.
- Use `toLocalDisplayDate` / `fromLocalDate` at date-picker and localized display boundaries, and `todayCalendarDate` for today.
- Do not add independent date-only conversions using `new Date('YYYY-MM-DD')` or `toISOString()`.

Working days, successor calendars, and date placement modes are defined in [calendars](calendars.md) and [scheduling](scheduling.md).

<a id="保存非同期処理の共通契約"></a>

## Shared persistence and asynchronous contracts

- Separate confirmed server state from local patches; display their projection. [Persistence and conflict recovery](persistence.md) owns the persistence model.
- Reconcile state using mutation outcomes, completeness of confirmed data, revisions, and invalidation targets. HTTP success alone must not clear local edits.
- Protect load generations, view context, and issue/operation revisions. Responses for old views, superseded requests, or earlier edits must not overwrite current state.
- Main data, edit metadata, baselines, and actual workload each have their own loading boundaries. Do not add direct cross-store writes or a competing save pipeline.
- Redmine owns derived parent issue dates. Do not synthesize parent date mutations from projected children.

The [async contract checker](../../spa/scripts/check-async-contract.mjs) statically checks existing boundaries. Use it alongside feature-specific conflict and recovery tests.

<a id="データ量と失敗"></a>

## Data budgets and failures

[DataPayloadBudget](../../lib/redmine_canvas_gantt/data_payload_budget.rb) limits record counts and JSON bytes for data retrieval.

| Environment variable | Default and maximum |
| --- | --- |
| `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES` | 10,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS` | 50,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS` | 10,000 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES` | 25 × 1024 × 1024 bytes |

Positive integer settings are capped at the maximum. Invalid or non-positive values fall back to defaults. Retrieval using `load_records` reads at most limit + 1 records to detect overflow. Other collection paths check counts after construction; not every load is bounded to limit + 1 records. JSON size is also checked. Overflow returns `413` with `code: canvas_gantt_payload_limit`, `resource`, and `limit`. These limits do not guarantee performance or define pagination across all APIs.

Distinguish permission denial, missing targets, conflicts, invalid input, and transport failures. Feature specifications define API details; [persistence](persistence.md) defines mutation failure classification and recovery. Do not copy sensitive information into notifications or logs.

<a id="根拠と回帰確認"></a>

## Evidence and regression checks

- Dates: [dateOnly.test](../../spa/src/utils/dateOnly.test.ts). Distinguish today/display boundaries from timer instants; consider Asia/Tokyo and America/Los_Angeles/DST.
- API conversion: [client.test](../../spa/src/api/client.test.ts), [mutationDecoders.test](../../spa/src/api/mutationDecoders.test.ts).
- Counts and size: [data_payload_budget_spec](../../spec/lib/redmine_canvas_gantt/data_payload_budget_spec.rb), [controller spec](../../spec/controllers/canvas_gantts_controller_spec.rb).
- Bootstrap and view boundaries: [App.test](../../spa/src/App.test.tsx), [asset helper spec](../../spec/lib/redmine_canvas_gantt/vite_asset_helper_spec.rb).
- Commands and prerequisites are in [AGENTS.md](../../AGENTS.md) and [CI](../../.github/workflows/ci.yml). This evidence comes from reading code and tests; it does not replace integration verification on every supported Redmine version.
