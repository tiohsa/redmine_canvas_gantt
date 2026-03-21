import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createScenario, loadFixtures } from '../bench/scenario-builder.mjs';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const SPA_DIR = resolve(SCRIPT_DIR, '..');
const BENCH_DIR = resolve(SPA_DIR, 'bench');
const RESULTS_DIR = resolve(BENCH_DIR, 'results');
const BUDGET_FILE = resolve(BENCH_DIR, 'budgets.json');
const DEFAULT_OUTPUT_FILE = resolve(RESULTS_DIR, 'benchmark-results.json');
const BUILD_DIR = resolve(SPA_DIR, '..', 'assets', 'build');
const MANIFEST_FILE = resolve(BUILD_DIR, '.vite', 'manifest.json');
const BASE_URL = 'http://127.0.0.1:4173';
const SAMPLE_COUNT = Number(process.env.BENCHMARK_SAMPLE_COUNT ?? 3);
const REGRESSION_THRESHOLD = 1.2;

const parseArgs = (argv) => {
  const args = { ci: false, output: DEFAULT_OUTPUT_FILE };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--ci') {
      args.ci = true;
      continue;
    }

    if (value === '--output') {
      args.output = resolve(SPA_DIR, argv[index + 1]);
      index += 1;
    }
  }

  return args;
};

const round = (value) => Number(value.toFixed(2));

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const contentTypeFor = (path) => {
  const extension = path.slice(path.lastIndexOf('.'));
  return MIME_TYPES[extension] ?? 'application/octet-stream';
};

const renderBenchmarkHtml = async () => {
  const [templateHtml, manifestText] = await Promise.all([
    readFile(resolve(SPA_DIR, 'index.html'), 'utf8'),
    readFile(MANIFEST_FILE, 'utf8')
  ]);
  const manifest = JSON.parse(manifestText);
  const entry = manifest['src/main.tsx'];

  if (!entry?.file) {
    throw new Error('Missing build manifest entry for src/main.tsx');
  }

  const cssLinks = (entry.css ?? [])
    .map((file) => `    <link rel="stylesheet" href="/${file}" />`)
    .join('\n');
  const scriptTag = `    <script type="module" src="/${entry.file}"></script>`;

  return templateHtml
    .replace('    <script type="module" src="/src/main.tsx"></script>', `${cssLinks}\n${scriptTag}`)
    .replace('href="/vite.svg"', 'href="/vite.svg"');
};

const startBenchmarkServer = async () => {
  const html = await renderBenchmarkHtml();
  const fileMap = new Map();
  const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
  const entry = manifest['src/main.tsx'];

  fileMap.set('/vite.svg', resolve(BUILD_DIR, 'vite.svg'));
  fileMap.set(`/${entry.file}`, resolve(BUILD_DIR, entry.file));
  for (const cssFile of entry.css ?? []) {
    fileMap.set(`/${cssFile}`, resolve(BUILD_DIR, cssFile));
  }

  const server = createServer(async (request, response) => {
    const requestPath = request.url === '/' ? '/' : new URL(request.url, BASE_URL).pathname;

    if (requestPath === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }

    const filePath = fileMap.get(requestPath);
    if (!filePath) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'content-type': contentTypeFor(filePath) });
      response.end(body);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolveReady, rejectReady) => {
    server.once('error', rejectReady);
    server.listen(4173, '127.0.0.1', resolveReady);
  });

  return server;
};

