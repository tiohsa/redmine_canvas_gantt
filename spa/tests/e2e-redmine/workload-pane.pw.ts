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
