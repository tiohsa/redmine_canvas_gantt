import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('filters tasks by text', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Filter Tasks').click();
  await page.getByPlaceholder('Filter by subject...').fill('login');

  await expect(page.getByText('Fix login flow')).toBeVisible();
  await expect(page.getByText('Release prep')).toHaveCount(0);
});

test('clears filter on button click', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Filter Tasks').click();
  await page.getByPlaceholder('Filter by subject...').fill('login');
  await page.getByRole('button', { name: 'Clear' }).first().click();

  await expect(page.getByText('Fix login flow')).toBeVisible();
});

test('filters by status', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Status').click();
  await page.getByRole('button', { name: 'Clear' }).first().click();
  await page.getByLabel('Closed').check();
  await expect(page.getByText('Implement sidebar resize behavior')).toHaveCount(0);
  await expect(page.getByText('Fix login flow')).toHaveCount(0);
});
