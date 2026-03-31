<div align="center">

# Redmine Canvas Gantt

High-performance Canvas-based Gantt chart plugin for Redmine.

Listed on Redmine Plugins Directory:
https://www.redmine.org/plugins/redmine_canvas_gantt

[![License](https://img.shields.io/github/license/tiohsa/redmine_canvas_gantt)](LICENSE)
[![Redmine](https://img.shields.io/badge/Redmine-6.x-red)](#requirements)
[![Ruby](https://img.shields.io/badge/Ruby-3.x-cc342d)](#requirements)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#requirements)

[日本語 README](README_ja.md) · [Issues](https://github.com/tiohsa/redmine_canvas_gantt/issues)

</div>

---

## Overview

Redmine Canvas Gantt provides a fast, interactive Gantt chart for Redmine by rendering the timeline on HTML5 Canvas while keeping the left sidebar editable. It is intended for projects where the default Redmine Gantt becomes hard to read or slow to operate.

## Features

- High-performance timeline rendering with smooth scrolling and zooming
- Drag to move tasks, resize date ranges, and create dependencies from task endpoints
- Dependency management with create, update, and remove operations
- Inline quick edit for subject, assignee, status, progress, due date, and custom fields
- Drag and drop to change parent-child relationships in the sidebar
- Bulk subtask creation from multiple subject lines
- Filters and grouping by project, assignee, status, version, and subject text
- Version headers, progress line, row height presets, and persistent UI preferences

## Demo

![Canvas Gantt Demo](./docs/demo.gif)

![Canvas Gantt Demo](./docs/demo2.gif)

## Requirements

- Redmine 6.x
- Ruby 3.x
- Node.js 20+ for SPA build and frontend development
- REST API enabled in Redmine

### Security and impact

- Database migration: none
- Added permissions: `view_canvas_gantt`, `edit_canvas_gantt`
- Uninstall: remove the plugin directory and restart Redmine

## Installation

1. Clone the plugin into Redmine's `plugins/` directory.

   ```bash
   cd /path/to/redmine/plugins
   git clone https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Restart Redmine.

   Restart your application server after placing the plugin.

## Usage

1. Enable the REST API.
   Go to **Administration** -> **Settings** -> **API** and enable **Enable REST web service**.

2. Enable the project module.
   Open **Project** -> **Settings** -> **Modules** and enable **Canvas Gantt**.

3. Grant permissions.
   In **Administration** -> **Roles and permissions**, grant `view_canvas_gantt` and `edit_canvas_gantt` as needed.

4. Open the chart.
   Click **Canvas Gantt** from the project menu.

5. Interact with tasks.
   - Zoom with Ctrl/Cmd + mouse wheel or toolbar controls.
   - Drag tasks to move them on the timeline.
   - Drag task edges to resize date ranges.
   - Drag from endpoint dots to create dependencies.
   - Open dependency editing to adjust relation type or delay, or remove the relation.
   - Drag a sidebar row onto another task to make it a child issue.
   - Use bulk subtask creation to add multiple child issues at once.

## Shared Views and Query Parameters

Canvas Gantt separates shared business conditions from personal UI preferences.

- Shared business conditions are resolved from the URL and optional `query_id`
- Personal UI state such as zoom, viewport, sidebar width, and visible columns stays in `localStorage`
- Shared query conditions do not fall back to `localStorage`
- When the same shared condition is provided by multiple sources, the precedence is:
  URL parameters -> saved query (`query_id`) -> defaults

### Query editing flow

Canvas Gantt does not reimplement Redmine's query editor. Query creation, editing, and saving are done in the standard Redmine issue list, and Canvas Gantt consumes both saved queries and the supported subset of Redmine issue-list URL parameters.

- Use **Edit Query in Redmine** in the Canvas Gantt toolbar to open the standard issue list for the current project
- Adjust filters in the Redmine issue list and save the query with Redmine's built-in **Save** action
- After the query is saved, use **Open in Canvas Gantt** in the issue list to return to Canvas Gantt with `query_id`
- If the query is not saved yet, Canvas Gantt does not receive a `query_id`, so the issue list shows a save notice instead of returning directly

`query_id` alone is enough only when the current view exactly matches the saved query. If Canvas Gantt adds extra shared filters on top of that saved query, the toolbar sends `query_id` plus standard Redmine filter parameters so the issue list can reproduce the same view as closely as possible.

### Supported shared parameters

- `query_id`: use an existing Redmine saved issue query as the base condition. Only persisted query ids are supported
- `status_ids[]`: filter by issue status ids
- `assigned_to_ids[]`: filter by assignee ids, use `none` for unassigned issues
- `project_ids[]`: narrow the visible projects inside the current project/subproject scope
- `fixed_version_ids[]`: filter by target version ids, use `none` for issues without a version
- `group_by`: `project` or `assigned_to`
- `sort`: frontend sort key plus direction, for example `subject:asc` or `startDate:desc`
- `show_subprojects`: `0` to hide subprojects, omit it or use `1` to include them

Canvas Gantt also reads the following Redmine-standard issue list parameters:

- `set_filter=1`
- `f[]`
- `op[field]`
- `v[field][]`
- `group_by`
- `sort`

Supported Redmine-standard fields:

- `status_id`
- `assigned_to_id`
- `project_id`
- `fixed_version_id`
- `subproject_id`

Supported Redmine-standard operators:

- `=`
- `*`
- `!*`
- `o`
- `c`

Current compatibility limits:

- Unsupported Redmine fields or operators are ignored and shown as warnings
- `assigned_to_id` with both specific assignees and unassigned issues cannot be represented exactly when exporting back to the Redmine issue list, so the unassigned part is omitted with a warning
- Issues without a target version are supported in Canvas-specific URLs via `fixed_version_ids[]=none`, but that case is omitted when exporting a Redmine-standard issue-list URL
- Default sort (`startDate:asc`) may be omitted when exporting a Redmine issue-list URL

### Example URLs

Use a saved Redmine query as the base view:

```text
/projects/demo/canvas_gantt?query_id=12
```

Override a saved query with explicit status and assignee filters:

```text
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&status_ids[]=2&assigned_to_ids[]=5
```

Open Canvas Gantt directly from a supported Redmine-standard issue-list URL:

```text
/projects/demo/canvas_gantt?query_id=12&set_filter=1&f[]=status_id&op[status_id]==&v[status_id][]=1&group_by=assigned_to&sort=start_date:desc
```

Open a shared project/version view without relying on browser storage:

```text
/projects/demo/canvas_gantt?project_ids[]=3&fixed_version_ids[]=7&group_by=project&sort=startDate:asc
```

Hide subprojects and show only unassigned issues:

```text
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```

## Configuration

Configure the plugin from **Administration** -> **Plugins** -> **Canvas Gantt** -> **Configure**.

- Inline edit toggles: `subject`, `assigned_to`, `status`, `done_ratio`, `due_date`, `custom_fields`
- `row_height`: default row height
- `use_vite_dev_server`: load frontend assets from `http://localhost:5173` during development

### Compatibility note

If `redmica_ui_extension` applies Select2 behavior that interferes with Canvas Gantt controls, open **Administration** -> **Plugins** -> **Redmica UI Extension** -> **Configure** and disable searchable select boxes.

## Docker Quick Start

This repository includes `docker-compose.yml` for running a local Redmine 6.0 + MariaDB environment.

### Start the stack

```bash
docker compose up -d --wait
```

Open Redmine at [http://localhost:3000](http://localhost:3000).

### Load initial data

```bash
docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### Enable Canvas Gantt in a project

1. Open the target project.
2. Go to **Settings** -> **Modules**.
3. Enable **Canvas Gantt**.
4. Ensure the active role has `view_canvas_gantt` and `edit_canvas_gantt` if editing is required.

### Stop the stack

```bash
docker compose down
```

## Development

The SPA frontend lives in `spa/`.

```bash
cd spa
npm ci
npm run build
npm run lint
npm run test -- --run
```

For live frontend development:

```bash
cd spa
npm run dev
```

Then enable `use_vite_dev_server` in the plugin settings.

### Redmine integration tests

Run Redmine-backed Playwright tests from `spa/`:

```bash
npx playwright test -c playwright.redmine.config.ts
```

## Build Output

- `npm run build` outputs the SPA to `assets/build/`
- On Redmine boot, the plugin links or copies those files into `public/plugin_assets/redmine_canvas_gantt/build`
- The fallback asset route is also available through `/plugin_assets/redmine_canvas_gantt/build/*`

## License

GNU General Public License v2.0 (GPL v2). See [LICENSE](LICENSE).
