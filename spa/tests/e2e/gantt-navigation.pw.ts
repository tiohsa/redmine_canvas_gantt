import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('switches to Month view', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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

test('keeps timeline header and viewport aligned after rapid month navigation clicks', async ({ page }) => {
  await waitForInitialRender(page);

  const headerCanvas = page.locator('canvas').first();
  const viewportPane = page.locator('.rcg-gantt-viewport');

  const getAlignment = async () => {
    const [headerBox, viewportBox] = await Promise.all([
      headerCanvas.boundingBox(),
      viewportPane.boundingBox(),
    ]);

    if (!headerBox || !viewportBox) {
      throw new Error('Failed to get bounding boxes for header/viewport');
    }

    return {
      deltaX: Math.abs(headerBox.x - viewportBox.x),
      deltaWidth: Math.abs(headerBox.width - viewportBox.width),
    };
  };

  const before = await getAlignment();
  expect(before.deltaX).toBeLessThanOrEqual(1);
  expect(before.deltaWidth).toBeLessThanOrEqual(1);

  const previousMonthButton = page.getByRole('button', { name: 'Previous month' });
  const nextMonthButton = page.getByRole('button', { name: 'Next month' });

  for (let i = 0; i < 8; i++) {
    await previousMonthButton.click();
    await nextMonthButton.click();
  }

  await expect.poll(async () => (await getAlignment()).deltaX).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await getAlignment()).deltaWidth).toBeLessThanOrEqual(1);
});

test('keeps timeline header and viewport aligned during rapid right-to-left wheel scrolling', async ({ page }) => {
  await waitForInitialRender(page);

  const scrollPane = page.locator('.rcg-gantt-scroll-pane');
  const headerCanvas = page.locator('canvas').first();
  const viewportPane = page.locator('.rcg-gantt-viewport');

  const getAlignment = async () => {
    const [headerBox, viewportBox] = await Promise.all([
      headerCanvas.boundingBox(),
      viewportPane.boundingBox(),
    ]);

    if (!headerBox || !viewportBox) {
      throw new Error('Failed to get bounding boxes for header/viewport');
    }

    return {
      deltaX: Math.abs(headerBox.x - viewportBox.x),
      deltaWidth: Math.abs(headerBox.width - viewportBox.width),
    };
  };

  await scrollPane.evaluate((el) => {
    el.scrollLeft = Math.max(0, el.scrollWidth);
    el.dispatchEvent(new Event('scroll'));
  });

  await scrollPane.evaluate((el) => {
    for (let i = 0; i < 12; i++) {
      el.scrollLeft = Math.max(0, el.scrollLeft - 240);
      el.dispatchEvent(new Event('scroll'));
    }
  });

  await expect.poll(async () => (await getAlignment()).deltaX).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await getAlignment()).deltaWidth).toBeLessThanOrEqual(1);
});
