# Permissions

Canvas Gantt access and issue actions are authorized separately. Grant only the required role permissions, and check the standard Redmine permissions on the project that owns each target issue.

## Canvas Gantt permissions

| Permission | Purpose |
| --- | --- |
| `view_canvas_gantt` | View Canvas Gantt in a project |
| `manage_canvas_gantt_baseline` | Save or replace a baseline |

Viewing a baseline comparison requires `view_canvas_gantt`. Saving a baseline requires `manage_canvas_gantt_baseline`. Each project has one baseline snapshot; saving another replaces it.

![English UI showing Canvas Gantt permission assignments.](/images/permissions-en.png)

English UI. [View full-size image](/images/permissions-en.png)

If a role used the retired `edit_canvas_gantt` permission, it is not migrated automatically. Reassign `manage_canvas_gantt_baseline` only to roles that should continue saving baselines. Canvas Gantt permissions do not replace normal issue permissions.

## Standard Redmine permissions used for issue actions

| Action | Permission to check on the target issue's project |
| --- | --- |
| Edit issue fields or dates | `edit_issues` and Redmine's issue editability rules |
| Delete an issue | `delete_issues` |
| Create a child issue | `add_issues` and `manage_subtasks` |
| Create or change a relation | Editability of the related issues; cross-project actions also follow `cross_project_issue_relations` |

These checks use the project that owns the issue being changed, not only the project where Canvas Gantt was opened. Issues in other projects remain subject to Redmine visibility rules. Permission to open Canvas Gantt does not grant permission to view or edit issues.

## Recommended review steps

1. In **Administration → Roles and permissions**, grant `view_canvas_gantt` to roles that need chart access.
2. Grant `manage_canvas_gantt_baseline` only to roles allowed to save baselines.
3. Configure the standard project permissions for issue editing, deletion, and child creation as needed.
4. Confirm Canvas Gantt is enabled under the project's **Settings → Modules**.
5. Verify access with a test account in the target project and, if needed, for issues in another project.

Menu labels can vary with the Redmine language. Restricted issue and time-entry data follow Redmine's server-side visibility rules.

If a user has access but an action still fails, see [Troubleshooting](/en/troubleshooting/).
