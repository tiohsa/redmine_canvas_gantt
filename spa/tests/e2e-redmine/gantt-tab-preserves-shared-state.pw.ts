import { expect, test, type Page } from '@playwright/test';
import { adminLogin } from './helpers';

const ensureCanvasGanttModuleEnabled = async (redmineBase: string, page: Page) => {
  await page.goto(`${redmineBase}/projects/ecookbook/settings/modules`);

  const moduleToggle = page.getByLabel('Canvas Gantt');
  await expect(moduleToggle).toBeVisible();

  if (!(await moduleToggle.isChecked())) {
    await moduleToggle.check();
    await page.getByRole('button', { name: /save|apply/i }).click();
  }
};

test('restores the last-used shared query state when reopening bare Canvas Gantt tab', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const initialUrl = new URL(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  initialUrl.searchParams.append('status_ids[]', '1');
  initialUrl.searchParams.set('group_by', 'assigned_to');
  initialUrl.searchParams.set('show_subprojects', '0');

  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page);

  await page.goto(initialUrl.toString());
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await expect(page).toHaveURL(/status_ids%5B%5D=1/);
  await expect(page).toHaveURL(/group_by=assigned_to/);
  await expect(page).toHaveURL(/show_subprojects=0/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('canvasGantt:lastSharedQueryState')))
    .toContain('"overrides":{"status":{"mode":"subset","values":[1]}}');

  const canvasTab = page.locator('a.menu-canvas-gantt, #main-menu a[href*="/canvas_gantt"], #project-menu a[href*="/canvas_gantt"]').first();
  await expect(canvasTab).toBeVisible();
  await expect(canvasTab).toHaveAttribute('href', /\/projects\/ecookbook\/canvas_gantt$/);

  await canvasTab.click();
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await expect(page).toHaveURL(/status_ids%5B%5D=1/);
  await expect(page).toHaveURL(/group_by=assigned_to/);
  await expect(page).toHaveURL(/show_subprojects=0/);

  initialUrl.searchParams.set('group_by', 'none');
  await page.goto(initialUrl.toString());
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await expect(page).toHaveURL(/group_by=none/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('canvasGantt:lastSharedQueryState')))
    .toContain('"groupBy":null');

  await canvasTab.click();
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await expect(page).toHaveURL(/status_ids%5B%5D=1/);
  await expect(page).toHaveURL(/group_by=none/);
  await expect(page).toHaveURL(/show_subprojects=0/);
});
