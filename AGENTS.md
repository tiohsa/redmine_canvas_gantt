# Repository Guidelines

日本語で回答してください。

## Project Structure & Modules
- `docker-compose.yml`: spins up Redmine (development mode) plus MariaDB; mounts local `plugins/` and `themes/`.
- Plugin code lives in `plugins/redmine_canvas_gantt/`: Rails endpoints in `app/`, routes in `config/routes.rb`, Vite asset helper in `lib/`, and the React/Vite SPA under `assets/spa/`. Built assets land in `assets/build/` and are served via the helper.
- View entrypoint is `app/views/canvas_gantts/index.html.erb`, mounting the SPA and wiring auth/i18n. Controller logic sits in `app/controllers/canvas_gantts_controller.rb`.
- Specs folder exists but is empty; add new tests under `spec/` (controllers, features, models) as you contribute.

## Build, Test, and Development Commands
- Start stack: `docker compose up -d` (from repo root). Load default data if needed: `docker compose exec -e REDMINE_LANG=ja redmine bundle exec rake redmine:load_default_data`.
- Frontend setup (once): `cd plugins/redmine_canvas_gantt/assets/spa && pnpm install`.
- Frontend dev server: `pnpm run dev` (serves on `localhost:5173`, auto-injected when `RAILS_ENV=development`).
- Frontend production bundle: `pnpm run build` (writes manifest + assets to `assets/build/`).
- Lint: `pnpm run lint`; Unit/UI tests: `pnpm run test` (Vitest + Testing Library).
- If you add Ruby-side DB changes, run migrations in container: `docker compose exec redmine bundle exec rake redmine:plugins:migrate`.

## Coding Style & Naming Conventions
- Ruby: 2-space indent, snake_case methods, keep controllers thin and reuse Redmine permissions/helpers; wrap user-facing text in i18n keys (`l(:label_key)`).
- React/TypeScript: strict TS (`tsconfig.app.json`), functional components, hooks, and Zustand stores live in `src/`. Keep renderers/engines in `src/renderers` and `src/engines` to preserve separation of concerns. Follow the flat ESLint config; no Prettier is enforced.
- Assets: Vite base path is `/plugin_assets/redmine_canvas_gantt/build/` in production—avoid hardcoding other URLs.

## Testing Guidelines
- Frontend: prefer Vitest with Testing Library; co-locate test files near components/engines. Mock network calls from `src/api/client.ts`.
- Backend: add controller/request specs under `spec/controllers` or feature specs under `spec/features` to cover JSON responses, permissions, and optimistic locking paths.
- Cover at least the happy path and permission/locking error paths when changing task updates.

## Commit & Pull Request Guidelines
- Commit history mixes Japanese summaries and conventional prefixes (`feat:`). Favor a short prefix (`feat`, `fix`, `chore`, `refactor`) plus concise subject; keep scope small.
- PRs should describe the problem, the change, and test evidence (`pnpm run test`/`lint`, manual steps, screenshots for UI). Link related Redmine issues and note any DB or asset build steps (`pnpm run build`) needed after merge.
