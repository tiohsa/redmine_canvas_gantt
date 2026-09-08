# AGENTS.md

## Project

Redmine Canvas Gantt is a Redmine plugin with a Ruby on Rails backend and a React SPA under `spa/`.

- **Backend**: Ruby / Redmine 6.0, 6.1, 7.0
- **Frontend**: TypeScript, React 19, Vite 8, Zustand 5
- **Product behavior**: `README.md`
- **UI / interaction authority**: `DESIGN.md`
- **Known pitfalls**: `tasks/lessons.md`
- **Backend test setup**: `tasks/backend-test-setup.md`

Use this file as the repository execution map. Read deeper docs only when relevant.

## Instruction Priority

1. Current task requirements
2. Critical invariants in this file
3. `DESIGN.md`
4. Existing architecture and repository conventions
5. `README.md` / `tasks/lessons.md`

If the task intentionally changes documented behavior, follow the task.

## Execution

Bias toward action.

For implementation work:

1. Inspect
2. Identify the execution and state path
3. Implement the smallest coherent fix
4. Run targeted verification
5. Fix regressions caused by the change
6. Review the final diff
7. Report results

Do not ask for routine clarification when repository context provides a reasonable answer.

If an optional analysis/indexing tool is unavailable, continue with direct repository inspection unless that tool is essential to correctness.

## Critical Invariants

### Task State

All task mutations must flow through:

`spa/src/stores/taskStore/`

Preserve `ServerSnapshot`, `LocalPatch`, and `MutationOperation`.

Do not introduce parallel dirty tracking or ad-hoc mutation paths.

### Date-Only Values

Preserve local-date semantics.

Do not use `new Date('YYYY-MM-DD')` or `toISOString()` for date-only flows when timezone conversion can occur.

### API Boundaries

New direct API access must comply with:

`spa/scripts/check-async-contract.mjs`

Do not bypass established stores or API abstractions with isolated `fetch` calls.

### i18n

New frontend translation keys must be synchronized with:

- `config/locales/*.yml`
- `app/controllers/canvas_gantts_controller.rb`

### Production Assets

Production assets are generated under `assets/build/`.

Files referenced by `assets/build/.vite/manifest.json` are tracked in Git.

When production output changes, keep generated assets and the manifest synchronized.

## Scope

Make the smallest coherent change that fully solves the task.

Do not:

- refactor unrelated code;
- add dependencies without need;
- modify database migrations unless required;
- change unrelated behavior;
- create parallel mechanisms where an existing abstraction exists.

Prefer fixing the root cause over retries, forced rerenders, duplicate synchronization, arbitrary delays, or symptom-only workarounds.

Do not modify production behavior merely to satisfy a test whose environment assumptions are incorrect.

## Git Safety

Do not commit, amend, merge, rebase, push, create a PR, or alter remote branches unless explicitly requested.

Preserve unrelated pre-existing working-tree changes.

Do not reset, checkout, clean, or overwrite files outside the requested scope.

Generated files required by the task may be updated, but do not create Git history merely to make a HEAD-based verification check pass.

## Investigation

Before modifying behavior, inspect as relevant:

- implementation path;
- authoritative state owner;
- callers and consumers;
- related tests;
- `DESIGN.md`;
- applicable `tasks/lessons.md`.

For regressions, identify the causal path before applying a workaround.

Do not infer root cause from a single failing test or visible symptom.

## Verification

Use verification proportional to the change.

Prefer targeted checks during iteration. Broaden only when shared infrastructure, state management, dependency impact, or regression risk justifies it.

When a check fails, classify the failure before changing code:

1. **Regression** — caused by the current change
2. **Pre-existing failure** — reproducible without the change
3. **Environment failure** — missing runtime, dependency, locale, service, or configuration
4. **Working-tree/Git-state constraint** — output is internally consistent but a check depends on committed HEAD state

Fix regressions caused by the task.

Do not alter product behavior to hide environment or pre-existing failures. Report such failures with the evidence needed to reproduce them.

### Frontend

From `spa/`:

```bash
npx vitest run <path/to/test>
```

or:

```bash
npm run test -- --run
```

When relevant:

```bash
npx tsc -b
npm run lint
npm run check:async-contract
npm run build
```

After production builds:

- inspect the Git diff;
- verify the manifest references existing generated assets;
- distinguish worktree consistency from checks that require generated files to already exist in `HEAD`.

### Backend

See:

`tasks/backend-test-setup.md`

From the Redmine root:

```bash
bundle exec rspec plugins/redmine_canvas_gantt/spec
```

Prefer targeted specs first.

If the documented runtime is unavailable or incomplete, report the exact environment failure rather than treating the spec as a product failure.

## Definition of Done

A task is complete when:

- requested behavior is implemented;
- repository invariants are preserved or intentionally changed;
- relevant targeted verification passes;
- regressions caused by the change are fixed;
- generated assets are synchronized when applicable;
- the final diff contains no accidental unrelated changes.

Update `tasks/lessons.md` only for reusable repository-specific lessons.

A task may still be reported as implementation-complete when an environment-dependent check cannot run, provided the limitation and remaining verification gap are explicit.

## Final Response

Keep the completion report concise:

- what changed;
- important implementation decisions;
- verification performed;
- failed or unavailable checks and their classification;
- unresolved risks.

Clearly distinguish implementation failures from environment or tooling limitations.
