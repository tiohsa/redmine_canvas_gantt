# Basic operations

Canvas Gantt uses Redmine's display language. User-provided issue subjects, project names, and other data keep their original text.

::: info Unreleased correction
The development version corrects missing translations in controls, tooltips, accessibility labels, and related error messages in Japanese and English. This correction is not yet included in the documented release.
:::

## Screen areas

![Day view of Canvas Gantt 0.18.1 on Redmine 7.0.0.stable, showing issues and dependencies.](/images/canvas-gantt-overview-en.png)

[View full-size image](/images/canvas-gantt-overview-en.png)

The sidebar on the left lists issue rows and selected columns. The timeline on the right shows task bars and dependencies. The toolbar provides filters, display scale, zoom, fullscreen, and auto-save controls.

## Select and navigate

1. Click an issue row in the sidebar or its task bar on the timeline.
2. Use the wheel or trackpad to navigate the timeline. A horizontal scrollbar is also available.
3. Switch between month, week, and day scales; use the Today control to move near the current date.
4. Adjust zoom from the toolbar or hold Ctrl / Cmd while scrolling with the mouse wheel.

See the in-app help for other controls and keyboard shortcuts.

## Change dates and duration

- Drag the task bar body to move its start and due dates together.
- Drag either edge to adjust one side of the date range.

Selecting a non-working day may adjust the date according to the issue's project calendar: start dates move to the next working day and due dates to the previous working day.

<video controls preload="metadata" playsinline poster="/images/schedule-edit-poster.png" src="/videos/schedule-edit.mp4" style="width:100%;height:auto" aria-label="moving and resizing a task bar to change its dates"></video>

## Edit a cell

1. Show the column you want from the column menu.
2. Double-click an editable cell other than Subject. Editors are available for assignee, status, progress, start date, due date, priority, category, estimated hours, project, tracker, target version, and custom fields.
3. Select or enter a value and confirm it. With auto-save on, the change is sent to the server; with auto-save off, it remains a draft.

Double-clicking the Subject cell does not start inline editing. Click the subject link to open issue details, or hover the row and click its pencil button to open Redmine's issue edit screen. 

Available edits depend on the issue's Redmine permissions and workflow. See [Permissions](/en/administration/permissions).

![Inline editing in a date cell.](/images/date-cell-edit-en.png)

[View full-size image](/images/date-cell-edit-en.png)

## Save or discard unsaved changes

1. With auto-save off, edit a cell. The toolbar shows **Save** and **Cancel** while task changes are pending.
2. Select **Save** to commit pending changes.
3. Select **Cancel** to discard all unsaved task changes and reload server values. This is not a per-issue or per-field undo.

::: info Development version: dependency drafts
The development version also includes pending dependency changes in **Save** and **Cancel**. These actions appear as icon-only buttons; the **Save** tooltip shows separate task and dependency counts. See [Dependencies](/en/features/dependencies#manual-save) for how these changes are staged and for cases that cannot be saved together. This behavior is not part of the documented v0.18.0 release.
:::

With auto-save on, changes are sent immediately, so **Cancel** is not shown. To reverse a saved change, edit the values in Redmine's issue edit screen.

If a grouped date update conflicts, the whole change group remains unsaved and drafts are retained. Both automatic and manual saving use the [save-conflict resolution steps](/en/troubleshooting/#a-save-conflict-appears).

![Pending edits and manual Save and Cancel controls.](/images/pending-save-en.png)

[View full-size image](/images/pending-save-en.png)

## Columns, row height, and fullscreen

Use the column menu to show or hide fields and drag column boundaries to resize them. See [Display settings and export](/en/features/display-export) for row height, font size, fullscreen, and the scope of saved preferences.

## Common checks

- Empty chart: check for issues with dates, filters, and the current timeline range.
- Edit not applied: check Redmine permissions and auto-save state.
- Dates adjusted: check the project business calendar and the date returned by the server.

See [Filters](/en/features/filters), [Dependencies](/en/features/dependencies), [Display settings and export](/en/features/display-export), and [Permissions](/en/administration/permissions).
