import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createScenario } from '../bench/scenario-builder.mjs';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const SPA_DIR = resolve(SCRIPT_DIR, '..');
const BENCH_DIR = resolve(SPA_DIR, 'bench');
const BUILD_DIR = resolve(SPA_DIR, '..', 'assets', 'build');
const MANIFEST_FILE = resolve(BUILD_DIR, '.vite', 'manifest.json');
const OUTPUT = resolve(BENCH_DIR, process.env.INTERACTION_OUTPUT_FILE ?? 'interaction-results-20261012.json');
const PORT = Number(process.env.INTERACTION_PORT ?? 4174);
const TASK_COUNTS = (process.env.INTERACTION_TASK_COUNTS ?? '100,1000,5000').split(',').map(Number);
const SAMPLE_COUNT = Number(process.env.INTERACTION_SAMPLE_COUNT ?? 3);

const round = (value) => Number(value.toFixed(2));
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const summarize = (samples, key) => {
  const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
  return { median: round(median(values)), min: round(Math.min(...values)), max: round(Math.max(...values)) };
};
const utcDateOnly = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
const entry = manifest['src/main.tsx'];
if (!entry?.file) throw new Error(`Missing build manifest entry in ${MANIFEST_FILE}`);
const template = await readFile(resolve(SPA_DIR, 'index.html'), 'utf8');
const html = template.replace(
  '</head>',
  '    <style>html, body, #root { height: 100%; margin: 0; } #root { min-height: 100vh; } body { overflow: hidden; }</style>\n  </head>'
).replace(
  '    <script type="module" src="/src/main.tsx"></script>',
  `${(entry.css ?? []).map((file) => `    <link rel="stylesheet" href="/${file}" />`).join('\n')}\n    <script type="module" src="/${entry.file}"></script>`
);
const fileMap = new Map();
for (const item of Object.values(manifest)) {
  if (item.file) fileMap.set(`/${item.file}`, resolve(BUILD_DIR, item.file));
  for (const asset of item.assets ?? []) fileMap.set(`/${asset}`, resolve(BUILD_DIR, asset));
  for (const css of item.css ?? []) fileMap.set(`/${css}`, resolve(BUILD_DIR, css));
}
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;
  if (pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  const file = fileMap.get(pathname);
  if (!file) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    response.writeHead(200, { 'content-type': `${mime[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});
await new Promise((resolveReady, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolveReady);
});

const makePayload = (taskCount) => {
  const payload = createScenario({ name: `flat-${taskCount}`, kind: 'flat', taskCount }).payload;
  const anchorDate = new Date();
  const anchor = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate());
  for (const [index, task] of payload.tasks.entries()) {
    const start = new Date(anchor + ((index % 30) * 86400000));
    const due = new Date(start.getTime() + (5 + (index % 7)) * 86400000);
    task.start_date = utcDateOnly(start);
    task.due_date = utcDateOnly(due);
  }
  return payload;
};

const installPage = async (page, payload, cpEnabled) => {
  const mockedRequests = [];
  const preferences = {
    version: 4,
    general: { 'project:1': { autoSave: true, todayOnwardOnly: false, includeClosedIssues: true } },
    display: {
      projects: {
        'project:1': {
          calculateCriticalPathEnabled: cpEnabled,
          visibleColumns: ['id', 'subject', 'ratioDone', 'dueDate'],
          sidebarWidth: 700,
          // Default timeline starts one year ago at roughly 10 px/day in Week view.
          viewport: { scrollX: 3500, scrollY: 0 }
        }
      },
      global: { enabled: false, preferences: {} }
    }
  };
  await page.addInitScript(({ initialPreferences }) => {
    localStorage.clear();
    localStorage.setItem('canvasGantt:preferences', JSON.stringify(initialPreferences));
    window.__RCG_INTERACTION__ = { startedAt: performance.now(), frames: [], longTasks: [] };
    const record = window.__RCG_INTERACTION__;
    let lastFrame = performance.now();
    const frameLoop = (now) => {
      record.frames.push({ at: now, gap: now - lastFrame });
      lastFrame = now;
      requestAnimationFrame(frameLoop);
    };
    requestAnimationFrame(frameLoop);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* Long Task API is optional; frame data remains available. */ }
    window.RedmineCanvasGantt = {
      projectId: 1, apiBase: '/projects/1/canvas_gantt', redmineBase: '',
      authToken: 'benchmark-token', apiKey: 'benchmark-api-key',
      i18n: { field_subject: 'Task Name', field_status: 'Status', field_assigned_to: 'Assignee' },
      settings: {
        inline_edit_subject: '1', inline_edit_assigned_to: '1', inline_edit_status: '1',
        inline_edit_done_ratio: '1', inline_edit_due_date: '1', inline_edit_start_date: '1', row_height: '36'
      }
    };
  }, { initialPreferences: preferences });

  const payloadText = JSON.stringify(payload);
  await page.route('**/canvas_gantt/**', async (route) => {
    const url = new URL(route.request().url());
      const mockedRequest = { method: route.request().method(), path: url.pathname };
      mockedRequests.push(mockedRequest);
    if (url.pathname.endsWith('/data.json')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: payloadText });
    } else if (url.pathname.endsWith('/relations.json')) {
      const body = route.request().postDataJSON?.() ?? {};
      const relation = body.relation ?? {};
      mockedRequest.relation = { issue_from_id: relation.issue_from_id, issue_to_id: relation.issue_to_id };
      payload.relations.push({ id: 900001, issue_from_id: relation.issue_from_id, issue_to_id: relation.issue_to_id, relation_type: relation.relation_type ?? 'precedes' });
      mockedRequest.relationCount = payload.relations.length;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 900001, issue_from_id: relation.issue_from_id, issue_to_id: relation.issue_to_id, relation_type: relation.relation_type ?? 'precedes', status: 'ok', completeness: 'complete' }) });
    } else if (url.pathname.endsWith('/schedule_mutation.json')) {
      const body = route.request().postDataJSON?.() ?? {};
      const revisions = {};
      const entities = (body.changes ?? []).map((change) => {
        const taskId = Number(change.task_id);
        const task = payload.tasks.find((candidate) => candidate.id === taskId);
        if (!task) return null;
        if (typeof change.start_date === 'string') task.start_date = change.start_date;
        if (typeof change.due_date === 'string') task.due_date = change.due_date;
        task.lock_version = (task.lock_version ?? 0) + 1;
        revisions[String(taskId)] = task.lock_version;
        return { id: taskId, start_date: task.start_date, due_date: task.due_date, lock_version: task.lock_version };
      }).filter(Boolean);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation_id: body.operation_id, completeness: 'complete', entities, revisions, invalidated_entity_ids: [] }) });
    } else if (/\/tasks\/\d+\.json$/.test(url.pathname)) {
      const body = route.request().postDataJSON?.() ?? {};
      const id = Number(url.pathname.match(/\/tasks\/(\d+)\.json$/)?.[1]);
      const task = payload.tasks.find((candidate) => candidate.id === id);
      const fields = body.task ?? {};
      if (task && typeof fields.subject === 'string') task.subject = fields.subject;
      if (task && typeof fields.done_ratio === 'number') task.ratio_done = fields.done_ratio;
      if (task && typeof fields.status_id === 'number') task.status_id = fields.status_id;
      if (task && typeof fields.start_date === 'string') task.start_date = fields.start_date;
      if (task && typeof fields.due_date === 'string') task.due_date = fields.due_date;
      const entity = task ? {
        id,
        subject: fields.subject ?? task.subject,
        project_id: task.project_id,
        project_name: task.project_name,
        start_date: fields.start_date ?? task.start_date,
        due_date: fields.due_date ?? task.due_date,
        ratio_done: task.ratio_done,
        status_id: fields.status_id ?? task.status_id,
        status_name: task.status_name,
        assigned_to_id: task.assigned_to_id,
        assigned_to_name: task.assigned_to_name,
        lock_version: (task.lock_version ?? 0) + 1
      } : { id };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', completeness: 'complete', entity, revision: entity.lock_version, task_id: id, invalidated_entity_ids: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', completeness: 'partial', invalidated_entity_ids: [] }) });
    }
  });
  return mockedRequests;
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.INTERACTION_CHROMIUM_PATH || undefined });
const allResults = [];
const pageErrors = [];

const collectWindowMetrics = async (page, startedAt) => page.evaluate((start) => {
  const state = window.__RCG_INTERACTION__;
  const now = performance.now();
  const frames = state.frames.filter((frame) => frame.at >= start && frame.at <= now);
  const tasks = state.longTasks.filter((task) => task.start >= start && task.start <= now);
  const gaps = frames.map((frame) => frame.gap);
  return {
    browserMs: now - start,
    frameCount: frames.length,
    maxFrameGapMs: gaps.length ? Math.max(...gaps) : 0,
    meanFrameGapMs: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0,
    longTaskCount: tasks.length,
    longTaskTotalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
    longTaskMaxMs: tasks.length ? Math.max(...tasks.map((task) => task.duration)) : 0
  };
}, startedAt);

const measurePage = async (taskCount, cpEnabled) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const mockedRequests = await installPage(page, makePayload(taskCount), cpEnabled);
  await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('task-row-1').waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForFunction(() => document.querySelectorAll('.rcg-gantt-viewport canvas').length >= 1, null, { timeout: 120_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const initialLoad = await page.evaluate(() => {
    const state = window.__RCG_INTERACTION__;
    return {
      browserMs: performance.now() - state.startedAt,
      domNodes: document.querySelectorAll('*').length,
      visibleRows: document.querySelectorAll('[data-testid^="task-row-"]').length,
      canvasCount: document.querySelectorAll('.rcg-gantt-viewport canvas').length
    };
  });
  await page.getByTestId('display-settings-menu-button').click();
  const criticalPathSetting = page.getByLabel('Calculate critical path');
  await criticalPathSetting.waitFor({ state: 'visible', timeout: 10_000 });
  const observedSetting = await criticalPathSetting.isChecked();
  if (observedSetting !== cpEnabled) throw new Error(`Critical path preference was ${observedSetting}, expected ${cpEnabled}`);
  const autoSaveSetting = page.getByRole('switch', { name: 'Auto Save', exact: true });
  if (!(await autoSaveSetting.isChecked())) {
    await page.locator('label').filter({ has: autoSaveSetting }).click();
    await autoSaveSetting.waitFor({ state: 'visible' });
    if (!(await autoSaveSetting.isChecked())) throw new Error('Auto Save could not be enabled for the interaction run');
  }
  await page.getByTestId('display-settings-menu-button').click();

  const operation = async (name, action) => {
    const before = await page.evaluate(() => performance.now());
    const externalStart = performance.now();
    const details = await action();
    const externalMs = performance.now() - externalStart;
    const browserMetrics = await collectWindowMetrics(page, before);
    return { name, externalMs: round(externalMs), ...Object.fromEntries(Object.entries(browserMetrics).map(([key, value]) => [key, round(value)])), ...(details ?? {}) };
  };

  const operations = [];
  operations.push(await operation('task_edit_ratio', async () => {
    const cell = page.getByTestId('cell-1-ratioDone');
    await cell.dblclick();
    const input = page.locator('input[type="number"]').first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill('51');
    await input.press('Enter');
    await page.getByTestId('cell-1-ratioDone').locator('input').waitFor({ state: 'detached', timeout: 10_000 });
    const editState = await page.getByTestId('cell-1-ratioDone').evaluate((element) => ({
      tooltips: Array.from(element.querySelectorAll('[data-tooltip]')).map((node) => node.getAttribute('data-tooltip')),
      inputValue: element.querySelector('input')?.value ?? null,
      html: element.innerHTML.slice(0, 300)
    }));
    if (!editState.tooltips.includes('51%')) throw new Error(`Task edit did not render value 51: ${JSON.stringify({ editState, mockedRequests })}`);
    if (!mockedRequests.some((request) => request.method === 'PATCH' && request.path.endsWith('/tasks/1.json'))) {
      throw new Error(`Task edit did not reach the expected mocked task update endpoint: ${JSON.stringify(mockedRequests)}`);
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return { mockedTaskPatchCount: mockedRequests.filter((request) => request.method === 'PATCH' && request.path.endsWith('/tasks/1.json')).length };
  }));

  operations.push(await operation('task_schedule_drag', async () => {
    await page.getByTestId('task-row-1').click({ position: { x: 110, y: 18 } });
    await page.getByTestId('task-row-1').hover({ position: { x: 110, y: 18 } });
    const viewport = await page.getByTestId('gantt-viewport').boundingBox();
    const handle = page.getByTestId('task-resize-handle-end-1');
    await handle.waitFor({ state: 'visible', timeout: 10_000 });
    const box = await handle.boundingBox();
    const dueCell = page.getByTestId('cell-1-dueDate');
    const dueBefore = (await dueCell.innerText()).trim();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const dragStart = await page.evaluate(() => performance.now());
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + Math.min(45, viewport.width / 20), box.y + box.height / 2, { steps: 24 });
    const duringDrag = await collectWindowMetrics(page, dragStart);
    await page.mouse.up();
    try {
      await page.waitForFunction(({ before }) => {
        const cell = document.querySelector('[data-testid="cell-1-dueDate"]');
        return cell && cell.textContent.trim() !== before;
      }, { before: dueBefore }, { timeout: 10_000 });
    } catch {
      const dueAfter = await dueCell.innerText();
      throw new Error(`Schedule drag did not change due date ${dueBefore} -> ${dueAfter}; mock requests: ${JSON.stringify(mockedRequests)}`);
    }
    if (!mockedRequests.some((request) => request.method === 'POST' && request.path.endsWith('/schedule_mutation.json'))) {
      throw new Error('Schedule drag did not reach the mocked schedule mutation endpoint');
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return { dueDateChanged: true, duringDrag: Object.fromEntries(Object.entries(duringDrag).map(([key, value]) => [`drag${key[0].toUpperCase()}${key.slice(1)}`, round(value)])) };
  }));

  operations.push(await operation('relation_create_drag', async () => {
    const rowState = await page.locator('[data-testid^="task-row-"]').evaluateAll((elements) => elements.map((element) => ({
      testId: element.getAttribute('data-testid'),
      visible: element.getBoundingClientRect().height > 0,
      text: element.textContent?.slice(0, 60)
    })));
    const visibleTaskIds = rowState.filter((row) => row.visible).map((row) => row.testId.match(/^task-row-(\d+)$/)?.[1]).filter(Boolean);
    if (visibleTaskIds.length < 2) throw new Error(`Fewer than two visible rows before relation action: ${JSON.stringify(rowState.slice(0, 20))}`);
    const [fromTaskId, toTaskId] = visibleTaskIds;
    await page.getByTestId(`task-row-${toTaskId}`).click({ position: { x: 110, y: 18 } });
    await page.getByTestId(`task-row-${toTaskId}`).hover({ position: { x: 110, y: 18 } });
    const destinationResize = page.getByTestId(`task-resize-handle-end-${toTaskId}`);
    await destinationResize.waitFor({ state: 'visible', timeout: 10_000 });
    const destinationBar = await destinationResize.boundingBox();
    const target = { x: destinationBar.x + destinationBar.width / 2 - 20, y: destinationBar.y + destinationBar.height / 2 };
    await page.getByTestId(`task-row-${fromTaskId}`).click({ position: { x: 110, y: 18 } });
    await page.getByTestId(`task-row-${fromTaskId}`).hover({ position: { x: 110, y: 18 } });
    const sourceResize = await page.getByTestId(`task-resize-handle-end-${fromTaskId}`).boundingBox();
    await page.mouse.move(sourceResize.x + sourceResize.width / 2, sourceResize.y + sourceResize.height / 2);
    const handle = page.getByTestId(`dependency-handle-right-${fromTaskId}`);
    await handle.waitFor({ state: 'visible', timeout: 10_000 });
    const from = await handle.boundingBox();
    const relationResponse = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/relations.json')
    ), { timeout: 10_000 }).catch(() => null);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 24 });
    await page.mouse.up();
    const relationState = await Promise.race([
      relationResponse.then((response) => ({ kind: 'response', response })),
      page.getByTestId('relation-editor').waitFor({ state: 'visible', timeout: 10_000 }).then(() => ({ kind: 'editor' }))
    ]);
    if (relationState.kind === 'editor') {
      await page.getByTestId('relation-save-button').click();
      await page.getByTestId('relation-editor').waitFor({ state: 'detached', timeout: 10_000 });
    }
    const relationResponseValue = relationState.response ?? await relationResponse;
    if (relationResponseValue && !relationResponseValue.ok()) throw new Error(`Relation API mock returned ${relationResponseValue.status()}`);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const relationPostCount = mockedRequests.filter((request) => request.method === 'POST' && request.path.endsWith('/relations.json')).length;
    const relationRequest = mockedRequests.find((request) => request.path.endsWith('/relations.json'));
    if (relationPostCount < 1 || !relationRequest?.relationCount ||
      Number(relationRequest.relation?.issue_from_id) !== Number(fromTaskId) ||
      Number(relationRequest.relation?.issue_to_id) !== Number(toTaskId)) {
      throw new Error('Relation creation did not reach the mocked relation endpoint and update the relation state');
    }
    return { mockedRelationPostCount: relationPostCount, relationFromTaskId: fromTaskId, relationToTaskId: toTaskId };
  }));

  await context.close();
  return { initialLoad: Object.fromEntries(Object.entries(initialLoad).map(([key, value]) => [key, round(value)])), operations };
};

try {
  for (const taskCount of TASK_COUNTS) {
    for (const cpEnabled of [true, false]) {
      const samples = [];
      for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
        process.stdout.write(`Measuring ${taskCount} tasks, critical path ${cpEnabled ? 'ON' : 'OFF'}, sample ${sample}/${SAMPLE_COUNT}\n`);
        samples.push(await measurePage(taskCount, cpEnabled));
      }
      const operationNames = samples[0].operations.map((item) => item.name);
      allResults.push({
        taskCount,
        criticalPath: cpEnabled ? 'on' : 'off',
        samples,
        metrics: {
          initialLoadMs: summarize(samples.map((sample) => ({ value: sample.initialLoad.browserMs })), 'value'),
          operations: operationNames.map((name) => {
            const values = samples.map((sample) => sample.operations.find((item) => item.name === name));
            const summary = {
              name,
              externalMs: summarize(values, 'externalMs'),
              browserMs: summarize(values, 'browserMs'),
              maxFrameGapMs: summarize(values, 'maxFrameGapMs'),
              longTaskCount: summarize(values, 'longTaskCount'),
              longTaskTotalMs: summarize(values, 'longTaskTotalMs'),
              longTaskMaxMs: summarize(values, 'longTaskMaxMs')
            };
            if (name === 'task_schedule_drag') {
              const dragValues = values.map((value) => Object.fromEntries(Object.entries(value.duringDrag).map(([key, metric]) => [key.slice(4, 5).toLowerCase() + key.slice(5), metric])));
              summary.duringDrag = {
                browserMs: summarize(dragValues, 'browserMs'),
                frameCount: summarize(dragValues, 'frameCount'),
                maxFrameGapMs: summarize(dragValues, 'maxFrameGapMs'),
                meanFrameGapMs: summarize(dragValues, 'meanFrameGapMs'),
                longTaskCount: summarize(dragValues, 'longTaskCount'),
                longTaskTotalMs: summarize(dragValues, 'longTaskTotalMs'),
                longTaskMaxMs: summarize(dragValues, 'longTaskMaxMs')
              };
            }
            return summary;
          })
        }
      });
    }
  }
} finally {
  await browser.close();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);
await mkdir(resolve(OUTPUT, '..'), { recursive: true });
const result = {
  measuredAt: new Date().toISOString(),
  gitSha: process.env.BENCHMARK_GIT_SHA ?? null,
  browserVersion: browser.version(),
  buildEntry: entry.file,
  buildManifest: MANIFEST_FILE,
  host: { platform: process.platform, arch: process.arch },
  viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  sampleCount: SAMPLE_COUNT,
  taskCounts: TASK_COUNTS,
  caveats: [
    'Production Vite bundle with mocked API responses; Redmine server and network latency are excluded.',
    'External action duration includes Playwright input dispatch and UI settling; browserMs uses page performance.now around the same action.',
    'Frame gaps and Long Task API entries describe main-thread responsiveness during the measured action window; Long Task API is unavailable in some browser builds.',
    'Synthetic flat task fixtures are benchmark data, not a representative project distribution.'
  ],
  results: allResults
};
await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`Wrote ${OUTPUT}\n`);
