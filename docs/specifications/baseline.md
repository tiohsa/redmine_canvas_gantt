<a id="ベースラインの現行仕様"></a>

# Baselines

Reference: HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`, implementation as of 2026-11-13 (plugin 0.20.0). This document describes the development reference; the specification index identifies the public manual's current target.

<a id="目的とデータ"></a>

## Purpose and data

A baseline records issue start/due dates at capture time for comparison with current Gantt dates. It does not retain multiple historical generations: each target project holds one snapshot, replaced on the next save. See [persistence](persistence.md) for task updates and [queries and scope](query-scope.md) for target selection.

`BaselineSnapshot` metadata includes `snapshot_id`, `project_id`, UTC `captured_at`, `captured_by_id`, `captured_by_name`, and `scope`. Each issue retains only its ID, `baseline_start_date`, and `baseline_due_date`; dates may be absent. The API returns `tasks_by_issue_id`, keyed by issue ID. Subjects, assignees, progress, estimated hours, and similar history are not stored.

<a id="作成と表示"></a>

## Creation and display

1. `POST /projects/:project_id/canvas_gantt/baseline.json` checks `manage_canvas_gantt_baseline` permission.
2. `scope` is `filtered` or `project`; omission defaults to `filtered`, and other values are errors.
3. `filtered` captures the current resolved query. `project` loads visible issues in the target project and descendants regardless of query filters. Both obey retrieval limits.
4. Generate a new ID and capture time from server issue dates and replace the project's existing snapshot. The response may include query warnings.
5. Normal Gantt data loading reads the snapshot and returns only issues visible to the current user and within target project scope. This read does not modify the stored snapshot.

Snapshots are stored in plugin setting `baseline_snapshots`. Replacement/deletion runs in a transaction locking the settings row and updates the settings cache. An in-process mutex is used when DB locking is unavailable, such as in-memory settings.

The stored hash uses string project IDs as keys, with metadata and a `task_states` array. Each element contains `issue_id`, `baseline_start_date`, and `baseline_due_date`. Reads also accept legacy `task_states` hashes and `tasks_by_issue_id` hashes; a missing `scope` means `filtered`. There is no independent schema-version field in the storage format.

`snapshot_id` is a UUID generated for each new save, separate from issue `lock_version`. Creation/replacement does not validate an expected previous ID, so the replacement completing last wins concurrent saves. Deletion validates the expected ID as described below. Saving loads server issues rather than directly submitting unsaved SPA drafts as a snapshot.

The SPA [BaselineStore](../../spa/src/stores/BaselineStore.ts) holds the snapshot, warnings, save/delete states, and errors. Toggling display or comparison does not change storage. Issues outside the capture scope and new issues have no matching baseline.

<a id="比較"></a>

## Comparison

[Comparison calculations](../../spa/src/utils/baseline.ts) use calendar-day differences between current and captured start/due dates. A range with both endpoints is inclusive with a minimum of one day; one endpoint also means one day; neither means no duration. Start, due, and duration differences are calculated when both compared values exist; missing values are not replaced with numeric zero differences. Different missingness of start or due dates also counts as a difference. These are not working-day differences.

<a id="削除と失敗"></a>

## Deletion and failures

`DELETE /projects/:project_id/canvas_gantt/baseline.json` also requires management permission and the observed `snapshot_id`. Compare it with the current ID under lock and delete only on a match. Invalid IDs return 422, missing snapshots 404, and stale IDs after replacement by another operation 409, prompting a refetch. Success includes `baseline: null` and `deleted_snapshot_id`. A stale deletion cannot remove a newer snapshot.

Missing required stored metadata or a project-ID mismatch returns no snapshot and produces warnings. Individual invalid task states are also validated and reported through warnings. Transport, permission, and payload-limit errors are not successes.

Task states with invalid issue IDs or unparseable dates are omitted while the remainder loads with warnings. A failure constructing the entire snapshot, such as invalid scope, returns no snapshot. Filtering by current visibility can produce a different issue count from capture time.

<a id="実装と検証"></a>

## Implementation and verification

- [Repository](../../lib/redmine_canvas_gantt/baseline_repository.rb), [snapshot](../../lib/redmine_canvas_gantt/baseline_snapshot.rb), [task state](../../lib/redmine_canvas_gantt/baseline_task_state.rb), [controller](../../app/controllers/canvas_gantts_controller.rb).
- [Repository tests](../../spec/lib/redmine_canvas_gantt/baseline_repository_spec.rb), [model tests](../../spec/lib/redmine_canvas_gantt/baseline_snapshot_spec.rb), [comparison tests](../../spa/src/utils/baseline.test.ts), [permission E2E](../../spa/tests/e2e-redmine/baseline-permissions.pw.ts), [delete dialog E2E](../../spa/tests/e2e/dialog-settings-baseline-delete.pw.ts).
- Because each project holds one snapshot, replacement/deletion provides no restoration of earlier snapshots. Returned issue counts vary with current visibility.
