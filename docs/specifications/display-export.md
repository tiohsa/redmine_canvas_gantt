<a id="表示設定とエクスポート仕様"></a>

# Display Settings and Export

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (2026-11-13, code 0.20.0). This document records that development implementation; see the specification index for the public manual's current target.

<a id="表示と既定値"></a>

## Display and defaults

The list/chart layout supports standard display, maximized list, and maximized chart; both panes cannot be hidden together. Users can change zoom, day/week/month scale, row height, font, column visibility/order/width, sidebar width, and issue-dialog dimensions. Initial display is weekly, zoom 1, font 13, sidebar width 400, and row height 36 from the controller's fixed `row_height` when no browser preference exists. Row-height options are 20, 28, 36, 44, and 52; font options are 11, 13, and 15 px. Current `row_height` is not an administrator-configurable value. See [permissions and settings](permissions-settings.md) for fixed settings and permission details.

Without stored values, progress lines, bar dates, and baselines are off; task names, hierarchy lines, and markers for tasks with only one date are on. Start-only and due-only markers can be toggled independently. Critical-path calculation is enabled by default; disabling it stops its calculations/notifications, independently of automatic dependency scheduling. Versions, dependency ordering, columns, tracker icons, and other display options are also configurable.

Issue-dialog widths are 900 / 1200 / 1500 px, default 1200 px. Height is automatic or a fixed percentage, default automatic with an initial fixed value of 80%. Fullscreen defaults to off. Dimensions are constrained to the viewport. These preferences apply to issue viewing/editing/creation and similar dialogs, excluding time-entry and query dialogs.

<a id="保存範囲と優先順位"></a>

## Storage scope and precedence

[preferences.ts](../../spa/src/utils/preferences.ts) stores display preferences in the `canvasGantt:preferences` localStorage envelope. Both per-project and shared cross-project display preferences exist. Enabling shared preferences uses that set; switching saves current display preferences to the selected destination. “Shared” means within the same browser profile, not Redmine user settings or distribution to other users/devices. Clearing site data removes them.

Display preferences cover zoom/viewport, display flags, visible columns and widths, row height/font, dialog dimensions, dependency ordering, auto-save, critical paths, and similar options. General relation/date-placement preferences are stored separately within the same envelope. Query-specified columns apply in query context, separately from ordinary display preferences. Sharing filters follows Redmine query/URL contracts, not these browser-local settings.

Stored values are validated and normalized when read. [preferencesWatcher.ts](../../spa/src/stores/preferencesWatcher.ts) watches changes. Enabling auto-save follows the existing transition that saves pending changes first; a failure does not complete that transition.

<a id="出力"></a>

## Export

When the chart pane is visible, the toolbar offers current-view PNG, full PNG, and CSV, generated and downloaded in the browser.

| Format | Scope and limits |
| --- | --- |
| PNG | Composites current chart headers, background, baselines, tasks, and overlays. Dimensions use logical pixels, not screen device pixel ratio. |
| Full PNG | All displayed rows and date range according to current filters, order, collapse state, zoom, and row height. Includes visible labels/baselines; excludes sidebar, workload, selection, and hover. Fails beyond 8192 px per side or 16,777,216 total pixels. |
| CSV | Exports displayed tasks, hierarchy, predecessor/successor information, and custom fields. Dates use date-only format; numbers are exported as numbers. |

Fixed CSV columns cover ID, subject, parent ID/subject, hierarchy, child presence, project, tracker, status, assignee, start/due dates, progress, priority, author, category, estimated/spent hours, version, predecessors, and successors, followed by custom-field columns. Relations referencing targets outside the export scope use the relation type.

Text starting with characters that could be interpreted as spreadsheet formulas gets a tab inside the quoted cell. This modifies exported data and does not guarantee safety in every spreadsheet application or import path. Quotes, commas, and newlines are also CSV-escaped.

<a id="実装と確認先"></a>

## Implementation and verification references

- [Display UI](../../spa/src/components/DisplaySettingsControls.tsx), [UIStore](../../spa/src/stores/UIStore.ts), [TaskStore](../../spa/src/stores/TaskStore.ts), [preference tests](../../spa/src/utils/preferences.test.ts)
- [Current PNG](../../spa/src/export/png.ts), [full PNG](../../spa/src/export/fullPng.ts), [CSV](../../spa/src/export/csv.ts), [CSV tests](../../spa/src/export/csv.test.ts), [full PNG tests](../../spa/src/export/fullPng.test.ts)
- [Display E2E](../../spa/tests/e2e/gantt-display.pw.ts), [export E2E](../../spa/tests/e2e/gantt-export.pw.ts), [public manual](../../website/ja/features/display-export.md)
- These references provide supporting evidence; they do not mean those tests were run during this update.
