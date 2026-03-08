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

test('uses move cursor when hovering an editable gantt bar body', async ({ page }) => {
  await waitForInitialRender(page);

  const result = await page.evaluate(async () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const startDate = Date.parse('2026-01-20T00:00:00Z');
    const scale = 10 / oneDayMs;
    const [{ useTaskStore }, { LayoutEngine }] = await Promise.all([
      import('/src/stores/TaskStore.ts'),
      import('/src/engines/LayoutEngine.ts'),
    ]);

    useTaskStore.getState().updateViewport({ startDate, scrollX: 0, scrollY: 0, scale });
    const state = useTaskStore.getState();
    const task = state.tasks.find((t) => t.id === '102');
    const pane = document.querySelector('.rcg-gantt-viewport');

    if (!task || !(pane instanceof HTMLElement)) {
      return { cursor: null, visible: false };
    }

    const bar = LayoutEngine.getTaskBounds(task, state.viewport, 'bar', state.zoomLevel);
    const rect = pane.getBoundingClientRect();
    const x = rect.left + bar.x + bar.width / 2;
    const y = rect.top + bar.y + bar.height / 2;
    pane.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));

    return {
      cursor: getComputedStyle(pane).cursor,
      visible: bar.x >= 0 && bar.x + bar.width <= state.viewport.width,
    };
  });

  expect(result.visible).toBe(true);
  expect(result.cursor).toBe('move');
});
