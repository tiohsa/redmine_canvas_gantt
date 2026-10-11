# Deployment environments

## Docker Compose

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

For an existing production deployment, use a path visible to the Redmine process. A file that exists only on the host is unavailable unless the container mounts it.

## Updates and rollback

Before distributing an update, validate syntax and references against the [business-calendar formats and constraints](/en/administration/calendars). After rollout, check the resolved calendar in Gantt; that page also describes reload failure behavior.

For plugin installation and upgrade steps, see the [Installation guide](/en/guide/installation). Uninstalling the plugin does not remove an external calendar directory.

## Compatibility and operations

- Supported Redmine versions are 6.0, 6.1, and 7.0. Use a Ruby version supported by the selected Redmine release.
- Do not distribute different calendars to different workers.
- Display preferences belong to each user's browser profile; they are not shared by a server restart or container update.

See [Business calendars](/en/administration/calendars) for formats and limits, and [Troubleshooting](/en/troubleshooting/) for loading problems.
