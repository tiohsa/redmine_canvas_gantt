import { expect, test } from '@playwright/test';
import { setupMockApp } from './support/mockApp';

const projectMoveData = {
  tasks: [
    {
      id: 601,
      subject: 'Movable issue',
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
      fixed_version_id: 10,
      fixed_version_name: 'P1 version',
      category_id: 20,
      category_name: 'P1 category',
      tracker_id: 1,
      tracker_name: 'Task',
    },
  ],
  relations: [],
  versions: [],
  statuses: [{ id: 1, name: 'New', is_closed: false }],
  project: { id: 1, name: 'P0' },
  permissions: { editable: true, viewable: true },
  filter_options: {
    projects: [
      { id: 2, name: 'P1' },
      { id: 3, name: 'P2' },
    ],
  },
};

const setupProjectMove = async (
  page: Parameters<typeof setupMockApp>[0],
  options: Parameters<typeof setupMockApp>[1] = {},
) => {
  await setupMockApp(page, {
    mockData: projectMoveData,
    preferences: { visibleColumns: ['id', 'subject', 'project', 'tracker', 'assignee', 'version', 'category'] },
    editProjects: [
      { id: 2, name: 'P1' },
      { id: 3, name: 'P2' },
    ],
    editVersions: [{ id: 10, name: 'P1 version' }],
    editCategories: [{ id: 20, name: 'P1 category' }],
    editAssignees: [{ id: 10, name: 'Jane Doe' }],
    editTrackers: [{ id: 1, name: 'Task' }],
    ...options,
  });
  await page.goto('/');
  await page.getByTestId('cell-601-project').waitFor({ state: 'visible' });
};

test('moves an issue to a project inside the current view', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupProjectMove(page, { onPatchTask: (payload) => patchPayloads.push(payload) });

  await page.getByTestId('cell-601-project').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await page.locator('[data-testid="task-row-601"] select').first().selectOption({ label: 'P2' });

  await expect.poll(() => patchPayloads.length).toBe(1);
  const payload = patchPayloads[0] as { task?: { project_id?: number } };
  expect(payload.task?.project_id).toBe(3);
});

test('does not offer projects outside the current view as move targets', async ({ page }) => {
  await setupProjectMove(page, {
    editProjects: [
      { id: 2, name: 'P1' },
      { id: 3, name: 'P2' },
    ],
  });

  await page.getByTestId('cell-601-project').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  const select = page.locator('[data-testid="task-row-601"] select').first();
  await expect(select).toBeVisible();
  const options = await select.locator('option').evaluateAll((entries) => (
    entries.map((entry) => entry.textContent ?? '')
  ));
  expect(options).toContain('P1');
  expect(options).toContain('P2');
  expect(options).not.toContain('Outside project');
});

test('clears version and category when moving projects', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupProjectMove(page, { onPatchTask: (payload) => patchPayloads.push(payload) });

  await page.getByTestId('cell-601-project').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await page.locator('[data-testid="task-row-601"] select').first().selectOption({ label: 'P2' });

  await expect.poll(() => patchPayloads.length).toBe(1);
  const payload = patchPayloads[0] as { task?: { fixed_version_id?: unknown; category_id?: unknown } };
  expect(payload.task?.fixed_version_id).toBeNull();
  expect(payload.task?.category_id).toBeNull();
});

test('surfaces save failure when tracker or assignee is invalid for the target project', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupProjectMove(page, {
    onPatchTask: (payload) => patchPayloads.push(payload),
    failTaskPatchWhen: () => true,
  });

  await page.getByTestId('cell-601-project').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await page.locator('[data-testid="task-row-601"] select').first().selectOption({ label: 'P2' });

  await expect.poll(() => patchPayloads.length).toBe(1);
  await expect(page.getByText('Update failed').first()).toBeVisible();
  await expect(page.getByTestId('cell-601-project')).toContainText('P1');
});

test('refreshes project-dependent inline edit options after moving projects', async ({ page }) => {
  await setupProjectMove(page, {
    editOptionsByProject: {
      '2': {
        trackers: [{ id: 1, name: 'P1 tracker' }],
        assignees: [{ id: 10, name: 'P1 assignee' }],
        versions: [{ id: 10, name: 'P1 version' }],
        categories: [{ id: 20, name: 'P1 category' }],
      },
      '3': {
        trackers: [{ id: 3, name: 'P2 tracker' }],
        assignees: [{ id: 30, name: 'P2 assignee' }],
        versions: [{ id: 30, name: 'P2 version' }],
        categories: [{ id: 40, name: 'P2 category' }],
      },
    },
  });

  await page.getByTestId('cell-601-project').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  await page.locator('[data-testid="task-row-601"] select').first().selectOption({ label: 'P2' });

  await page.getByTestId('cell-601-tracker').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  let options = await page.locator('[data-testid="task-row-601"] select').first().locator('option').evaluateAll((entries) => (
    entries.map((entry) => entry.textContent ?? '')
  ));
  expect(options).toContain('P2 tracker');
  expect(options).not.toContain('P1 tracker');
  await page.keyboard.press('Escape');

  await page.getByTestId('cell-601-version').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  options = await page.locator('[data-testid="task-row-601"] select').first().locator('option').evaluateAll((entries) => (
    entries.map((entry) => entry.textContent ?? '')
  ));
  expect(options).toContain('P2 version');
  expect(options).not.toContain('P1 version');
  await page.keyboard.press('Escape');

  await page.getByTestId('cell-601-category').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  options = await page.locator('[data-testid="task-row-601"] select').first().locator('option').evaluateAll((entries) => (
    entries.map((entry) => entry.textContent ?? '')
  ));
  expect(options).toContain('P2 category');
  expect(options).not.toContain('P1 category');
  await page.keyboard.press('Escape');

  await page.getByTestId('cell-601-assignee').dispatchEvent('dblclick', { bubbles: true, cancelable: true });
  options = await page.locator('[data-testid="task-row-601"] select').first().locator('option').evaluateAll((entries) => (
    entries.map((entry) => entry.textContent ?? '')
  ));
  expect(options).toContain('P2 assignee');
  expect(options).not.toContain('P1 assignee');
});
