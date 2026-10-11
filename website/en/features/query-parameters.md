# URL and query parameters

Canvas Gantt URLs and Redmine saved queries can share supported view conditions. Browser-only personal preferences are not included unless a parameter explicitly represents them.

## State precedence

Canvas Gantt resolves a view in this order:

1. Explicit URL parameters
2. The visible saved Redmine query identified by `query_id`
3. The last query state saved in `localStorage` for the current project and browser profile
4. Defaults

The saved query is the base condition. Explicit URL filters override matching fields.

## Canvas URL parameters

| Parameter | Meaning |
| --- | --- |
| `query_id` | Use a visible saved query as the base condition |
| `status_ids[]` | Status IDs |
| `assigned_to_ids[]` | Assignee IDs; use `none` for unassigned |
| `canvas_project_ids[]` | Explicitly selected project IDs; see Project scope below for visibility limits. `none` explicitly selects zero projects |
| `project_id` | Redmine issue-list filter input: use with `set_filter=1`, `f[]=project_id`, `op[project_id]`, and `v[project_id][]`. Use `canvas_project_ids[]` for Canvas project scope |
| `project_ids[]` | Backward-compatible input; Canvas Gantt does not generate it |
| `fixed_version_ids[]` | Target-version IDs; use `none` for no version |
| `tracker_ids[]` | Tracker IDs |
| `group_by` | `project`, `assigned_to`, or `none` |
| `sort` | Frontend key and direction, such as `subject:asc` |
| `c[]` | Visible columns; compatible with Redmine `c[]` |
| `show_subprojects` | `0` hides them; omitted or `1` shows them |

## Redmine issue-list compatibility

Supported parameters are `set_filter=1`, `f[]`, `op[field]`, `v[field][]`, `c[]`, `group_by`, and `sort`. Supported fields are `status_id`, `assigned_to_id`, `project_id`, `fixed_version_id`, `tracker_id`, and `subproject_id`. `tracker_id` supports `=` and `*`; Canvas URLs use `tracker_ids[]`.

| Field | Supported operators |
| --- | --- |
| `status_id` | `=`, `*`, `o`, `c` |
| `assigned_to_id` | `=`, `*`, `!*` |
| `project_id`, `fixed_version_id`, `tracker_id` | `=`, `*` |
| `subproject_id` | `*`, `!*` |

Unsupported fields and operators are ignored with a warning. A specific assignee combined with unassigned cannot be represented exactly when exported back to a standard Redmine URL, so the unassigned part is omitted. No-version is supported in Canvas URLs but omitted when exporting to Redmine. The default sort may also be omitted on export.

## State that is not shared

Subject text and workload focus filters are personal browser state. Zoom, viewport, row height, sidebar width, and font size are also browser display preferences tied to the same profile.

## Examples

```text
/projects/demo/canvas_gantt?query_id=12
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&assigned_to_ids[]=5
/projects/demo/canvas_gantt?canvas_project_ids[]=3&fixed_version_ids[]=7&group_by=project
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```

The projects, issues, and saved queries a user can open remain subject to Redmine visibility and permissions.

## Project scope

By default, project candidates remain within the opened project's tree. The **Member projects only** filter uses visible active projects where the user has direct or group membership; administrators get all visible active projects. Closed and archived projects are excluded.

Projects outside the opened tree do not contribute issues until explicitly selected in the Canvas project filter. Visible, editable issues in explicitly selected external projects support the same scheduling actions, subject to normal Redmine issue permissions. Relations across project trees also follow Redmine's `cross_project_issue_relations` setting.
