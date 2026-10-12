import { expect, test } from '@playwright/test';
import { setupMockApp } from './support/mockApp';

const criticalPathData = {
  tasks: [
    {
      id: 501,
      subject: 'Predecessor task',
      project_id: 1,
      project_name: 'Alpha',
      start_date: '2026-02-02',
      due_date: '2026-02-04',
      ratio_done: 0,
      status_id: 1,
      status_name: 'New',
      lock_version: 1,
      editable: true,
      display_order: 0,
    },
    {
      id: 502,
      subject: 'Successor task',
      project_id: 1,
      project_name: 'Alpha',
      start_date: '2026-02-05',
      due_date: '2026-02-06',
      ratio_done: 0,
      status_id: 1,
      status_name: 'New',
      lock_version: 1,
      editable: true,
      display_order: 1,
    },
  ],
  relations: [{ id: 77, issue_from_id: 501, issue_to_id: 502, relation_type: 'precedes', delay: 0 }],
  versions: [],
  statuses: [{ id: 1, name: 'New', is_closed: false }],
  project: { id: 1, name: 'Alpha' },
  permissions: { editable: true, viewable: true },
};

const preferenceEnvelope = (projectPreferences: Record<string, unknown>, globalEnabled = false, globalPreferences: Record<string, unknown> = {}) => ({
  version: 4,
  general: {},
  display: {
    projects: { 'project:1': projectPreferences },
    global: { enabled: globalEnabled, preferences: globalPreferences },
  },
});

test('critical path can be disabled, persists by project, and leaves scheduling and relations available', async ({ page }) => {
  const dataRequests: number[] = [];
  const updatedRelations: Array<{ id: string; payload: unknown }> = [];
  await setupMockApp(page, {
    mockData: criticalPathData,
    preferences: preferenceEnvelope({
      calculateCriticalPathEnabled: true,
      visibleColumns: ['id', 'subject', 'notification', 'startDate', 'dueDate'],
      sidebarWidth: 650,
      autoSave: false,
    }),
    onDataRequest: (_data, requestCount) => dataRequests.push(requestCount),
    onUpdateRelation: (id, payload) => updatedRelations.push({ id, payload }),
  });
  await page.goto('/');
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });

  const criticalBadge = page.getByTestId('task-notification-badge-critical-501');
  await expect(criticalBadge).toBeVisible();

  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/canvas_gantt/')) {
      apiRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  await page.getByTestId('display-settings-menu-button').click();
  const criticalPathSwitch = page.getByRole('switch', { name: 'Calculate critical path', exact: true });
  await expect(criticalPathSwitch).toBeChecked();
  await page.locator('label').filter({ has: criticalPathSwitch }).click();

  await expect(criticalPathSwitch).not.toBeChecked();
  await expect(criticalBadge).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(dataRequests).toEqual([1]);

  const storedAfterToggle = await page.evaluate(() => JSON.parse(localStorage.getItem('canvasGantt:preferences') ?? '{}'));
  expect(storedAfterToggle.display.projects['project:1'].calculateCriticalPathEnabled).toBe(false);
  const otherProjectPreference = await page.evaluate(async () => {
    const { loadPreferences } = await import('/src/utils/preferences.ts');
    return loadPreferences(2).calculateCriticalPathEnabled;
  });
  expect(otherProjectPreference).toBeUndefined();

  await page.reload();
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });
  await page.getByTestId('display-settings-menu-button').click();
  await expect(page.getByRole('switch', { name: 'Calculate critical path', exact: true })).not.toBeChecked();
  await expect(page.getByTestId('task-notification-badge-critical-501')).toHaveCount(0);

  await page.evaluate(() => {
    (window as typeof window & { RedmineCanvasGanttTest?: { selectRelation: (relationId: string) => void } }).RedmineCanvasGanttTest?.selectRelation('77');
  });
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-save-button').click();
  await expect.poll(() => updatedRelations.length).toBe(1);
  expect(updatedRelations[0]).toMatchObject({ id: '77' });
  const criticalPathAfterRelationEdit = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().calculateCriticalPathEnabled;
  });
  expect(criticalPathAfterRelationEdit).toBe(false);

  await page.evaluate(async () => {
    const [{ useTaskStore }, { parseDateOnly }] = await Promise.all([
      import('/src/stores/TaskStore.ts'),
      import('/src/utils/dateOnly.ts'),
    ]);
    useTaskStore.getState().updateTask('502', { dueDate: parseDateOnly('2026-02-10')! });
  });
  const taskAfterScheduleEdit = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const state = useTaskStore.getState();
    const successor = state.allTasks.find(task => task.id === '502');
    return {
      dueDate: successor?.dueDate,
      dirty: state.modifiedTaskIds.has('502'),
      criticalPathEnabled: state.calculateCriticalPathEnabled,
    };
  });
  expect(taskAfterScheduleEdit).toMatchObject({ dirty: true, criticalPathEnabled: false });
  expect(taskAfterScheduleEdit.dueDate).toBe(Date.UTC(2026, 1, 10));
});

test('shared critical path preference loads for other projects after reload', async ({ page }) => {
  await setupMockApp(page, {
    mockData: criticalPathData,
    preferences: preferenceEnvelope({
      calculateCriticalPathEnabled: true,
      visibleColumns: ['id', 'subject', 'notification', 'startDate', 'dueDate'],
      sidebarWidth: 650,
    }),
  });
  await page.goto('/');
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });
  await page.getByTestId('display-settings-menu-button').click();

  const sharedSettingsSwitch = page.getByRole('switch', { name: 'Share settings across all projects', exact: true });
  await page.locator('label').filter({ has: sharedSettingsSwitch }).click();
  await expect(sharedSettingsSwitch).toBeChecked();
  const criticalPathSwitch = page.getByRole('switch', { name: 'Calculate critical path', exact: true });
  await page.locator('label').filter({ has: criticalPathSwitch }).click();
  await expect(criticalPathSwitch).not.toBeChecked();

  await page.reload();
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });
  await page.getByTestId('display-settings-menu-button').click();
  await expect(page.getByRole('switch', { name: 'Share settings across all projects', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Calculate critical path', exact: true })).not.toBeChecked();

  const otherProjectPreference = await page.evaluate(async () => {
    const { loadDisplayPreferencesWithSource } = await import('/src/utils/preferences.ts');
    return loadDisplayPreferencesWithSource(2);
  });
  expect(otherProjectPreference).toMatchObject({
    source: 'global',
    globalEnabled: true,
    preferences: { calculateCriticalPathEnabled: false },
  });
});
