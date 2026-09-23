import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => { await setupMockApp(page); });

for (const autoSave of [false, true]) for (const valid of [false, true]) {
  test(`reviews and applies dependent mixed choices: autoSave=${autoSave}, valid=${valid}`, async ({ page }) => {
    await waitForInitialRender(page);
    const requests: Array<{ resolution: { preview?: boolean; token?: string }; changes: Array<{ task_id: string; start_date: string; due_date: string }> }> = [];
    await page.route('**/tasks/*.json*', route => { throw new Error(`Unexpected single issue save: ${route.request().url()}`); });
    await page.route('**/schedule_mutation.json*', async route => {
      const body = route.request().postDataJSON();
      requests.push(body);
      const entities = [
        { id: 1000, start_date: '2027-01-04', due_date: '2027-01-05', lock_version: 2 },
        { id: 1001, start_date: '2027-01-06', due_date: '2027-01-07', lock_version: 2 }
      ];
      if (!body.resolution.preview) for (const change of body.changes) {
        Object.assign(entities.find(entity => String(entity.id) === change.task_id)!, change, { lock_version: 3 });
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation_id: body.operation_id,
        entities, revisions: Object.fromEntries(entities.map(entity => [entity.id, entity.lock_version])),
        ...(body.resolution.preview ? { resolution_context: { token: 'review-token', task_ids: [1000, 1001],
          relations: [{ id: 1, from: 1000, to: 1001, type: 'precedes', delay: 0 }] } } : {}) }) });
    });
    await page.evaluate(async ({ autoSave, valid }) => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      const { createServerSnapshot } = await import('/src/stores/taskStore/stateContract.ts');
      const { parseDateOnly } = await import('/src/utils/dateOnly.ts');
      const base = useTaskStore.getState().allTasks[0];
      const tasks = ['1000', '1001'].map((id, index) => ({ ...base, id, parentId: undefined, hasChildren: false, subject: `Resolution ${id}`,
        startDate: parseDateOnly(index ? '2027-01-06' : '2027-01-04')!, dueDate: parseDateOnly(index ? '2027-01-07' : '2027-01-05')!, lockVersion: 2 }));
      useTaskStore.setState({ autoSave, allTasks: tasks, tasks, serverTaskSnapshot: createServerSnapshot(tasks),
        relations: [{ id: '1', from: '1000', to: '1001', type: 'precedes', delay: 0 }],
        editGenerations: { '1000': 1, '1001': 1 }, modifiedTaskIds: new Set(['1000', '1001']),
        localTaskPatches: Object.fromEntries(tasks.map(task => [task.id, [{ entityId: task.id, generation: 1, operationId: 'schedule:original',
          mutationIntent: { startDate: parseDateOnly(valid ? '2027-01-08' : '2027-01-04'), dueDate: parseDateOnly(valid ? '2027-01-11' : '2027-01-05') }, projection: {} }]])),
        taskConflicts: Object.fromEntries(tasks.map(task => [task.id, { taskId: task.id, detectedAt: 1, generation: 1, message: 'Conflict',
          remoteEntity: task, remoteRevision: 2, remoteAvailability: 'known' }])) });
    }, { autoSave, valid });
    await page.getByTestId('conflict-use-remote-1000').click();
    await expect(page.getByTestId('conflict-use-remote-1000')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('conflict-keep-local-1001').click();
    await expect(page.getByTestId('conflict-keep-local-1001')).toHaveAttribute('aria-pressed', 'true');
    expect(requests).toHaveLength(1);
    expect(requests[0].resolution.preview).toBe(true);
    const apply = page.getByTestId('conflict-apply-1000');
    if (valid) {
      await apply.click();
      await expect(page.getByTestId('conflict-resolution-panel')).toHaveCount(0);
      expect(requests).toHaveLength(2);
      expect(requests[1].resolution.token).toBe('review-token');
      expect(requests[1].changes.map(change => change.task_id)).toEqual(['1001']);
    } else {
      await expect(apply).toBeDisabled();
      await expect(page.getByRole('alert').filter({ hasText: 'dependency' })).toBeAttached();
      const dirty = await page.evaluate(async () => {
        const { useTaskStore } = await import('/src/stores/TaskStore.ts');
        return [...useTaskStore.getState().modifiedTaskIds];
      });
      expect(dirty).toEqual(['1000', '1001']);
    }
  });
}

