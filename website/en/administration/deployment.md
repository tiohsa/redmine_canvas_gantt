# Deployment environments

## Docker Compose

### Repository quick start

The repository's `docker-compose.yml` starts Redmine 7.0.0 and MariaDB 11.4, with this checkout mounted as the plugin. It is for a disposable local evaluation environment. It publishes Redmine on port `3000` and uses known example database passwords and a known secret key. Do not expose this stack to a network or use it for production data. Use Docker Engine with Docker Compose v2, and make sure port `3000` is available.

Keep `RAILS_ENV=production` for this Compose setup. The official Redmine image does not include the `listen` gem required by its development environment.

Run the following commands from the plugin repository root.

### Start Redmine

```sh
docker compose up -d --wait
```

The default image is Redmine 7.0.0. To try a CI-tested compatibility image, set `REDMINE_IMAGE` when starting the stack:

```sh
REDMINE_IMAGE=redmine:6.1.2 docker compose up -d --wait
```

Use `redmine:6.0.6` for the Redmine 6.0 compatibility image. After the service is healthy, open `http://localhost:3000` in a browser.

### Initialize Redmine's default data

Run Redmine's standard default-data task, then load Redmine's standard test fixtures:

::: warning Use fixtures only with a fresh disposable database
The test fixture task can replace records for models it covers. Do not run it against production or any database containing data you need to keep.
:::

```sh
docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### Enable Canvas Gantt

In Redmine, enable the REST API under **Administration → Settings → API**, then open a project, go to **Settings → Modules**, and enable **Canvas Gantt**. Grant `view_canvas_gantt` to the roles that should open it. Redmine's regular project permissions continue to control issue actions; grant `manage_canvas_gantt_baseline` only to roles allowed to save baselines. See [Installation and setup](/en/guide/installation) and [Permissions](/en/administration/permissions).

### Stop the local stack

```sh
docker compose down
```

This removes the containers and network while keeping the named `db-data` volume, so the database remains for the next start. This quick start does not include production security, TLS, backup, or secret management.

### Mounting business calendars

Mount the calendar directory at a stable path inside the container and set `REDMINE_CANVAS_GANTT_CALENDAR_DIR` to that same path.

```yaml
services:
  redmine:
    environment:
      REDMINE_CANVAS_GANTT_CALENDAR_DIR: /etc/redmine/business_calendars
    volumes:
      - ./business_calendars:/etc/redmine/business_calendars
```

Place either the YAML configuration files or `holiday.csv` in the host's `./business_calendars` directory. The official Redmine Docker image changes ownership of its configuration directory at startup, so do not add `:ro` to this mount. After startup, the plugin treats calendar files as read-only.

1. Configure the Redmine service environment variable and mount.
2. Place the calendar files and check ownership and readability from inside the container.
3. Start or recreate the service.
4. Open Gantt and confirm holiday display and schedule behavior.

For an existing production deployment, use a path visible to the Redmine process. A file that exists only on the host is unavailable unless the container mounts it. Do not carry the repository quick start's example credentials or secret into a production deployment.

For Kubernetes, mount the same calendar files read-only, for example from one ConfigMap, at the configured path in every Redmine Pod and set `REDMINE_CANVAS_GANTT_CALENDAR_DIR` there. Each Puma worker and Pod keeps its own in-memory snapshot, so all workers must see identical files. ConfigMap changes are picked up at the next periodic reload check; there is no real-time push. Removing the plugin does not remove a ConfigMap or other external calendar directory.

## Updates and rollback

Before distributing an update, validate syntax and references against the [business-calendar formats and constraints](/en/administration/calendars). After rollout, check the resolved calendar in Gantt; that page also describes reload failure behavior.

For plugin installation and upgrade steps, see the [Installation guide](/en/guide/installation). Uninstalling the plugin does not remove an external calendar directory.

## Compatibility and operations

- Supported Redmine versions are 6.0, 6.1, and 7.0. Use a Ruby version supported by the selected Redmine release.
- Do not distribute different calendars to different workers.
- Display preferences belong to each user's browser profile; they are not shared by a server restart or container update.

See [Business calendars](/en/administration/calendars) for formats and limits, and [Troubleshooting](/en/troubleshooting/) for loading problems.
