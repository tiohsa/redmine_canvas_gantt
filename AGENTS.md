# AGENTS.md — Redmine Canvas Gantt

## Project and approach

- Redmine plugin: Ruby/Rails backend, React 19 + TypeScript 5.9 + Vite + Zustand SPA (`spa/`). Support Redmine 6.0, 6.1, and 7.0.
- Node.js runtime: `spa/` requires `^20.19.0 || >=22.12.0`; `website/` requires `>=22`.
- Follow existing code and tests. Read documentation only for the affected area; do not require a repository-wide survey for small changes.
- Make the smallest coherent change. Preserve unrelated work, public contracts, compatibility, and existing UX. Avoid speculative refactoring, new dependencies, and duplicate infrastructure.
- For complex or cross-boundary work, identify invariants and regression scenarios first. Keep simple fixes lightweight; complete implementation, relevant verification, and directly caused fixes without unnecessary approval pauses.

## Invariants worth protecting

- **Task persistence:** Use the existing `ServerSnapshot` / `LocalPatch` / `MutationOperation` model in `spa/src/stores/TaskStore.ts`, `EditMetaStore.ts`, and `spa/src/stores/taskStore/`. Preserve auto-save, sequential manual-save settlement, draft intents, conflict recovery, and atomic mutations. Do not add competing dirty-state or save pipelines.
- **Async boundaries:** Preserve request generation, view context, and revision guards: stale or superseded responses must not overwrite current task state, baselines, or edits. Route reads/writes through existing store, service, and API layers; obey `spa/scripts/check-async-contract.mjs`.
- **Date-only:** Redmine `YYYY-MM-DD` values are calendar dates, not instants. `spa/src/utils/dateOnly.ts` represents them as UTC midnight for timezone-independent calculation, **not** as a local timestamp. Use its conversions; never parse via `new Date('YYYY-MM-DD')` or serialize date-only values with `toISOString()`. Use local dates only at explicit display/today boundaries. Check timezone and DST edge cases.
- **Relations and scheduling:** Preserve Redmine issue visibility, permissions, supported relation types, manual relation drafts, atomic schedule updates, optimistic revisions, and conflict recovery. Keep derived parent issue dates server-owned (Redmine calculates parent dates from children; do not synthesize client-side parent mutations). For dependency calculations, use the successor issue's project calendar where required.
- **Baselines:** Preserve baseline snapshot lifecycle and comparison models. Enforce the `manage_canvas_gantt_baseline` permission on creation and deletion; route baseline updates through `useBaselineStore` and the existing API contracts.
- **Calendars:** Keep Ruby loader/repository/resolver, API, and SPA consistent. YAML supports inheritance, project mapping, and working-day overrides. Root `holiday.csv` uses one shared `global` calendar; CSV and YAML may not coexist in that directory. Invalid reloads must not replace the last valid snapshot. When changing CSV parsing, cover headered/headerless cases as applicable, invalid/duplicate dates, and first-row data loss; do not describe proposed behavior as already implemented.
- **Workload and security:** Enforce Redmine project, issue, and time-entry visibility server-side. Keep planned and actual issue scopes consistent unless specified otherwise; aggregate large datasets server-side. Do not expose restricted data in API responses or logs.
- **UI and localization:** Preserve established interactions, dialog viewport containment, and accessibility. Keep added i18n keys aligned across `config/locales/*.yml`, `app/controllers/canvas_gantts_controller.rb` (`I18N_LABELS`), and the SPA payload (`i18n.t` and `tr` calls), validated by `npm run check:i18n-contract`.
- **Generated files:** Never edit `assets/build/` by hand. Regenerate through `spa` build scripts and include the manifest and its referenced assets when required. `check:build-artifacts` compares files with `HEAD`; its archive check belongs after the necessary artifacts are committed or in CI.

## Documentation ownership and maintenance

