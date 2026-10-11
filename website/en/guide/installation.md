# Installation and setup

These installation and upgrade steps are for administrators. Adjust paths and service names to match your Redmine deployment.

## Requirements

- Redmine 6.0, 6.1, or 7.0
- A Ruby version supported by the selected Redmine release
- Redmine REST API enabled
- A supported desktop browser
- Node.js 20 or newer only when building the SPA from source

## Install

1. Clone the plugin into Redmine's `plugins/` directory.

   ```sh
   cd /path/to/redmine/plugins
   git clone --branch v0.18.0 --depth 1 https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Restart the Redmine application server.
3. As an administrator, open **Administration → Settings → API** and enable the REST web service. The label may differ with Redmine's language.
4. In the project, open **Settings → Modules** and enable **Canvas Gantt**.
5. Under **Administration → Roles and permissions**, grant `view_canvas_gantt` to roles that may open the chart.
6. Open **Canvas Gantt** from the project menu.

No database migration is required. See [Permissions](/en/administration/permissions) for the standard permissions needed for issue actions. Grant `manage_canvas_gantt_baseline` to roles that may save a baseline.

## Upgrade

1. Back up the Redmine database and plugin directory.
2. Replace the plugin directory with the files from the release you are installing. If you need to build modified source, follow [Build from source](#build-from-source-only-when-needed) below before restarting.
3. Restart Redmine and verify the project module and role permissions.

There are no database migrations. Baselines stored in Redmine settings and display preferences in each browser are retained by an ordinary upgrade. The retired `edit_canvas_gantt` permission is not migrated automatically. Review existing roles and grant `manage_canvas_gantt_baseline` only where needed.

### Build from source (only when needed)

When using the prebuilt `assets/build/` included in the release, you do not need this step or Node.js / npm. Build with Node.js 20 or newer only if you modify the SPA source or install from source without prebuilt assets.

```sh
cd /path/to/redmine/plugins/redmine_canvas_gantt/spa
npm ci
npm run build
```

## Uninstall

Back up the Redmine database if you may need its baselines or plugin settings. Run the cleanup task while the plugin directory is still present. It deletes the `plugin_redmine_canvas_gantt` settings row, including baselines and plugin settings. It does not clear browser `localStorage`.

From the Redmine application directory containing `Gemfile`, run:

```sh
bundle exec rake redmine_canvas_gantt:uninstall RAILS_ENV=production
```

With Docker Compose, run inside the Redmine service:

```sh
docker compose exec -T redmine bundle exec rake redmine_canvas_gantt:uninstall
```

After cleanup, remove the plugin directory (or its container volume / bind mount) and restart Redmine. If Redmine only runs in Docker, do not run `bundle exec` from the host plugin directory; it does not contain Redmine's `Gemfile`.

## First launch checks

- The project has enabled the module.
- The user's role has `view_canvas_gantt`.
- The REST API is enabled.
- Issue visibility and edits match Redmine permissions.
- If the chart looks empty, check issue dates and filters.

See [Permissions](/en/administration/permissions), [Settings](/en/administration/settings), [Business calendars](/en/administration/calendars), and [Docker / Kubernetes deployment](/en/administration/deployment).
