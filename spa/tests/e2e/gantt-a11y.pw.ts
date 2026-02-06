import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('has proper ARIA labels', async ({ page }) => {
  await waitForInitialRender(page);

  await expect(page.getByRole('list', { name: 'Gantt Chart Task List' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
});

test('focuses first task on Tab', async ({ page }) => {
  await waitForInitialRender(page);

  let focusedTaskLabel = '';
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    focusedTaskLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
    if (focusedTaskLabel.includes('Task:')) break;
  }

  expect(focusedTaskLabel).toContain('Task:');
});
