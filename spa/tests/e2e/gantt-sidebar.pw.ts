import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('renders sidebar with task list', async ({ page }) => {
  await waitForInitialRender(page);

  await expect(page.getByTestId('sidebar-header-subject')).toContainText('Task Name');
  await expect(page.getByRole('link', { name: 'Fix login flow' })).toBeVisible();
});

test('sidebar task cells keep pointer cursor while rows stay draggable', async ({ page }) => {
  await waitForInitialRender(page);

  const taskRow = page.getByTestId('task-row-101');
  const subjectCell = page.getByTestId('cell-101-subject');
  const statusCell = page.getByTestId('cell-101-status');

  await expect(taskRow).toHaveAttribute('draggable', 'true');
  await expect
    .poll(() => taskRow.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        color: style.borderBottomColor,
        style: style.borderBottomStyle,
        width: style.borderBottomWidth,
      };
    }))
    .toEqual({
      color: 'rgb(224, 224, 224)',
      style: 'solid',
      width: '1px',
    });
  await expect
    .poll(() => taskRow.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('pointer');
  await expect
    .poll(() => subjectCell.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('pointer');
  await expect
    .poll(() => statusCell.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('pointer');
  await expect(page.getByTestId('sidebar-column-resize-handle-ratioDone')).toHaveCount(0);
});

test('resize handles use ew-resize and column resizing still works', async ({ page }) => {
  await waitForInitialRender(page);

  const sidebarResizeHandle = page.getByTestId('sidebar-resize-handle');
  const statusHeader = page.getByTestId('sidebar-header-status');
  const columnResizeHandle = page.getByTestId('sidebar-column-resize-handle-status');

  await expect
    .poll(() => sidebarResizeHandle.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('ew-resize');
  await expect
    .poll(() => columnResizeHandle.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('ew-resize');

  const statusWidthBefore = await statusHeader.evaluate((el) => Number.parseFloat(getComputedStyle(el).width));
  expect(statusWidthBefore).toBeTruthy();

  const columnHandleBox = await columnResizeHandle.boundingBox();
  expect(columnHandleBox).toBeTruthy();
  const startX = columnHandleBox!.x + columnHandleBox!.width / 2;
  const centerY = columnHandleBox!.y + columnHandleBox!.height / 2;
  const endX = startX + 60;
  await columnResizeHandle.dispatchEvent('mousedown', {
    clientX: startX,
    clientY: centerY,
    button: 0,
    buttons: 1,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true,
      buttons: 1,
    }));
  }, { x: endX, y: centerY });

  await expect
    .poll(() => statusHeader.evaluate((el) => Number.parseFloat(getComputedStyle(el).width)))
    .toBeGreaterThan(statusWidthBefore + 10);

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent('mouseup', {
      clientX: x,
      clientY: y,
      bubbles: true,
    }));
  }, { x: endX, y: centerY });
});

test('resizing left pane keeps the rightmost column aligned to the boundary', async ({ page }) => {
  await page.addInitScript((prefs) => {
    localStorage.clear();
    localStorage.setItem('canvasGantt:preferences', JSON.stringify(prefs));
  }, {
    groupByProject: false,
    sidebarWidth: 700,
    visibleColumns: ['id', 'subject', 'status', 'assignee', 'ratioDone'],
    viewport: {
      scrollX: 0,
      scrollY: 0,
    },
  });

  await waitForInitialRender(page);

  const ratioDoneHeader = page.getByTestId('sidebar-header-ratioDone');
  const assigneeHeader = page.getByTestId('sidebar-header-assignee');
  const sidebar = page.getByTestId('left-pane');
  const resizeHandle = page.getByTestId('sidebar-resize-handle');

  await expect(page.getByTestId('sidebar-column-resize-handle-ratioDone')).toHaveCount(0);

  const ratioDoneBoxBefore = await ratioDoneHeader.boundingBox();
  const assigneeBoxBefore = await assigneeHeader.boundingBox();
  const sidebarBoxBefore = await sidebar.boundingBox();
  expect(ratioDoneBoxBefore?.width).toBeTruthy();
  expect(assigneeBoxBefore?.width).toBeTruthy();
  expect(sidebarBoxBefore?.width).toBeTruthy();
  await expect
    .poll(() => resizeHandle.evaluate((el) => getComputedStyle(el).cursor))
    .toBe('ew-resize');

  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).toBeTruthy();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 200, handleBox!.y + handleBox!.height / 2, { steps: 8 });
  await page.mouse.up();

  const sidebarBoxAfter = await sidebar.boundingBox();
  expect(sidebarBoxAfter).toBeTruthy();
  expect(sidebarBoxAfter!.width).toBeGreaterThan(sidebarBoxBefore!.width + 100);

  const ratioDoneBoxAfter = await ratioDoneHeader.boundingBox();
  const assigneeBoxAfter = await assigneeHeader.boundingBox();
  expect(ratioDoneBoxAfter).toBeTruthy();
  expect(assigneeBoxAfter).toBeTruthy();
  expect(ratioDoneBoxAfter!.width).toBeGreaterThan(ratioDoneBoxBefore!.width);
  expect(Math.abs(assigneeBoxAfter!.width - assigneeBoxBefore!.width)).toBeLessThanOrEqual(1);
  const sidebarDelta = sidebarBoxAfter!.width - sidebarBoxBefore!.width;
  const ratioDoneDelta = ratioDoneBoxAfter!.width - ratioDoneBoxBefore!.width;
  expect(Math.abs(ratioDoneDelta - sidebarDelta)).toBeLessThanOrEqual(1);
});

test('left pane maximize keeps sidebar tasks visible', async ({ page }) => {
  await waitForInitialRender(page);

  const leftPaneMaxButton = page.getByTestId('maximize-left-pane-button');
  const rightPane = page.getByTestId('right-pane');
  const taskRow = page.getByTestId('task-row-101');

  await leftPaneMaxButton.click();

  await expect(page.getByTestId('left-pane')).toBeVisible();
  await expect(page.getByTestId('sidebar-resize-handle')).toHaveCount(0);
  await expect(rightPane).toHaveCSS('display', 'none');
  await expect(taskRow).toBeVisible();
});
