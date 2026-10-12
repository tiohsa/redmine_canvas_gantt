# Browser interaction benchmark — 2026-10-12

## Method

The runner loaded the existing production Vite bundle (`assets/main-zBwM5bIy.js`) in headless Chromium 145.0.7632.6 on Linux x64. It measured 100, 1,000, and 5,000 synthetic flat tasks with critical path calculation both on and off, using three fresh browser contexts per combination. Each context used a 1600×900 viewport and device scale factor 1. The temporary benchmark host sets `html`, `body`, and `#root` to full height so the standalone SPA has the same usable viewport it receives when embedded in Redmine; this does not change product files.

The browser drove the visible ratio cell to edit a task, resized a task bar with 24 pointer moves, and dragged a dependency handle to create a relation. The runner checked the edited 51% value, a changed due date, and a relation POST that updated mock relation state with the selected, distinct task IDs. Critical path ON/OFF was verified from the visible settings checkbox. Each operation waits for its state change and two animation frames before ending. The drag-only measurements stop before pointer-up, so they cover processing while the pointer is down.

All API responses were mocked in the page. These are browser and UI timings, not Redmine request or server timings. “Browser” values below use `performance.now()` around the action; the JSON also retains Playwright external action time. The Long Task API and animation-frame gaps are Chromium main-thread responsiveness signals, not a guarantee about physical display presentation.

## Median results

Times are milliseconds. “Drag gap” is the maximum animation-frame gap during the pointer-down resize; “drag long tasks” counts Long Task API entries in that interval.

| Tasks | CP | Initial load | Ratio edit | Schedule action | Pointer-down drag | Drag gap | Drag long tasks | Relation creation |
| ---: | :--: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | On | 431.1 | 166.4 | 580.9 | 397.7 | 16.8 | 0 | 698.0 |
| 100 | Off | 411.5 | 155.5 | 578.3 | 398.9 | 16.8 | 0 | 682.6 |
| 1,000 | On | 429.5 | 171.5 | 654.5 | 465.1 | 16.8 | 0 | 716.5 |
| 1,000 | Off | 427.3 | 170.7 | 646.9 | 447.6 | 16.8 | 0 | 715.1 |
| 5,000 | On | 486.8 | 320.6 | 1,081.5 | 816.1 | 116.6 | 4 | 730.1 |
| 5,000 | Off | 454.4 | 272.4 | 972.5 | 732.7 | 83.4 | 4 | 731.8 |

The 5,000-task run shows the clearest responsiveness cost: the task edit and schedule drag take longer, and the resize interval has four long tasks per sample (median), with maximum frame gaps of 83–117 ms. At 100 and 1,000 tasks the drag interval had no Long Task API entries and a median maximum frame gap of 16.8 ms. CP on/off differences are not consistent across actions; these three-sample results do not establish a causal performance change from the CP setting.

## Store-level evidence

The separate Store regression run passed 251 TaskStore tests in 8.85 seconds. A `scheduling.calculateCriticalPath` spy verified zero calls with CP off for accepted refreshes before their response, apply/edit updates, sorting-suspended updates, and relation add/replace/delete; the CP-on positive control called it once. This checks Store scheduling behavior, not browser timing or all browser paths.

## Limits and artifacts

Fixtures are synthetic, flat, and use the same generated task dates across sizes. Relation creation used task 1 → task 31 in all samples; the pair has the same start date and different due dates in this fixture. The UI virtualizes visible rows, so the runner chooses the first two rendered rows for the relation gesture and records their IDs in each raw sample. Browser/API timings exclude Redmine, network latency, and server processing. Three samples per combination make these directional measurements rather than production service-level estimates.

The rerunnable script is [scripts/measure-interactions.mjs](../scripts/measure-interactions.mjs). Full per-sample timings, frame gaps, long tasks, selected relation IDs, browser configuration, and min/median/max summaries are in [interaction-results-20261012.json](./interaction-results-20261012.json).

## Reproduce

Run from `spa/` with the production bundle already built and Playwright Chromium installed:

```sh
rtk proxy node scripts/measure-interactions.mjs
rtk npm run test -- --run src/stores/TaskStore.test.ts
```

The runner defaults to three samples at 100, 1,000 and 5,000 tasks. `INTERACTION_SAMPLE_COUNT`, `INTERACTION_TASK_COUNTS`, `INTERACTION_OUTPUT_FILE`, `INTERACTION_PORT`, and `INTERACTION_CHROMIUM_PATH` override those conditions; `BENCHMARK_GIT_SHA` records the revision. Rebuild with `rtk npm run build` before measuring changed product code. Rebuilding updates tracked generated assets. Do not run competing benchmarks while collecting timings.
