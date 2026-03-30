# Help screen refresh

- [x] Audit current help dialog against the live toolbar and editing flows
- [x] Refresh the help dialog content and structure for the current UI
- [x] Add/update localized help strings and frontend i18n payload keys
- [x] Update frontend/backend coverage for the refreshed help content
- [x] Run targeted verification and record results

## Review

- Help dialog now uses three quick-reference sections that match the live toolbar and editing flows
- Added coverage for missing current controls including query editor, workload pane, month navigation, top, and manual save/cancel behavior
- Replaced emoji markers in the operations area with SVG-based icons for consistency with the rest of the UI
- Localized new help labels/descriptions in Japanese and English and exposed them through the controller i18n payload
- Verification passed with `cd spa && npm run test -- --run src/components/HelpDialog.test.tsx src/components/GanttToolbar.test.tsx`
- Verification passed with `cd spa && npm run lint`
- Verification passed with `cd spa && npx tsc -b`
- Ruby syntax checks passed for controller and controller spec
- Docker Redmine runtime still could not execute plugin RSpec because `rspec` is not installed in the container (`bundler: command not found: rspec`)

# Query refactor

- [x] Split backend query resolution responsibilities in `lib/redmine_canvas_gantt/query_state_resolver.rb`
- [x] Centralize store-to-query serialization in `spa/src/utils/queryParams.ts`
- [x] Remove unused `spa/src/stores/queryParamsWatcher.ts` and `spa/src/utils/businessQueryState.ts`
- [x] Add backend/frontend coverage for the refactored query-state helpers
- [x] Run targeted verification and record results

## Review

- Backend resolver now separates query resolution, query-derived state extraction, request overrides, and issue scope construction
- Query state now flows through `toResolvedQueryStateFromStore` for both URL sync and API refreshes
- Existing URL contract and backend payload shape were preserved
- Verification passed with `npm run lint`
- Verification passed with `npm run test -- --run src/utils/queryParams.test.ts src/api/client.test.ts src/components/GanttToolbar.test.tsx`
- Verification passed with `npx tsc -b`
- Ruby syntax checks passed for resolver and resolver spec
- Docker Redmine runtime still could not execute plugin RSpec because `rspec` is not installed in the container (`bundler: command not found: rspec`)

# Canvas Gantt query integration

- [x] Inspect current backend/frontend filter and persistence flow
- [x] Add backend query resolution for `query_id` and URL params
- [x] Return resolved shared filter state in `data.json`
- [x] Separate shared conditions from UI preferences in SPA
- [x] Sync shared filter changes back into the URL
- [x] Add controller/frontend tests for the new behavior
- [x] Run targeted backend/frontend verification

# Epic 4 Phase 1

- [x] Confirm Redmine issue index injection point in the runtime view
- [x] Add Canvas Gantt toolbar navigation to the standard Redmine query editor
- [x] Inject `Canvas Ganttで開く` action into the Redmine issue query form
- [x] Add i18n strings and frontend payload labels for the new query actions
- [x] Add targeted frontend/backend specs for the Phase 1 flow
- [x] Run targeted verification for the Phase 1 changes

## Review

- Frontend verification passed with `npm run lint`
- Frontend verification passed with targeted Vitest runs for API, query params, TaskStore, and toolbar flows
- Ruby syntax checks passed for controller, payload builder, resolver, and resolver spec
- Docker Redmine runtime did not have the `rspec` executable available, so backend RSpec could not be executed in this session
- Phase 1 verification passed with `npm run lint`
- Phase 1 targeted frontend verification passed with `npm run test -- --run src/components/GanttToolbar.test.tsx src/utils/queryParams.test.ts src/api/client.test.ts`
- Phase 1 Ruby syntax checks passed for the new hook, controller, and issue-index partial
- Phase 1 plugin load check passed with `docker compose exec -T redmine bundle exec rails runner "require Rails.root.join('plugins','redmine_canvas_gantt','init.rb'); puts 'plugin-init-ok'"`
