import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

const timerSessionCount = async (page: import('@playwright/test').Page): Promise<number> => page.evaluate(() => (
  Object.keys(localStorage).filter(key => key.startsWith('redmine_canvas_gantt_timer_session:')).length
));

test('records timer work through the standard Redmine TimeEntry redirect', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);

  await page.getByRole('button', { name: /cols|columns/i }).click();
  const timerColumn = page.getByRole('checkbox', { name: /work timer|timer/i });
  if (!(await timerColumn.isChecked())) await timerColumn.click();
  await expect(page.getByTestId('sidebar-header-timer')).toBeVisible();

  const startButton = page.locator('[data-testid^="task-timer-start-"]:not([disabled])').first();
  await expect(startButton).toBeVisible();
  await startButton.dispatchEvent('click');
  await page.getByTestId('timer-start-confirm-button').click();
  await expect(page.getByTestId('global-timer')).toBeVisible();
  await expect.poll(() => timerSessionCount(page)).toBe(1);

  await page.getByTestId('global-timer-stop-button').click();
  const timeEntryFrame = page.frameLocator('iframe[src*="/time_entries/new"]');
  const hours = timeEntryFrame.locator('input[name="time_entry[hours]"]');
  await expect(hours).toBeVisible();
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
  await expect.poll(() => timerSessionCount(page)).toBe(0);
});

