# AGENTS.md

## Project Overview

Redmine Canvas Gantt is a high-performance Canvas-based Gantt chart plugin for Redmine. The backend is a Redmine plugin built with Ruby on Rails, and the frontend is a React SPA in `spa/`.

- Languages: Ruby (backend), TypeScript (frontend)
- Frameworks: Redmine 6.x, React 19, Vite 7
- Architecture: Redmine plugin backend + SPA frontend

## Dev Environment Setup

### Backend / Redmine

- Mount this repository into a Redmine app as `plugins/redmine_canvas_gantt`
- Start the local stack from the plugin root: `docker compose up -d --wait`
- Redmine URL: `http://localhost:3000`
- Load initial data when needed:
  - `docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data`
  - `docker compose exec -T redmine bundle exec rake db:fixtures:load`

### Frontend / SPA

- Working directory: `spa/`
- Install dependencies: `cd spa && npm ci`
- Required Node.js version: 20+
- Start the Vite dev server: `cd spa && npm run dev`
- To use live frontend assets, enable the plugin setting `use_vite_dev_server`

## Build Commands

- SPA build: `cd spa && npm run build`
- SPA build watch: `cd spa && npm run build:watch`
- TypeScript type check: `cd spa && tsc -b`
- ESLint: `cd spa && npm run lint`
- Preview built SPA: `cd spa && npm run preview`

## Testing Instructions

### Frontend Unit Tests

- Run all unit tests: `cd spa && npm run test -- --run`
- Watch mode: `cd spa && npm run test`
- Run one file: `cd spa && npx vitest run src/components/GanttContainer.resize.test.tsx`

### Frontend E2E Tests

- Standalone Playwright tests: `cd spa && npm run test:e2e`
- Headed Playwright tests: `cd spa && npm run test:e2e:headed`
- Redmine-backed Playwright tests: `cd spa && npx playwright test -c playwright.redmine.config.ts`
- Redmine 6.0 compatibility smoke test: `cd spa && npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/redmine-smoke.pw.ts`

### Backend Tests

- Do not run `bundle exec rspec` from the plugin directory; this directory does not contain a `Gemfile`
- Run backend specs from the Redmine runtime environment
- Docker command: `docker compose exec -T redmine bundle exec rspec plugins/redmine_canvas_gantt/spec`
- Non-Docker command: from the Redmine app root, run `bundle exec rspec plugins/redmine_canvas_gantt/spec`

### Benchmark Gate

- Local benchmark run: `cd spa && npm run benchmark`
- CI-style benchmark gate: `cd spa && npm run benchmark:ci`

## Code Style

- Frontend lint config: `spa/eslint.config.js`
- TypeScript strict mode is enabled
  - `noUnusedLocals`
  - `noUnusedParameters`
  - `noFallthroughCasesInSwitch`
- Prefer small, testable UI/state helpers over large inline blocks
- Keep Ruby code idiomatic to Redmine/Rails conventions
  - 2-space indentation
  - `snake_case` methods and files
  - `CamelCase` classes and modules

## CI/CD

GitHub Actions workflow: `.github/workflows/ci.yml`

- `spa-test`: install dependencies, lint, run Vitest
- `spa-benchmark`: run the benchmark regression gate
- `e2e-redmine-61`: build SPA, boot Docker Redmine 6.1, run full Playwright integration tests
- `e2e-redmine-60-compat`: build SPA, boot Docker Redmine 6.0, run compatibility smoke tests

## Security Considerations

- Do not commit API keys, tokens, or secrets
- Keep secret configuration in environment variables or Redmine settings
- Respect Redmine permissions: `view_canvas_gantt` and `edit_canvas_gantt`
- Preserve the asset path safety checks around `/plugin_assets/redmine_canvas_gantt/build/*`

## Architecture

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
└── .github/workflows/ci.yml
```

- `app/controllers/canvas_gantts_controller.rb` serves the main page, JSON data endpoints, edit endpoints, relation endpoints, and fallback asset delivery
- `lib/redmine_canvas_gantt/data_payload_builder.rb` builds task, relation, version, status, and project payloads for the SPA
- `spa/` contains the React application, Zustand stores, renderers, API client, Vitest tests, and Playwright tests
- `npm run build` writes frontend assets to `assets/build/`
- On Redmine boot, `init.rb` links or copies built assets into `public/plugin_assets/redmine_canvas_gantt/build`
