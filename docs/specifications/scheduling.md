<a id="日程依存関係クリティカルパス"></a>

# Scheduling, Dependencies, and Critical Paths

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`, code version 0.20.0, reviewed 2026-11-13. The public manual covers tag v0.20.0 (`0c2b68a`); distinguish it from this specification's reviewed commit.

<a id="目的と境界"></a>

## Purpose and boundaries

Edit dates and dependencies on the Gantt chart and save schedules consistent with actual Redmine data. Separate display/preview calculations from server confirmation. See [persistence](persistence.md) for manual saving, generations, and conflict recovery; [calendars](calendars.md) for calendar configuration; and [Gantt display](gantt-view.md) for interaction layout.

Dates are `YYYY-MM-DD` calendar dates; internal UTC midnight is not an instant. Use [dateOnly](../../spa/src/utils/dateOnly.ts) at conversion boundaries. When parent dates derive from children, Redmine owns confirmed values; the client must not synthesize parent mutations.

<a id="関連と制約"></a>

## Relations and constraints

Only `precedes` and `follows` form scheduling edges; normalize the latter by reversing its direction into predecessor/successor order. The interval is `1 + delay` working days. Calculate the successor's earliest start from predecessor finish using the **successor issue's project calendar**. Other relation types remain relations but do not form these constraint edges. See [constraintGraph](../../spa/src/scheduling/constraintGraph.ts).

Missing both dates, one-sided dates, start after finish, dependency cycles, and constraint violations are derived as distinct states. Incomplete dates and cyclic tasks are not automatically eligible for calculation. Cycle detection identifies nodes actually belonging to cycles.

For automatic delay calculation in the relation editor, use predecessor start if finish is missing. Successor start is required, and calculation uses the successor calendar. This fallback is specific to relation editing; it does not make incomplete ranges eligible for automatic scheduling. See [relation editing calculations](../../spa/src/utils/relationEditing.ts).

Relation creation accepts `relation.issue_from_id`, `issue_to_id`, `relation_type`, and optional `delay`. Updates can include expected existing state. In manual mode, create/update/delete drafts overlay confirmed relations and remain distinguishable from them. Changes failing server permission, visibility, target, cycle, or similar validation do not settle. See [API client](../../spa/src/api/client.ts), [relation validator](../../lib/redmine_canvas_gantt/relation_change_validator.rb), and [manual relation E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts).

<a id="バー操作と日程計算"></a>

## Bar operations and schedule calculation

Bar moves, resizing either edge, and multiple-selection operations build previews from operation-start state and generation. If another operation starts during saving, earlier success/failure must not take ownership of later operations. Ineligible issues and invalid schedules must not be saved unchanged as if valid. See [bar-operation state](../../spa/src/stores/taskStore/barOperations.ts) and [bar-operation tests](../../spa/src/stores/taskStore/barOperations.test.ts).

Dependency recalculation follows successors with valid dates. A successor earlier than its constraint moves to the required start using its own working-day calendar while preserving working-day duration. Derived-date parents and invalid/incomplete ranges are excluded from this client recalculation. Linked moves validate external dependencies after movement; violations return an error without updates. Combining multiple operations requires final-graph validation.

Date-placement modes and project working days/holidays affect scheduling and server validation. See [calendars](calendars.md) for weekdays, holidays, and explicit working-day overrides. Display predictions do not override server permissions, other users' updates, or Redmine callbacks.

<a id="複数移動の対象と検証"></a>

### Multiple-move eligibility and validation

When moving visible selected issues by bar body, exclude parents. Every remaining leaf must be editable, not date-derived, and have at least a start or due date. Do not start when there are no targets or any selected leaf fails eligibility. Start-only and due-only issues can move. Hidden selections are not part of the visible move cohort. See [InteractionEngine](../../spa/src/engines/InteractionEngine.ts).

Calendar-day mode moves dates by the same calendar-day delta. Working-day mode derives movement from the grabbed issue's calendar, then moves each target using its own calendar and preserves working-day duration when both dates exist. Exclude the selected cohort from cascading calculations to prevent double movement. With auto-scheduling, group moves reject cycles involving selected targets and validate the final result, including internal and external edges, so existing dependency violations do not worsen. Rejection does not apply the candidate. See [TaskStore](../../spa/src/stores/TaskStore.ts) and [interaction tests](../../spa/src/engines/InteractionEngine.test.ts).

On save failure, operation IDs and per-target generations determine rollback/settlement ownership. Even a definite rejection must not unconditionally erase later patches or independently successful changes. Conflicts require remote retrieval/resolution; unknown responses are not confirmation. Provisional candidates from an active save-time drag are not captured at save start. See [persistence](persistence.md).

<a id="原子的な日程-mutation"></a>

## Atomic schedule mutations

Call `POST /canvas_gantt/schedule_mutation.json` with view context. Project routes also exist. See [routes](../../config/routes.rb), [controller](../../app/controllers/canvas_gantts_controller.rb), and [coordinator](../../lib/redmine_canvas_gantt/schedule_mutation_coordinator.rb).

| Element | Contract |
| --- | --- |
| `operation_id` | Required operation identifier; empty returns 422. |
| `base_revisions` | Base revision per target task ID, required for explicit change targets. |
| `changes` | `task_id`, changed `start_date` / `due_date`, optional `date_placement_mode`. Dates are calendar-date strings or null. |
| `resolution` | Resolution target `task_ids`, `token`, `preview`, and, when needed, `accepted_adjustments`. |
| Response | `status`, `operation_id`, `completeness`, `entities`, `revisions`, `invalidated_entity_ids`; conditionally `resolution_context`, `adjustments`, `errors`, `conflict` / `conflicts`, `failure`. |

Success is HTTP 200, conflict 409, validation failure 422, permission denial 403, and missing target 404. Completeness is `complete` for success and `partial` otherwise. The client validates complete acknowledgments rather than trusting unconfirmed responses as canonical values.

The coordinator checks targets/revisions and locks, validates, and saves with relation, hierarchy, and Redmine-callback effects in scope. It checks scope, visibility, and edit permission for issues actually changed by callbacks as well as explicit targets. Validation/conflict failures roll back the bulk schedule transaction. Scope changes allow up to three attempts. Other manual-save fields and relation operations are not all part of this transaction.

Each attempt creates a resolver from a calendar snapshot and runs normalization and Redmine callbacks within the same scoped calendar context. Check callback-scope signatures before/after locking and after saving; changes roll back the attempt and retry. Exhaustion is a scope conflict, distinct from individual stale task revisions. Context stays local to processing and must not leak calendars into unrelated requests. See [calendar context](../../lib/redmine_canvas_gantt/schedule_calendar_context.rb).

Conflict resolution derives a token from the target graph, revisions, dates, calendars, relation settings, and related state to verify preview conditions remain current. Accepting adjustments still requires current-state and permission validation. The client sends schedule mutations through one ordered queue; revision checks handle other sessions. See [resolution handling](../../spa/src/stores/taskStore/scheduleConflictResolution.ts), [coordinator tests](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_spec.rb), and [concurrency tests](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_concurrency_spec.rb).

<a id="クリティカルパス"></a>

## Critical paths

Build topological order from displayed tasks and scheduling edges, then calculate early/late starts/finishes and slack in working days. Per-task results include `durationDays`, `es`, `ef`, `ls`, `lf`, `totalSlackDays`, and `critical`; overall results include `projectFinish`, order, excluded IDs, and cyclic IDs. Exclude tasks without valid start/finish dates and tasks in cycles; use edges whose endpoints both remain eligible. This does not guarantee complete project-wide paths involving issues outside display/retrieval scope. See [implementation](../../spa/src/scheduling/criticalPath.ts), [unit tests](../../spa/src/scheduling/criticalPath.test.ts), [differential tests](../../spa/src/scheduling/criticalPath.differential.test.ts), and [E2E](../../spa/tests/e2e/gantt-critical-path.pw.ts).

<a id="性能上の境界"></a>

## Performance boundaries

Critical paths and group moves depend on loaded graph size and edge density. The [selected-move benchmark](../../spa/scripts/benchmark-selected-drag.bench.ts) is a measurement tool; previous results do not guarantee current-environment latency or arbitrary dataset sizes. Store-only measurements cannot establish full browser responsiveness including rendering, input, and networking. This benchmark was not run during this documentation update.

<a id="失敗と検証の観点"></a>

## Failure and verification scenarios

Do not treat previews as confirmed after conflicts, permission loss, invisible/deleted targets, invalid schedules, dependency cycles, external dependency violations, calendar changes, or unknown transport outcomes. Recovery distinguishes independently successful operations from unsaved intent. Delayed save/refetch responses must not overwrite newer edits.

Supporting tests include [dependency E2E](../../spa/tests/e2e/gantt-dependency.pw.ts), [conflict E2E](../../spa/tests/e2e/gantt-conflicts.pw.ts), and [calendar-aware schedule tests](../../spec/lib/redmine_canvas_gantt/issue_schedule_calendar_patch_spec.rb). References do not mean those tests ran during this update.
