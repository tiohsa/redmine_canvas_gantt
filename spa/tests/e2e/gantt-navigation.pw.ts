import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('switches to Month view', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByRole('button', { name: 'Month' }).click();
  await expect(page.getByRole('button', { name: 'Month' })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('switches to Week view', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByRole('button', { name: 'Week' })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('switches to Day view', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('scrolls horizontally', async ({ page }) => {
  await waitForInitialRender(page);

  const scrollPane = page.locator('.rcg-gantt-scroll-pane');
  await scrollPane.evaluate((el) => { el.scrollLeft = 400; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => scrollPane.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test('scrolls vertically', async ({ page }) => {
  await waitForInitialRender(page);

  const scrollPane = page.locator('.rcg-gantt-scroll-pane');
  await scrollPane.evaluate((el) => { el.scrollTop = 200; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => scrollPane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('navigates to Today', async ({ page }) => {
  await waitForInitialRender(page);

  const scrollPane = page.locator('.rcg-gantt-scroll-pane');
  const before = await scrollPane.evaluate((el) => el.scrollLeft);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect.poll(() => scrollPane.evaluate((el) => el.scrollLeft)).not.toBe(before);
});
