import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => { await setupMockApp(page); });

for (const autoSave of [false, true]) {
  test(`shows all batch conflicts and retains every draft with autoSave=${autoSave}`, async ({ page }) => {
    await waitForInitialRender(page);
    const requests: Array<{ changes: Array<{ task_id: string }>; base_revisions: Record<string, number> }> = [];
    await page.route('**/schedule_mutation.json*', async route => {
      const body = route.request().postDataJSON();
      requests.push(body);
      const conflicts = [101, 201].map(task_id => ({ task_id, expected_revision: 1, actual_revision: 2 }));
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'conflict', operation_id: body.operation_id, completeness: 'partial',
          errors: ['The issue was updated by another request.'],
          conflict: conflicts[0], conflicts,
          entities: [101, 201].map(id => ({ id, start_date: '2026-02-20', due_date: '2026-02-23', lock_version: 2 })),
          revisions: { 101: 2, 201: 2 }, invalidated_entity_ids: [101, 201]
        })
      });
    });
    const drafts = await page.evaluate(async (autoSave) => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      const { parseDateOnly } = await import('/src/utils/dateOnly.ts');
      useTaskStore.getState().setAutoSave(autoSave);
      for (const id of ['101', '102', '201']) {
        useTaskStore.getState().updateTask(id, {
          startDate: parseDateOnly('2026-03-02'), dueDate: parseDateOnly('2026-03-03')
        });
      }
      return useTaskStore.getState().localTaskPatches;
    }, autoSave);

    if (autoSave) {
      // Bar interaction's auto-save invokes this same store entry point.
      await page.evaluate(async () => {
        const { useTaskStore } = await import('/src/stores/TaskStore.ts');
        await useTaskStore.getState().saveChanges();
      });
    } else {
      await page.getByTitle('Save changes', { exact: true }).click();
    }

    const panel = page.getByTestId('conflict-resolution-panel');
    await expect(panel.locator('.conflict-panel-count')).toHaveText('2');
    for (const id of ['101', '201']) {
      await expect(page.getByTestId(`task-conflict-${id}`)).toBeAttached();
      await expect(page.getByTestId(`conflict-jump-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('task-conflict-102')).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].changes.map(change => change.task_id).sort()).toEqual(['101', '102', '201']);
    expect(requests[0].base_revisions).toEqual({ 101: 1, 102: 1, 201: 1 });
    const state = await page.evaluate(async () => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      const state = useTaskStore.getState();
      return {
        dirty: [...state.modifiedTaskIds].sort(), patches: state.localTaskPatches,
        conflicts: Object.keys(state.taskConflicts).sort()
      };
    });
    expect(state).toEqual({ dirty: ['101', '102', '201'], patches: drafts, conflicts: ['101', '201'] });
  });
}

test('shows both conflicts and keeps the second reachable after resolving the first', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    const tasks = [
      { ...base, id: '1000', subject: 'First conflict', rowIndex: 0 },
      { ...base, id: '1001', subject: 'Second conflict', rowIndex: 1 }
    ];
    useTaskStore.setState({
      allTasks: tasks,
      taskConflicts: Object.fromEntries(tasks.map(task => [task.id, {
        taskId: task.id, message: 'Another user changed this issue.', detectedAt: 1,
        remoteEntity: { id: task.id, subject: `Remote ${task.id}`, lockVersion: 2 }, remoteRevision: 2
      }])),
      localTaskPatches: Object.fromEntries(tasks.map(task => [task.id, [{
        entityId: task.id, projection: { subject: task.subject }, mutationIntent: { subject: task.subject },
        generation: 1, operationId: `edit:${task.id}:1`
      }]]))
    });
  });

  const panel = page.getByTestId('conflict-resolution-panel');
  const list = page.getByTestId('conflict-scroll-list');
  const second = page.getByTestId('task-conflict-1001');
  await expect(panel.locator('.conflict-panel-count')).toHaveText('2');
  await expect(page.getByTestId('task-conflict-1000')).toBeAttached();
  await expect(second).toBeAttached();
  await page.getByTestId('conflict-jump-1001').click();
  await expect(second).toBeInViewport();
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

  await page.getByTestId('conflict-use-remote-1000').click();
  await expect(panel).toBeVisible();
  await expect(second).toBeInViewport();
  await expect(panel.locator('.conflict-panel-count')).toHaveText('1');
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 800, height: 600 }]) {
  test(`scrolls and resolves the last of 25 conflicts at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await waitForInitialRender(page);
    await page.evaluate(async () => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      const base = useTaskStore.getState().allTasks[0];
      const tasks = Array.from({ length: 25 }, (_, index) => ({ ...base, id: String(index + 1000),
        subject: `Long conflict ${index} ${'verylong'.repeat(30)}`, rowIndex: index }));
      useTaskStore.setState({
        allTasks: tasks,
        taskConflicts: Object.fromEntries(tasks.map(task => [task.id, {
          taskId: task.id, message: `Conflict\n${'message'.repeat(40)}`, detectedAt: 1,
          remoteEntity: { id: task.id, subject: `Remote ${task.id}`, lockVersion: 2 }, remoteRevision: 2
        }])),
        localTaskPatches: Object.fromEntries(tasks.map(task => [task.id, [{
          entityId: task.id, projection: { subject: task.subject }, mutationIntent: { subject: task.subject },
          generation: 1, operationId: `edit:${task.id}:1`
        }]]))
      });
    });
    const list = page.getByTestId('conflict-scroll-list');
    await expect(page.getByTestId('task-conflict-1024')).toBeAttached();
    await expect.poll(() => list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const last = page.getByTestId('conflict-use-remote-1024');
    await last.focus();
    await expect(last).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('task-conflict-1024')).toHaveCount(0);
    const panel = page.getByTestId('conflict-resolution-panel');
    await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height);
    await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}
