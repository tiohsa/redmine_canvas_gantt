# Troubleshooting

## The Canvas Gantt menu is missing

1. In the target project, confirm Canvas Gantt is enabled under **Settings → Modules**.
2. Confirm the user's role has `view_canvas_gantt`.
3. Confirm the user can view the target project.
4. Reload the page. After a fresh installation or upgrade, the Redmine process may need to restart.

## An issue cannot be edited, created, or deleted

Permission to view Canvas Gantt does not grant issue actions. On the project that owns the target issue, check `edit_issues` and issue editability for edits, `delete_issues` for deletion, and `add_issues` plus `manage_subtasks` for child creation. Saving a baseline separately requires `manage_canvas_gantt_baseline`. For cross-project actions, check visibility and permissions for each target issue.

## A date change is not saved

- If auto-save is off, use the save action after editing. Do not leave the page before saving pending changes.
- Check the target issue's edit permission, validation errors, and messages returned by Redmine.
- With a business calendar configured, selecting a non-working date can move the start date forward to the next working day and the due date backward to the previous working day.
- If the conflict panel lists issues, review the differences using the steps below.

## A save conflict appears

If another user or page updates an issue first, the whole date-change group is not applied and local drafts are retained. In the conflict panel, choose the server or local dates for each issue, then use **Apply this group** to validate and apply the complete operation, including its dependencies and hierarchy.

If a Redmine callback would adjust dates, review every affected issue and explicitly use **Accept adjusted dates and apply** to retry. If reviewed relations, delays, hierarchy, or calendars have changed, use **Refresh comparison and reselect**. A failed application preserves selections and drafts. Auto-save and manual save use the same resolution flow.

For a conflict caused by an outdated business-calendar revision, the page refreshes the latest calendar and retries once. If conflicts continue, reload the page to fetch current issues and calendars before editing again.

## A relation cannot be added

- Confirm the related issues are visible and editable. For cross-project relations, also check Redmine's `cross_project_issue_relations` setting.
- Relations that would create a cycle are rejected.
- Check date consistency for the predecessor relation and delay, using the successor project's business calendar.
- If calendar configuration is invalid, check the Redmine log and [Business calendars](/en/administration/calendars).

## Filter results do not match expectations

Review saved Redmine query and URL conditions such as status, assignee, project, version, tracker, and sorting, then clear conditions that should not apply. Subject text and workload focus filters are personal browser state; they are not part of a shared URL or saved query in the same way. Issues outside the project tree may require explicit project selection.

## The chart is blank, distorted, or stale

- Clear filters and use **Today** or zoom controls to return to a useful timeline position.
- Check that you are using a current supported desktop version of Chrome, Edge, Firefox, or Safari, with JavaScript and `localStorage` enabled. Mobile browsers and embedded webviews are outside the tested support matrix.
- Check that `CANVAS_GANTT_USE_VITE_DEV_SERVER=1` is not set on production Redmine. When enabled for development, the Vite dev server must also be running.
- Check failed data requests in the browser's developer tools. An oversized complete data response returns HTTP 413; narrow the query if appropriate.
- After updating assets, restart Redmine and force-reload the page.

## Another plugin interferes with controls

If the `redmica_ui_extension` Select2 extension interferes with selection controls, disable searchable select boxes under **Administration → Plugins → Redmica UI Extension → Configure** and check again. To isolate a cause, record the relevant plugin settings and change one setting at a time.

## Frequently asked questions

### Where is the plugin settings page?

Canvas Gantt does not have a general settings page. Configure browser display preferences in Gantt and business calendars with server-side YAML or CSV files.

### Why is a calendar change not visible?

Check the file location and permissions for the Redmine process. Changes are checked at intervals of up to 60 seconds by default; reload Gantt after detection. Invalid changes retain the last valid calendar. With multiple Pods, confirm every Pod reads the same files.

### Why is a baseline missing or unavailable to save?

Viewing baseline comparison requires `view_canvas_gantt`; saving requires `manage_canvas_gantt_baseline`. Each project has one baseline, and saving a new one replaces it.

## Report an issue on GitHub

Report reproduction steps, expected and actual results, Redmine and plugin versions, browser, relevant permissions, and related logs in [GitHub Issues](https://github.com/tiohsa/redmine_canvas_gantt/issues). Remove issue IDs and subjects, user names, host names, credentials, API keys, and sensitive log content before posting. Crop screenshots to the relevant area and redact personal information.

Related pages: [Permissions](/en/administration/permissions) · [Plugin settings](/en/administration/settings) · [Business calendars](/en/administration/calendars) · [Deployment environments](/en/administration/deployment)
