import { expect, test, type Page } from '@playwright/test';
import { setupMockApp } from './support/mockApp';

const bulkData = {
  tasks: [
    {
      id: 501,
      subject: 'I-P1-PARENT',
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
      id: 502,
      subject: 'Hidden parent',
      project_id: 2,
      project_name: 'P1',
      start_date: '2026-02-11',
      due_date: '2026-02-12',
      ratio_done: 0,
      status_id: 3,
      status_name: 'Closed',
      assigned_to_id: 10,
      assigned_to_name: 'Jane Doe',
      lock_version: 1,
      editable: true,
      display_order: 1,
    },
  ],
  relations: [],
  versions: [],
  statuses: [
    { id: 1, name: 'New', is_closed: false },
    { id: 3, name: 'Closed', is_closed: true },
  ],
  project: { id: 1, name: 'P0' },
  permissions: { editable: true, viewable: true },
};

const routeIssueEditFrame = async (page: Page, issueId: number) => {
  await page.route(`**/issues/${issueId}/edit`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><body><form id="issue-form" action="/issues/${issueId}" method="get"><input type="submit" value="Save"></form></body></html>`,
    });
  });
  await page.route(`**/issues/${issueId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><body><h1>Issue ${issueId}</h1></body></html>`,
    });
  });
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

test('bulk creates subtasks for a visible parent issue', async ({ page }) => {
  const bulkPayloads: unknown[] = [];
  await routeIssueEditFrame(page, 501);
  await setupMockApp(page, {
    mockData: bulkData,
    onBulkCreateSubtasks: (payload) => bulkPayloads.push(payload),
  });
  await page.goto('/');
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });

  await openContextMenu(page, 501);
  await page.getByTestId('context-menu-edit-task').click();
  await expect(page.getByTestId('issue-dialog-header')).toBeVisible();
  await page.getByText('Bulk Ticket Creation').click();
  await page.getByTestId('bulk-subtask-subjects').fill('Subtask A\nSubtask B');
  await page.getByTestId('issue-dialog-footer').getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => bulkPayloads.length).toBe(1);
  expect(bulkPayloads[0]).toEqual({
    parent_issue_id: 501,
    subjects: ['Subtask A', 'Subtask B'],
  });
});

test('does not show bulk create entry point for a parent outside the current view', async ({ page }) => {
  await setupMockApp(page, {
    mockData: { ...bulkData, initial_state: { selectedStatusIds: [1] } },
    failBulkCreateWhenParentHidden: true,
  });
  await page.goto('/?status_ids[]=1');
  await page.getByTestId('cell-501-subject').waitFor({ state: 'visible' });

  await expect(page.getByText('Hidden parent')).toHaveCount(0);
  await expect(page.getByTestId('task-row-502')).toHaveCount(0);
});
