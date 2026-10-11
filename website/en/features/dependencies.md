# Dependencies

Dependencies appear as lines between issues on the timeline. `precedes` / `follows` are used as scheduling constraints; reference-only `relates` and blocking relations have different behavior.

## Create a dependency

1. Drag from a small dependency handle near either end of the predecessor task bar.
2. Drop near the successor issue's task bar.
3. If **Auto apply default relation** is off, an editor popover opens. Choose a relation type and any required delay, then select **Save**. If it is on, the relation is created using the default type selected in toolbar settings.

The editor offers three types:

- **Precedes**: the predecessor issue must finish before the successor starts. This is the only type with a delay field; delay is a non-negative number of working days.
- **Relates**: a reference link with no scheduling constraint.
- **Blocks**: one issue blocks the other.

When the stored relation is the reverse type `follows` or `blocked`, the editor reverses the displayed issue order. The scheduler uses `precedes` / `follows` for start-date constraints.

<video controls preload="metadata" playsinline poster="/images/dependency-create-poster.png" src="/videos/dependency-create.mp4" style="width:100%;height:auto" aria-label="English UI recording of creating an issue dependency">Your browser cannot play this video. <a href="/videos/dependency-create.mp4">Download the dependency creation video</a>.</video>

1. Drag from the predecessor task's dependency handle.
2. Drop on the successor task and save the relation in the editor.

[Download the dependency creation video](/videos/dependency-create.mp4)

## Default type and delay

Use toolbar relation settings to choose the default type, automatic delay calculation, and automatic application. Auto delay uses the predecessor's due date (or start date when no due date exists) and the successor's start date, with the successor issue's project calendar. If dates are missing, the UI reports that it cannot calculate the delay.

## Edit or remove a relation

1. Click a dependency line on the timeline.
2. Change the type or delay in the editor popover, then select **Save**.
3. Select **Delete** in the popover to remove the relation. You can also right-click an issue and remove a relation from the list of related relations.

Duplicates, cycles, permissions, and date consistency can prevent a save. Editing requires visibility and permission for the related issues. Cross-project relations follow Redmine's `cross_project_issue_relations` setting.

![English UI showing the dependency relation editor.](/images/relation-editor-en.png)

English UI screenshot of the relation type and delay editor. [View full-size image](/images/relation-editor-en.png)

## Scheduling behavior

Automatic scheduling and dependency validation use the issue's project calendar. The successor issue's calendar is used for minimum-start checks. See [Business calendars](/en/administration/calendars) for calendar setup.

The toolbar's **Organize by dependencies** option changes display order; it does not create or remove relations.
