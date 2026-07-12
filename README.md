<div align="center">

# Redmine Canvas Gantt

A fast, low-risk, Canvas-based Gantt chart plugin for Redmine 6.x.

## Why this plugin?

- Your Redmine Gantt becomes slow with many issues
- You want drag-and-drop scheduling inside Redmine
- You want to try a Gantt plugin without database migration
- You are using Redmine 6.x and need a modern maintained plugin

## Key benefits

- Fast Canvas rendering
- Drag, resize, dependency editing
- Inline issue editing
- No database migration
- Easy uninstall
- Redmine 6.x support

Listed on Redmine Plugins Directory:
https://www.redmine.org/plugins/redmine_canvas_gantt

[![License](https://img.shields.io/github/license/tiohsa/redmine_canvas_gantt)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tiohsa/redmine_canvas_gantt/ci.yml?branch=main&label=CI)](https://github.com/tiohsa/redmine_canvas_gantt/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tiohsa/redmine_canvas_gantt)](https://github.com/tiohsa/redmine_canvas_gantt/releases)
[![Redmine](https://img.shields.io/badge/Redmine-6.x-red)](#requirements)
[![Ruby](https://img.shields.io/badge/Ruby-3.x-cc342d)](#requirements)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#requirements)

[日本語 README](README_ja.md) · [Releases](https://github.com/tiohsa/redmine_canvas_gantt/releases) · [Issues](https://github.com/tiohsa/redmine_canvas_gantt/issues)

</div>

---

## Overview

Redmine Canvas Gantt renders the timeline on HTML5 Canvas while keeping the left task list editable. It is designed for projects where the default Redmine Gantt view becomes hard to read or slow to operate.

Baseline snapshots are stored in Redmine's plugin settings (`Setting.plugin_redmine_canvas_gantt`), not in browser storage and not in a separate table. Each project has one snapshot; saving a new snapshot replaces the previous one.

## Highlights

- Fast Canvas rendering with smooth scrolling and zooming
- Drag tasks to move them, resize date ranges, and create dependencies from task endpoints
- Dependency management with create, update, and delete operations
- Inline quick edit for subject, assignee, status, progress, due date, and custom fields
- Drag and drop in the sidebar to change parent-child relationships
- Bulk child task creation from multiple subject lines
- Baseline snapshots for visual comparison, saved for either the current filtered view or the whole project
- Saved queries, Redmine query editing, and round-tripping back to the issue list with supported filters
- Filters by subject text, project, assignee, status, and target version
- Grouping by project or assignee; target-version headers are a display toggle, not a grouping mode
- Workload pane, export to PNG or CSV, full screen mode, and toolbar controls for zoom, row height, and font size
- Display settings stored per project or shared across all projects in the same browser profile (not across Redmine users)
- Version headers, progress line, hierarchy lines, orphan date points, task titles, and dependency-based organization

## Demo

![Canvas Gantt Demo](./docs/demo.gif)

## Requirements

- Redmine 6.x
- Ruby 3.x
- Node.js 20+ only for building the SPA or running frontend development tools; Node.js is not required for normal Redmine operation when prebuilt assets are used
- REST API enabled in Redmine

### Supported browsers

Use a current desktop version of Chrome, Edge, Firefox, or Safari with HTML5 Canvas, ES modules, and `localStorage` enabled. Internet Explorer is not supported. Mobile browsers and embedded webviews are not part of the supported test matrix.

### Security and impact

- Database migration: none
- Added permissions: `view_canvas_gantt`, `edit_canvas_gantt`
- Uninstall: remove the plugin directory and restart Redmine. Redmine plugin settings, including stored baselines, and each user's browser `localStorage` are not automatically deleted; remove them separately if data removal is required.

## Installation

1. Clone the plugin into Redmine's `plugins/` directory.

   ```bash
   cd /path/to/redmine/plugins
   git clone https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Restart Redmine.

   Restart your application server after placing the plugin.

### Upgrade

1. Back up the Redmine database and the plugin directory.
2. Replace the plugin directory with the desired release (for example, update the Git checkout or extract the release over it).
3. If you build the SPA from source, run `cd spa && npm ci && npm run build` with Node.js 20+.
4. Restart Redmine and verify the plugin module and permissions.

This plugin does not provide database migrations. Existing baselines in Redmine settings and browser display preferences are retained unless you remove them explicitly.

## Usage

1. Enable the REST API.
   Go to **Administration** -> **Settings** -> **API** and enable **Enable REST web service**.

2. Enable the project module.
   Open **Project** -> **Settings** -> **Modules** and enable **Canvas Gantt**.

3. Grant permissions.
   In **Administration** -> **Roles and permissions**, grant `view_canvas_gantt` and `edit_canvas_gantt` as needed.

4. Open the chart.
   Click **Canvas Gantt** from the project menu.

5. Use the chart and toolbar.
   - Zoom with Ctrl/Cmd + mouse wheel or the toolbar controls.
   - Drag tasks to move them on the timeline.
   - Drag task edges to resize date ranges.
   - Drag from endpoint dots to create dependencies.
   - Open dependency editing to change the relation type, delay, or remove the relation.
   - Drag a sidebar row onto another task to make it a child issue.
   - Use bulk subtask creation to add multiple child issues at once.
   - Open the workload pane to review capacity and focus filters.
   - Use display settings to save and share UI preferences across projects.
   - Export the current view as PNG or CSV when the layout supports it.
   - Toggle full screen for more workspace when needed.

### Baseline snapshots

- Baseline is comparison-only. It is not used for scheduling or CPM calculations.
- Each project stores a single baseline snapshot, and saving a new one replaces the previous snapshot.
- The toolbar lets you save either the current filtered view or the whole project as the baseline scope.
- Baseline bars and diff popovers only render for tasks currently visible in the chart, even when the saved scope was the whole project.
- Viewing baseline comparison requires `view_canvas_gantt`. Saving a baseline requires `edit_canvas_gantt`.
- Baselines are stored in `Setting.plugin_redmine_canvas_gantt` in Redmine's settings area. They are not shared through the browser URL, and they are not removed automatically when the plugin directory is deleted.

### Workload, display settings, and export

- The workload pane can show daily capacity, peak and total workload, and filters for leaf issues, closed issues, and today-onward focus.
- Display settings are stored in the browser's `localStorage`, not on a Redmine user record. Project mode applies to that project; global mode applies across projects in that same browser profile. It does not change settings in other browser profiles, but anyone using the same browser profile will see them. Settings cover zoom level, view mode, chart position, progress line, task titles, hierarchy lines, orphan date points, version headers, baseline visibility, visible columns, column order, dependency-based organization, column widths, sidebar width, custom zoom scales, row height, and font size.
- The configuration screen also supports tracker icon mapping with a JSON object that maps tracker IDs to icon kinds.
- Auto save determines whether edits are committed immediately or kept pending until you save them manually.
- The help dialog documents the current toolbar actions and editing flows if you need a quick refresher in the UI.

## Shared views, filters, and query parameters

URL parameters and saved Redmine queries are the shareable contract for business conditions: status, assignee, project, target version, subproject visibility, grouping, sorting, and visible columns. The subject-text filter and workload focus filters are personal browser state and are not shared. The last resolved query is kept in `localStorage` only as a per-user fallback when a bare Canvas Gantt URL is opened.

Display settings are also browser-profile preferences, not Redmine user settings. “Shared across all projects” means all projects in the same browser profile, not all Redmine users. See [URL and query parameters](QUERY_PARAMETERS.md) for the complete parameter list, Redmine compatibility rules, precedence, and examples.

Canvas Gantt uses Redmine's standard issue list for creating and editing saved queries. The toolbar can open the current query in an iframe or a new tab, and **Open in Canvas Gantt** returns with supported URL state.

## Configuration

Canvas Gantt does not expose a plugin configuration screen. UI defaults are fixed in code, and baseline snapshots are stored internally in `Setting.plugin_redmine_canvas_gantt` without requiring a database migration. The setting is Redmine-wide storage; baseline access is still limited by the project permissions described above.

To use the Vite dev server during development, set `CANVAS_GANTT_USE_VITE_DEV_SERVER=1`.

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
