<a id="権限設定実行環境"></a>

# Permissions, Settings, and Runtime

Reviewed: 2026-11-13. Reference: `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (code version 0.20.0). See the [specification index](../README.md) for the public manual's target version.

<a id="権限の責務"></a>

## Authorization responsibilities

Canvas Gantt pages and JSON APIs require `view_canvas_gantt` on the entry project. Mutations additionally check standard Redmine permissions on the target issue's project and the issue's own eligibility.

Entry-project permission alone must not authorize updates to another project's issues. Matching display filters is also different from mutation authorization. View/operation scope follows the [scope specification](query-scope.md).

| Target or operation | Main server-side conditions |
| --- | --- |
| Page, data, editing APIs | Entry-project `view_canvas_gantt`, including direct API access |
| Issue reads | `Issue.visible` and target project scope |
| Issue editing | Target-project `edit_issues` and `issue.editable?`; safe attributes/workflow apply per field |
| Issue deletion | Target-project `delete_issues` and `issue.deletable?` |
| Child issue creation | Parent-project `add_issues` and `manage_subtasks`, parent issue visibility/scope |
| Relation creation/update/deletion | Both endpoint issues' visibility, operation scope, editability, and relation format/consistency |
| Time recording | Start eligibility using `log_time` and standard Redmine time-entry form checks |
| Baseline saving/deletion | Entry-project `view_canvas_gantt` and `manage_canvas_gantt_baseline` |
| Actual workload aggregation | Issue and TimeEntry visibility/scope; see [workload](workload.md) |

[MutationAuthorizationPolicy](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb) owns shared permission decisions. The controller and services handle HTTP mapping and scope checks. UI `permissions` and per-field editability guide interaction; they do not replace authorization.

Canvas-specific permissions in [init.rb](../../init.rb) are `view_canvas_gantt` and `manage_canvas_gantt_baseline`. Do not treat legacy `edit_canvas_gantt` as the current editing permission.

<a id="認証と情報公開"></a>

## Authentication and disclosure

- Browser JSON requests retain page-session authentication when a Redmine session user exists and no explicit API credentials are supplied.
- If `X-Redmine-API-Key`, a `key` parameter, or Authorization is supplied, or no session user exists, use Redmine's normal API authentication decisions. `accept_api_auth` defines actions accepting API keys; it currently excludes `schedule_mutation` and `subtask_trackers`. A route's existence does not imply API-key support. Browser JSON requests without explicit API credentials use session authentication as above.
- SPA mutations include the page-provided CSRF token in headers. Only asset delivery is exempt from page-project resolution, permission checks, and CSRF checks.
- Enforce project, issue, time-entry, baseline, and edit-option visibility on the server. Filter candidates and calendar mappings must not disclose invisible projects.
- Detailed calendar diagnostics are administrator-only; other users receive generalized errors. Do not expose file or invalid-input details unconditionally.

Generally use `403` for permission denial, `404` for invisible/out-of-scope targets, `422` for invalid input, and `409` for revision and similar conflicts. Feature specifications define individual response data and recovery.

<a id="固定-ui-設定と利用者の設定"></a>

## Fixed UI settings and user preferences

The controller's current `plugin_settings` returns `CANVAS_GANTT_UI_SETTINGS`; it does not read administrator-saved plugin settings as authoritative UI configuration. Do not reuse legacy administration-UI descriptions as current functionality.

| Key | Fixed value |
| --- | --- |
| `inline_edit_subject` | `'1'` |
| `inline_edit_assigned_to` | `'1'` |
| `inline_edit_status` | `'1'` |
| `inline_edit_done_ratio` | `'1'` |
| `inline_edit_due_date` | `'1'` |
| `inline_edit_custom_fields` | `'1'` |
| `row_height` | `'36'` |

These values do not remove permission/safe-attribute restrictions. User-selected row height, columns, font, panes/dialogs, and storage scope are defined in [display settings](display-export.md). Calendars use [dedicated files/environment variables](calendars.md); data budgets follow [shared contracts](architecture.md).

<a id="実行環境と配信"></a>

## Runtime and delivery

- Supported Redmine lines are 6.0, 6.1, and 7.0. Check [CI](../../.github/workflows/ci.yml) and test prerequisites for actual verified combinations.
- The SPA uses React 19, TypeScript 5.9, Vite 8, and Zustand 5. [spa/package.json](../../spa/package.json) requires Node `^20.19.0 || >=22.12.0`.
- The public manual is an independent VitePress project. [website/package.json](../../website/package.json) requires Node `>=22`. Keep SPA and website dependencies separate.
- In `spa`, `npm run build` runs TypeScript and Vite, generating `assets/build/` and `.vite/manifest.json`. Do not edit generated files directly.
- [ViteAssetHelper](../../lib/redmine_canvas_gantt/vite_asset_helper.rb) resolves JS/CSS paths from manifest entry `src/main.tsx`.
- Use `http://localhost:5173` only when Rails is in development and `CANVAS_GANTT_USE_VITE_DEV_SERVER=1`; otherwise use built assets.
- `/plugin_assets/redmine_canvas_gantt/build/*asset_path` can serve through the controller when static serving is disabled. Startup must not rewrite `public/plugin_assets`.
- Limit asset paths to real files inside the build directory. Reject traversal, absolute paths, and symlinks outside build.
- Preserve Redmine's relative URL root in APIs and navigation. Do not introduce fixed URLs rooted at the host.

<a id="保存データと削除の境界"></a>

## Stored data and deletion boundaries

The plugin Setting row also contains baselines. Deleting settings resets more than visual preferences. The [uninstall task](../../lib/tasks/redmine_canvas_gantt.rake) deletes the `plugin_redmine_canvas_gantt` Setting row and clears caches. See [SettingsCleanup](../../lib/redmine_canvas_gantt/settings_cleanup.rb) and [baselines](baseline.md).

Do not run that deletion task to organize or verify this specification. Its lifecycle is separate from browser-stored timers/display preferences.

<a id="根拠と回帰確認"></a>

## Evidence and regression checks

| Concern | Supporting tests |
| --- | --- |
| Standard permissions per target project | [mutation_authorization_policy_spec](../../spec/lib/redmine_canvas_gantt/mutation_authorization_policy_spec.rb) |
| Direct APIs, authentication, CSRF/visibility, asset paths | [controller spec](../../spec/controllers/canvas_gantts_controller_spec.rb) |
| Project visibility in calendar mappings | [controller patch spec](../../spec/lib/redmine_canvas_gantt/canvas_gantts_controller_patch_spec.rb) |
| Manifest/development-server selection | [vite_asset_helper_spec](../../spec/lib/redmine_canvas_gantt/vite_asset_helper_spec.rb) |
| Settings/baseline deletion scope | [settings_cleanup_spec](../../spec/lib/redmine_canvas_gantt/settings_cleanup_spec.rb) |
| Baseline permissions in Redmine | [baseline-permissions](../../spa/tests/e2e-redmine/baseline-permissions.pw.ts) |

This does not claim every Redmine version's integration tests ran during this documentation update. Security/permission changes require allowed cases plus direct API access, other projects, invisible issues/TimeEntries, and revoked permissions.
