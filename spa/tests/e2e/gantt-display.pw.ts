import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('renders gantt chart on load', async ({ page }) => {
  await waitForInitialRender(page);

  await expect(page.locator('.rcg-gantt-viewport canvas')).toHaveCount(3);
});

test('displays task bars correctly', async ({ page }) => {
  await waitForInitialRender(page);

  const a11yTasks = page.getByRole('listitem');
  await expect(a11yTasks).toHaveCount(2);
  await expect(page.getByRole('listitem', { name: /Task: Implement sidebar resize behavior/ })).toBeVisible();
});
