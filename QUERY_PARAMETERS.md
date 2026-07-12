# Canvas Gantt URL and query parameters

This document describes the URL contract used to share a Canvas Gantt view. A
URL or a saved Redmine query can be sent to another user; browser-local
preferences are not included unless they are explicitly represented by query
parameters.

## State precedence

Canvas Gantt resolves the view in this order:

1. Explicit URL parameters
2. The saved Redmine query identified by `query_id`
3. The last resolved query state stored in `localStorage` for the current
   project and browser profile (personal fallback only)
4. Defaults

The saved query is the base condition. Explicit Canvas or Redmine URL filters
override the corresponding fields from that query.

## Shareable query state

The following conditions are shareable when present in a URL or saved query:

- Status, assignee, project, target-version, and subproject filters
- `query_id`
- Grouping, sorting, and visible columns
- Whether subprojects are shown

The Canvas toolbar's subject-text filter and workload focus filters are
personal browser state. They are not written into the shareable query URL.
Display preferences such as zoom, viewport, row height, sidebar width, and
font size are also personal browser preferences. They can be saved per project
or enabled as a global display preference, but “global” means all projects in
the same browser profile—not all Redmine users. The setting is not tied to a
Redmine user record; anyone using that browser profile will see it.

## Filterable and groupable items

Filterable in Canvas Gantt:

- Subject text (personal, local only)
- Status
- Assignee, including unassigned
- Project
- Target version, including no version
- Redmine saved-query fields supported by the compatibility table below

Groupable in Canvas Gantt:

- Project
- Assignee

Target-version headers are a display toggle, not a third grouping mode.

## Canvas parameters

| Parameter | Description |
| :--- | :--- |
| `query_id` | Use a visible saved Redmine issue query as the base condition |
| `status_ids[]` | Filter by status IDs |
| `assigned_to_ids[]` | Filter by assignee IDs; use `none` for unassigned |
| `canvas_project_ids[]` | Select projects inside the current project/subproject scope; `none` explicitly selects zero projects |
| `project_id` | Redmine standard input, normalized to Canvas project scope |
| `project_ids[]` | Backward-compatible project-scope input; Canvas Gantt does not generate it |
| `fixed_version_ids[]` | Filter by target-version IDs; use `none` for no version |
| `group_by` | `project`, `assigned_to`, or `none` |
| `sort` | Frontend sort key and direction, for example `subject:asc` |
| `c[]` | Visible columns, compatible with Redmine's `c[]` |
| `show_subprojects` | `0` hides subprojects; omitted or `1` shows them |

## Redmine issue-list compatibility

Supported parameters are `set_filter=1`, `f[]`, `op[field]`, `v[field][]`,
`c[]`, `group_by`, and `sort`. Supported fields are `status_id`,
`assigned_to_id`, `project_id`, `fixed_version_id`, and `subproject_id`.

Supported operators are:

- `status_id`: `=`, `*`, `o`, `c`
- `assigned_to_id`: `=`, `*`, `!*`
- `project_id` and `fixed_version_id`: `=`, `*`
- `subproject_id`: `*`, `!*`

Unsupported fields and operators are ignored with a warning. A mixed
specific-assignee plus unassigned filter cannot be represented exactly when
exported back to a Redmine issue-list URL, so the unassigned part is omitted.
The no-version filter is supported in Canvas URLs but omitted when exporting
to a standard Redmine URL. The default sort may also be omitted on export.

## Examples

```text
/projects/demo/canvas_gantt?query_id=12
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&assigned_to_ids[]=5
/projects/demo/canvas_gantt?canvas_project_ids[]=3&fixed_version_ids[]=7&group_by=project
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```
