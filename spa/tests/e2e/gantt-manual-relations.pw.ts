import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }, testInfo) => {
  const isDragTest = testInfo.title.includes('dragged relation');
  if (isDragTest) await page.setViewportSize({ width: 1920, height: 1080 });
  await setupMockApp(page);
});

const setManualMode = async (page: Parameters<typeof waitForInitialRender>[0]) => {
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().setAutoSave(false);
  });
};

const openRelationDraft = async (page: Parameters<typeof waitForInitialRender>[0], from: string, to: string, type = 'relates') => {
  await page.evaluate(({ from, to, type }) => {
    const testApi = (window as typeof window & {
      RedmineCanvasGanttTest?: { setDraftRelation: (relation: unknown) => void };
    }).RedmineCanvasGanttTest;
    if (!testApi) throw new Error('Relation editor test hook is unavailable');
    testApi.setDraftRelation({ from, to, type, ...(type === 'precedes' ? { delay: 0 } : {}), anchor: { x: 140, y: 36 } });
  }, { from, to, type });
};

const selectExistingRelation = async (page: Parameters<typeof waitForInitialRender>[0], relationId: string) => {
  await page.evaluate((id) => {
    const testApi = (window as typeof window & {
      RedmineCanvasGanttTest?: { selectRelation: (relationId: string) => void };
    }).RedmineCanvasGanttTest;
    if (!testApi) throw new Error('Relation editor test hook is unavailable');
    testApi.selectRelation(id);
  }, relationId);
};

test('saves a relation-only draft from the manual save button', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  const relationWrites: unknown[] = [];
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') relationWrites.push(route.request().postDataJSON());
    await route.fallback();
  });

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().stageRelationCreate({ from: '101', to: '201', type: 'relates' });
  });

  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  expect(relationWrites).toHaveLength(0);
  await page.getByTestId('manual-save-button').click();
  await expect.poll(() => relationWrites.length).toBe(1);
  await expect.poll(async () => page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.keys(useTaskStore.getState().pendingRelationChanges).length;
  })).toBe(0);
  expect(relationWrites[0]).toMatchObject({ relation: {
    issue_from_id: '101', issue_to_id: '201', relation_type: 'relates',
  } });
});

test('discards a staged relation deletion without sending it', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  const relationDeletes: string[] = [];
  await page.route('**/canvas_gantt/relations/*.json**', async route => {
    if (route.request().method() === 'DELETE') relationDeletes.push(route.request().url());
    await route.fallback();
  });

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().stageRelationDelete('1');
  });
  await expect(page.getByTestId('discard-manual-changes-button')).toBeVisible();
  await page.getByTestId('discard-manual-changes-button').click();

  expect(relationDeletes).toHaveLength(0);
  const state = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    return {
      pending: Object.keys(store.pendingRelationChanges),
      effective: store.getEffectiveRelations().map(relation => relation.id),
    };
  });
  expect(state).toEqual({ pending: [], effective: ['1'] });
});

test('saves ticket changes before staged relation creation', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  const writes: string[] = [];
  await page.route('**/canvas_gantt/tasks/*.json**', async route => {
    if (route.request().method() === 'PATCH') writes.push('task');
    await route.fallback();
  });
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') writes.push('relation');
    await route.fallback();
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    store.updateTask('201', { subject: 'Updated before relation' });
    store.stageRelationCreate({ from: '101', to: '201', type: 'relates' });
  });

  await page.getByTestId('manual-save-button').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes).toEqual(['task', 'relation']);
});

test('does not write relations when the ticket save fails', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  const relationWrites: unknown[] = [];
  await page.route('**/canvas_gantt/tasks/*.json**', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Ticket update failed' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') relationWrites.push(route.request().postDataJSON());
    await route.fallback();
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    store.updateTask('201', { subject: 'Cannot save' });
    store.stageRelationCreate({ from: '101', to: '201', type: 'relates' });
  });

  await page.getByTestId('manual-save-button').click();
  await expect.poll(async () => page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().modifiedTaskIds.size;
  })).toBeGreaterThan(0);
  expect(relationWrites).toHaveLength(0);
  const pendingCount = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.keys(useTaskStore.getState().pendingRelationChanges).length;
  });
  expect(pendingCount).toBe(1);
});

