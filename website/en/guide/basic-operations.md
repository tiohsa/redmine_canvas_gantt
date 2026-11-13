# Basic operations

Canvas Gantt uses Redmine's display language. User-provided issue subjects, project names, and other data keep their original text.

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

With **Snap to working days** selected under **Manual scheduling**, non-working dates may move to the next working day for starts or the previous working day for due dates. To place tasks on non-working days, choose **Allow any calendar day** in [display settings](/en/features/display-export).

<video controls preload="metadata" playsinline poster="/images/schedule-edit-poster.png" src="/videos/schedule-edit.mp4" style="width:100%;height:auto" aria-label="moving and resizing a task bar to change its dates"></video>

### Move multiple issues together

1. Hold Ctrl / Cmd and click issue rows to add or remove them from the selection. Hold Shift and click to select the range from the previous selection anchor to that row.
2. Release the modifier key, then drag the body of a selected task bar.
3. Release at the destination to confirm the dates. With auto-save off, select **Save** in the toolbar to apply them.

Only selected rows currently visible in the chart are included. Parents are excluded from the move, so select the child issues you want to move. You can drag a selected parent bar to move the selected eligible issues, but unselected descendants are not added. A parent-only selection cannot move.

The entire move is stopped if a selected visible non-parent issue is not editable, has dates derived from children, or has neither a start nor a due date. Dragging a selection that cannot move preserves its dates and multiple selection.

Clicking the body of a selected bar without modifier keys and releasing without moving selects only that issue. This also works when the selection contains issues that cannot move or consists only of parents. Right-clicking an issue selects only that issue and opens its menu; right-clicking blank chart or sidebar space clears a multiple selection.

### Movement and calendars

Both single and group bar moves in working-day mode convert the movement into a working-day count using the grabbed issue. The same count is applied to every selected issue using its project calendar, preserving working-day duration. Dates aligned under the same calendar remain aligned; different project calendars may produce different dates. In calendar-day mode, dates move by the same number of calendar days. Issues with only a start or due date move only that date.

### Canceling and saving a move

With automatic scheduling enabled, a move that introduces or worsens a dependency violation may be rejected. If the final drag position is invalid, the entire drag is canceled. Pressing Escape or moving focus away from the window also cancels a drag in progress.

A save requested during a drag waits until the drag finishes or is canceled; canceling the drag does not undo changes already saved. If a grouped schedule save is rejected because of permissions or invalid input, unconfirmed changes belonging to that drag are rolled back; separate issue edits are not part of the same transaction. For conflicts or unconfirmed save results, follow the [save-conflict resolution steps](/en/troubleshooting/#a-save-conflict-appears).

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

::: info Dependency drafts
Canvas Gantt also includes pending dependency changes in **Save** and **Cancel**. These actions appear as icon-only buttons; the **Save** tooltip shows separate task and dependency counts. See [Dependencies](/en/features/dependencies#manual-save) for how these changes are staged and for cases that cannot be saved together.
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
