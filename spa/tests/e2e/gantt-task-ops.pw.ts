import { expect, test, type Locator } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

const dispatchCellDoubleClick = async (cell: Locator) => {
  await cell.evaluate((element) => element.dispatchEvent(new MouseEvent('dblclick', {
    bubbles: true,
    cancelable: true,
    view: window,
  })));
};

test('selects task on click', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await expect(page.getByTestId('task-row-101')).toHaveClass(/is-selected/);
});

test('opens issue dialog when clicking the task title text', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByRole('link', { name: 'Implement sidebar resize behavior' }).dispatchEvent('click');
  await expect(page.getByTestId('issue-dialog-header')).toBeVisible();
});

test('selects task when clicking empty space in the subject column', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByTestId('cell-101-subject').dispatchEvent('click');

  await expect(page.getByTestId('task-row-101')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('issue-dialog-header')).toHaveCount(0);
});

test('edits status inline', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, {
    preferences: {
      visibleColumns: ['id', 'subject', 'status'],
      sidebarWidth: 700,
    },
    onPatchTask: (payload) => patchPayloads.push(payload),
  });
  await waitForInitialRender(page);

  await dispatchCellDoubleClick(page.getByTestId('cell-101-status'));
  const select = page.locator('[data-testid="task-row-101"] select').first();
  await expect(select).toBeVisible();
  await select.selectOption({ label: 'Closed' });

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { status_id?: number } };
  expect(payload.task?.status_id).toBe(3);
});

test('saves inline number editor on blur', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, {
    preferences: {
      visibleColumns: ['id', 'subject', 'ratioDone'],
      sidebarWidth: 700,
    },
    onPatchTask: (payload) => patchPayloads.push(payload),
  });
  await waitForInitialRender(page);

  await dispatchCellDoubleClick(page.getByTestId('cell-101-ratioDone'));
  const input = page.getByTestId('cell-101-ratioDone').locator('input[type="number"]').first();
  await expect(input).toBeVisible();
  await input.fill('70');
  await input.press('Enter');

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { done_ratio?: number } };
  expect(payload.task?.done_ratio).toBe(70);
});

test('edits a non-descendant member project task inline', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, {
    mockData: {
      ...defaultMockData,
      tasks: [
        ...defaultMockData.tasks,
        {
          id: 301,
          subject: 'I-P2-VIS',
          project_id: 3,
          project_name: 'P2',
          start_date: '2026-02-11',
          due_date: '2026-02-15',
          ratio_done: 20,
          status_id: 1,
          status_name: 'New',
          assigned_to_id: 10,
          assigned_to_name: 'Jane Doe',
          lock_version: 1,
          editable: true,
          display_order: 3,
        },
      ],
      filter_options: {
        projects: [
          { id: 1, name: 'P0' },
          { id: 2, name: 'P1' },
          { id: 3, name: 'P2' },
        ],
      },
      initial_state: { memberProjectsOnly: true },
    },
    preferences: {
      visibleColumns: ['id', 'subject', 'status', 'ratioDone'],
      sidebarWidth: 700,
    },
    onPatchTask: (payload) => patchPayloads.push(payload),
  });
  await waitForInitialRender(page);

  await expect(page.getByRole('link', { name: 'I-P2-VIS' })).toBeVisible();
  await dispatchCellDoubleClick(page.getByTestId('cell-301-ratioDone'));
  const input = page.locator('[data-testid="task-row-301"] input[type="number"]').first();
  await expect(input).toBeVisible();
  await input.fill('70');
  await input.press('Enter');

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { done_ratio?: number } };
  expect(payload.task?.done_ratio).toBe(70);
});

test('does not expose inline edit controls for tasks outside the current view', async ({ page }) => {
  await setupMockApp(page, {
    mockData: {
      ...defaultMockData,
      tasks: [
        ...defaultMockData.tasks,
        {
          id: 302,
          subject: 'I-P2-HIDDEN',
          project_id: 3,
          project_name: 'P2',
          start_date: '2026-02-11',
          due_date: '2026-02-15',
          ratio_done: 20,
          status_id: 3,
          status_name: 'Closed',
          assigned_to_id: 10,
          assigned_to_name: 'Jane Doe',
          lock_version: 1,
          editable: true,
          display_order: 3,
        },
      ],
      initial_state: { selectedStatusIds: [1] },
    },
  });
  await page.goto('/?status_ids[]=1');
  await page.getByTestId('cell-101-subject').waitFor({ state: 'visible' });

  await expect(page.getByText('I-P2-HIDDEN')).toHaveCount(0);
  await expect(page.getByTestId('cell-302-status')).toHaveCount(0);
});
