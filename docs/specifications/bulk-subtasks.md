<a id="子チケット一括作成の現行仕様"></a>

# Bulk Child Issue Creation

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (code 0.20.0, 2026-11-13). This development reference is distinct from the public manual's target, recorded in the specification index.

<a id="入力と操作"></a>

## Input and interaction

- Child input has text and table modes. Text uses one subject per line; the table accepts subject and tracker and provides at least three rows.
- Switching modes preserves row subjects. Text edits preserve existing row trackers where possible; new rows use the default tracker.
- Before submission, trim subjects and discard empty rows. If no subjects remain, send no request and return zero successes and failures.
- Creation can run directly from an existing parent or after saving a Redmine parent-issue form. In the latter case, create children only when the post-save destination identifies the parent ID and the form has no errors. Do not submit children if parent saving fails.
- Parent saving and bulk child creation are separate requests. Child creation failure does not undo the parent save.
- On issue details, the primary button navigates to the edit screen when there are no subjects. When subjects exist, it navigates to edit, automatically submits the parent form, and submits children after that save succeeds. Reopening the dialog resets submission-in-progress state.

<a id="api-と認可"></a>

## API and authorization

`POST /canvas_gantt/subtasks/bulk.json` and equivalent project routes are available. The global route requires the view context's root project.

| Input | Meaning |
| --- | --- |
| `parent_issue_id` | Parent issue ID |
| `subjects` | Subject array without per-row trackers |
| `subtasks` | Array of `{subject, tracker_id?}`; takes precedence when supplied |
| `operation_issue_ids` | IDs defining operation scope; the SPA supplies the parent ID |
| `client_operation_id` | Optional operation identifier |

- Load the parent through `Issue.visible`; it must belong to current project scope and any specified operation scope.
- Require both `add_issues` and `manage_subtasks` in the parent project. Return 403 for insufficient permissions, 404 for a missing parent, and 422 if both subject and row arrays are empty.
- Tracker options come from `GET /canvas_gantt/subtasks/trackers.json`. Each row's tracker must be available in the parent project.

<a id="作成と失敗"></a>

## Creation and failures

1. The server prepares inherited attributes from the parent: `parent_issue_id`, `project_id`, `tracker_id`, `status_id`, `priority_id`, and `assigned_to_id`.
2. Trim each row's subject; an empty subject is an error. A specified tracker overrides the inherited value and must belong to the project's tracker list.
3. Use the current user as author and apply Redmine `safe_attributes` and save handling. Verify the saved parent-child link; a mismatch is an error.
4. Process all rows in one transaction. Any error rolls back every row, including successful rows, which are converted to rollback errors.
5. The response includes `status: ok`, `success_count`, `fail_count`, and per-row `status`, `subject`, and either `issue_id` on success or `errors` on failure. `completeness: partial` and `invalidated_entity_ids` for parent/created IDs support refetching; they do not mean partial commit.

The SPA reports success/failure counts and shows the first row error on failure. It clears and collapses input only when every row succeeds; otherwise input remains. HTTP errors and transport exceptions produce a general save-failure notification. Mutation metadata passes through existing task-state update paths. Parent-form validation errors leave child input unsubmitted. This retention is component state while open; persistence after closing and reopening the dialog is not guaranteed.

<a id="実装と回帰確認箇所"></a>

## Implementation and regression references

- [UI](../../spa/src/components/BulkSubtaskCreator.tsx), [parent-form ordering](../../spa/src/components/IssueIframeDialog.tsx), [API client](../../spa/src/api/client.ts)
- [Controller](../../app/controllers/canvas_gantts_controller.rb), [creation service](../../lib/redmine_canvas_gantt/bulk_subtask_creator.rb), [authorization](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb)
- [Server tests](../../spec/lib/redmine_canvas_gantt/bulk_subtask_creator_spec.rb), [UI tests](../../spa/src/components/BulkSubtaskCreator.test.tsx), [E2E](../../spa/tests/e2e/gantt-bulk-subtasks.pw.ts)

These tests were not run for this documentation update.
