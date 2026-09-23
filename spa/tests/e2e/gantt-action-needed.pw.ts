import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => { await setupMockApp(page); });

test('pages many loaded issues, preserves scope state, and focuses an unscheduled read-only issue', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    const tasks = Array.from({ length: 80 }, (_, index) => ({ ...base, id: String(index + 1000),
      subject: `Needs plan ${index}`, startDate: undefined, dueDate: undefined,
      assignedToId: null, estimatedHours: 2, hasPhysicalChildren: false, editable: false, rowIndex: index }));
    useTaskStore.getState().setTasks(tasks);
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
  });
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('aria-label', 'Action needed: 80');
  await expect(page.getByTestId('action-needed-count')).toHaveText('80');
  await page.getByTestId('action-needed-button').click();
  await expect(page.getByRole('dialog', { name: 'Action needed' })).toContainText('Unplanned estimated hours: 160');
  await expect(page.getByRole('dialog', { name: 'Action needed' }).locator('.action-needed-total')).toHaveText('80');
  const list = page.getByTestId('action-needed-list');
  await expect(list.locator('button')).toHaveCount(25);
  await page.getByRole('button', { name: '›' }).click();
  await expect(list.locator('button').first()).toContainText('#1025');
  await list.locator('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Action needed' })).toHaveCount(0);
  const selected = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().selectedTaskId;
  });
  expect(selected).toBe('1025');
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ dataReadStatus: 'loading' });
  });
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('data-load-state', 'loading');
  await expect(page.getByTestId('action-needed-status')).toHaveText('…');
  await page.getByTestId('action-needed-button').click();
  await expect(page.getByText('Loading current issues')).toBeVisible();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ dataReadStatus: 'error' });
  });
  await expect(page.getByText(/could not be loaded/)).toBeVisible();
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('data-load-state', 'error');
  await expect(page.getByTestId('action-needed-status')).toHaveText('!');
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().setTasks([]);
    useTaskStore.setState({ dataReadStatus: 'ready' });
  });
  await expect(page.getByTestId('action-needed-count')).toHaveText('0');
});

test('keeps fullscreen open on Escape and traps focus inside the dialog', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().setFullScreen(true);
  });
  const trigger = page.getByTestId('action-needed-button');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const close = dialog.getByRole('button', { name: 'Close' }).first();
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close' }).last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.app-container')).toHaveClass(/is-fullscreen/);
});

test('keeps the dialog header and close control visible while its body scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    useTaskStore.getState().setTasks(Array.from({ length: 25 }, (_, index) => ({ ...base,
      id: String(index + 1000), subject: `Needs plan ${index}`, startDate: undefined, dueDate: undefined,
      assignedToId: null, estimatedHours: 2, hasPhysicalChildren: false, rowIndex: index })));
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
  });
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const body = dialog.locator('.action-needed-body');
  const scrollTop = await body.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  const bounds = await dialog.evaluate(element => {
    const dialogBox = element.getBoundingClientRect();
    const headerBox = element.querySelector('.action-needed-header')!.getBoundingClientRect();
    const closeBox = element.querySelector('.action-needed-close-icon')!.getBoundingClientRect();
    const footerBox = element.querySelector('.action-needed-footer')!.getBoundingClientRect();
    return { dialogTop: dialogBox.top, dialogBottom: dialogBox.bottom, headerTop: headerBox.top,
      closeTop: closeBox.top, closeBottom: closeBox.bottom, footerBottom: footerBox.bottom,
      dialogScrollTop: element.scrollTop };
  });
  expect(bounds.dialogScrollTop).toBe(0);
  expect(bounds.headerTop).toBeGreaterThanOrEqual(bounds.dialogTop);
  expect(bounds.closeTop).toBeGreaterThanOrEqual(bounds.dialogTop);
  expect(bounds.closeBottom).toBeLessThanOrEqual(bounds.dialogBottom);
  expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.dialogBottom);
});

test('shows computed planned overload separately and opens its workload bar', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    const issue = useTaskStore.getState().allTasks[0];
    const daily = { dateStr: '2026-09-23', timestamp: 0, plannedLoad: 10, isPlannedOverload: true,
      plannedContributions: [{ task: issue, dailyLoad: 10 }], actualHours: 0, actualContributions: [], isActualOverload: false };
    useWorkloadStore.setState({ workloadPaneVisible: true, capacityThreshold: 8,
      workloadData: { assignees: new Map([[10, { assigneeId: 10, assigneeName: 'Jane',
        dailyWorkloads: new Map([['2026-09-23', daily]]), plannedTotal: 10, plannedPeak: 10, actualTotal: 0, actualPeak: 0 }]]),
      plannedOverloadedAssigneeCount: 1, plannedOverloadedDayCount: 1, actualOverloadedAssigneeCount: 0, actualOverloadedDayCount: 0 } });
  });
  await page.getByTestId('action-needed-button').click();
  const overload = page.getByRole('button', { name: /Jane · 2026-09-23 · 10h \/ 8h/ });
  await expect(overload).toContainText('#101');
  await overload.click();
  const focused = await page.evaluate(async () => {
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    return useWorkloadStore.getState().focusedHistogramBar;
  });
  expect(focused).toMatchObject({ assigneeId: 10, dateStr: '2026-09-23' });
});

test('shows remaining overload days when the last page disappears', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    const issue = useTaskStore.getState().allTasks[0];
    const days = Array.from({ length: 30 }, (_, index) => {
      const dateStr = `2026-10-${String(index + 1).padStart(2, '0')}`;
      return [dateStr, { dateStr, timestamp: index, plannedLoad: 10, isPlannedOverload: true,
        plannedContributions: [{ task: issue, dailyLoad: 10 }], actualHours: 0,
        actualContributions: [], isActualOverload: false }] as const;
    });
    useWorkloadStore.setState({ workloadPaneVisible: true, capacityThreshold: 8,
      workloadData: { assignees: new Map([[10, { assigneeId: 10, assigneeName: 'Jane',
        dailyWorkloads: new Map(days), plannedTotal: 300, plannedPeak: 10, actualTotal: 0, actualPeak: 0 }]]),
      plannedOverloadedAssigneeCount: 1, plannedOverloadedDayCount: 30,
      actualOverloadedAssigneeCount: 0, actualOverloadedDayCount: 0 } });
  });

  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const pagination = dialog.getByText('30 assignee-days').locator('..');
  await pagination.getByRole('button', { name: '›' }).click();
  await expect(dialog.getByRole('button', { name: /Jane · 2026-10-/ })).toHaveCount(5);

  await page.evaluate(async () => {
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    const data = useWorkloadStore.getState().workloadData!;
    const assignee = data.assignees.get(10)!;
    useWorkloadStore.setState({ workloadData: { ...data,
      assignees: new Map([[10, { ...assignee,
        dailyWorkloads: new Map([...assignee.dailyWorkloads].slice(0, 10)), plannedTotal: 100 }]]),
      plannedOverloadedDayCount: 10 } });
  });

  await expect(dialog.getByRole('button', { name: /Jane · 2026-10-/ })).toHaveCount(10);
  await expect(dialog.getByRole('button', { name: /Jane · 2026-10-01/ })).toBeVisible();
  await expect(dialog.getByText('30 assignee-days')).toHaveCount(0);
});
