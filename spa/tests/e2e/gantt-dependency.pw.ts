import { expect, test, type Page } from '@playwright/test';
import { setupMockApp } from './support/mockApp';

const day = 24 * 60 * 60 * 1000;
const p2DependencyData = {
  tasks: [
    {
      id: 401,
      subject: 'I-P1-VIS',
      project_id: 2,
      project_name: 'P1',
      start_date: '2026-02-01',
      due_date: '2026-02-10',
      ratio_done: 20,
      status_id: 1,
      status_name: 'New',
      assigned_to_id: 10,
      assigned_to_name: 'Jane Doe',
      lock_version: 1,
      editable: true,
      display_order: 0,
    },
    {
      id: 402,
      subject: 'I-P2-VIS',
      project_id: 3,
      project_name: 'P2',
      start_date: '2026-02-11',
      due_date: '2026-02-18',
      ratio_done: 10,
      status_id: 1,
      status_name: 'New',
      assigned_to_id: 12,
      assigned_to_name: 'Mary Major',
      lock_version: 1,
      editable: true,
      display_order: 1,
    },
  ],
  relations: [{ id: 77, issue_from_id: 401, issue_to_id: 402, relation_type: 'precedes', delay: 0 }],
  versions: [],
  statuses: [
    { id: 1, name: 'New', is_closed: false },
    { id: 3, name: 'Closed', is_closed: true },
  ],
  project: { id: 1, name: 'P0' },
  permissions: { editable: true, viewable: true },
  filter_options: {
    projects: [
      { id: 2, name: 'P1' },
      { id: 3, name: 'P2' },
    ],
  },
  initial_state: { memberProjectsOnly: true },
};

const viewportPreferences = {
  viewport: {
    startDate: Date.parse('2026-02-01T00:00:00'),
    scrollX: 0,
    scrollY: 0,
    scale: 10 / day,
  },
};

const openContextMenu = async (page: Page, taskId: number) => {
  const row = page.getByTestId(`task-row-${taskId}`);
  const box = await row.boundingBox();
  expect(box).toBeTruthy();
  await row.dispatchEvent('contextmenu', {
    clientX: box!.x + 24,
    clientY: box!.y + 12,
    button: 2,
    buttons: 2,
  });
};

const openDraftRelation = async (page: Page) => {
  await page.evaluate(() => {
    (window as typeof window & { RedmineCanvasGanttTest?: { setDraftRelation: (relation: unknown) => void } }).RedmineCanvasGanttTest?.setDraftRelation({
      from: '401',
      to: '402',
      type: 'precedes',
      delay: 0,
      anchor: { x: 140, y: 36 },
    });
  });
};

const selectRelation = async (page: Page, relationId: string) => {
  await page.evaluate((id) => {
    (window as typeof window & { RedmineCanvasGanttTest?: { selectRelation: (relationId: string) => void } }).RedmineCanvasGanttTest?.selectRelation(id);
  }, relationId);
};

test('creates dependency between visible member project issues', async ({ page }) => {
  const created: unknown[] = [];
  await setupMockApp(page, {
    mockData: { ...p2DependencyData, relations: [] },
    preferences: viewportPreferences,
    onCreateRelation: (payload) => created.push(payload),
  });
  await page.goto('/');
  await page.getByTestId('cell-401-subject').waitFor({ state: 'visible' });

  await openDraftRelation(page);
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-save-button').click();

  await expect.poll(() => created.length).toBe(1);
  const payload = created[0] as { relation?: { issue_from_id?: string; issue_to_id?: string; relation_type?: string } };
  expect(payload.relation).toMatchObject({
    issue_from_id: '401',
    issue_to_id: '402',
    relation_type: 'precedes',
  });
});

test('updates and deletes a visible dependency relation', async ({ page }) => {
  const updated: string[] = [];
  const deleted: string[] = [];
  await setupMockApp(page, {
    mockData: p2DependencyData,
    preferences: viewportPreferences,
    onUpdateRelation: (id) => updated.push(id),
    onDeleteRelation: (id) => deleted.push(id),
  });
  await page.goto('/');
  await page.getByTestId('cell-401-subject').waitFor({ state: 'visible' });

  await selectRelation(page, '77');
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('relation-type-select').selectOption('relates');
  await page.getByTestId('relation-save-button').click();
  await expect.poll(() => updated).toContain('77');

  await openContextMenu(page, 401);
  await expect(page.getByText('Remove dependency')).toBeVisible();
  await page.getByTestId('remove-relation-77').click();
  await expect.poll(() => deleted).toContain('77');
});

test('rejects relation deletion when one side is filtered out of the current view', async ({ page }) => {
  const deleted: string[] = [];
  await setupMockApp(page, {
    mockData: {
      ...p2DependencyData,
      tasks: [
        p2DependencyData.tasks[0],
        { ...p2DependencyData.tasks[1], status_id: 3, status_name: 'Closed' },
      ],
      initial_state: { selectedStatusIds: [1] },
    },
    preferences: viewportPreferences,
    failRelationWhenHidden: true,
    onDeleteRelation: (id) => deleted.push(id),
  });
  await page.goto('/?status_ids[]=1');
  await page.getByTestId('cell-401-subject').waitFor({ state: 'visible' });

  await openContextMenu(page, 401);
  await expect(page.getByTestId('remove-relation-77')).toHaveCount(0);
  expect(deleted).toEqual([]);
});
