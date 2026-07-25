import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('loads the unified UI and Japanese fallback fonts', async ({ page }) => {
  await waitForInitialRender(page);

  const fonts = await page.evaluate(() => {
    return {
      dmSans: Array.from(document.fonts).some((font) => font.family === 'DM Sans'),
      notoSansJp: Array.from(document.fonts).some((font) => font.family === 'Noto Sans JP Variable'),
      fontFamily: getComputedStyle(document.querySelector('#root')!).fontFamily,
    };
  });

  expect(fonts).toEqual({
    dmSans: true,
    notoSansJp: true,
    fontFamily: '"DM Sans", "Noto Sans JP Variable", "Helvetica Neue", Helvetica, Arial, sans-serif',
  });
});
