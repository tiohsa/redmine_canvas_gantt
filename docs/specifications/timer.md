<a id="作業時間タイマー仕様"></a>

# Work Timer and Time Recording

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (2026-11-13, code 0.20.0). This is a developer record of the referenced implementation, not a declaration of released functionality. See the specification index for the public manual's current target.

<a id="目的と境界"></a>

## Purpose and boundaries

Also see the [architecture, measurement states, recording reservations, and time-entry flow diagrams](../architecture/timer-session-architecture.md). Maintain them together with this specification.

Measure elapsed time per issue in the browser and pass it to Redmine's standard time-entry form. The timer column is hidden initially; starting requires `log_time` permission on the target issue. For the same Redmine instance and user within one browser profile, keep one running or pending-record session. Sharing across browsers/devices is not guaranteed.

Start targets are 5, 10, 15, 30, or 60 minutes. Auto-stop defaults to off. Manual stopping or automatic stopping at the deadline enters pending-record state, with resume, extend, discard, and record actions. If a session already exists, notify about existing work instead of starting a competing session.

<a id="セッションと時計"></a>

## Session and clock

- Storage uses `TimerSession` version 4: `sessionId`, monotonically increasing `revision`, issue ID, subject, state, timestamps, segments, deadline, auto-stop, and optional recording attempt.
- `running` means measuring; `expired` keeps measuring beyond the target with auto-stop off; `stopped_pending_record` means stopped and awaiting recording.
- Times are epoch-millisecond instants. Elapsed time sums each interval from `startedAt` to `stoppedAt` or now. Resuming after stopping opens a new segment and excludes the stopped gap.
- With auto-stop on, close the final segment exactly at the deadline even if callbacks run late. With auto-stop off, keep it open after the deadline. Startup/ticks reevaluate deadlines; notification claims are coordinated through shared state.
- Convert summed segments to hours rounded to two decimal places for recording. Short measurements may become `0.00`. Redmine validation decides whether input is accepted.
- Elapsed time is not split at local-date or DST boundaries. Unlike date-only values, it uses timezone-independent differences between instants.

<a id="操作と状態遷移"></a>

## Actions and state transitions

| Action or event | Preconditions | Result |
| --- | --- | --- |
| Start | No canonical session; issue permits timing | Create `running`, first open segment, and deadline; do not start after an acquisition conflict |
| Deadline | `running`, auto-stop off | `expired`; continue measuring with the segment open |
| Deadline | `running`, auto-stop on | Close at deadline and enter `stopped_pending_record` |
| Extend | `running` / `expired`, no recording attempt | Extend the existing deadline for the former; set a deadline from now and enter `running` for the latter |
| Manual stop | `running` / `expired`, no recording attempt | Close segment, enter pending-record, create an `editing` reservation, and open form |
| Resume | `stopped_pending_record`, no recording attempt | Open a new segment, set deadline from now, enter `running` |
| Record | `stopped_pending_record`, no recording attempt | Create `editing` reservation and open standard form |
| Discard | `stopped_pending_record`, no recording attempt | Delete canonical session |

Operations recheck canonical session ID and recording attempt. A changed state or failed persistence does not mean the intended operation applied.

<a id="保存と同期"></a>

## Persistence and synchronization

The `localStorage` keys `redmine_canvas_gantt_timer_session`, `redmine_canvas_gantt_timer_preferences`, and `redmine_canvas_gantt_timer_lock` have suffixes encoding origin + Redmine base and user ID. The tab ID lives in `sessionStorage`. Do not mix sessions across users or instances.

Mutations reread canonical shared storage before applying. Web Locks, IndexedDB, and localStorage locking paths handle concurrent operations and acquisition conflicts. Storage events load snapshots from other tabs; older revisions of the same session are ignored. Unreadable/invalid data or lock conflicts must not overwrite existing data as empty. Valid v2/v3 data migrates to v4; uncertain legacy recording attempts receive conservative handling.

The storage keys, schema, and version 4 are shared with `redmine_kanban`. Implement and verify phase/version changes in both plugins together. This contract carries forward the legacy [timer-session-contract.md](../timer-session-contract.md).

<a id="記録処理と失敗"></a>

## Recording and failures

Recording opens `/issues/:id/time_entries/new?time_entry[hours]=...` in an iframe; the Redmine form performs the save. Timer context matches scope, session ID, attempt ID, and owner tab so unrelated navigation cannot clear the session.

| Recording attempt phase | Meaning and transition |
| --- | --- |
| `editing` | Form editing; cancel releases the attempt while retaining pending-record state. |
| `submitting` | Form submission; validation errors return to `editing`, ambiguous outcomes become `unknown`. |
| `confirmed` | Redmine success is confirmed; only local session cleanup remains. |
| `unknown` | Submission cannot be safely classified; the user checks Redmine time entries and resolves recorded/not recorded. |

The success path is `editing → submitting → confirmed → cleanup`. If cleanup fails, retain `confirmed` and allow only synchronization/cleanup retries. Never return to `unknown`, `editing`, or `submitting`, or resend the Time Entry POST. While editing/submitting, other tabs cannot resume, extend, discard, or record. Explicit recovery after losing the owner tab treats an in-flight submission as `unknown`. Do not infer server outcomes from general network failures.

Explicit recovery releases `editing` reservations and changes `submitting` to `unknown`. Confirming an `unknown` attempt as “記録済み” (recorded) deletes the session; confirming it as “未登録” (not recorded) releases only the attempt and returns to pending-record. `confirmed` uses cleanup retries, not unknown-outcome resolution. Operations with mismatched attempt IDs or owner contexts do not apply.

If canonical reads/writes fail, preserve existing display state rather than treating the session as missing and creating another. Do not proceed if form reservation/submission state cannot persist. If Redmine accepted the record but local cleanup fails, retain confirmed state and resynchronize.

<a id="実装と検証根拠"></a>

## Implementation and verification evidence

- [Types](../../spa/src/types/timer.ts), [time and state transitions](../../spa/src/domain/timer/timerDomain.ts), [storage](../../spa/src/services/timerStorage.ts), [store](../../spa/src/stores/TimerStore.ts)
- [Forms and outcome detection](../../spa/src/components/IssueIframeDialog.tsx), [outcome logic](../../spa/src/domain/timer/timerRecordingOutcome.ts)
- [Time/DST tests](../../spa/src/domain/timer/timerDomain.timezone.test.ts), [storage tests](../../spa/src/services/timerStorage.test.ts), [store tests](../../spa/src/stores/TimerStore.test.ts), [multi-tab E2E](../../spa/tests/e2e/gantt-work-timer-multitab.pw.ts), [Redmine E2E](../../spa/tests/e2e-redmine/work-timer.pw.ts)
- These references do not mean tests ran during this documentation update. Clearing site data, other browsers, and implementation status in other plugins cannot be verified from this document alone.
