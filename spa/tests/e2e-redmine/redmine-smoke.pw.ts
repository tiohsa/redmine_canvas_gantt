import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

test('renders canvas gantt page in Redmine', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedScriptResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    const req = response.request();
    if (req.resourceType() !== 'script') return;
    if (!response.ok()) {
      failedScriptResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await adminLogin(redmineBase, page);

  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByRole('heading', { name: '403' })).toHaveCount(0);

  const loadingText = page.getByText('Loading Canvas Gantt...');
  await expect(loadingText).toHaveCount(0);

  const memberProjectsResponse = await page.evaluate(async () => {
    const url = new URL('/projects/ecookbook/canvas_gantt/data.json', window.location.origin);
    url.searchParams.set('member_projects_only', '1');
    const response = await window.fetch(url);

    return {
      status: response.status,
      payload: await response.json()
    };
  });

  expect(memberProjectsResponse.status).toBe(200);
  expect(memberProjectsResponse.payload).toHaveProperty('filter_options.projects');
  expect(failedScriptResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
