# AGENTS.md

## Project Overview

Redmine Canvas Gantt is a Redmine plugin (Ruby on Rails backend + React 19 SPA under `spa/`).

* **Stack**: Ruby (Redmine 6.0/6.1/7.0), TypeScript, React 19, Vite 8, Zustand 5
* **Key Docs**:
  * Product Behavior: `README.md`
  * UI/Interaction Authority: `DESIGN.md` (takes precedence on all visual/layout decisions)
  * Guardrails & Known Pitfalls: `tasks/lessons.md`

## Critical Project Invariants

Follow these repository-specific invariants without deviation:

* **State & Mutations**: Route all task mutations through `spa/src/stores/taskStore/` (ServerSnapshot, LocalPatch, MutationOperation). Do not bypass this flow with isolated dirty tracking.
* **Date Handling**: Preserve local-date semantics for all date-only flows. Never use `toISOString()` or parse with `new Date('YYYY-MM-DD')`.
* **Asset Tracking**: Production assets build to `assets/build/`. Built files referenced in `assets/build/.vite/manifest.json` are tracked in Git. When changing frontend code that touches production output, keep git tracking and manifest in sync.
* **i18n Sync**: New frontend translation keys must be registered in both `config/locales/*.yml` and `app/controllers/canvas_gantts_controller.rb`.
* **API Boundaries**: Direct fetch/API additions must respect the allowlist in `spa/scripts/check-async-contract.mjs`.

## Autonomous Scope & Definition of Done

* **Autonomous Execution**: You have permission to implement changes, run relevant test suites, fix regressions caused by your changes, and iterate until green without seeking permission at every step.
* **Scope Discipline**: Keep changes targeted to the requested task. Do not refactor unrelated modules, introduce new dependencies, or touch database migrations unless explicitly instructed.
* **Completion Checklist**: A task is considered complete when:
  1. The requested feature or bugfix is implemented according to `DESIGN.md` and repository conventions.
  2. Targeted tests (unit/e2e/specs) covering the change pass cleanly.
  3. If lessons or recurring pitfalls were identified during implementation, document them concisely in `tasks/lessons.md`.

## Essential Commands

Run commands relevant to your task scope:

### Frontend (`spa/`)
* **Dev Server**: `npm run dev` (Set `CANVAS_GANTT_USE_VITE_DEV_SERVER=1` in Redmine dev)
* **Verify Changes**:
  * Unit Tests: `npx vitest run <path/to/test>` (or `npm run test -- --run`)
  * Type Check & Lint: `npx tsc -b && npm run lint`
  * Boundaries: `npm run check:async-contract`
* **Build Artifacts**: `npm run build`

### Backend (`spec/`)
Backend specs must run in the Redmine runtime environment.
* **Docker Setup**: See `tasks/backend-test-setup.md` (or run RSpec via `redmine` container with `BUNDLE_WITHOUT` unset).
* **Direct Runner**: `bundle exec rspec plugins/redmine_canvas_gantt/spec` (when run from Redmine root).
