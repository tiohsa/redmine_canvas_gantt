# Filters and saved queries

Filters narrow the chart to the issues you need. Shareable conditions can be saved in a Redmine query or URL. Some conditions exist only in browser state, so check what will travel with a shared link.

## Canvas Gantt filters

Filter by subject text, project, tracker, target version, assignee, and status. Assignee filtering includes unassigned issues; target-version filtering includes issues with no version. Use the toolbar search field or the relevant filter menu.

Subject text and workload focus filters are personal browser state and are not part of the shared query URL or saved query.

![English UI showing the status filter menu.](/images/status-filter-en.png)

English UI screenshot of filtering the chart by status. [View full-size image](/images/status-filter-en.png)

## Redmine saved queries

Canvas Gantt uses Redmine's issue list to create and edit saved queries. The toolbar can open a query in an iframe or a new tab, then return to Canvas Gantt with supported conditions.

The `query_id` URL parameter loads a visible saved query as the base condition. Explicit Canvas or Redmine URL filters override the matching fields from that query.

## Grouping

Canvas Gantt groups by project or assignee. Target-version headers are a display toggle, not a third grouping mode. Expand or collapse a group from its header.

## Shared and personal state

| State | How it is shared |
| --- | --- |
| Status, assignee, project, tracker, target version, subproject visibility | Saved query or URL |
| `query_id`, grouping, sorting, visible columns | Saved query or URL |
| Subject text and workload focus | Personal browser state |
| Zoom, viewport, row height, sidebar width, and similar preferences | Browser display settings |

“Shared across all projects” means the same browser profile. It does not share settings with other Redmine users or other browser profiles. Anyone using that profile sees the same settings. See [URL and query parameters](/en/features/query-parameters) for details.
