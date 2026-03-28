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

  expect(histogramBox).not.toBeNull();
  expect(toolbarButtonBox).not.toBeNull();
  expect(histogramBox!.y).toBeGreaterThan(toolbarButtonBox!.y);

  const histogramHasBars = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    const histogramCanvas = canvases[canvases.length - 1] as HTMLCanvasElement | undefined;
    const ctx = histogramCanvas?.getContext('2d');
    if (!histogramCanvas || !ctx) return false;

    const { width, height } = histogramCanvas;
    const data = ctx.getImageData(0, 0, width, height).data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) continue;

      const isNormalBar = r === 66 && g === 133 && b === 244;
      const isOverloadBar = r === 234 && g === 67 && b === 53;

      if (isNormalBar || isOverloadBar) {
        return true;
      }
    }

    return false;
  });

  expect(histogramHasBars).toBe(true);
});
