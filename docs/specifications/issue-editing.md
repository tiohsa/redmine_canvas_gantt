<a id="チケット編集の現行仕様"></a>

# Issue Editing

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (code 0.20.0, 2026-11-13). This is a development specification, separate from the public manual.

<a id="編集経路"></a>

## Editing paths

- Sidebar inline editing operates on editable cells and passes changes through existing task state and persistence paths. Automatic/manual saving, pending values, and conflict recovery belong to [persistence](persistence.md).
- The controller's `CANVAS_GANTT_UI_SETTINGS` fixes subject, assignee, status, progress, due date, and custom fields as enabled. SPA setting types also include start date and estimated hours; do not assume administrators can configure these. Server edit metadata determines permissions for each issue/field. Values Redmine does not allow as safe attributes do not become editable. See [permissions and settings](permissions-settings.md) for scope.
- Redmine issue viewing, creation, editing, and similar actions use native forms in iframe dialogs. Form submission, validation results, and redirects are monitored; data refreshes after successful saving. Forms with remaining errors stay available.
- Ordering of parent-form saving and bulk child creation is defined in [bulk child creation](bulk-subtasks.md). Native forms have a save path independent of inline editing's JSON API.

<a id="編集メタデータとプレビュー"></a>

## Edit metadata and preview

`GET /canvas_gantt/tasks/:id/edit_meta.json` returns the persisted issue, per-field editability, options, and custom-field information. Equivalent project routes exist. For compatibility, GET accepts `target_project_id`, `target_tracker_id`, and `target_status_id`.

`POST /canvas_gantt/tasks/:id/edit_meta/preview.json` evaluates a draft under `{ "task": { ... } }` without saving. It checks edit permission as well as visibility and current scope. It can calculate options and capabilities in draft context after project, tracker, or status changes.

GET checks view access and scope and can return `editable` even when editing is disallowed. Preview requires edit permission. Compatibility target context on GET is also evaluated; permission violations during evaluation return 403.

Main response information:

| Field | Meaning |
| --- | --- |
| `task` | Persisted values and `lock_version` |
| `editable` | Editability for subject, assignee, status, progress, dates, priority, category, estimated hours, project, tracker, version, custom fields |
| `options` | Options for status, assignee, priority, category, project, tracker, version, custom fields |
| `custom_field_values` | Current custom-field values |
| `capability_context` | Issue, project, tracker, and status used for evaluation |
| `draft_contract` | Draft evaluation's base revision, materialized values, normalizations, violations |

Editable custom-field formats are string, int, float, list, bool, date, and text. Permission violations found during evaluation return 403; missing targets return 404. Stale draft revisions are evaluated as conflicts. The client verifies response context so stale previews cannot overwrite current edits.

Preview represents a stale `lock_version` as `stale_revision` in `draft_contract.violations`. The same condition during update returns 409 with the latest entity/revision. Ordinary update draft-validation failures return 422 with `status: validation_error`, `errors`, and `draft_contract`. Normalizations include `field`, before/after values, and `source`; violations include `field`, `code`, and `message`.

<a id="更新移動削除"></a>

## Updates, moves, and deletion

`PATCH /canvas_gantt/tasks/:id.json` accepts a `task` object containing fields such as `subject`, `assigned_to_id`, `status_id`, `done_ratio`, `start_date`, `due_date`, `priority_id`, `category_id`, `estimated_hours`, `project_id`, `tracker_id`, `fixed_version_id`, `parent_issue_id`, `lock_version`, and `custom_field_values`. Date intents also use date-update and placement modes.

- The issue must be visible and within current project scope. Editing requires project `edit_issues` and issue `editable?`.
- Validate revision and draft before updating; preprocess date and parent changes. For project moves, evaluate options and dates in an authorized destination context. Parent assignment also validates the resulting link.
- `sibling_position: tail` in a parent-change response tells the client to place the issue last in the new sibling set. It is not an API for arbitrary sibling ordering. If Redmine's resulting parent differs from the requested parent, return 422.
- Success returns `status: ok`, `entity`, `revision` / `lock_version`, `task_id`, `parent_id`, `sibling_position: tail`, and `invalidated_entity_ids` for changed targets and old/new parents. `completeness: partial` means related state requires refetching.
- Validation, save, or parent-link failures return 422; permission denial 403; missing targets 404; stale revisions 409. Conflict responses may include the latest available entity/revision. The client treats malformed responses as protocol errors.
- Date-related intents check the business calendar revision. Do not convert date-only values to timezone-bearing instants. Redmine owns aggregate parent dates; the client must not synthesize parent mutations.
- `DELETE /canvas_gantt/tasks/:id.json` checks visibility, scope, `delete_issues`, and `deletable?`. Success returns the deleted ID and invalidation IDs for the target and parent. Delete permission is separate from edit permission.

<a id="実装と回帰確認箇所"></a>

## Implementation and regression references

- [Inline editing](../../spa/src/components/sidebar/useSidebarInlineEdit.ts), [editors](../../spa/src/components/InlineEditors.tsx), [edit metadata state](../../spa/src/stores/EditMetaStore.ts)
- [Iframe dialog](../../spa/src/components/IssueIframeDialog.tsx), [API client](../../spa/src/api/client.ts), [controller](../../app/controllers/canvas_gantts_controller.rb)
- [Draft evaluation](../../lib/redmine_canvas_gantt/issue_draft_evaluator.rb), [authorization](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb)
- [Metadata state tests](../../spa/src/stores/EditMetaStore.test.ts), [inline editing tests](../../spa/src/components/sidebar/useSidebarInlineEdit.test.tsx), [dialog tests](../../spa/src/components/IssueIframeDialog.test.tsx)

These tests were not run for this documentation update. Redmine forms and workflows depend on installed plugins and permission settings.
