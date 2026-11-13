<a id="タスク変更の永続化と競合回復"></a>

# Task Persistence and Conflict Recovery

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`, code version 0.20.0, reviewed 2026-11-13. This is a development contract, not a declaration of released functionality; see the specification index for the public manual's target.

<a id="目的と範囲"></a>

## Purpose and scope

Display Gantt edits immediately while distinguishing confirmed Redmine state from unsaved intent. Handle save ordering, partial success, stale responses, and conflicts for tasks, schedules, and some relation changes. See [scheduling](scheduling.md) for schedule constraints and atomicity and [issue editing](issue-editing.md) for editing operations.

Main implementations are [TaskStore](../../spa/src/stores/TaskStore.ts), [state contracts](../../spa/src/stores/taskStore/stateContract.ts), [persistence handling](../../spa/src/stores/taskStore/taskPersistence.ts), and [mutation service](../../spa/src/services/taskMutationService.ts).

<a id="状態の構成"></a>

## State model

| State | Role |
| --- | --- |
| `ServerSnapshot` | Server entities/revisions by ID and loading context; the confirmed baseline. |
| `LocalPatch` | Entity ID, display `projection`, outgoing `mutationIntent`, generation, and operation ID; may include a bar-operation ID and date-placement mode. |
| `MutationOperation` | Contract for operation ID, type, context, generation, target IDs, patches and rollback patches, retries, and status. |
| Modified IDs and relation drafts | Track unsaved task intent and relation creates/updates/deletes. Displayed relations project drafts over confirmed state. |

Display is the result of projecting local patches over the snapshot, not a payload sending every projection field to the server. Outgoing intent is managed as `mutationIntent`. Patches settle by generation and field, preserving newer edits made after submission. Tombstones track deleted entities. See [draftIntent](../../spa/src/stores/taskStore/draftIntent.ts) and [state contract tests](../../spa/src/stores/taskStore/stateContract.test.ts).

<a id="自動保存と手動保存"></a>

## Automatic and manual saving

- Auto-save defaults to off without stored preferences. In auto mode, edits enter the mutation path and responses update confirmed state.
- In manual mode, task and relation intents remain drafts. Unsaved state means remaining intent in either tasks or relations.
- Enabling auto-save with pending changes first runs `saveChanges`. Failure or remaining unsaved changes prevents enabling. Concurrent toggle requests share the in-progress transition.
- `saveChanges` also shares its in-progress promise instead of launching duplicate saves. Old responses must not remove edits added while saving.
- Relation drafts normalize create/update/delete operations into effective displayed relations. Additional edits to the same relation are restricted during saves or unknown outcomes. See [relation draft implementation](../../spa/src/stores/taskStore/relationDrafts.ts).

<a id="モード遷移と所有権"></a>

### Mode transitions and ownership

| State or action | Actual transition |
| --- | --- |
| manual / `idle` | Keep task patches and relation drafts until explicit saving. |
| Request auto-save | Enable immediately if nothing is pending; otherwise enter `enabling` and wait for saving while effective auto remains false. |
| Save completion | Set auto to true only when no failure exists and both task/relation dirty state are empty. Failure, remaining drafts, or exceptions return to manual / `idle`. |
| Disable auto-save | Set false; mutations already in progress continue settling their responses. |

Saving waits for active bar operations to end and does not capture provisional drag patches. Each save iteration captures task and relation-draft generations. Responses settle only fields/generations owned by that operation, preserving later intent on the same targets. Changes added while waiting are processed according to what remains. See [TaskStore](../../spa/src/stores/TaskStore.ts) and [bar operations](../../spa/src/stores/taskStore/barOperations.ts).

<a id="手動保存の決着"></a>

## Manual-save settlement

Capture targets and generations, then handle schedule-related changes and other fields. Schedule plans use a dedicated bulk mutation; remaining task changes are sent with dependency-aware ordering. Predecessor settlement gates successor submission; parent depth also orders equally ranked tasks. Up to eight independently ready writes can run concurrently. The entire manual save is not one DB transaction.

Results contain `failures`, `savedTaskIds`, `unsentTaskIds`, `abortedTaskIds`, per-task `settledFieldsByTask`, and `batchStatus` (`completed` / `partial_failure` / `preflight_failure`). Settle only confirmed fields; retain unsent/failed changes. Cycles, preflight errors, and predecessor failures can block successors. Relation operations are also ordered; work remaining after failure stays unprocessed. See [persistence tests](../../spa/src/stores/taskStore/taskPersistence.test.ts) and [relation draft tests](../../spa/src/stores/taskStore/relationDrafts.test.ts).

Relation drafts have state independent of task drafts. After prevalidating captured relations, check task-save results and scope, then save eligible relations in `delete → update → create` order, with draft-ID ordering within each type. Settle relations one at a time, removing only the corresponding generation's draft. Some tasks/relations may succeed without overall atomicity; failed/unsent work remains. Unresolved task conflicts involving relations, view-scope changes, and validation failures can prevent relation saving. Unknown relation outcomes require review rather than automatic resubmission. See [relation drafts](../../spa/src/stores/taskStore/relationDrafts.ts) and [relation E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts).

<a id="書き込みキューと応答"></a>

## Mutation queue and responses

`enqueueMutationOperation` assigns an operation ID, targets/resource key, and generation. Operations sharing a resource key wait for predecessors; different resources may run concurrently within the limit. Schedule mutations share one ordered client stream even with disjoint targets. Operation states include `queued`, `running`, `succeeded`, `conflict`, `failed`, and `cancelled`; at most 128 completed history entries are retained.

Task updates use revisions such as `lock_version`. Internal outcomes include success, validation error, conflict, permission denial, not found, and transient error. Even a success response is not trusted as confirmation without valid target IDs, revisions, intended fields, and other required acknowledgments. Missing HTTP responses may leave server execution unknown; do not equate this with definite failure. See [outcome classification](../../spa/src/api/mutationOutcome.ts) and [response decoders](../../spa/src/api/mutationDecoders.ts).

Basic classification follows. `protocol_error` is terminal as a response-contract failure, but the actual server save may remain unknown; do not apply unvalidated response metadata to confirmed state.

| status | Classification and handling |
| --- | --- |
| `ok` | `success`; validate required canonical response/revision before settling. |
| `conflict` | `conflict`; fetch remote state and resolve local intent. |
| `validation_error` / `forbidden` / `not_found` | `terminal`; consider the failed resource's role. A missing reference does not mean the target itself was deleted. |
| `protocol_error`, missing/invalid status | `terminal`; do not settle malformed responses as success. |
| `error` / `transient_error`, unclassified exceptions | `transient`; callers handle unknown outcomes and retry eligibility. |

Structured `failure` may include `resource_role` (`target` / `reference` / `relation` / `scope`), resource type/ID, and `remote_availability`. Scope conflicts differ from a single task's stale revision; retain intent and reload scope. See [mutationOutcome](../../spa/src/api/mutationOutcome.ts) and [its tests](../../spa/src/api/mutationOutcome.test.ts).

<a id="読み込みの鮮度と巻き戻し"></a>

## Read freshness and rollback

`ReadContext` contains generation, project, query/scope identifiers, purpose, and merge policy. Delayed responses not matching current context are superseded and ignored. For the same snapshot entity, older revisions cannot overwrite newer ones; partial responses merge into existing entities. Refetches account for dirty patches. Reads and post-mutation synchronization each pass through context/generation guards.

Conflicts separate local intent from valid remote state and recover through the conflict UI. Rollback starts from the server snapshot and reapplies patches newer than the failed operation. Failure of an old operation must not discard subsequent edits. Deletion, invisibility, or permission loss may prevent obtaining current values; do not assume refetch success. See [remote conflict handling](../../spa/src/stores/taskStore/conflictRemote.ts), [conflict UI](../../spa/src/components/ConflictResolutionPanel.tsx), and [conflict E2E](../../spa/tests/e2e/gantt-conflicts.pw.ts).

<a id="境界と確認対象"></a>

## Boundaries and verification scope

Treat date-only values as calendar dates encoded at UTC midnight. General timestamp conversion must not shift dates. Permissions and visibility are also enforced server-side. This specification does not guarantee restoration of unsaved drafts after closing the browser. Do not declare an unknown transport outcome successful without confirmation.

Related tests include [state machine](../../spa/src/stores/taskStore/stateMachine.test.ts), [draft intent](../../spa/src/stores/taskStore/draftIntent.test.ts), [mutation service](../../spa/src/services/taskMutationService.test.ts), and [manual relation E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts). They are evidence references, not a claim that they ran during this documentation update.