test('approves a proposed date change for a dependent task with no conflict card', async ({ page }) => {
  await waitForInitialRender(page);
  const requests: Array<{ resolution: { preview?: boolean; token?: string; accepted_adjustments?: Array<{ task_id: string; start_date: string; due_date: string }> }; changes: Array<{ task_id: string }> }> = [];
  await page.route('**/tasks/*.json*', route => { throw new Error(`Unexpected single issue save: ${route.request().url()}`); });
  await page.route('**/schedule_mutation.json*', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const base = { status: 'ok', operation_id: body.operation_id,
      entities: [
        { id: 1000, start_date: '2027-01-04', due_date: '2027-01-05', lock_version: 2 },
        { id: 1001, start_date: '2027-01-11', due_date: '2027-01-12', lock_version: 2 }
      ], revisions: { 1000: 2, 1001: 2 } };
    if (body.resolution.preview) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base,
        resolution_context: { token: 'review-token', task_ids: [1000, 1001],
          relations: [{ id: 1, from: 1000, to: 1001, type: 'precedes', delay: 0 }] } }) });
    } else if (!body.resolution.accepted_adjustments) {
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
        ...base, status: 'validation_error', errors: ['Review the adjusted schedule before applying.'],
        adjustments: [{ task_id: 1001, before_start_date: '2027-01-11', before_due_date: '2027-01-12',
          start_date: '2027-01-13', due_date: '2027-01-14' }]
      }) });
    } else {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base,
        entities: [
          { id: 1000, start_date: '2027-01-08', due_date: '2027-01-09', lock_version: 3 },
          { id: 1001, start_date: '2027-01-13', due_date: '2027-01-14', lock_version: 3 }
        ], revisions: { 1000: 3, 1001: 3 } }) });
    }
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { createServerSnapshot } = await import('/src/stores/taskStore/stateContract.ts');
    const { parseDateOnly } = await import('/src/utils/dateOnly.ts');
    const base = useTaskStore.getState().allTasks[0];
    const tasks = ['1000', '1001'].map((id, index) => ({ ...base, id, parentId: undefined, hasChildren: false,
      subject: `Dependent ${id}`, startDate: parseDateOnly(index ? '2027-01-11' : '2027-01-04')!,
      dueDate: parseDateOnly(index ? '2027-01-12' : '2027-01-05')!, lockVersion: 2 }));
    useTaskStore.setState({ autoSave: true, allTasks: tasks, tasks, serverTaskSnapshot: createServerSnapshot(tasks),
      relations: [{ id: '1', from: '1000', to: '1001', type: 'precedes', delay: 0 }],
      editGenerations: { '1000': 1 }, modifiedTaskIds: new Set(['1000']),
      localTaskPatches: { '1000': [{ entityId: '1000', generation: 1, operationId: 'schedule:original',
        mutationIntent: { startDate: parseDateOnly('2027-01-08'), dueDate: parseDateOnly('2027-01-09') }, projection: {} }] },
      taskConflicts: { '1000': { taskId: '1000', detectedAt: 1, generation: 1, message: 'Conflict',
        remoteEntity: tasks[0], remoteRevision: 2, remoteAvailability: 'known' } } });
  });
  const panel = page.getByTestId('conflict-resolution-panel');
  await expect(panel.locator('.conflict-panel-count')).toHaveText('1');
  await page.getByTestId('conflict-keep-local-1000').click();
  await page.getByTestId('conflict-apply-1000').click();
  await expect(page.getByTestId('conflict-adjustments')).toContainText('#1001:');
  await expect(page.getByTestId('conflict-adjustments')).toContainText('2027-01-11');
  await expect(page.getByTestId('conflict-adjustments')).toContainText('2027-01-13');
  await expect(page.getByTestId('task-conflict-1001')).toHaveCount(0);
  await expect(page.getByTestId('conflict-apply-1000')).toBeDisabled();
  const beforeApproval = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return { dirty: [...useTaskStore.getState().modifiedTaskIds], conflicts: Object.keys(useTaskStore.getState().taskConflicts) };
  });
  expect(beforeApproval).toEqual({ dirty: ['1000'], conflicts: ['1000'] });
  await page.getByTestId('conflict-accept-adjustments-1000').click();
  await expect(panel).toHaveCount(0);
  expect(requests).toHaveLength(3);
  expect(requests[1].changes.map(change => change.task_id)).toEqual(['1000']);
  expect(requests[2].resolution.accepted_adjustments).toEqual([{ task_id: '1001',
    start_date: '2027-01-13', due_date: '2027-01-14' }]);
});

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