- **Canonical development specifications:** `docs/README.md` indexes the feature specifications in `docs/specifications/`. Write new and updated development specifications in English, preserving code identifiers and exact UI labels where quoted. This language policy also applies to the specification index and maintained architecture documents under `docs/`; archived Japanese manuals and compatibility notices retain their existing language and paths. These are the maintained source of truth for current implementation behavior, state transitions, permissions, API and persistence contracts. Update the affected specifications alongside feature or contract changes, including internal-only contract changes. Verify against code and tests; distinguish observed implementation, unresolved limitations, and proposed behavior. Record the reviewed commit/date and keep development HEAD separate from the public manual's released version. Do not recreate dated instructions, planning notes, or review reports in `docs/` as competing specifications.
- **Canonical manual:** `website/ja/` and `website/en/` are the sole maintained public user manual. Keep this static VitePress site, its navigation, configuration, and assets version-controlled here, with dependencies isolated from `spa/`.
- **README scope:** `README.md` and `README_ja.md` contain the product introduction, feature overview, demo, requirements, minimal installation and Quick Start, and links to the manual and developer information. Update them only when these entry-point details change; put detailed workflows and configuration in Website Docs. Link from README only to the Japanese and English manual homepages; manage installation, feature, settings, and troubleshooting navigation in VitePress. Demo asset and developer-guide links remain appropriate. Preserve existing README anchors and important short safety warnings.
- **Docs alongside features:** Include the affected Japanese and English Website pages in the same change when visible UI, workflows, permissions, configuration, installation, supported versions, or user-observable behavior changes. Internal-only refactoring need not change docs. Identify any unfinished documentation explicitly rather than describing unfinished functionality as available.
- **Locales and navigation:** Keep page structure, navigation, feature coverage, links, and major warnings aligned between locales. Do not silently present untranslated or machine-generated text as verified; clearly flag unfinished translations during review.
- **Legacy references:** `docs/manual_ja.md` and `QUERY_PARAMETERS*.md` are archives retained for existing links, not synchronized manuals. Preserve their file paths and migration notices. Before removing README detail, verify that the relevant Website pages retain the necessary information.
- **Grounding and release scope:** Verify claims against code, tests, and reproducible UI behavior for the documented release. The manual currently covers v0.19.0. Consult `website/MAINTENANCE.md` for maintenance records, capture environments, and asset dimensions. Do not describe development HEAD features as released or update the target version without checking the release tag. AI-generated drafts are proposals; never invent labels, screenshots, defaults, permissions, command outputs, or supported behavior. State version differences and unresolved behavior explicitly.
- **Screenshots and examples:** Prefer real captures from disposable/demo Redmine environments and reusable existing assets. Use the reproducible scripts in `website/scripts/` (`capture-core.mjs`, `capture-panels.mjs`, `capture-display.mjs`, `encode-recordings.mjs`, `manual-demo.rb`). Sanitize identities, issue details, credentials, API tokens, and sensitive information. Do not depict generated mockups as application screenshots. Provide alt text and reasonably optimized assets.
- **Versions and stable URLs:** Keep the documented release visible and existing page paths stable. Add an archived versioned manual only when older releases require different instructions; do not imply an unmaintained release is supported.
- **Validation and deployment:** Run `website/` link, asset, locale-structure and README compatibility checks, the VitePress production build, and browser smoke tests. `.github/workflows/docs.yml` validates documentation and publishes only pushes to `main`, never PR content. Keep `/redmine_canvas_gantt/` as the Pages base unless a verified custom domain supersedes it; use minimal Actions permissions and preserve separate plugin CI and release workflows. Local checks do not prove a production deployment succeeded.
- **Scope:** Keep the website a static user manual. Do not add backend APIs, a database, authentication, analytics, or external services without a concrete requirement. Preserve existing Ruby, SPA, permission, date, mutation, build, and CI contracts.

## Verification (run from `spa/` unless noted)

