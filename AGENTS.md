# AGENTS.md

## Project Overview

Redmine Canvas Gantt is a Redmine plugin consisting of a Ruby on Rails backend and a React SPA (single-page application) located in the `spa/` directory.

* **Languages**: Ruby for the backend, TypeScript for the frontend
* **Frameworks/Libraries**: Redmine 6.0 / 6.1 / 7.0, React 19, Vite 8, Zustand 5
* **Architecture**: Redmine plugin backend + SPA frontend

## Source of Truth

* `README.md` and `README_ja.md` describe product behavior, supported workflows, and expected user-facing specifications.
* `DESIGN.md` is the canonical reference for decisions related to UI, layout, spacing, typography, colors, components, shadows, and interactions.

  * When making visual or interaction changes, always prioritize `DESIGN.md` and preserve consistency with it.
  * If `DESIGN.md` conflicts with local conventions or simplification patterns, `DESIGN.md` takes precedence.
* `tasks/lessons.md` records recurring implementation pitfalls and issues encountered in the past. Treat it as a set of project-specific guardrails.
* `tasks/todo.md` is a working memo, not an authoritative specification.

## Development Setup

### Backend / Redmine

* Mount this repository as `plugins/redmine_canvas_gantt` within the Redmine application.
* Start the local environment from the plugin root directory:

```bash
docker compose up -d --wait
```

* Redmine URL: `http://localhost:3000`
* Load default data when necessary:

