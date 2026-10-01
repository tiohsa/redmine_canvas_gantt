import { expect, test } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

test.describe('default mock dataset', () => {
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
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      focusedTaskLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      if (focusedTaskLabel.includes('Task:')) break;
    }

    expect(focusedTaskLabel).toContain('Task:');
  });
});

test('keeps a large accessibility list bounded while navigating every task', async ({ page }) => {
  const mockData = {
    ...defaultMockData,
    tasks: Array.from({ length: 10_000 }, (_, index) => ({
      ...defaultMockData.tasks[0],
      id: 101 + index,
      subject: `Accessible task ${index + 1}`,
      display_order: index,
    })),
    relations: [],
    versions: [],
  };
  await setupMockApp(page, { mockData });
  await waitForInitialRender(page);
  const list = page.getByRole('list', { name: 'Gantt Chart Task List' });
  const rows = list.locator('li');
  expect(await rows.count()).toBeLessThanOrEqual(55);
  await expect(rows.first()).toHaveAttribute('aria-posinset', '1');
  await expect(rows.first()).toHaveAttribute('aria-setsize', '10000');
  // Sentinels establish both exits without depending on the surrounding toolbar.
  await list.evaluate(element => {
    for (const side of ['before', 'after']) {
      const button = document.createElement('button');
      button.id = `a11y-${side}`;
      button.textContent = side;
      if (side === 'before') element.before(button);
      else element.after(button);
    }
  });
  await rows.first().focus();
  for (let index = 2; index <= 60; index += 1) {
    await page.keyboard.press('Tab');
    await expect(list.locator(`li[aria-posinset="${index}"]`)).toBeFocused();
    expect(await rows.count()).toBeLessThanOrEqual(55);
  }
  for (let index = 59; index >= 24; index -= 1) {
    await page.keyboard.press('Shift+Tab');
    await expect(list.locator(`li[aria-posinset="${index}"]`)).toBeFocused();
  }
  await page.keyboard.press('ArrowDown');
  await expect(list.locator('li[aria-posinset="25"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(list.locator('li[aria-posinset="24"]')).toBeFocused();
  await rows.last().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(list.locator('li[aria-posinset="9999"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#a11y-after')).toBeFocused();
  await rows.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#a11y-before')).toBeFocused();
  expect(await rows.count()).toBeLessThanOrEqual(55);
});

test('keeps the accessibility list bounded after closing an issue dialog refreshes 10,000 tasks', async ({ page }) => {
  const mockData = {
    ...defaultMockData,
    tasks: Array.from({ length: 10_000 }, (_, index) => ({
      ...defaultMockData.tasks[0],
      id: 101 + index,
      subject: `Accessible task ${index + 1}`,
      display_order: index,
    })),
    relations: [],
    versions: [],
  };
  let dataRequests = 0;
  await setupMockApp(page, {
    mockData,
    onDataRequest: (data, requestCount) => {
      dataRequests = requestCount;
      if (requestCount > 1) data.tasks[0].subject = 'Refreshed accessible task';
    },
  });
  await waitForInitialRender(page);
  const list = page.getByRole('list', { name: 'Gantt Chart Task List' });
  const rows = list.locator('li');
  expect(await rows.count()).toBeLessThanOrEqual(55);

  await page.getByTestId('cell-101-subject').getByRole('link').dispatchEvent('click');
  await expect(page.getByTestId('issue-dialog-header')).toBeVisible();
  const requestsBeforeClose = dataRequests;
  await page.getByRole('button', { name: 'Close issue dialog' }).click();

  await expect(page.getByTestId('issue-dialog-header')).toHaveCount(0);
  expect(requestsBeforeClose).toBeGreaterThan(0);
  await expect(rows.first()).toHaveAttribute('aria-label', /Refreshed accessible task/);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(list).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(55);
  await expect(rows.first()).toHaveAttribute('aria-posinset', '1');
  await expect(rows.first()).toHaveAttribute('aria-setsize', '10000');
});
