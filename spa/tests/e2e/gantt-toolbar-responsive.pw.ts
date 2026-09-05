import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const toolbarMetrics = async (page: import('@playwright/test').Page) => page.evaluate(() => {
  const toolbar = document.querySelector<HTMLElement>('.gantt-toolbar');
  const left = document.querySelector<HTMLElement>('.gantt-toolbar-left');
  const right = document.querySelector<HTMLElement>('.gantt-toolbar-right');
  if (!toolbar || !left || !right) throw new Error('Toolbar groups are missing');

  const toolbarRect = toolbar.getBoundingClientRect();
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')]
    .filter(button => button.getClientRects().length > 0)
    .map(button => {
      const rect = button.getBoundingClientRect();
      return { name: button.getAttribute('aria-label') ?? button.title, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
  const overlaps = buttons.flatMap((first, index) => buttons.slice(index + 1).filter(second => (
    first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
  )).map(second => [first.name, second.name]));

  return {
    toolbar: { left: toolbarRect.left, right: toolbarRect.right, top: toolbarRect.top, bottom: toolbarRect.bottom },
    left: left.getBoundingClientRect().toJSON(),
    right: right.getBoundingClientRect().toJSON(),
    labelsVisible: [...left.querySelectorAll('.gantt-toolbar-button-label')].some(label => getComputedStyle(label).display !== 'none'),
    buttons,
    overlaps,
  };
});

const expectPopupInViewport = async (page: import('@playwright/test').Page, testId: string) => {
  const popup = page.getByTestId(testId);
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
};

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('keeps right controls contained and left labels compact across breakpoint boundaries', async ({ page }) => {
  await waitForInitialRender(page);

  for (const width of [1920, 1600, 1200, 1199, 1000, 999, 701, 700, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await toolbarMetrics(page);
    expect(metrics.right.right, `right group at ${width}px`).toBeLessThanOrEqual(metrics.toolbar.right + 1);
    expect(metrics.right.left, `right group at ${width}px`).toBeGreaterThanOrEqual(metrics.toolbar.left - 1);
    expect(metrics.overlaps, `overlaps at ${width}px`).toEqual([]);
    for (const button of metrics.buttons) {
      expect(button.left, `${button.name} left at ${width}px`).toBeGreaterThanOrEqual(metrics.toolbar.left - 1);
      expect(button.right, `${button.name} right at ${width}px`).toBeLessThanOrEqual(metrics.toolbar.right + 1);
    }
    const toolbarWidth = metrics.toolbar.right - metrics.toolbar.left;
    if (toolbarWidth > 999) expect(metrics.labelsVisible, `labels at ${width}px (toolbar ${toolbarWidth}px)`).toBe(true);
    else expect(metrics.labelsVisible, `labels at ${width}px (toolbar ${toolbarWidth}px)`).toBe(false);
    if (toolbarWidth > 700) {
      expect(metrics.left.top, `left row at ${width}px`).toBe(metrics.right.top);
    } else {
      expect(metrics.right.top, `right row at ${width}px`).toBeGreaterThan(metrics.left.top);
    }
  }
});

test('responds to a narrow embedded toolbar and preserves primary interactions', async ({ page }) => {
  await waitForInitialRender(page);
  await page.locator('.app-container').evaluate((app: HTMLElement) => {
    app.style.width = '680px';
    app.style.maxWidth = '680px';
  });

  const metrics = await toolbarMetrics(page);
  expect(metrics.overlaps).toEqual([]);
  expect(metrics.right.right).toBeLessThanOrEqual(metrics.toolbar.right + 1);
  expect(metrics.labelsVisible).toBe(false);

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ modifiedTaskIds: new Set(['101']), autoSave: false });
  });
  await expect(page.getByTitle('Save changes')).toBeVisible();
  await expect(page.getByTitle('Discard changes')).toBeVisible();
  const dirtyMetrics = await toolbarMetrics(page);
  expect(dirtyMetrics.overlaps).toEqual([]);
  for (const button of dirtyMetrics.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(dirtyMetrics.toolbar.left - 1);
    expect(button.right).toBeLessThanOrEqual(dirtyMetrics.toolbar.right + 1);
  }
  await page.getByTestId('baseline-save-menu-button').click();
  const baselineMenu = page.getByTestId('baseline-save-menu');
  await expect(baselineMenu).toBeVisible();
  const popup = await baselineMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(popup).not.toBeNull();
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await page.getByTestId('baseline-save-menu-button').click();

  await page.getByTestId('display-settings-menu-button').click();
  await expectPopupInViewport(page, 'display-settings-menu');
  await page.getByTestId('display-settings-menu-button').click();
  await page.getByTestId('query-menu-button').click();
  await expectPopupInViewport(page, 'query-menu');
  await page.getByTestId('query-menu-button').click();
  await page.getByTestId('column-menu-button').click();
  await expectPopupInViewport(page, 'column-menu');
  await page.getByTestId('column-menu-button').click();
  await page.getByTitle('Filter Tasks').click();
  await expectPopupInViewport(page, 'filter-menu');
  await page.getByTitle('Filter Tasks').click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toBeVisible();
});
