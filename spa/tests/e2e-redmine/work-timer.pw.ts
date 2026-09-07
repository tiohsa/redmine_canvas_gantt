import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

const timerSessionCount = async (page: import('@playwright/test').Page): Promise<number> => page.evaluate(() => (
  Object.keys(localStorage).filter(key => key.startsWith('redmine_canvas_gantt_timer_session:')).length
));

test('keeps an Issue edit dialog distinct from a TimeEntry dialog', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);

  await page.getByTestId('task-row-2').click({ button: 'right' });
  await page.getByTestId('context-menu-edit-task').click();

  const issueFrame = page.frameLocator('iframe[src*="/issues/2/edit"]');
  await expect(issueFrame.locator('#issue-form')).toBeVisible();
  await expect(page.getByText('Bulk Ticket Creation')).toBeVisible();
  const dialogFooter = page.getByTestId('issue-dialog-footer');
  await expect(dialogFooter.getByRole('button', { name: /save issue/i })).toBeVisible();
  await expect(dialogFooter.getByRole('button', { name: /log time/i })).toHaveCount(0);
});

test('records timer work through the standard Redmine TimeEntry redirect', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByTitle('Workload', { exact: true }).click();
  const actualLoaded = page.waitForResponse(response => response.url().includes('/actual_workload.json') && response.status() === 200);
  await page.getByLabel('Show Workload Pane').check();
  const entriesBefore = (await (await actualLoaded).json()).entries as Array<{ userId: number; hours: number }>;
  const actualBefore = entriesBefore.filter(entry => entry.userId === 1).reduce((sum, entry) => sum + entry.hours, 0);
  await expect(page.getByTestId('workload-canvas')).toBeVisible();
  await page.getByTitle('Workload', { exact: true }).click();

  await page.getByRole('button', { name: /cols|columns/i }).click();
  const timerColumn = page.getByRole('checkbox', { name: /work timer|timer/i });
  if (!(await timerColumn.isChecked())) await timerColumn.click();
  await expect(page.getByTestId('sidebar-header-timer')).toBeVisible();

  const startButton = page.locator('[data-testid="task-timer-start-2"]');
  await expect(startButton).toBeVisible();
  await startButton.dispatchEvent('click');
  await page.getByTestId('timer-start-confirm-button').click();
  await expect(page.getByTestId('global-timer')).toBeVisible();
  await expect.poll(() => timerSessionCount(page)).toBe(1);

  await page.getByTestId('global-timer-stop-button').click();
  const timeEntryFrame = page.frameLocator('iframe[src*="/time_entries/new"]');
  const hours = timeEntryFrame.locator('input[name="time_entry[hours]"]');
  await expect(hours).toBeVisible();
  await expect(page.getByTestId('issue-dialog-header')).toContainText('#2');
  await expect(timeEntryFrame.getByRole('link', { name: /cancel/i })).toBeHidden();
  await expect(page.getByText('Bulk Ticket Creation')).toHaveCount(0);
  const dialogFooter = page.getByTestId('issue-dialog-footer');
  await expect(dialogFooter.getByRole('button', { name: /cancel/i })).toBeVisible();
  await expect(dialogFooter.getByRole('button', { name: /log time|save|button_log_time/i })).toBeVisible();
  await hours.fill('1.0');
  const activity = timeEntryFrame.locator('select[name="time_entry[activity_id]"]');
  if (await activity.count()) {
    const activityValue = await activity.locator('option').evaluateAll(options => (
      options.map(option => (option as HTMLOptionElement).value).find(value => value !== '') ?? ''
    ));
    if (activityValue) await activity.selectOption(activityValue);
  }

  await dialogFooter.getByRole('button', { name: /Log time|Save|button_log_time/i }).click();

  await expect(page.locator('iframe[src*="/time_entries/new"]')).toHaveCount(0);
  await expect(page.getByTestId('issue-dialog-error')).toHaveCount(0);
  await expect.poll(() => timerSessionCount(page)).toBe(0);
  await expect(page.getByTestId('workload-sidebar-total-1')).toContainText(`A ${(actualBefore + 1).toFixed(1)}h`);
  await page.reload();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByTitle('Workload', { exact: true }).click();
  await page.getByLabel('Show Workload Pane').check();
  await expect(page.getByTestId('workload-sidebar-total-1')).toContainText(`A ${(actualBefore + 1).toFixed(1)}h`);
});

test('keeps the timer session after Redmine validation and records it on retry', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);

  await page.getByRole('button', { name: /cols|columns/i }).click();
  const timerColumn = page.getByRole('checkbox', { name: /work timer|timer/i });
  if (!(await timerColumn.isChecked())) await timerColumn.click();
  await expect(page.getByTestId('sidebar-header-timer')).toBeVisible();

  const startButton = page.locator('[data-testid="task-timer-start-2"]');
  await expect(startButton).toBeVisible();
  await startButton.dispatchEvent('click');
  await page.getByTestId('timer-start-confirm-button').click();
  await expect.poll(() => timerSessionCount(page)).toBe(1);

  await page.getByTestId('global-timer-stop-button').click();
  const timeEntryFrame = page.frameLocator('iframe[src*="/time_entries/new"]');
  const hours = timeEntryFrame.locator('input[name="time_entry[hours]"]');
  await expect(hours).toBeVisible();
  await hours.fill('');
  await page.getByTestId('issue-dialog-footer').getByRole('button', { name: /Log time|Save|button_log_time/i }).click();

  await expect(timeEntryFrame.locator('#errorExplanation, .errorExplanation')).toBeVisible();
  await expect(page.getByTestId('issue-dialog-error')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('redmine_canvas_gantt_timer_session:'))!;
    return JSON.parse(localStorage.getItem(key)!).recordingAttempt?.phase;
  })).toBe('editing');
  await expect.poll(() => timerSessionCount(page)).toBe(1);

  await hours.fill('0.01');
  const activity = timeEntryFrame.locator('select[name="time_entry[activity_id]"]');
  if (await activity.count()) {
    const activityValue = await activity.locator('option').evaluateAll(options => (
      options.map(option => (option as HTMLOptionElement).value).find(value => value !== '') ?? ''
    ));
    if (activityValue) await activity.selectOption(activityValue);
  }
  await page.getByTestId('issue-dialog-footer').getByRole('button', { name: /Log time|Save|button_log_time/i }).click();

  await expect(page.locator('iframe[src*="/time_entries/new"]')).toHaveCount(0);
  await expect(page.getByTestId('issue-dialog-error')).toHaveCount(0);
  await expect.poll(() => timerSessionCount(page)).toBe(0);
});