test('does not resend a relation create with an unknown outcome', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  let relationAttempts = 0;
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') {
      relationAttempts += 1;
      await route.abort('connectionreset');
      return;
    }
    await route.fallback();
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().stageRelationCreate({ from: '101', to: '201', type: 'relates' });
  });

  await page.getByTestId('manual-save-button').click();
  await expect.poll(async () => page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.values(useTaskStore.getState().pendingRelationChanges).find(change => change.status === 'unknown')?.draftId ?? null;
  })).not.toBeNull();
  const unknownDraftId = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.values(useTaskStore.getState().pendingRelationChanges).find(change => change.status === 'unknown')?.draftId ?? '';
  });
  const panel = page.getByTestId('conflict-resolution-panel');
  await expect(panel).toBeVisible();
  const unknownCard = page.getByTestId(`relation-review-card-${unknownDraftId}`);
  await expect(unknownCard).toBeVisible();
  const assumeApplied = unknownCard.getByTestId(`relation-unknown-assume-applied-${unknownDraftId}`);
  const retryUnknown = unknownCard.getByTestId(`relation-unknown-retry-${unknownDraftId}`);
  await expect(unknownCard.getByTestId(`relation-review-refresh-${unknownDraftId}`)).toBeVisible();
  await expect(assumeApplied).toBeDisabled();
  await expect(retryUnknown).toBeDisabled();
  await expect(unknownCard.getByTestId(`relation-failed-retry-${unknownDraftId}`)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId(`relation-unknown-assume-applied-${unknownDraftId}`)).toHaveCount(0);
  await page.getByTestId('relation-review-button').click();
  await expect(panel).toBeVisible();
  const reopenedCard = page.getByTestId(`relation-review-card-${unknownDraftId}`);
  await reopenedCard.getByTestId(`relation-review-refresh-${unknownDraftId}`).click();
  await expect(assumeApplied).toBeEnabled();
  await expect(retryUnknown).toBeEnabled();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    await useTaskStore.getState().saveChanges();
  });
  expect(relationAttempts).toBe(1);
});

test('saves pending relations before enabling auto save', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  let relationAttempts = 0;
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') relationAttempts += 1;
    await route.fallback();
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    store.stageRelationCreate({ from: '101', to: '201', type: 'relates' });
    await store.requestAutoSaveChange(true);
  });

  await expect.poll(async () => page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().autoSave;
  })).toBe(true);
  expect(relationAttempts).toBe(1);
  const pending = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.keys(useTaskStore.getState().pendingRelationChanges);
  });
  expect(pending).toEqual([]);
});

test('stages a relation from the editor in manual mode without an immediate write', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().setAutoApplyDefaultRelation(true);
    useUIStore.getState().setDefaultRelationType('relates');
  });
  const relationWrites: unknown[] = [];
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') relationWrites.push(route.request().postDataJSON());
    await route.fallback();
  });

  await openRelationDraft(page, '102', '201');
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-save-button').click();
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  expect(relationWrites).toHaveLength(0);
  const pending = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return Object.values(useTaskStore.getState().pendingRelationChanges).map(change => ({
      operation: change.operation,
      desired: change.desired,
    }));
  });
  expect(pending).toMatchObject([{ operation: 'create', desired: { from: '102', to: '201', type: 'relates' } }]);
});

