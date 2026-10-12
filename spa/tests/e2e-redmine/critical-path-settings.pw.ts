import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

test('persists critical path calculation and shares its display preference without API mutations', async ({ page, baseURL }) => {
  await adminLogin(baseURL ?? 'http://127.0.0.1:3000', page);
  await page.goto('/projects/ecookbook/canvas_gantt');
  await expect(page.getByTestId('display-settings-menu-button')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await page.getByTestId('display-settings-menu-button').click();
  const calculation = page.getByRole('switch', { name: 'Calculate critical path', exact: true });
  await expect(calculation).toBeChecked();

  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/canvas_gantt/') && request.resourceType() !== 'script') {
      requests.push(`${request.method()} ${request.url()}`);
    }
  });
  await calculation.locator('xpath=ancestor::label').click();
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('canvasGantt:preferences');
    const projectId = (window as Window & { RedmineCanvasGantt?: { projectId: string | number } }).RedmineCanvasGantt?.projectId;
    return raw ? JSON.parse(raw).display.projects[`project:${projectId}`]?.calculateCriticalPathEnabled : undefined;
  })).toBe(false);
  expect(requests).toEqual([]);

  await page.reload();
  await page.getByTestId('display-settings-menu-button').click();
  await expect(calculation).not.toBeChecked();
  await page.getByRole('switch', { name: 'Share settings across all projects', exact: true })
    .locator('xpath=ancestor::label').click();
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('canvasGantt:preferences');
    return raw ? JSON.parse(raw).display.global.preferences.calculateCriticalPathEnabled : undefined;
  })).toBe(false);

  requests.length = 0;
  await calculation.locator('xpath=ancestor::label').click();
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('canvasGantt:preferences');
    return raw ? JSON.parse(raw).display.global.preferences.calculateCriticalPathEnabled : undefined;
  })).toBe(true);
  expect(requests).toEqual([]);
});
