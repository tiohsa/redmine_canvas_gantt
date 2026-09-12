import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

test('shows workload pane in the lower split view area', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';

  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);

  await page.getByTitle('Workload').click();
  await page.getByLabel('Show Workload Pane').check();

  const histogramHeader = page.getByText('HISTOGRAM (DAILY WORKLOAD)');
  await expect(histogramHeader).toBeVisible();
  await expect(page.getByText('Assignees', { exact: true })).toBeVisible();

  const workloadMenu = page.getByText('Capacity Threshold (hours/day)');
  await expect(workloadMenu).toBeVisible();

  const histogramBox = await histogramHeader.boundingBox();
  const toolbarButtonBox = await page.getByTitle('Workload').boundingBox();
  const histogramCanvas = page.getByTestId('workload-canvas');
  const histogramCanvasBox = await histogramCanvas.boundingBox();

  expect(histogramBox).not.toBeNull();
  expect(toolbarButtonBox).not.toBeNull();
  expect(histogramBox!.y).toBeGreaterThan(toolbarButtonBox!.y);
  expect(histogramCanvasBox).not.toBeNull();
  expect(histogramCanvasBox!.width).toBeGreaterThan(0);
  expect(histogramCanvasBox!.height).toBeGreaterThan(0);
  await expect(histogramCanvas).toBeVisible();
});

test('keeps workload viewport metrics aligned at boundary pane heights', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';

  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await page.getByTitle(/^(Workload|ワークロード)$/i).click();
  await page.getByLabel(/^(Show Workload Pane|ワークロードパネルを表示)$/i).check();
  await page.getByTestId('workload-canvas-viewport').waitFor();

  for (const paneHeight of [358, 359, 360, 361, 362, 363]) {
    await page.evaluate((height) => {
      for (const testId of ['workload-split-layout-left', 'workload-split-layout-right']) {
        const layout = document.querySelector(`[data-testid="${testId}"]`);
        if (layout instanceof HTMLElement) {
          layout.style.gridTemplateRows = `minmax(160px, 1fr) 8px ${height}px`;
        }
      }
    }, paneHeight);

    const metrics = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!(element instanceof HTMLElement)) return null;
        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight)
        };
      };

      return {
        sidebar: read('workload-sidebar-scroll'),
        canvas: read('workload-canvas-viewport')
      };
    });

    expect(metrics.sidebar).not.toBeNull();
    expect(metrics.canvas).not.toBeNull();
    expect(metrics.sidebar!.clientHeight).toBe(metrics.canvas!.clientHeight);
    expect(metrics.sidebar!.maxScrollTop).toBe(metrics.canvas!.maxScrollTop);
  }
});

test('compares planned and actual workers, shows overload and retains actuals after reload', async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const base = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(base, page);
  await page.goto(`${base}/projects/ecookbook/canvas_gantt`);
  const day = new Date();
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() + 1);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const authorization = `Basic ${Buffer.from('admin:admin').toString('base64')}`;
  const identifier = `workload-${Date.now()}`;
  const projectResponse = await page.request.post(`${base}/projects.json`, {
    headers: { Authorization: authorization },
    data: { project: { name: identifier, identifier, enabled_module_names: ['issue_tracking', 'time_tracking', 'canvas_gantt'] } }
  });
  expect(projectResponse.status()).toBe(201);
  for (const userId of [2, 3]) {
    const membership = await page.request.post(`${base}/projects/${identifier}/memberships.json`, {
      headers: { Authorization: authorization }, data: { membership: { user_id: userId, role_ids: [1] } }
    });
    expect(membership.status()).toBe(201);
  }
  const issueResponse = await page.request.post(`${base}/issues.json`, {
    headers: { Authorization: authorization },
    data: { issue: { project_id: identifier, tracker_id: 1, subject: `Workload comparison ${Date.now()}`,
      assigned_to_id: 3, estimated_hours: 8, start_date: date, due_date: date } }
  });
  expect(issueResponse.status()).toBe(201);
  const issueId = (await issueResponse.json()).issue.id;
  try {
    const activityResponse = await page.request.get(`${base}/enumerations/time_entry_activities.json`, { headers: { Authorization: authorization } });
    const activityId = (await activityResponse.json()).time_entry_activities[0].id;
    for (const [userId, hours] of [[3, 6], [2, 9]]) {
      const response = await page.request.post(`${base}/time_entries.json`, {
        headers: { Authorization: authorization },
        data: { time_entry: { issue_id: issueId, user_id: userId, hours, spent_on: date, activity_id: activityId } }
      });
      expect(response.status()).toBe(201);
    }
    await page.goto(`${base}/projects/${identifier}/canvas_gantt`);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByTitle('Workload', { exact: true }).click();
    await page.getByLabel('Show Workload Pane').check();
    await expect(page.getByTestId('workload-sidebar-total-3')).toContainText('A 6.0h');
    await expect(page.getByTestId('workload-sidebar-total-3')).toContainText('P 8.0h');
    await expect(page.getByTestId('workload-sidebar-total-2')).toContainText('A 9.0h');
    await expect(page.getByTestId('workload-sidebar-total-2')).toContainText('P 0.0h');
    await expect(page.getByTestId('actual-overload-action-area-2')).toContainText('Actual overload');
    await page.getByTitle('Workload', { exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('comparison.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByTitle('Workload', { exact: true }).click();
    await page.getByLabel('Show Workload Pane').check();
    await expect(page.getByTestId('workload-sidebar-total-2')).toContainText('A 9.0h');
  } finally {
    await page.request.delete(`${base}/projects/${identifier}.json`, { headers: { Authorization: authorization } });
  }
});