| Scope | Commands / checks |
| --- | --- |
| Focused frontend test | `npm run test -- --run src/utils/businessCalendar.test.ts` (substitute the affected test) |
| Frontend TS/TSX | `npm run lint`; `npm run test -- --run` when breadth is warranted |
| Async / mutation contract | `npm run check:async-contract` and relevant tests |
| Frontend i18n contract | `npm run check:i18n-contract` (aligns controller `I18N_LABELS`, SPA calls, and locale YAMLs) |
| Mock E2E tests (fast, no Docker) | `npx playwright test tests/e2e/gantt-conflicts.pw.ts` (substitute affected mock suite under `spa/tests/e2e/`) |
| Frontend bundling or tracked assets | `npm run build`; inspect manifest and build outputs; `npm run check:build-artifacts` |
| Supply chain / security | `npm run security:supply-chain` |
| Performance / benchmark | `npm run benchmark:critical-path` or `npm run benchmark:ci:run` |
| Ruby backend | Focused RSpec in a prepared Redmine environment; CI runs `docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle exec rspec plugins/redmine_canvas_gantt/spec` from the repo root |
| Redmine UI (integrated, disposable stack) | With running Docker stack: `npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/business-calendar.pw.ts` (or affected suite) |
| Documentation website | From `website/`: `npm ci`, `npm run check`, `npm run docs:build`, and `npm run test:smoke` |
| Cross-boundary / release | Validate both sides and consult `.github/workflows/ci.yml`; date changes merit Asia/Tokyo and America/Los_Angeles coverage (`TZ=Asia/Tokyo npm run test -- --run src/domain/timer/timerDomain.timezone.test.ts`) |

- Prefer meaningful regression tests for behavior, races, data boundaries, and past failures; avoid tests that only mirror implementation details. Broaden testing only when impact or failure justifies it.
- Never reset shared databases, load destructive fixtures, remove Docker volumes, or run `docker compose down -v` unless the environment is explicitly disposable and the action is authorized.
- Distinguish newly introduced failures from pre-existing failures; rerun affected checks after fixes. Report checks not run or blocked rather than implying they passed.

## Finish and authorization

- Review the diff for unrelated edits, contract drift, missing documentation/tests, and generated artifacts. Report changes, executed checks, remaining risks, and unknowns; distinguish observed facts from hypotheses.
- Do not commit, amend, merge, rebase, reset, push, open PRs, delete data, or modify external systems without explicit authorization. Preserve unrelated working-tree changes.

## References (open only if relevant)

- `docs/README.md`: current feature specification index and maintenance policy; follow its links to the affected development specifications.
- `README.md` / `README_ja.md`: product introduction and Quick Start.
- `docs/manual_ja.md`, `QUERY_PARAMETERS.md` / `QUERY_PARAMETERS_ja.md`: archived manual and query references for link compatibility.
- `website/`: public manual source, site config, assets, and localized navigation.
- `website/MAINTENANCE.md`: manual update procedures, asset specs, and capture fixtures.
- `spa/package.json`, `.github/workflows/ci.yml`: real commands, versions, CI matrix.
- `website/package.json`, `.github/workflows/docs.yml`: documentation build, validation, and deployment.
- `spa/src/utils/dateOnly.ts`, `spa/src/stores/TaskStore.ts`, `spa/src/stores/EditMetaStore.ts`, `spa/src/stores/BaselineStore.ts`, `spa/src/stores/taskStore/`: date, persistence, and state contracts.
- `lib/redmine_canvas_gantt/business_calendar_loader.rb`, `business_calendar_repository.rb`, `project_calendar_resolver.rb`: calendar pipeline.
- `lib/redmine_canvas_gantt/schedule_mutation_coordinator.rb`, `baseline_repository.rb`: backend mutation and persistence pipeline.
- `spa/tests/e2e/`: mock Playwright end-to-end suites.
- `spa/tests/e2e-redmine/`: integration scenarios and fixtures.