test('keeps manual Save compact as task and relation counts grow, with review choices in the panel', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  await page.evaluate(async () => {
    const config = (window as typeof window & { RedmineCanvasGantt?: { i18n: Record<string, string> } }).RedmineCanvasGantt;
    if (config) {
      config.i18n.button_save = 'Save';
      config.i18n.label_save_changes_with_counts = 'Save (tasks: %{tasks} / dependencies: %{relations})';
    }
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    store.updateTask('201', { subject: 'One pending task' });
    store.stageRelationCreate({ from: '101', to: '201', type: 'relates' });
  });

  const saveButton = page.getByTestId('manual-save-button');
  await expect(saveButton).toHaveText('Save');
  const initialBox = await saveButton.boundingBox();
  const initialTitle = await saveButton.getAttribute('title');
  expect(initialBox).toBeTruthy();
  expect(initialTitle).toContain('1');
  await expect(page.getByTestId(/relation-unknown-(assume-applied|retry)-/)).toHaveCount(0);
  await expect(page.getByTestId(/relation-failed-retry-/)).toHaveCount(0);

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    store.updateTask('101', { subject: 'Second pending task' });
    store.updateTask('102', { subject: 'Third pending task' });
    store.stageRelationCreate({ from: '102', to: '201', type: 'relates' });
    store.stageRelationCreate({ from: '201', to: '102', type: 'relates' });
  });
  const crowdedBox = await saveButton.boundingBox();
  const crowdedTitle = await saveButton.getAttribute('title');
  expect(crowdedBox).toBeTruthy();
  expect(crowdedBox!.width).toBe(initialBox!.width);
  expect(crowdedTitle).not.toBe(initialTitle);
  expect(crowdedTitle).toContain('3');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(saveButton).toBeVisible();
  const narrowBox = await saveButton.boundingBox();
  expect(narrowBox).toBeTruthy();
  expect(narrowBox!.width).toBe(initialBox!.width);
  expect(narrowBox!.x + narrowBox!.width).toBeLessThanOrEqual(390);
});

test('auto-applies a dragged relation locally in manual mode without an API write', async ({ page }) => {
  await waitForInitialRender(page);
  await page.addStyleTag({ content: 'html, body { height: 100%; margin: 0; } #root { height: 100%; }' });
  await expect.poll(() => page.locator('.rcg-gantt-scroll-pane').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(0);
  await setManualMode(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useUIStore.getState().setAutoApplyDefaultRelation(true);
    useUIStore.getState().setDefaultRelationType('relates');
    const store = useTaskStore.getState();
    store.updateViewport({ scrollX: store.viewport.scrollX + 1000 });
    useTaskStore.getState().setHoveredTask('201');
  });
  const targetStart = page.getByTestId('task-resize-handle-start-201');
  const targetEnd = page.getByTestId('task-resize-handle-end-201');
  await expect(targetStart).toBeVisible();
  const startBox = await targetStart.boundingBox();
  const endBox = await targetEnd.boundingBox();
  expect(startBox).toBeTruthy();
  expect(endBox).toBeTruthy();
  const target = {
    x: (startBox!.x + startBox!.width / 2 + endBox!.x + endBox!.width / 2) / 2,
    y: startBox!.y + startBox!.height / 2,
  };
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().setHoveredTask('101');
  });
  const sourceHandle = page.getByTestId('dependency-handle-right-101');
  await expect(sourceHandle).toBeVisible();
  const sourceBox = await sourceHandle.boundingBox();
  expect(sourceBox).toBeTruthy();
  const hitTargets = await page.evaluate(({ source, target }) => {
    const at = (point: { x: number; y: number }) => {
      const element = document.elementFromPoint(point.x, point.y);
      return { tag: element?.tagName, testId: element?.getAttribute('data-testid') };
    };
    const chart = document.querySelector('[data-testid="gantt-viewport"]')?.getBoundingClientRect();
    return { source: { point: source, hit: at(source) }, target: { point: target, hit: at(target) },
      viewport: { width: innerWidth, height: innerHeight },
      chart: chart && { x: chart.x, y: chart.y, width: chart.width, height: chart.height } };
  }, {
    source: { x: sourceBox!.x + sourceBox!.width / 2, y: sourceBox!.y + sourceBox!.height / 2 },
    target,
  });
  expect(hitTargets.chart).toBeTruthy();
  expect(hitTargets.chart!.x).toBeLessThan(sourceBox!.x + sourceBox!.width / 2);
  expect(hitTargets.chart!.x + hitTargets.chart!.width).toBeGreaterThan(target.x);
  expect(hitTargets.chart!.y).toBeLessThan(sourceBox!.y + sourceBox!.height / 2);
  expect(hitTargets.chart!.y + hitTargets.chart!.height).toBeGreaterThan(target.y);
  expect(hitTargets.source.hit.testId).toBe('dependency-handle-right-101');
  const relationWrites: unknown[] = [];
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') relationWrites.push(route.request().postDataJSON());
    await route.fallback();
  });

  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  await expect(page.getByTestId('relation-editor')).toHaveCount(0);
  expect(relationWrites).toHaveLength(0);
  const effective = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().getEffectiveRelations().map(relation => [relation.from, relation.to]);
  });
  expect(effective).toContainEqual(['101', '201']);
});

