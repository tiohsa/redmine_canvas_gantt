# Plugin settings

## Redmine plugin settings page

Canvas Gantt does not have a general settings page. Configure display, columns, row height, and save mode in Gantt. See [Display and export](/en/features/display-export) for details.

## Display preferences stored in the browser

Display preferences are stored in the browser's `localStorage`, not in Redmine user settings. See [Display and export](/en/features/display-export) for scope and preference details.

## Save mode and relation defaults

The toolbar's auto-save control sends edits to Redmine immediately when enabled; when disabled, changes remain pending until you select **Save**. See [Save or discard unsaved changes](/en/guide/basic-operations#save-or-discard-unsaved-changes) for the save steps.

The relation settings menu controls the default relation type, automatic delay calculation, automatic application, and schedule move mode. Auto-save and relation settings are stored in the browser's `localStorage`. See [Default type and delay](/en/features/dependencies#default-type-and-delay) for relation defaults and delay behavior.

## Server environment variables

Configure business calendars and data response limits in the Redmine server environment:

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

Baselines are stored in Redmine's `Setting.plugin_redmine_canvas_gantt`. Each project has one snapshot, and saving another replaces it. See [Permissions](/en/administration/permissions) for the roles that may view and save baselines.

See [Business calendars](/en/administration/calendars) for YAML and CSV formats, and [Deployment environments](/en/administration/deployment) for container configuration.
