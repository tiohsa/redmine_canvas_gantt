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
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('aria-label', 'Action needed');
  await expect(page.getByTestId('action-needed-button')).toHaveText('');
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
