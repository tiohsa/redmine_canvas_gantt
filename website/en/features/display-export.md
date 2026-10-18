# Display settings and export

## Adjust the view

Use the toolbar and display settings to adjust zoom, month/week/day view, row height, font size, sidebar width, and visible columns and their order. Drag column borders to resize them. Fullscreen is also available.

You can also toggle the progress line, task titles, hierarchy lines, date-only task markers, version headers, baseline visibility, and dependency-based sorting.

In the **Calculation & Performance** section of display settings, **Calculate critical path** controls calculation of the critical path and total slack. It is on by default. Turning it off clears critical-path and total-slack notifications; dependency-based automatic scheduling continues to work. This preference is stored with display settings and can be saved per project or for all projects in the current browser profile.

Preferences are stored in browser `localStorage`, not in a Redmine user record. You can apply them per project or across all projects in the same browser profile. “All projects” does not mean all Redmine users; anyone using the same profile will see those settings.

Clearing the browser's site data also removes saved display preferences.

Display settings also support tracker icon mapping through JSON from tracker IDs to icon kinds. Follow the help shown by the settings screen; do not enter unverified keys or values.

![Display settings.](/images/display-settings-en.png)

Display settings. [View full-size image](/images/display-settings-en.png)

To show or hide the **Progress Line**, select it in the toolbar. This line starts at today's position and connects one point per issue row: the point is placed on the task bar according to its progress percentage. Closed issues and future issues that have not started are placed at today's position. This is separate from the vertical today line.

### Issue dialog size (development feature)

In the development version, horizontal lines separate each settings group in the display settings panel.

Issue dialog size controls and the wider settings panel layout are development changes and are not included in release v0.18.0. In the development version, the settings panel uses a wider layout and adjusts its width on narrow screens. It provides Compact (900 px), Standard (1200 px, the default), and Wide (1500 px) widths, plus automatic or fixed height. Fixed height is 50% to 90% of the viewport in 5% steps and defaults to 80%. **Fill viewport** makes issue dialogs cover the current browser viewport. The width and height choices stay saved but are disabled while this option is on. Time-entry and query dialogs keep their normal sizing. Changes take effect immediately. Reset returns the width to 1200 px and height to automatic, turns off Fill viewport, and returns the fixed-height percentage to 80%.

These preferences follow the existing display preference scope: per project, or shared across projects in the same browser profile when that option is enabled. The selected width is capped to fit the viewport. The settings apply to issue display, edit, and creation dialogs, subtasks, and issue comment editing. Time-entry and query dialogs keep their existing sizing behavior.

## PNG and CSV

1. Show the timeline in the right pane. Export is unavailable while that pane is hidden.
2. Open **Export** in the toolbar.
3. Select **Export PNG** or **Export CSV**. PNG exports the current view; CSV exports the visible task data with hierarchy and dependency columns. Numeric task columns remain numeric.

To reduce formula execution risk in spreadsheets, exported untrusted text that begins with `=`, `+`, `-`, `@` (including full-width forms), a tab, or a line break may receive a leading tab inside a quoted cell. That tab becomes cell data and can affect programmatic imports. Verify the actual file in the target Excel / Calc version and import path where needed. The export cannot guarantee safety for every spreadsheet or import route.

For a spreadsheet check, create test issues with subject `=1+1`, parent subject `+1+1`, custom field name `＠SUM(1)`, and custom field value `  -1+1`. Include a value containing a quote, comma, and lone carriage return. Export CSV and inspect that dangerous text begins with a tab inside a quoted cell and embedded quotes are doubled. Open it in the target Excel or Calc version, confirm that values remain text and cells and rows stay intact, then save and reopen it to check again. Repeat for each supported import route. Automated serializer tests do not perform this spreadsheet check. The exporter also checks past leading spaces and BOM; a single-quote prefix is not used because Excel may remove it on save and reopen.

![Export menu.](/images/export-menu-en.png)

PNG and CSV export menu. [View full-size image](/images/export-menu-en.png)

### Export full PNG (development feature)

Full PNG export is under development and is not included in release v0.18.1.

Select **Export full PNG** from the Export menu to create a PNG of all rows in the current view, including rows outside the viewport, across the full date range beyond the visible area. It uses the current zoom and row height, preserves the current filters, sort order, and collapsed groups, and draws tasks, summaries, and enabled baseline dates. The image contains the chart area only; it excludes the sidebar and workload pane. Selection, hover, and the draft dependency line are also excluded. Image dimensions do not depend on monitor display scaling.

When enabled, task titles, version names, and bar date labels are included in the image's horizontal bounds. Long names widen the image instead of being truncated or scaled down.

The image must be no more than 8192 pixels on either side and no more than 16,777,216 pixels in total. The header and label widths count toward these limits. Export stops when a limit is exceeded. Reduce the zoom or row height, or filter the displayed rows, and try again.

## Display preferences versus shared query state

Display settings and filters are separate. See [Filters and saved queries](/en/features/filters) and [URL and query parameters](/en/features/query-parameters) for conditions that can be shared in a Redmine query or URL.
