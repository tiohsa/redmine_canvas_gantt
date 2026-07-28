import { expect, test, type Page } from '@playwright/test';

const login = async (baseURL: string, page: Page, username: string, password: string) => {
  await page.goto(`${baseURL}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
};

const baselineResponse = (page: Page) => page.evaluate(async () => {
  const config = (window as Window & { RedmineCanvasGantt: { apiBase: string; authToken: string } }).RedmineCanvasGantt;
  const response = await window.fetch(`${config.apiBase}/baseline.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.authToken },
    body: JSON.stringify({ scope: 'filtered' })
  });
  return { status: response.status, payload: await response.json() };
});

test('Baseline read is allowed but save is forbidden for a viewer-only user', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await login(redmineBase, page, 'canvas_gantt_viewer', 'canvas-gantt-viewer');
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  const response = await baselineResponse(page);
  expect(response.status).toBe(403);
});

test('Baseline save is allowed for a user with manage_canvas_gantt_baseline', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await login(redmineBase, page, 'canvas_gantt_baseline_manager', 'canvas-gantt-baseline-manager');
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  const response = await baselineResponse(page);
  expect(response.status).toBe(200);
  expect(response.payload).toMatchObject({ status: 'ok' });
});