test('saves a staged relation update with the original relation precondition', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  const relationUpdates: Array<{ body: { relation?: Record<string, unknown>; expected_relation?: Record<string, unknown> } }> = [];
  await page.route('**/canvas_gantt/relations/*.json**', async route => {
    if (route.request().method() === 'PATCH') relationUpdates.push({ body: route.request().postDataJSON() });
    await route.fallback();
  });

  await selectExistingRelation(page, '1');
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-type-select').selectOption('relates');
  await page.getByTestId('relation-save-button').click();
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  expect(relationUpdates).toHaveLength(0);

  await page.getByTestId('manual-save-button').click();
  await expect.poll(() => relationUpdates.length).toBe(1);
  expect(relationUpdates[0].body).toMatchObject({
    relation: { relation_type: 'relates' },
    expected_relation: { from: '101', to: '102', type: 'precedes' },
  });
});

test('rejects a relation deletion needed for a date change before writing either resource', async ({ page }) => {
  await waitForInitialRender(page);
  await setManualMode(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { createServerSnapshot } = await import('/src/stores/taskStore/stateContract.ts');
    const { parseDateOnly } = await import('/src/utils/dateOnly.ts');
    const config = (window as typeof window & {
      RedmineCanvasGantt?: { i18n: Record<string, string> };
    }).RedmineCanvasGantt;
    if (config) config.i18n.label_relation_combined_change_unsupported = 'These task and dependency changes cannot be saved together safely.';
    const store = useTaskStore.getState();
    const tasks = store.allTasks.map(task => task.id === '102'
      ? { ...task, startDate: parseDateOnly('2026-02-11')! }
      : task);
    useTaskStore.setState({ allTasks: tasks, tasks, serverTaskSnapshot: createServerSnapshot(tasks) });
  });
  await selectExistingRelation(page, '1');
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-delete-button').click();
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { parseDateOnly } = await import('/src/utils/dateOnly.ts');
    useTaskStore.getState().updateTask('102', { startDate: parseDateOnly('2026-02-09')! });
  });

  const writes: string[] = [];
  await page.route('**/canvas_gantt/**', async route => {
    const method = route.request().method();
    if (['PATCH', 'POST', 'DELETE'].includes(method)) writes.push(`${method} ${route.request().url()}`);
    await route.fallback();
  });
  await page.getByTestId('manual-save-button').click();

  await expect(page.getByText('These task and dependency changes cannot be saved together safely.')).toBeVisible();
  expect(writes).toEqual([]);
  const state = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const store = useTaskStore.getState();
    return { dirty: [...store.modifiedTaskIds], pending: Object.keys(store.pendingRelationChanges) };
  });
  expect(state.dirty).toContain('102');
  expect(state.pending).toHaveLength(1);
});