const stopBenchmarkServer = async (server) => {
  if (!server?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
};

const installBenchmarkGlobals = async (page) => {
  const preferences = {
    groupByProject: false,
    visibleColumns: ['id', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone'],
    sidebarWidth: 420,
    viewport: {
      scrollX: 0,
      scrollY: 0
    }
  };

  await page.addInitScript(({ initialPreferences }) => {
    localStorage.clear();
    localStorage.setItem('canvasGantt:preferences', JSON.stringify(initialPreferences));
    window.__RCG_BENCHMARK__ = { start: performance.now() };
    window.RedmineCanvasGantt = {
      projectId: 1,
      apiBase: '/projects/1/canvas_gantt',
      redmineBase: '',
      authToken: 'benchmark-token',
      apiKey: 'benchmark-api-key',
      i18n: {
        field_subject: 'Task Name',
        field_status: 'Status',
        field_assigned_to: 'Assignee'
      },
      settings: {
        inline_edit_subject: '1',
        inline_edit_assigned_to: '1',
        inline_edit_status: '1',
        inline_edit_done_ratio: '1',
        inline_edit_due_date: '1',
        inline_edit_start_date: '1',
        row_height: '36'
      }
    };
  }, { initialPreferences: preferences });
};

const measureScenario = async (browser, scenario) => {
  const samples = [];
  const payload = JSON.stringify(scenario.payload);
  const payloadBytes = Buffer.byteLength(payload, 'utf8');

  for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const pageErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await installBenchmarkGlobals(page);
    await page.route('**/projects/1/canvas_gantt/data.json**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: payload
      });
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="cell-1-subject"]', { state: 'visible', timeout: 120_000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.rcg-gantt-viewport canvas').length === 3,
      undefined,
      { timeout: 120_000 }
    );

    const metrics = await page.evaluate(async () => {
      await new Promise((resolveAnimation) => {
        requestAnimationFrame(() => requestAnimationFrame(resolveAnimation));
      });

      const state = window.__RCG_BENCHMARK__ ?? { start: 0 };
      return {
        renderMs: performance.now() - state.start,
        domNodes: document.querySelectorAll('*').length,
        visibleRows: document.querySelectorAll('[data-testid^="task-row-"]').length,
        canvasCount: document.querySelectorAll('.rcg-gantt-viewport canvas').length
      };
    });

    await context.close();

    if (pageErrors.length > 0) {
      throw new Error(`Scenario ${scenario.name} hit page errors: ${pageErrors.join(' | ')}`);
    }

    samples.push({
      sample: sampleIndex + 1,
      renderMs: round(metrics.renderMs),
      domNodes: metrics.domNodes,
      visibleRows: metrics.visibleRows,
      canvasCount: metrics.canvasCount
    });
  }

  const renderValues = samples.map((sample) => sample.renderMs);
  return {
    name: scenario.name,
    kind: scenario.kind,
    taskCount: scenario.taskCount,
    payloadBytes,
    samples,
    metrics: {
      renderMs: {
        min: round(Math.min(...renderValues)),
        median: round(median(renderValues)),
        mean: round(average(renderValues)),
        max: round(Math.max(...renderValues))
      }
    }
  };
};

const evaluateBudgets = (results, budgets) => results.map((result) => {
  const budget = budgets[result.name];
  if (!budget?.renderMs) {
    throw new Error(`Missing benchmark budget for ${result.name}`);
  }

  const baselineMs = Number(budget.renderMs);
  const observedMs = result.metrics.renderMs.median;
  const thresholdMs = round(baselineMs * REGRESSION_THRESHOLD);

  return {
    ...result,
    budget: {
      baselineMs,
      thresholdMs,
      allowedRegressionPercent: 20
    },
    status: observedMs <= thresholdMs ? 'pass' : 'fail'
  };
});

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = await loadFixtures();
  const scenarios = fixtures.map(createScenario);
  const budgets = JSON.parse(await readFile(BUDGET_FILE, 'utf8'));

  await mkdir(resolve(RESULTS_DIR), { recursive: true });

  let benchmarkServer;
  let browser;

  try {
    benchmarkServer = await startBenchmarkServer();
    browser = await chromium.launch({ headless: true });

    const scenarioResults = [];
    for (const scenario of scenarios) {
      process.stdout.write(`Running benchmark ${scenario.name}...\n`);
      scenarioResults.push(await measureScenario(browser, scenario));
    }

    const evaluatedResults = evaluateBudgets(scenarioResults, budgets);
    const failedScenarios = evaluatedResults.filter((result) => result.status === 'fail');
    const output = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sampleCount: SAMPLE_COUNT,
      regressionThreshold: REGRESSION_THRESHOLD,
      ci: args.ci,
      results: evaluatedResults
    };

    await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    for (const result of evaluatedResults) {
      process.stdout.write(
        `${result.name}: median ${result.metrics.renderMs.median}ms, ` +
          `budget ${result.budget.baselineMs}ms, threshold ${result.budget.thresholdMs}ms [${result.status}]\n`
      );
    }

    if (failedScenarios.length > 0) {
      const names = failedScenarios.map((result) => result.name).join(', ');
      throw new Error(`Benchmark regression gate failed for: ${names}`);
    }
  } finally {
    await browser?.close();
    await stopBenchmarkServer(benchmarkServer);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