```bash
docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### Frontend / SPA

* Work within the `spa/` directory.
* Install dependencies:

```bash
cd spa && npm ci
```

* Use Node.js `^20.19.0 || >=22.12.0` as specified by the `engines` field in `spa/package.json`. Treat `spa/package-lock.json` as the source of truth for dependencies and install them with `npm ci`. Do not mix package managers.
* Start the Vite development server:

```bash
cd spa && npm run dev
```

* To load frontend assets live, run Redmine in the development environment and set the environment variable `CANVAS_GANTT_USE_VITE_DEV_SERVER=1`. Canvas Gantt does not have a plugin settings page.

## Build and Test Commands

### Frontend (SPA)

* Build: `cd spa && npm run build`
* Build watch mode: `cd spa && npm run build:watch`
* Type check: `cd spa && npx tsc -b` (also included in `npm run build`)
* Lint: `cd spa && npm run lint`
* Build preview: `cd spa && npm run preview`
* Distribution asset integrity: `cd spa && npm run check:build-artifacts`
  This is a release/CI gate that verifies that the manifest and all referenced assets are already included in the current `HEAD`.
* Async API boundary check: `cd spa && npm run check:async-contract`
* Dependency lockfile supply-chain check: `cd spa && npm run security:supply-chain`

### Frontend Tests (SPA Tests)

* Unit tests: `cd spa && npm run test -- --run`
* Watch mode: `cd spa && npm run test`
* Example of running a single test file:

```bash
cd spa && npx vitest run src/components/GanttContainer.resize.test.tsx
```

* Standalone E2E tests: `cd spa && npm run test:e2e`
* Headed E2E tests: `cd spa && npm run test:e2e:headed`
* Redmine-integrated Playwright tests: `cd spa && npx playwright test -c playwright.redmine.config.ts`
* Example of running the targeted compatibility suite against Redmine 6.0:

```bash
cd spa && npx playwright test -c playwright.redmine.config.ts tests/e2e-redmine/redmine-smoke.pw.ts
```

### Backend Tests

* There is no `Gemfile` inside the plugin directory, so do not run `bundle exec rspec` directly from the plugin directory.
* Backend tests/specs must be run from the Redmine runtime environment.

  * **Docker environment**:

```bash
docker compose up -d --wait --wait-timeout 600
docker compose exec -T -u root redmine apt-get update
docker compose exec -T -u root redmine apt-get install -y --no-install-recommends build-essential
docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle config unset without
docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle add rspec-rails --version '~> 8.0' --group test --skip-install
docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle install --jobs 4 --retry 3
docker compose exec -T redmine env -u BUNDLE_WITHOUT bundle exec rspec plugins/redmine_canvas_gantt/spec
```

The official Redmine image does not include build tools, and `BUNDLE_WITHOUT=development:test` takes precedence over Bundler configuration. When running RSpec, install the required build tools as `root` and unset `BUNDLE_WITHOUT` for Bundler commands as shown above.

Use `rspec-rails ~> 7.1` for Redmine 6.0/6.1 and `~> 8.0` for Redmine 7.0. If the container is recreated, repeat this setup.

* **Non-Docker environment**: Run from the Redmine root directory.

```bash
bundle exec rspec plugins/redmine_canvas_gantt/spec
```

### Benchmark

* Local benchmark: `cd spa && npm run benchmark`
* CI benchmark gate: `cd spa && npm run benchmark:ci`

## CI/CD

* **CI workflow**: `.github/workflows/ci.yml`
* CI runs frontend builds and distribution asset integrity checks, linting and async API boundary checks, unit tests under the default and multiple time zones, and benchmarks.
* Backend specs and Redmine E2E tests run against Redmine 6.0.6, 6.1.2, and 7.0.0 images. Redmine 6.0 uses the targeted compatibility suite, while Redmine 6.1 and 7.0 run the full Playwright suite.
* **Release workflow**: `.github/workflows/release.yml`

  * Runs only when a tag matching `v*` is pushed.
  * Before release, it verifies that every file under `assets/build/` referenced by the manifest is tracked by Git and included in the target tag's tree.
  * Creates a GitHub release including the generated changelog.
  * Does not build, package, or upload artifacts such as VSIX files.

## Code Style

* Write Ruby code idiomatically and follow Redmine and Rails conventions.
* Use two spaces for indentation, `snake_case` for method and file names, and `CamelCase` for class and module names.
* Keep frontend code small and testable. Prefer single-purpose helper functions over large inline blocks.
* Follow the existing lint rules and strict TypeScript checks defined by `spa/eslint.config.js` and the TypeScript project configuration.
* Unless explicitly requested, avoid broad automated refactoring. Keep changes minimal and scoped to the intended task.

## Design Governance

* Apply `DESIGN.md` consistently across DOM-based UI, canvas renderers, dialogs, popovers, and help screens.
* Follow the defined design tokens for typography, spacing, border radius, shadows, and color usage rather than introducing independent design patterns.
* When changing fonts, update CSS, inline styles, canvas `ctx.font`, and any sizing logic based on `measureText` together.
* The canvas-based Gantt chart area must remain visually consistent with the surrounding SPA UI. Do not treat canvas text or color schemes as a separate design system.

## Implementation Rules

* When adding a new frontend internationalization (i18n) key, always add it to both `config/locales/*.yml` and `app/controllers/canvas_gantts_controller.rb` so the SPA receives it correctly.
* Preserve local-date semantics in UI flows that operate on date-only values. Do not mix local-date handling with `toISOString()` or `new Date('YYYY-MM-DD')`.
* Changes to query, filter, URL, or `localStorage` state require regression coverage because shared-state precedence is easy to break.
* UI whose visibility depends on project filters or other permissions must follow candidate lists supplied by the backend. Do not reconstruct hidden options by inferring them from task data.
* Treat `ServerSnapshot`, operation-ID-based `LocalPatch`, and `MutationOperation` as the sources of truth for asynchronous task state. Do not independently update display entities or dirty state through separate paths; route changes through the state transitions and mutation queue under `spa/src/stores/taskStore/`.
* API mutation/read call boundaries are protected by the allowlist in `spa/scripts/check-async-contract.mjs`. Before adding a new direct API call, integrate it into an existing service/store boundary. Update the allowlist and tests only when intentionally introducing a new boundary.
* Business calendars must use the same resolution rules across backend and SPA date calculations, validation, and rendering. `examples/business_calendars/` contains configuration examples, while `tools/holiday_generator/` is a generation tool. Do not confuse company-specific customizations with managed generated files.

## Recurring Implementation Notes

* `IssueIframeDialog` のiframe内フォームは `action` URLだけで役割を判定しない。RedmineのTimeEntry一覧の `query_form` も `/time_entries` をactionに持ち得るため、`query_form` / `query-form` を先に除外し、TimeEntry Editorは `new_time_entry`、`edit_time_entry*`、`new_time_entry` class、または `time_entry[...]` fieldのsemantic structureで分類する。判定ロジックは `spa/src/utils/issueDialogForms.ts` に集約し、DOMパターンごとのunit testを追加する。
* iframeフォーム判定を変更するときは、フッター保存ボタンの対象選択とiframe内のnative `submit` listenerの両方を同じclassifierへ接続する。片方だけ直すと、保存ボタンとEnter／フォームボタン押下でTimerの保存結果が不一致になる。
* Work TimerのTimeEntry成功判定はredirect先pathnameを固定しない。`back_url` によりCanvas Ganttへ戻ることがあるため、送信開始済み、TimeEntry Editorから離脱、成功flash表示、validation errorなしを組み合わせる。`IssueIframeDialog.test.tsx` のquery form混入回帰と `spa/tests/e2e-redmine/work-timer.pw.ts` の実Redmine lifecycle検証を併用する。
* 互換性E2Eを起動する前に、既存のDockerコンテナ・イメージ・DB volumeを確認する。Composeの既定はRedmine 7.0.0で、6.0.6／6.1.2はREADMEの `REDMINE_IMAGE` 切替を使う。既存環境を検証目的で `down -v` したり削除したりせず、対象versionのbase URLを明示してテストする。
* `.codegraph/` が存在しても `codegraph_status` がDB open errorになる場合は、同じ問い合わせを繰り返さない。失敗を記録したうえで、対象ファイルが絞れたら直接読み取りへ切り替える。`.codegraph/` 自体が存在しない場合だけ、初期化が必要かを確認する。

## Security and Safety

* Do not commit API keys, tokens, or confidential information.
* Keep sensitive configuration in environment variables or Redmine's configuration facilities.
* Respect `view_canvas_gantt` for access to Canvas Gantt and `manage_canvas_gantt_baseline` for baseline saving. Issue operations must use Redmine's standard permissions for the target Issue's Project.
* Preserve and do not weaken the asset-path safety validation around `/plugin_assets/redmine_canvas_gantt/build/*`.
* Do not add or upgrade dependencies, introduce Redmine DB migrations, change the permission model, make breaking changes to external calendar formats, release, or deploy unless explicitly requested.

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
├── examples/business_calendars/
├── tools/holiday_generator/
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

* `app/controllers/canvas_gantts_controller.rb`: Provides the main page, JSON endpoints, edit endpoints, related endpoints, and fallback asset-serving behavior.
* `lib/redmine_canvas_gantt/data_payload_builder.rb`: Builds task, relation, version, status, and project payloads for the SPA.
* `spa/`: Contains the React application, Zustand stores, Canvas renderer, API client, Vitest tests, and Playwright tests.
* `cd spa && npm run build` writes frontend assets to `assets/build/`. These are generated artifacts, but because they are included in releases, the manifest, hashed JS/CSS files, fonts, and all referenced files are tracked in Git as a complete set.
* Production asset URLs are resolved from the manifest by `lib/redmine_canvas_gantt/vite_asset_helper.rb`, and `CanvasGanttsController#asset` serves them with safety validation. `init.rb` does not link or copy them into `public/plugin_assets` at startup.

## Working Rules & Agent Workflow

* Always inspect and review the relevant source files before editing code.
* Keep changes within the scope of the requested task and avoid unnecessary rewrites of unrelated code.
* When behavior changes, always run the relevant tests or validation commands before considering the work complete.
* When fixing a bug or changing a recurring implementation pattern, record the lesson in `tasks/lessons.md` as part of the task.
* Preserve the user's uncommitted changes and do not revert out-of-scope diffs or generated artifacts. In particular, builds replace hashed files under `assets/build/`, so inspect the diff before and after running a build.
* For frontend changes, run the following whenever reasonably possible:

```bash
cd spa && npm run build
npm run lint
npm run check:async-contract
npm run test -- --run
```

For dependency changes, also run `npm run security:supply-chain`. For changes affecting performance or Redmine integration, also run the relevant benchmark or Playwright suite.

* After a build, verify `assets/build/.vite/manifest.json` references, Git tracking status, removed old hashes, and newly added hashes as one consistent set. Do not treat the build as successful while leaving untracked generated artifacts behind.
* `npm run check:build-artifacts` verifies that referenced files are already included in the current `HEAD` tree. Therefore, run it against a commit/tag candidate or in CI, rather than immediately after source changes in an uncommitted working tree.
* For compatibility-impacting changes, account for the distinction between the Redmine 6.0 targeted suite and the Redmine 6.1/7.0 full E2E suites. At minimum, add and run the backend spec or Playwright test directly relevant to the change.
* If any validation cannot be run, explicitly list the unexecuted command and the reason in the final report.
