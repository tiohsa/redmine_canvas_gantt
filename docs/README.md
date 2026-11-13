# Redmine Canvas Gantt Development Specifications

The feature specifications in this directory are the **canonical development specifications for the current implementation**. They cover feature behavior, state transitions, permissions, APIs, and persistence and recovery contracts.

<a id="基準と読み方"></a>

## Scope and reference points

- Review date: 2026-11-13.
- Initial reference commit: `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`.
- Plugin version of the reference code: `0.20.0`. The initial specifications covered the commit 12 commits after tag `v0.19.0`. The public manual now covers tag `v0.20.0` (`0c2b68a`); distinguish it from the reviewed commit recorded in each development specification.
- The canonical public user manuals are [Japanese](../website/ja/index.md) and [English](../website/en/index.md). They currently cover v0.20.0.
- Implementation and test references provide entry points to the supporting evidence. They do not mean that all linked tests passed or that behavior was verified in every environment.
- Keep current implementation separate from future requirements. Record unresolved issues and unverified constraints in the limitations of the relevant specification.

<a id="機能別仕様"></a>

## Feature specifications

The feature specifications and maintained architecture document are in English. Their translation preserves the original review dates and reference commits; translation alone is not a new review of implementation behavior.

| Specification | Responsibilities and scope |
| --- | --- |
| [Architecture and shared contracts](specifications/architecture.md) | Rails/SPA boundaries, startup, reads and writes, dates, asynchronous operations, data limits |
| [View scope, filters, and saved queries](specifications/query-scope.md) | Project scope, filtering, URLs, saved queries, state preservation |
| [Gantt display and interaction](specifications/gantt-view.md) | Hierarchies and group rows, selection, movement, zoom, screen interactions |
| [Issue editing and dialogs](specifications/issue-editing.md) | Inline editing, edit options and previews, dialogs, project moves, deletion |
| [Bulk child issue creation](specifications/bulk-subtasks.md) | Input, inherited attributes, ordering relative to parent saves, failure handling |
| [Persistence and conflict recovery](specifications/persistence.md) | Server state and local edits, automatic/manual saving, conflicts, stale responses, rollback |
| [Scheduling and dependencies](specifications/scheduling.md) | Dragging, resizing, moving multiple selected issues, relations, schedule adjustments, critical paths |
| [Business calendars](specifications/calendars.md) | YAML/CSV, inheritance, project mapping, reloads, revisions |
| [Baselines](specifications/baseline.md) | Snapshots, comparison, saving and deletion, permissions, freshness |
| [Workload](specifications/workload.md) | Planned and actual effort, aggregation, scope, display, caching |
| [Work Timer and time entries](specifications/timer.md) | Sessions, sharing across tabs and plugins, record confirmation and recovery |
| [Display settings and export](specifications/display-export.md) | Applying and storing preferences, screen settings, image and data export |
| [Permissions, settings, and runtime](specifications/permissions-settings.md) | Operation permissions, authentication, fixed settings, supported environments, builds and asset delivery |

<a id="更新ルール"></a>

## Maintenance rules

Write new and updated development specifications, the specification index, and maintained architecture documents in English. Preserve code identifiers and exact UI labels where quoted. Continue to maintain the public manual in `website/ja/` and `website/en/`; retain the existing language and paths of archived Japanese manuals and compatibility notices.

1. Check the affected feature specification and its referenced implementation and tests.
2. Update the relevant specification together with implementation and tests when behavior or contracts change. Update its review date and reference commit as well.
3. Define shared rules in the specification that owns them and link to it elsewhere. In particular, do not redefine persistence models, dates, permissions, or view scope separately for each feature.
4. For user-visible changes, verify the public target version and update the corresponding Japanese and English website pages. Do not describe development features as released.
5. If implementation and specifications differ, examine code, tests, and reproducible behavior, and state the discrepancy. Do not describe proposals as implemented behavior.
6. Do not create competing canonical documents for dated implementation instructions, plans, or reviews in this directory. Use Git history for the change record.

<a id="旧資料と互換パス"></a>

## Legacy documents and compatibility paths

Earlier implementation instructions, plans, reviews, and implementation records were checked against the current code and consolidated into feature specifications; duplicate documents were removed. Old statements such as “not implemented” or “complete,” and measurements from that time, are not evidence of current implementation status or performance guarantees.

- Keep the [archived Japanese user manual](manual_ja.md) as migration material for existing links; do not synchronize it. Retain its images and historical demo to preserve links.
- Keep the [legacy shared TimerSession contract entry point](timer-session-contract.md) as a compatibility link to the current timer specification.
- Retain `demo-current.gif`, which the root READMEs use, and the [manual maintenance guide](../website/MAINTENANCE.md) that documents how to generate it.
- The old timer architecture PNG was replaced by a [Mermaid architecture diagram](architecture/timer-session-architecture.md). Maintain the diagram alongside the timer specification.
- `.gitignore` tracks the index, feature specifications, and shared timer contract compatibility entry point. Do not reintroduce earlier local working documents as competing canonical specifications.
