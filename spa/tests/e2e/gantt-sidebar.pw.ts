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

test('resizing left pane does not shrink column width', async ({ page }) => {
  await waitForInitialRender(page);

  const subjectHeader = page.getByTestId('sidebar-header-subject');
  const assigneeHeader = page.getByTestId('sidebar-header-assignee');
  const sidebar = page.getByTestId('left-pane');
  const resizeHandle = page.getByTestId('sidebar-resize-handle');

  const subjectWidthBefore = (await subjectHeader.boundingBox())?.width;
  const sidebarWidthBefore = (await sidebar.boundingBox())?.width;
  expect(subjectWidthBefore).toBeTruthy();
  expect(sidebarWidthBefore).toBeTruthy();

  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).toBeTruthy();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(220, handleBox!.y + handleBox!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeLessThan(sidebarWidthBefore! - 100);

  const subjectWidthAfter = (await subjectHeader.boundingBox())?.width;
  expect(subjectWidthAfter).toBeTruthy();
  expect(Math.abs(subjectWidthAfter! - subjectWidthBefore!)).toBeLessThanOrEqual(1);

  const sidebarBox = await sidebar.boundingBox();
  const assigneeBox = await assigneeHeader.boundingBox();
  expect(sidebarBox).toBeTruthy();
  expect(assigneeBox).toBeTruthy();
  expect(assigneeBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
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
