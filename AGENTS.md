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

## Documentation website (planned; applies as components are introduced)

- **Architecture and ownership:** Build the public user manual as a static VitePress site in `website/`, hosted on GitHub Pages. Keep the Markdown, site configuration, navigation, and documentation assets version-controlled in this repository. Do not make ChatGPT Sites, an external CMS, or a database the canonical documentation source. Keep site dependencies isolated from `spa/`.
- **Locales and navigation:** Use `website/ja/` and `website/en/` for Japanese and English content. Keep page structure, navigation, feature coverage, links, and major warnings aligned between locales. Do not silently present untranslated or machine-generated text as verified; clearly flag unfinished translations during review.
- **Existing sources:** Reuse and verify `README.md`, `README_ja.md`, `docs/manual_ja.md`, `QUERY_PARAMETERS*.md`, and existing `docs/images/` and demo GIFs as relevant. Once the website launches, treat its pages as the maintained user-guide source and keep README files as concise introductions that link to it. Migrate, redirect, or explicitly synchronize overlapping legacy manual content; avoid multiple divergent authoritative manuals.
- **Docs alongside features:** In a PR that changes visible UI, workflows, permissions, configuration, installation, supported versions, or user-observable behavior, update the affected website pages in the same PR once `website/` exists. Internal-only refactoring need not change docs. If documentation cannot be completed in that PR, identify the gap explicitly rather than describing unfinished functionality as available.
- **Grounding:** Verify user-facing claims against the implemented code, automated tests, and reproducible UI behavior. AI-generated drafts are proposals, not authoritative specifications. Never invent menu names, screenshots, defaults, permissions, command outputs, or supported behaviors. State version-specific differences and unresolved behavior explicitly.
- **Screenshots and examples:** Prefer real captures from a disposable/demo Redmine environment and reusable existing assets. Sanitize project names, issue details, user identities, credentials, API tokens, and other sensitive information. Do not depict generated mockups as actual application screenshots. Keep images accessible (alt text) and reasonably optimized for static hosting.
- **Versions and stable URLs:** Clearly identify which released plugin version the published manual covers; update that label when a release's documented behavior is verified. Keep stable page paths and redirects when reorganizing content. Add an archived versioned manual only when older releases require different instructions; do not imply that an unmaintained version is supported.
- **Validation and deployment:** When adding the website, define reproducible `website/package.json` scripts (including `docs:build`) and `.github/workflows/docs.yml`. On documentation PRs, check the VitePress production build, internal links, navigation, referenced assets, and relevant locale completeness. After merge to `main`, deploy the built static output to GitHub Pages; never deploy PR content as production. Configure the Pages base path for `/redmine_canvas_gantt/` unless a verified custom-domain configuration supersedes it. Use minimal GitHub Actions permissions and keep publishing separate from the plugin's release workflow.
- **Scope and safety:** The website is a user manual, not a live Redmine backend. Avoid adding server APIs, a database, authentication, analytics, or external services unless a concrete requirement justifies them. Preserve the existing plugin build and CI behavior. Since `website/` and `docs.yml` do not exist yet, do not run nonexistent documentation scripts or claim deployment checks passed.

## Verification (run from `spa/` unless noted)

| Scope | Commands / checks |
| --- | --- |
| Focused frontend test | `npm run test -- --run src/utils/businessCalendar.test.ts` (substitute the affected test) |
| Frontend TS/TSX | `npm run lint`; `npm run test -- --run` when breadth is warranted |
| API/store changes | `npm run check:async-contract` and relevant tests |
| Frontend bundling or tracked assets | `npm run build`; inspect manifest and build outputs |
| Ruby backend | Focused RSpec in a prepared Redmine environment; CI runs `docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle exec rspec plugins/redmine_canvas_gantt/spec` from the repo root |
| Redmine UI | With the disposable test stack running: `npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/business-calendar.pw.ts` (or the affected suite) |
| Documentation website (after setup) | From `website/`: `npm ci`, `npm run docs:build`, and the link/asset/locale checks defined in `website/package.json` and `.github/workflows/docs.yml` |
| Cross-boundary / release | Validate both sides and consult `.github/workflows/ci.yml`; date changes merit Asia/Tokyo and America/Los_Angeles coverage |

- Prefer meaningful regression tests for behavior, races, data boundaries, and past failures; avoid tests that only mirror implementation details. Broaden testing only when impact or failure justifies it.
- Never reset shared databases, load destructive fixtures, remove Docker volumes, or run `docker compose down -v` unless the environment is explicitly disposable and the action is authorized.
- Distinguish newly introduced failures from pre-existing failures; rerun affected checks after fixes. Report checks not run or blocked rather than implying they passed.

## Finish and authorization

- Review the diff for unrelated edits, contract drift, missing documentation/tests, and generated artifacts. Report changes, executed checks, remaining risks, and unknowns; distinguish observed facts from hypotheses.
- Do not commit, amend, merge, rebase, reset, push, open PRs, delete data, or modify external systems without explicit authorization. Preserve unrelated working-tree changes.

## References (open only if relevant)

- `README.md` / `README_ja.md`: behavior, installation, calendar formats.
- `docs/manual_ja.md`, `QUERY_PARAMETERS.md` / `QUERY_PARAMETERS_ja.md`: existing end-user manual and query documentation.
- `website/` (once introduced): public manual source, site config, assets, and localized navigation.
- `spa/package.json`, `.github/workflows/ci.yml`: real commands, versions, CI matrix.
- `website/package.json`, `.github/workflows/docs.yml` (once introduced): documentation build, validation, and deployment.
- `spa/src/utils/dateOnly.ts`, `spa/src/stores/TaskStore.ts`, `spa/src/stores/taskStore/`: date and state contracts.
- `lib/redmine_canvas_gantt/business_calendar_loader.rb`, `business_calendar_repository.rb`, `project_calendar_resolver.rb`: calendar pipeline.
- `spa/tests/e2e-redmine/`: integration scenarios and fixtures.
