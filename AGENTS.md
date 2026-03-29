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

---

自信度: ★★★★★

画像の内容を正確に文字起こししました。このテキストは、AI（特にエージェント型AI）が効率的かつ正確にタスクを遂行するためのワークフロー定義として構成されています。

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
