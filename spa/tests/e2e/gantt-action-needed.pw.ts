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
  await expect(page.getByTestId('action-needed-count')).toHaveText('80');
  await page.getByTestId('action-needed-button').click();
  await expect(page.getByRole('dialog', { name: 'Action needed' })).toContainText('Unplanned estimated hours: 160');
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
  await expect(page.getByTestId('action-needed-count')).toHaveCount(0);
  await page.getByTestId('action-needed-button').click();
  await expect(page.getByText('Loading current issues')).toBeVisible();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ dataReadStatus: 'error' });
  });
  await expect(page.getByText(/could not be loaded/)).toBeVisible();
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
