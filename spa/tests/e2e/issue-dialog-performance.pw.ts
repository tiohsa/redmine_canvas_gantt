import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;
const ISSUE_DIALOG_PERF_ENV = 'ISSUE_DIALOG_PERF';

type Scenario = {
  issueCount: number;
  target: 'first' | 'tenth' | 'middle' | 'p90' | 'last';
  targetIndex: number;
  targetOrdinal: number;
};

type BrowserMeasurement = {
  trustedClick: boolean;
  clickedIssueId: string | null;
  clickAt: number | null;
  shellAt: number | null;
  iframeReadyAt: number | null;
};

type RunResult = {
  issueCount: number;
  target: Scenario['target'];
  targetIndex: number;
  targetOrdinal: number;
  issueId: string;
  run: number;
  warmup: boolean;
  shellMs: number;
  iframeReadyMs: number;
  iframeOnlyMs: number;
  timestamps: BrowserMeasurement;
};

type MeasurementWindow = Window & {
  __issueDialogMeasurement?: BrowserMeasurement;
  __stopIssueDialogMeasurement?: () => void;
};

const scenarios: Scenario[] = [100, 1_000, 10_000].flatMap((issueCount) => {
  const targets = [
    { target: 'first' as const, targetIndex: 0 },
    { target: 'tenth' as const, targetIndex: 9 },
    { target: 'middle' as const, targetIndex: Math.floor(issueCount / 2) },
    { target: 'p90' as const, targetIndex: Math.floor(issueCount * 0.9) - 1 },
    { target: 'last' as const, targetIndex: issueCount - 1 },
  ];

  return targets.map((target) => ({
    issueCount,
    ...target,
    targetOrdinal: target.targetIndex + 1,
  }));
});

const buildMockData = (issueCount: number) => ({
  ...defaultMockData,
  tasks: Array.from({ length: issueCount }, (_, index) => ({
    ...defaultMockData.tasks[0],
    id: 101 + index,
    subject: `Performance issue ${index + 1}`,
    display_order: index,
  })),
  relations: [],
  versions: [],
});

const installBrowserMeasurement = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const measurementWindow = window as MeasurementWindow;
    measurementWindow.__stopIssueDialogMeasurement?.();

    const measurement: BrowserMeasurement = {
      trustedClick: false,
      clickedIssueId: null,
      clickAt: null,
      shellAt: null,
      iframeReadyAt: null,
    };
    measurementWindow.__issueDialogMeasurement = measurement;

    const recordDialogMilestones = () => {
      if (measurement.clickAt === null) return;

      if (measurement.shellAt === null) {
        const header = document.querySelector<HTMLElement>('[data-testid="issue-dialog-header"]');
        if (header) {
          const style = window.getComputedStyle(header);
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && header.getClientRects().length > 0;
          if (visible) measurement.shellAt = performance.now();
        }
      }

      if (measurement.iframeReadyAt === null && measurement.clickedIssueId) {
        const iframe = document.querySelector<HTMLIFrameElement>('iframe');
        if (iframe) {
          const iframePath = new URL(iframe.src, window.location.href).pathname;
          const expectedPath = `/issues/${measurement.clickedIssueId}`;
          if (iframePath === expectedPath
            && iframe.contentWindow?.location.pathname === expectedPath
            && iframe.contentDocument?.readyState === 'complete'
            && !iframe.classList.contains('issue-iframe-loading')) {
            measurement.iframeReadyAt = performance.now();
          }
        }
      }
    };

    const handleSubjectClick = (event: MouseEvent) => {
      if (measurement.clickAt !== null) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a.task-subject[href]');
      if (!link) return;

      const issueId = new URL(link.href, window.location.href).pathname.match(/^\/issues\/(\d+)\/?$/)?.[1];
      if (!issueId) return;

      measurement.trustedClick = event.isTrusted;
      measurement.clickedIssueId = issueId;
      measurement.clickAt = performance.now();
      recordDialogMilestones();
    };

    document.addEventListener('click', handleSubjectClick, true);
    const observer = new MutationObserver(recordDialogMilestones);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true,
    });
    measurementWindow.__stopIssueDialogMeasurement = () => {
      observer.disconnect();
      document.removeEventListener('click', handleSubjectClick, true);
    };
  });
};

const summarize = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const nearestRankP95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
  const round = (value: number) => Number(value.toFixed(3));

  return {
    minMs: round(sorted[0]),
    medianMs: round(median),
    p95Ms: round(nearestRankP95),
    maxMs: round(sorted[sorted.length - 1]),
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
};

