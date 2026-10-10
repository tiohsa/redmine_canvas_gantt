# AGENTS.md — Redmine Canvas Gantt

## Project and approach

- Redmine plugin: Ruby/Rails backend, React 19 + TypeScript 5.9 + Vite + Zustand SPA (`spa/`). Support Redmine 6.0, 6.1, and 7.0.
- Follow existing code and tests. Read documentation only for the affected area; do not require a repository-wide survey for small changes.
- Make the smallest coherent change. Preserve unrelated work, public contracts, compatibility, and existing UX. Avoid speculative refactoring, new dependencies, and duplicate infrastructure.
- For complex or cross-boundary work, identify invariants and regression scenarios first. Keep simple fixes lightweight; complete implementation, relevant verification, and directly caused fixes without unnecessary approval pauses.

## Invariants worth protecting

- **Task persistence:** Use the existing `ServerSnapshot` / `LocalPatch` / `MutationOperation` model in `spa/src/stores/TaskStore.ts` and `spa/src/stores/taskStore/`. Preserve auto-save, manual-save, drafts, conflict handling, and atomic mutations. Do not add competing dirty-state or save pipelines.
- **Async boundaries:** Preserve request generation, view context, and revision guards: stale or superseded responses must not overwrite current task state, baselines, or edits. Route reads/writes through existing store, service, and API layers; obey `spa/scripts/check-async-contract.mjs`.
- **Date-only:** Redmine `YYYY-MM-DD` values are calendar dates, not instants. `spa/src/utils/dateOnly.ts` represents them as UTC midnight for timezone-independent calculation, **not** as a local timestamp. Use its conversions; never parse via `new Date('YYYY-MM-DD')` or serialize date-only values with `toISOString()`. Use local dates only at explicit display/today boundaries. Check timezone and DST edge cases.
- **Relations and scheduling:** Preserve Redmine issue visibility, permissions, supported relation types, atomic schedule updates, optimistic revisions, and conflict responses. For dependency calculations, use the successor issue's project calendar where required.
- **Calendars:** Keep Ruby loader/repository/resolver, API, and SPA consistent. YAML supports inheritance, project mapping, and working-day overrides. Root `holiday.csv` uses one shared `global` calendar; CSV and YAML may not coexist in that directory. Invalid reloads must not replace the last valid snapshot. When changing CSV parsing, cover headered/headerless cases as applicable, invalid/duplicate dates, and first-row data loss; do not describe proposed behavior as already implemented.
- **Workload and security:** Enforce Redmine project, issue, and time-entry visibility server-side. Keep planned and actual issue scopes consistent unless specified otherwise; aggregate large datasets server-side. Do not expose restricted data in API responses or logs.
- **UI and localization:** Preserve established interactions and accessibility. Keep added i18n keys aligned across `config/locales/*.yml`, `app/controllers/canvas_gantts_controller.rb`, and the SPA payload.
- **Generated files:** Never edit `assets/build/` by hand. Regenerate through `spa` build scripts and include the manifest and its referenced assets when required. `check:build-artifacts` compares files with `HEAD`; its archive check belongs after the necessary artifacts are committed or in CI.

## Verification (run from `spa/` unless noted)

| Scope | Commands / checks |
| --- | --- |
| Focused frontend test | `npm run test -- --run src/utils/businessCalendar.test.ts` (substitute the affected test) |
| Frontend TS/TSX | `npm run lint`; `npm run test -- --run` when breadth is warranted |
| API/store changes | `npm run check:async-contract` and relevant tests |
| Frontend bundling or tracked assets | `npm run build`; inspect manifest and build outputs |
| Ruby backend | Focused RSpec in a prepared Redmine environment; CI runs `docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle exec rspec plugins/redmine_canvas_gantt/spec` from the repo root |
| Redmine UI | With the disposable test stack running: `npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/business-calendar.pw.ts` (or the affected suite) |
| Cross-boundary / release | Validate both sides and consult `.github/workflows/ci.yml`; date changes merit Asia/Tokyo and America/Los_Angeles coverage |

- Prefer meaningful regression tests for behavior, races, data boundaries, and past failures; avoid tests that only mirror implementation details. Broaden testing only when impact or failure justifies it.
- Never reset shared databases, load destructive fixtures, remove Docker volumes, or run `docker compose down -v` unless the environment is explicitly disposable and the action is authorized.
- Distinguish newly introduced failures from pre-existing failures; rerun affected checks after fixes. Report checks not run or blocked rather than implying they passed.

## Finish and authorization

- Review the diff for unrelated edits, contract drift, missing documentation/tests, and generated artifacts. Report changes, executed checks, remaining risks, and unknowns; distinguish observed facts from hypotheses.
- Do not commit, amend, merge, rebase, reset, push, open PRs, delete data, or modify external systems without explicit authorization. Preserve unrelated working-tree changes.

## References (open only if relevant)

- `README.md` / `README_ja.md`: behavior, installation, calendar formats.
- `spa/package.json`, `.github/workflows/ci.yml`: real commands, versions, CI matrix.
- `spa/src/utils/dateOnly.ts`, `spa/src/stores/TaskStore.ts`, `spa/src/stores/taskStore/`: date and state contracts.
- `lib/redmine_canvas_gantt/business_calendar_loader.rb`, `business_calendar_repository.rb`, `project_calendar_resolver.rb`: calendar pipeline.
- `spa/tests/e2e-redmine/`: integration scenarios and fixtures.
