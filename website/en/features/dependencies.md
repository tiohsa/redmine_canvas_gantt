# Dependencies

Dependencies appear as lines between issues on the timeline. `precedes` / `follows` are used as scheduling constraints; reference-only `relates` and blocking relations have different behavior.

## Manual save in the development version {#manual-save}

In the documented v0.18.0 release, creating, editing, or deleting a dependency sends the change to Redmine immediately, even when task auto-save is off. The development version changes this when **Auto save** is off:

- Create, edit, and delete operations stay as local drafts. The relation editor's primary action is **Keep changes pending**; it stages the edit without sending an API request. This also applies when **Auto apply default relation** is on.
- Staged dependencies are shown as pending in the editor, and new or updated links use a dashed line.
- Staged precedence relations also take part in local constraint checks, linked moves, and critical-path calculations according to the current scheduling settings. Relations staged for deletion are excluded from these local calculations.
- Compact icon-only **Save** and **Cancel** buttons appear for task drafts, dependency drafts, or both. The **Save** tooltip shows separate task and dependency counts. A review alert opens the right-side panel for failed or unknown dependency saves. **Cancel** discards the unsaved task and dependency drafts together.
- With **Auto save** on, dependency changes continue to be sent immediately.

In manual save mode, definitive rejections such as permission errors, missing targets, conflicts, or validation errors leave the dependency draft marked as **Failed**. Review the server's error message, make any necessary corrections, and retry.

The combined save is a sequence of server requests, not one database transaction. Canvas Gantt saves task changes first and stops before dependency writes if any task save fails. It then refreshes and revalidates the dependencies before sending their changes. A task save or an earlier dependency request can complete while a later request fails. Completed work stays saved, while unresolved dependency changes stay pending. **Cancel** only discards those remaining drafts; it cannot undo changes already saved.

If a dependency request times out or returns an ambiguous server error, its result is marked **Unknown** and is never retried automatically. Use the toolbar's **Review dependencies** alert to open the right-side conflict and review panel. It lists unresolved dependency changes individually with their endpoints, status, and error, including deletions whose links are no longer shown. Before resolving an unknown result, Canvas Gantt refreshes the server relations and checks them against the intended change. Choose **Mark as applied** only when the server state matches; choose **Retry after review** only when it does not match and the original state is still current. Failed changes can also be retried from the panel with **Retry failed dependency saves**. This retry uses the combined save flow, so other pending task or dependency drafts may be included. If the refreshed state has changed in another way, or cannot be checked, leave the operation unresolved and review the dependency in Redmine. **Cancel** discards remaining drafts but cannot undo changes already saved.

For an unknown deletion, both endpoint issues must be included in the refreshed server data before absence of the relation can confirm deletion. If a filter excludes either issue, keep the change unresolved and adjust the filter to include both issues before checking again.

Some combined changes cannot be applied safely in this sequence. For example, if moving a successor earlier requires deleting or changing its existing predecessor relation first, the development version refuses the combined save before writing either change. Save the relation change first, then edit and save the dates. These development behaviors are not included in v0.18.0.

## Create a dependency

1. Drag from a dependency handle near either end of the predecessor task bar.
2. Drop near the successor issue's task bar.
3. If **Auto apply default relation** is off, an editor popover opens. Choose a relation type and any required delay, then select **Save**. If it is on, the relation is created using the default type selected in toolbar settings.

The editor offers three types:

- **Precedes**: the predecessor issue must finish before the successor starts. This is the only type with a delay field; delay is a non-negative number of working days.
- **Relates**: a reference link with no scheduling constraint.
- **Blocks**: one issue blocks the other.

When the stored relation is the reverse type `follows` or `blocked`, the editor reverses the displayed issue order. The scheduler uses `precedes` / `follows` for start-date constraints.

<video controls preload="metadata" playsinline poster="/images/dependency-create-poster.png" src="/videos/dependency-create.mp4" style="width:100%;height:auto" aria-label="creating an issue dependency"></video>

## Default type and delay

Use toolbar relation settings to choose the default type, automatic delay calculation, and automatic application. Auto delay uses the predecessor's due date (or start date when no due date exists) and the successor's start date, with the successor issue's project calendar. If dates are missing, the UI reports that it cannot calculate the delay.

## Edit or remove a relation

1. Click a dependency line on the timeline.
2. Change the type or delay in the editor popover, then select **Save**.
3. Select **Delete** in the popover to remove the relation. You can also right-click an issue and remove a relation from the list of related relations.

Duplicates, cycles, permissions, and date consistency can prevent a save. Editing requires visibility and permission for the related issues. Cross-project relations follow Redmine's `cross_project_issue_relations` setting.

![Dependency relation editor.](/images/relation-editor-en.png)

Dependency editor. [View full-size image](/images/relation-editor-en.png)

## Scheduling behavior

Automatic scheduling and dependency validation use the issue's project calendar. The successor issue's calendar is used for minimum-start checks. See [Business calendars](/en/administration/calendars) for calendar setup.

The toolbar's **Organize by dependencies** option changes display order; it does not create or remove relations.
