# AGENTS.md

## Project

Redmine Canvas Gantt is a Redmine plugin with a Ruby on Rails backend and a React SPA under `spa/`.

Supported Redmine versions:

* Redmine 6.0
* Redmine 6.1
* Redmine 7.0

Frontend stack includes React 19, TypeScript, Vite, and Zustand.

Use the repository as the primary source of truth. Read supporting documentation only when it is relevant to the task.

## Invariants

### Task state and mutations

Route task mutations through `spa/src/stores/taskStore/`.

Preserve the existing state model based on:

* ServerSnapshot
* LocalPatch
* MutationOperation

Do not introduce parallel dirty-state, mutation-state, or synchronization mechanisms unless required to replace the existing model coherently.

When changing task mutation behavior, consider both automatic-save and manual-save flows.

### Date-only values

Treat `YYYY-MM-DD` values as local calendar dates.

Do not use:

* `toISOString()` for date-only conversion
* `new Date('YYYY-MM-DD')` for date-only parsing

Preserve local-date semantics across UI, store, API, and backend boundaries.

### Baseline and server state

Keep server-derived state and locally edited state distinguishable.

Do not update baselines from stale or superseded asynchronous responses.

When multiple requests can overlap, preserve the existing generation/versioning rules that prevent older responses from overwriting newer state.

### Relationships

Preserve Redmine-supported relationship behavior and repository-specific restrictions.

Do not silently persist relationship types that the plugin intentionally rejects or treats as unsupported.

### Workload and actual work

When comparing planned and actual workload, apply equivalent issue-selection semantics unless a documented product rule explicitly requires otherwise.

Actual time-entry queries must preserve Redmine visibility and project/issue access rules.

Avoid loading large raw time-entry datasets into the frontend when aggregation can be performed safely on the backend.

### UI behavior

`DESIGN.md` is authoritative for visual and interaction behavior.

Do not infer a new interaction model from implementation convenience when `DESIGN.md` defines the behavior.

### Generated assets

Do not manually edit generated production assets.

When frontend changes require tracked generated assets, regenerate them through the repository's existing build process and include the resulting files.

## References

Read these only when relevant:

* `README.md` — product behavior and supported features
* `DESIGN.md` — UI and interaction behavior
* `tasks/lessons.md` — known regressions, pitfalls, and implementation lessons

Use feature-specific design or task documents when the requested work explicitly concerns that feature.

Repository-specific documentation takes precedence over general framework conventions when they conflict.

## Validation

Use the smallest sufficient validation set for the changed area.

For frontend changes:

* run relevant frontend tests;
* run the production build when generated assets or bundling can be affected.

For backend changes:

* run relevant Ruby/Rails tests.

For changes crossing frontend/backend, persistence, state-management, or date boundaries, validate both sides of the boundary.

When fixing a regression, add or update a regression test when practical.

If a relevant check fails:

1. determine whether the failure was caused by the requested change;
2. fix failures caused by the change;
3. rerun the affected checks.

Do not run unrelated exhaustive validation mechanically when narrower checks provide sufficient confidence.

## Completion

Continue until:

* the requested behavior is implemented;
* directly caused regressions are resolved;
* relevant validation passes;
* required generated assets are updated;
* implementation and documented behavior remain consistent.

Do not stop after the first implementation merely to request confirmation before testing or fixing directly caused failures.

## Boundaries

Fix issues directly caused by the requested change.

Do not expand into unrelated:

* refactoring;
* cleanup;
* dependency upgrades;
* architecture changes;
* behavioral changes.

Small adjacent changes are acceptable when required for correctness, consistency, or reliable validation.

When a broader change appears desirable but is not necessary for the requested work, leave it out and report it separately.

### API and i18n boundaries

New direct API access must comply with
`spa/scripts/check-async-contract.mjs`.
Do not bypass existing stores or API abstractions.

Keep new frontend translation keys synchronized with
`config/locales/*.yml`, `app/controllers/canvas_gantts_controller.rb`,
and the backend i18n payload.

### Git safety

Do not commit, amend, merge, rebase, reset, push, or alter remote branches unless explicitly requested.
Preserve unrelated working-tree changes.
