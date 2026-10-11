# Plugin settings

## Redmine plugin settings page

Canvas Gantt does not currently provide a general settings page under **Administration → Plugins → Canvas Gantt → Configure**. Older manual text listing inline-edit fields and a default row height does not match the current implementation; do not use it as a configuration procedure. Display preferences, columns, row height, save mode, and relation defaults are managed in Canvas Gantt or in browser display preferences.

## Display preferences stored in the browser

Display preferences are stored in the browser profile's `localStorage`, not in Redmine user settings. You can choose a project-specific scope or a scope shared across projects in that same browser profile. “Across all projects” does not mean shared with all Redmine users. Another person using the same profile may see those preferences.

![English UI showing display settings in Canvas Gantt.](/images/display-settings-en.png)

English UI screenshot of the display settings used in the chart. [View full-size image](/images/display-settings-en.png)

Stored preferences include zoom, timeline position, progress line, task titles, hierarchy lines, date-only task markers, version headers, baseline visibility, column visibility and order, column widths, sidebar width, row height, font size, and dependency-based organization. Clearing the browser's site data also clears these preferences.

## Save mode and relation defaults

- With toolbar auto-save enabled, edits are sent to Redmine immediately. With it disabled, edits remain pending until you save. Both modes use the same conflict-resolution flow.
- The relation menu's default type, automatic delay calculation, automatic application of the default relation, and schedule move mode are stored in browser preferences.
- Visible columns and widths are also stored in the browser. A saved Redmine query or URL that specifies columns can affect the displayed columns.

## Server environment variables

Configure calendars and data response limits on the Redmine server:

| Environment variable | Purpose |
| --- | --- |
| `REDMINE_CANVAS_GANTT_CALENDAR_DIR` | Business-calendar directory. Default: `<Rails.root>/config/redmine_canvas_gantt/business_calendars` |
| `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` | Calendar change-check interval in seconds. Default: `60`; values must be non-negative |
| `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES` | Lower the issue limit for one data response |
| `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS` | Lower the relation limit for one data response |
| `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS` | Lower the auxiliary-collection limit |
| `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES` | Lower the JSON response-size limit in bytes |

Built-in response maxima are 10,000 issues, 50,000 relations, 10,000 items per auxiliary collection, and 25 MiB of JSON. Environment variables can lower these limits but cannot raise them. An oversized complete response returns HTTP 413 instead of truncated data.

::: warning Development setting
`CANVAS_GANTT_USE_VITE_DEV_SERVER=1` is for frontend development. Do not enable it in a normal production environment.
:::

## Where baselines are stored

Baselines are stored in Redmine's `Setting.plugin_redmine_canvas_gantt`. Each project has one snapshot, and saving another replaces the previous one. Calendar files and browser display preferences are not stored there. See [Permissions](/en/administration/permissions) for the roles that may view and save baselines.

See [Business calendars](/en/administration/calendars) for YAML and CSV formats, and [Deployment environments](/en/administration/deployment) for container configuration.
