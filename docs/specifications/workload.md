<a id="工数ペインの現行仕様"></a>

# Workload Pane

Reference: HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`, implementation as of 2026-11-13 (plugin 0.20.0). The specification index records the public manual's current target version.

<a id="目的と範囲"></a>

## Purpose and scope

Show planned effort for Gantt issues and actual recorded work by person and date. The SPA calculates planned effort from issues; the server aggregates visible time entries for actual effort. Both use the same issue query scope, but planned effort belongs to the issue assignee while actual effort belongs to the user recording time. See [queries and scope](query-scope.md) and [calendars](calendars.md).

Default pane settings are an eight-hour daily workload threshold, leaf-only enabled, closed issues excluded, and today-onward disabled. Settings persist in local user preferences. Leaf detection uses physical children rather than displayed children, so a parent with hidden children is not a leaf.

The SPA filters loaded tasks by assignee, project, version, tracker, status, and subproject display and excludes context-only `isContextOnly` issues from aggregation. Actual API results are also matched against these target task IDs. Physical hierarchy after moving a parent refreshes through the existing data-refetch path.

<a id="予定の計算"></a>

## Planned effort calculation

[WorkloadLogicService](../../spa/src/services/WorkloadLogicService.ts) aggregates current target issues.

1. Require an assignee, positive estimated hours, and valid start/due dates. Exclude issues whose start is after due date.
2. Apply leaf-only, closed-issue, and today-onward settings. Use each issue's project calendar to find working days in the inclusive start-to-due range.
3. Allocate `estimated hours / total working days` evenly across working days. The denominator includes all working days before clipping to the viewport or today-onward filter, so partial display does not change daily allocation. No working days means no allocation.
4. Sum allocations by person/day and retain period totals, peaks, and per-issue contributions.

For example, ten estimated hours across five Monday–Friday working days gives two hours per day. Displaying only Wednesday–Friday totals six hours; it does not redistribute ten hours over three days. Treat dates as calendar dates, without timezone conversion to instants.

<a id="実績の取得と計算"></a>

## Actual effort retrieval and calculation

Opening the pane or changing scope, query, or settings calls `GET /projects/:project_id/canvas_gantt/actual_workload.json`. `from` and `to` must be real `YYYY-MM-DD` dates with an inclusive span of at most 730 days. Reversed ranges, invalid formats, or excessive spans return 422. `leaf_only=1` selects physical leaves; `include_closed=1` includes closed issues.

The server restricts target issues using Gantt query resolution and `Issue.visible`, then applies `TimeEntry.visible(current_user)`. SQL aggregates time within the period by user/date/issue, with row-count and response-size budgets. Aggregated rows contain `id`, `issueId`, `userId`, `userName`, `spentOn`, and `hours`; they are not raw time-entry records.

The response is `{ "entries": [...] }`, with each `id` composed as `userId:spentOn:issueId`. Actual scope intersects visible time entries and visible target issues; records for inaccessible issues are excluded.

The SPA matches rows to current target issues and excludes invalid dates, non-positive values, and unknown issues. Actual hours accumulate on their recorded dates, including holidays, rather than being distributed across working days. Planned and actual effort each retain daily totals, period totals, peaks, and contributing issues.

<a id="過負荷と操作"></a>

## Overload and interaction

A planned or actual daily total is overloaded only when it **exceeds** the threshold; equality is not overload. Count overloaded days and people with overloaded days separately.

Histogram bars can focus contributing issues; repeated actions cycle through multiple contributors to the same bar. Overload bars also support cycling by person. Workload-pane vertical scrolling stays synchronized with the sidebar.

<a id="非同期処理とエラー"></a>

## Asynchronous behavior and errors

[WorkloadStore](../../spa/src/stores/WorkloadStore.ts) keys actual scope by current project, resolved query/context, period, and leaf/closed settings. Scope changes clear previous actual results; refetching the same scope may retain the last result. Refetches are debounced by 150 ms.

Responses must match request generation, current scope key, and pane visibility. Stale responses are ignored. Closing the pane invalidates pending fetches/calculations. Actual retrieval failures enter `error`; failure must not become a successful empty result. Planned calculation is independent of fetching.

Actual states are `idle`, `loading`, `ready`, and `error`. A failed request for the same key may leave retained values, so their presence alone does not indicate the latest fetch succeeded. A changed key must not mix in old-scope data. The cache holds the current scope in store; it is not a multi-scope historical cache or persistent archive of actual effort.

<a id="実装検証制約"></a>

## Implementation, verification, and limitations

- [Controller](../../app/controllers/canvas_gantts_controller.rb), [actual aggregation](../../lib/redmine_canvas_gantt/actual_workload_builder.rb), [SPA store](../../spa/src/stores/WorkloadStore.ts), [calculation](../../spa/src/services/WorkloadLogicService.ts), [rendering](../../spa/src/components/workload/WorkloadCanvasPanel.tsx).
- [Actual API tests](../../spec/controllers/canvas_gantts_actual_workload_spec.rb), [calculation tests](../../spa/src/services/WorkloadLogicService.test.ts), [display tests](../../spa/src/components/workload/WorkloadCanvasPanel.test.tsx), [Redmine E2E](../../spa/tests/e2e-redmine/workload-pane.pw.ts).
- Actual effort is reaggregated under current visibility and query scope. It does not reconstruct historical memberships or permissions. Exceeding data budgets returns an error rather than unlimited results.
