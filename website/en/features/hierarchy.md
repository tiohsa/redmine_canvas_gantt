# Issue hierarchy and bulk child creation

Parent-child relationships are the Redmine issue hierarchy. You can move rows in the sidebar or create multiple child issues from Redmine's child issue form.

**Development version (not yet released):** Redmine's derived parent dates are server-managed. Child schedule edits update the parent through Redmine's callbacks; the client preview may use only the loaded children, while the saved schedule and refreshed parent dates come from Redmine. Direct date edits on a derived parent are rejected; other editable fields remain available. Canvas Gantt 0.18.0 does not include this fix.

Dependency-driven changes involving a derived parent are also calculated by Redmine when saving. The preview may therefore differ from the saved schedule, especially when some children are excluded by the query. Parents with manually configured dates keep their existing scheduling behavior.

## Change a parent-child relationship

1. Drag the issue row that should become a child.
2. Drop it on the issue that should become its parent.
3. Confirm the row now appears under that parent.

To detach an issue, right-click its row in the sidebar and choose **Remove Parent**. Invalid moves, such as making an issue its own descendant, are rejected. Redmine's standard permissions for the issues apply.

## Create multiple child issues

1. Right-click the parent issue in the sidebar or on its task bar.
2. Choose **Add Child Task** to open Redmine's new child issue form.
3. Expand **Bulk Ticket Creation** below the form. Text input is selected by default; enter one subject per line.
4. To use one tracker for all entries, choose it from the tracker menu above the text box. Switch to **Table input** to choose a subject and tracker per row. You can add or remove rows.
5. Select **Create**. Blank rows are skipped.

Created issues inherit the parent project's project, tracker, status, priority, and assignee. A tracker selected in the table must be enabled in the parent project's tracker list. The UI has no configured maximum row count. If creation permission or Redmine validation causes any row to fail, the server rolls back the whole batch. Correct the error and submit again.

![Bulk child issue form.](/images/bulk-subtasks-en.png)

Bulk child issue form. [View full-size image](/images/bulk-subtasks-en.png)

## Notes

Bulk creation accepts subjects and optional tracker choices; it does not let you set dates or other fields per row. Edit those fields from Redmine after creation. Parent visibility and `add_issues` / `manage_subtasks` permissions also apply.
