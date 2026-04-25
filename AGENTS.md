# AGENTS.md

## Project Overview

Redmine Canvas Gantt is a Redmine plugin with a Ruby on Rails backend and a React SPA in `spa/`.

- Languages: Ruby for the backend, TypeScript for the frontend
- Frameworks: Redmine 6.x, React 19, Vite 7
- Architecture: Redmine plugin backend plus SPA frontend

## Source of Truth

- `README.md` and `README_ja.md` describe product behavior, supported workflows, and user-facing expectations.
- `DESIGN.md` is the canonical reference for UI, layout, spacing, typography, color, component, shadow, and interaction decisions.
- For any visual or interaction change, follow `DESIGN.md` first and keep the implementation consistent with it.
- If `DESIGN.md` conflicts with a shortcut or local convention, `DESIGN.md` wins.
- `tasks/lessons.md` records recurring implementation pitfalls and should be treated as a project-specific guardrail.
- `tasks/todo.md` is a working note file, not a canonical specification.

## Development Setup

### Backend / Redmine

- Mount this repository into a Redmine app as `plugins/redmine_canvas_gantt`.
- Start the local stack from the plugin root: `docker compose up -d --wait`.
- Redmine URL: `http://localhost:3000`.
- Load default data when needed:
  - `docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data`
  - `docker compose exec -T redmine bundle exec rake db:fixtures:load`

### Frontend / SPA

- Work from `spa/`.
- Install dependencies with `cd spa && npm ci`.
- Node.js 20 or newer is required.
- Start the Vite dev server with `cd spa && npm run dev`.
- Enable the plugin setting `use_vite_dev_server` to load live frontend assets.

## Build and Test Commands

### Frontend

- Build: `cd spa && npm run build`
- Build watch: `cd spa && npm run build:watch`
- Type check: `cd spa && tsc -b`
- Lint: `cd spa && npm run lint`
- Preview build: `cd spa && npm run preview`

### Frontend Tests

- Unit tests: `cd spa && npm run test -- --run`
- Watch mode: `cd spa && npm run test`
- Single file example: `cd spa && npx vitest run src/components/GanttContainer.resize.test.tsx`
- Standalone E2E: `cd spa && npm run test:e2e`
- Headed E2E: `cd spa && npm run test:e2e:headed`
- Redmine-backed Playwright: `cd spa && npx playwright test -c playwright.redmine.config.ts`
- Redmine 6.0 smoke test: `cd spa && npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/redmine-smoke.pw.ts`

### Backend Tests

- Do not run `bundle exec rspec` from the plugin directory; this directory does not contain a `Gemfile`.
- Run backend specs from the Redmine runtime environment.
- Docker: `docker compose exec -T redmine bundle exec rspec plugins/redmine_canvas_gantt/spec`
- Non-Docker: from the Redmine app root, run `bundle exec rspec plugins/redmine_canvas_gantt/spec`

### Benchmark

- Local benchmark: `cd spa && npm run benchmark`
- CI benchmark gate: `cd spa && npm run benchmark:ci`

## CI/CD

- CI workflow: `.github/workflows/ci.yml`
  - Runs frontend build, lint, unit tests, benchmark gate, Redmine 6.1 full E2E, and Redmine 6.0 compatibility smoke coverage.
- Release workflow: `.github/workflows/release.yml`
  - Runs only on pushed tags matching `v*`.
  - Creates a GitHub Release with generated notes.
  - Does not build, package, or upload VSIX or other artifacts.

## Code Style

- Keep Ruby idiomatic to Redmine and Rails conventions.
- Use 2-space indentation, `snake_case` for methods and files, and `CamelCase` for classes and modules.
- Keep frontend code small and testable; prefer focused helpers over large inline blocks.
- Follow the existing lint and TypeScript strictness in `spa/eslint.config.js` and the TypeScript project config.
- Favor minimal, targeted changes over broad refactors unless the task clearly requires them.

## Design Governance

- Apply `DESIGN.md` consistently across DOM UI, canvas renderers, dialogs, popovers, and help surfaces.
- Keep typography, spacing, radius, shadow, and color usage aligned with the design tokens instead of introducing one-off visual patterns.
- When changing fonts, update CSS, inline styles, canvas `ctx.font`, and any `measureText`-based sizing together.
- Canvas-based Gantt surfaces must visually match the surrounding SPA UI; do not treat canvas text and colors as a separate design system.

## Implementation Rules

- New frontend i18n keys must be added to both `config/locales/*.yml` and `app/controllers/canvas_gantts_controller.rb` so the SPA receives them.
- Date-only UI flows must stay on local-date semantics; do not mix local date handling with `toISOString()` or `new Date('YYYY-MM-DD')`.
- Query, filter, URL, and localStorage state changes require regression coverage because shared-state precedence is easy to break.
- Project filter visibility and other permission-sensitive UI must follow backend-provided candidates instead of reconstructing hidden options from task data.

## Security and Safety

- Do not commit API keys, tokens, or secrets.
- Keep secret configuration in environment variables or Redmine settings.
- Respect Redmine permissions: `view_canvas_gantt` and `edit_canvas_gantt`.
- Preserve the asset path safety checks around `/plugin_assets/redmine_canvas_gantt/build/*`.

## Repository Layout

```text
redmine_canvas_gantt/
├── init.rb
├── app/
│   ├── controllers/
│   └── views/
├── config/
│   ├── locales/
│   └── routes.rb
├── lib/redmine_canvas_gantt/
├── spec/
├── assets/build/
├── spa/
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

- `app/controllers/canvas_gantts_controller.rb` serves the main page, JSON endpoints, edit endpoints, relation endpoints, and fallback asset delivery.
- `lib/redmine_canvas_gantt/data_payload_builder.rb` builds task, relation, version, status, and project payloads for the SPA.
- `spa/` contains the React app, stores, renderers, API client, Vitest tests, and Playwright tests.
- `npm run build` writes frontend assets to `assets/build/`.
- On Redmine boot, `init.rb` links or copies built assets into `public/plugin_assets/redmine_canvas_gantt/build`.

## Working Rules

- Inspect the relevant source files before editing.
- Keep changes scoped to the request and avoid rewriting unrelated code.
- When you change behavior, run the most relevant test or validation command before finishing.
- If you fix a bug or change a recurring pattern, record the lesson in `tasks/lessons.md` when that file is part of the task.
- Frontend changes should follow the same validation order as CI where practical: `npm run build`, `npm run lint`, `npm run test -- --run`, then benchmark or Playwright when the scope touches performance or Redmine integration.
- Compatibility-sensitive changes should account for the local Redmine 6.0 Docker setup and the CI coverage for Redmine 6.1 full E2E plus 6.0 compatibility smoke.
