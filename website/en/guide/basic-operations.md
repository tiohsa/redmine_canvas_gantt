# Basic operations

Labels and control placement can vary by Redmine language and plugin version. This page covers actions described in the README and existing manual.

## Screen areas

![English UI day view of Canvas Gantt 0.18.0 on Redmine 7.0.0.stable, showing fictional issues and dependencies.](/images/canvas-gantt-overview-en.png)

This real application screenshot was captured on 2026-10-11 with Redmine 7.0.0.stable and Canvas Gantt 0.18.0. It uses fictional issue data and the English UI. [View full-size image](/images/canvas-gantt-overview-en.png)

The sidebar on the left lists issue rows and selected columns. The timeline on the right shows task bars and dependencies. The toolbar provides filters, display scale, zoom, fullscreen, and auto-save controls.


The left sidebar lists issues and selected columns. The right timeline shows task bars and dependencies. The toolbar at the top provides filters, display scales, and save settings.

## Select and navigate

1. Click an issue row in the sidebar or its task bar on the timeline.
2. Use the wheel or trackpad to navigate the timeline. A horizontal scrollbar is also available.
3. Switch between month, week, and day scales; use the Today control to move near the current date.
4. Adjust zoom from the toolbar or hold Ctrl / Cmd while scrolling with the mouse wheel.

Control positions may change between builds; check the in-app help dialog when using the screen for the first time.

## Change dates and duration

- Drag the task bar body to move its start and due dates together.
- Drag either edge to adjust one side of the date range.
- Date changes use the issue's project calendar and Redmine's permissions and validation. A date on a non-working day may be normalized: starts move forward and due dates move backward.

Date changes in a batch are saved atomically. If revisions conflict, the entire batch is cancelled and local drafts are retained. Follow the conflict panel to review and apply the resolution.

<video controls preload="metadata" playsinline poster="/images/schedule-edit-poster.png" src="/videos/schedule-edit.mp4" style="width:100%;height:auto" aria-label="English UI recording of moving and resizing a task bar to change its dates">Your browser cannot play this video. <a href="/videos/schedule-edit.mp4">Download the schedule editing video</a>.</video>

1. Drag the task bar body to move its date range.
2. Drag an edge to resize the range.

[Download the schedule editing video](/videos/schedule-edit.mp4)

## Edit a cell

1. Show the column you want from the column menu.
2. Double-click an editable cell other than Subject. Editors are available for assignee, status, progress, start date, due date, priority, category, estimated hours, project, tracker, target version, and custom fields.
3. Select or enter a value and confirm it. With auto-save on, the change is sent to the server; with auto-save off, it remains a draft.

Double-clicking the Subject cell does not start inline editing. Click the subject link to open issue details, or hover the row and click its pencil button to open Redmine's issue edit screen. 

Available edits depend on issue visibility, Redmine permissions, workflow, and edit metadata for that issue. There is no plugin settings screen for toggling individual fields.

![English UI showing inline editing in a date cell.](/images/date-cell-edit-en.png)

English UI screenshot of opening and changing an editable date cell. [View full-size image](/images/date-cell-edit-en.png)

## Save or discard unsaved changes

1. With auto-save off, edit a cell. The toolbar shows **Save** and **Cancel** while task changes are pending.
2. Select **Save** to commit pending changes.
3. Select **Cancel** to discard all unsaved task changes and reload server values. This is not a per-issue or per-field undo.

With auto-save on, changes are sent immediately, so **Cancel** is not shown. To reverse an already saved change, use Redmine's normal issue editing or history procedures. For a conflict or failed save, follow the displayed resolution flow. Automatic and manual saving use the same conflict-resolution process.

![English UI showing pending edits and manual Save and Cancel controls.](/images/pending-save-en.png)

English UI screenshot of pending changes with manual save enabled. [View full-size image](/images/pending-save-en.png)

## Columns, row height, and fullscreen

Use the column menu to show or hide fields. Drag column boundaries to resize them. Adjust row height, font size, and fullscreen from the toolbar or display settings. These preferences are saved in browser `localStorage`.

## Common checks

- Empty chart: check for issues with dates, filters, and the current timeline range.
- Edit not applied: check Redmine permissions and auto-save state.
- Dates adjusted: check the project business calendar and the date returned by the server.

See [Filters](/en/features/filters), [Dependencies](/en/features/dependencies), [Display settings and export](/en/features/display-export), and [Permissions](/en/administration/permissions).
