# Display settings and export

## Adjust the view

Toolbar and display settings cover zoom, month/week/day view, row height, font size, sidebar width, visible columns and their order, progress line, task titles, hierarchy lines, version headers, baseline visibility, and dependency-based organization. Drag column borders to resize them. Fullscreen is also available.

Preferences are stored in browser `localStorage`, not in a Redmine user record. You can apply them per project or across all projects in the same browser profile. “All projects” does not mean all Redmine users; anyone using the same profile will see those settings.

Display settings also support tracker icon mapping through JSON from tracker IDs to icon kinds. Follow the help shown by the settings screen; do not enter unverified keys or values.

![English UI showing display settings.](/images/display-settings-en.png)

English UI screenshot of display preferences. [View full-size image](/images/display-settings-en.png)

To show or hide the **Progress Line**, select it in the toolbar. This line starts at today's position and connects one point per issue row: the point is placed on the task bar according to its progress percentage. Closed issues and future issues that have not started are placed at today's position. This is separate from the vertical today line. Change other preferences from the toolbar or display settings menu. Changes are saved in the browser.

## PNG and CSV

1. Show the timeline in the right pane. Export is unavailable while that pane is hidden.
2. Open **Export** in the toolbar.
3. Select **Export PNG** or **Export CSV**. PNG exports the current view; CSV is intended for spreadsheet applications. Numeric task columns remain numeric.

To reduce formula execution risk in spreadsheets, exported untrusted text that begins with `=`, `+`, `-`, `@` (including full-width forms), a tab, or a line break may receive a leading tab inside a quoted cell. That tab becomes cell data and can affect programmatic imports. Verify the actual file in the target Excel / Calc version and import path where needed. The export cannot guarantee safety for every spreadsheet or import route.

![English UI showing the export menu.](/images/export-menu-en.png)

English UI screenshot of the PNG and CSV export choices. [View full-size image](/images/export-menu-en.png)

## Display preferences versus shared query state

Display settings and filters are separate. See [Filters and saved queries](/en/features/filters) and [URL and query parameters](/en/features/query-parameters) for conditions that can be shared in a Redmine query or URL.