const summarizeRuns = (runs: RunResult[]) => scenarios.map((scenario) => {
  const measuredRuns = runs.filter((run) => (
    !run.warmup &&
    run.issueCount === scenario.issueCount &&
    run.target === scenario.target
  ));

  return {
    issueCount: scenario.issueCount,
    target: scenario.target,
    targetOrdinal: scenario.targetOrdinal,
    measuredRuns: measuredRuns.length,
    shell: summarize(measuredRuns.map((run) => run.shellMs)),
    iframeReady: summarize(measuredRuns.map((run) => run.iframeReadyMs)),
    iframeOnly: summarize(measuredRuns.map((run) => run.iframeOnlyMs)),
  };
});

const openMeasureAndClose = async (
  page: Page,
  scenario: Scenario,
  run: number,
  warmup: boolean,
  getCurrentSubject: () => string,
  getDataRequestCount: () => number,
): Promise<RunResult> => {
  const issueId = String(101 + scenario.targetIndex);
  const subject = getCurrentSubject();
  const subjectLink = page.getByRole('link', { name: subject, exact: true });

  // Locator readiness happens before browser timing starts.
  await expect(subjectLink).toBeVisible();
  await installBrowserMeasurement(page);

  // Match the existing mock E2E subject-click contract. Capture in the page
  // before the React handler, excluding automation and pointer hit-testing.
  await subjectLink.dispatchEvent('click');
  await page.waitForFunction(() => {
    const measurement = (window as MeasurementWindow).__issueDialogMeasurement;
    return Boolean(measurement && measurement.shellAt !== null && measurement.iframeReadyAt !== null);
  }, undefined, { timeout: 15_000 });

  const timestamps = await page.evaluate(() => {
    const measurement = (window as MeasurementWindow).__issueDialogMeasurement;
    if (!measurement) throw new Error('Issue dialog timing observer was not installed');
    return measurement;
  });
  expect(timestamps.trustedClick).toBe(false);
  expect(timestamps.clickedIssueId).toBe(issueId);
  expect(timestamps.clickAt).not.toBeNull();
  expect(timestamps.shellAt).not.toBeNull();
  expect(timestamps.iframeReadyAt).not.toBeNull();

  const header = page.getByTestId('issue-dialog-header');
  await expect(header).toBeVisible();
  await expect(header).toContainText(`#${issueId}`);
  await expect(header).toContainText(subject);
  const iframe = page.locator('iframe');
  await expect(iframe).toHaveAttribute('src', new RegExp(`/issues/${issueId}(?:[?#]|$)`));
  await expect(iframe).not.toHaveClass(/issue-iframe-loading/);
  await expect(page.frameLocator('iframe').locator('h2')).toHaveText(`Issue #${issueId}`);

  if (scenario.issueCount === 10_000) {
    const accessibilityList = page.getByRole('list', { name: 'Gantt Chart Task List' });
    expect(await accessibilityList.locator('li').count()).toBeLessThanOrEqual(55);
  }

  const clickAt = timestamps.clickAt!;
  const shellAt = timestamps.shellAt!;
  const iframeReadyAt = timestamps.iframeReadyAt!;
  const result: RunResult = {
    issueCount: scenario.issueCount,
    target: scenario.target,
    targetIndex: scenario.targetIndex,
    targetOrdinal: scenario.targetOrdinal,
    issueId,
    run,
    warmup,
    shellMs: Number((shellAt - clickAt).toFixed(3)),
    iframeReadyMs: Number((iframeReadyAt - clickAt).toFixed(3)),
    iframeOnlyMs: Number((iframeReadyAt - shellAt).toFixed(3)),
    timestamps,
  };

  await page.evaluate(() => (window as MeasurementWindow).__stopIssueDialogMeasurement?.());

  // Closing triggers refreshData. Wait for both its response and the refreshed
  // target row to render before the next measured click.
  const requestsBeforeClose = getDataRequestCount();
  const refreshResponse = page.waitForResponse((response) => (
    response.url().includes('/canvas_gantt/data.json') && response.request().method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Close issue dialog' }).click();
  await expect(header).toHaveCount(0);
  await refreshResponse;
  await expect.poll(getDataRequestCount).toBeGreaterThan(requestsBeforeClose);
  await expect(page.getByRole('link', { name: getCurrentSubject(), exact: true })).toBeVisible();

  return result;
};

test.describe('Issue Dialog performance measurement', () => {
  test('measures shell and iframe readiness across issue counts and target positions', async ({ browser }, testInfo) => {
    test.skip(
      process.env[ISSUE_DIALOG_PERF_ENV] !== '1',
      `Set ${ISSUE_DIALOG_PERF_ENV}=1 to run the full issue-count and target-position measurement matrix`,
    );
    test.setTimeout(15 * 60 * 1000);
    const allRuns: RunResult[] = [];

    // The mock returns an immediate same-origin Redmine-shaped document. This
    // keeps iframe handling deterministic while avoiding a fabricated network
    // delay in the client scaling measurement.
    for (const scenario of scenarios) {
      const scenarioContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
      const scenarioPage = await scenarioContext.newPage();
      scenarioPage.setDefaultTimeout(15_000);
      const targetId = String(101 + scenario.targetIndex);
      const initialSubject = `Performance issue ${scenario.targetIndex + 1}`;
      let currentSubject = initialSubject;
      let dataRequestCount = 0;
      const mockData = buildMockData(scenario.issueCount);

      try {
        await scenarioPage.route('**/issues/*', async (route) => {
          const issueId = new URL(route.request().url()).pathname.match(/\/issues\/(\d+)$/)?.[1] ?? 'unknown';
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<!doctype html><html><head><title>Issue #${issueId}</title></head><body><div id="main"><div id="content"><h2>Issue #${issueId}</h2></div></div></body></html>`,
          });
        });

        await setupMockApp(scenarioPage, {
          mockData,
          onDataRequest: (data, requestCount) => {
            dataRequestCount = requestCount;
            if (requestCount > 1) {
              currentSubject = `${initialSubject} refreshed ${requestCount}`;
              const target = data.tasks.find((task) => String(task.id) === targetId);
              if (target) target.subject = currentSubject;
            }
          },
        });
        await waitForInitialRender(scenarioPage);

        // Validate the loaded dataset and exact target position before timing,
        // then center every non-first target in the virtualized sidebar. The
        // viewport adjustment is outside the measured click interval.
        const targetPosition = await scenarioPage.evaluate(async ({ issueCount, targetIndex, targetId }) => {
            const { useTaskStore } = await import('/src/stores/TaskStore.ts');
            const state = useTaskStore.getState();
            if (state.tasks.length !== issueCount) {
              throw new Error(`Expected ${issueCount} tasks in TaskStore, received ${state.tasks.length}`);
            }
            const taskAtIndex = state.tasks[targetIndex];
            if (!taskAtIndex || String(taskAtIndex.id) !== targetId) {
              throw new Error(`TaskStore index ${targetIndex} did not contain target issue ${targetId}`);
            }
            const layoutRow = state.layoutRows.find((row) => row.type === 'task' && row.taskId === targetId);
            if (!layoutRow) throw new Error(`No visible task layout row was found for issue ${targetId}`);

            const rawScrollY = layoutRow.rowIndex === 0
              ? 0
              : layoutRow.rowIndex * state.viewport.rowHeight - (state.viewport.height - state.viewport.rowHeight) / 2;
            state.updateViewport({ scrollY: rawScrollY });
            const positionedState = useTaskStore.getState();
            return {
              taskCount: positionedState.tasks.length,
              targetId: String(positionedState.tasks[targetIndex]?.id),
              rowIndex: layoutRow.rowIndex,
              scrollY: positionedState.viewport.scrollY,
            };
        }, { issueCount: scenario.issueCount, targetIndex: scenario.targetIndex, targetId });
        expect(targetPosition.taskCount).toBe(scenario.issueCount);
        expect(targetPosition.targetId).toBe(targetId);

        await expect(scenarioPage.getByRole('link', { name: currentSubject, exact: true })).toBeVisible();

        for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run += 1) {
          console.log(`Measuring ${scenario.issueCount} issues, ${scenario.target} (#${scenario.targetOrdinal}), run ${run + 1}`);
          allRuns.push(await openMeasureAndClose(
            scenarioPage,
            scenario,
            run + 1,
            run < WARMUP_RUNS,
            () => currentSubject,
            () => dataRequestCount,
          ));
        }

        // Keep the scenario boundary explicit and ensure refresh work has settled
        // before disposing its isolated page and mock routes.
        await expect(scenarioPage.getByRole('link', { name: currentSubject, exact: true })).toBeVisible();
      } finally {
        await scenarioContext.close();
      }
    }

    const summary = summarizeRuns(allRuns);
    const output = {
      measurement: 'Issue Dialog shell and iframe readiness',
      environment: {
        browserName: browser.browserType().name(),
        browserVersion: browser.version(),
        nodeVersion: process.version,
        playwrightProject: testInfo.project.name,
        iframeResponseDelayMs: 0,
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        timingSource: 'Browser performance.now() captured on dispatched subject click and MutationObserver DOM milestones; pointer hit-testing excluded',
      },
      summary,
      rawRuns: allRuns,
    };

    const outputPath = testInfo.outputPath('issue-dialog-performance.json');
    await writeFile(outputPath, JSON.stringify(output, null, 2));
    await testInfo.attach('issue-dialog-performance.json', {
      path: outputPath,
      contentType: 'application/json',
    });
    console.log(JSON.stringify({ environment: output.environment, summary }, null, 2));
  });
});
