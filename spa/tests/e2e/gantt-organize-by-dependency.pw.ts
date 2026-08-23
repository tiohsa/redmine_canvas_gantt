import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const getRenderedTaskOrder = async (page: Parameters<typeof test>[0]['page']) => (
  page.locator('[data-testid^="task-row-"]').evaluateAll((rows) =>
    rows
      .map((row) => ({
        id: row.getAttribute('data-testid') ?? '',
        top: row.getBoundingClientRect().top,
      }))
      .sort((a, b) => a.top - b.top)
      .map((row) => row.id.replace('task-row-', ''))
  )
);

const enableDependencyOrganization = async (page: Parameters<typeof test>[0]['page']) => {
  await page.getByTestId('display-settings-menu-button').click();
  await page.getByText('Organize by dependency', { exact: true }).click();
  await expect(page.getByLabel('Organize by dependency')).toBeChecked();
};

test('organize by dependency overrides flat sort order', async ({ page }) => {
  await setupMockApp(page, {
    preferences: {
      groupByProject: false,
      showVersions: false,
      sortConfig: { key: 'startDate', direction: 'asc' },
    },
    mockData: {
      tasks: [
        {
          id: 101,
          subject: 'Task A',
          project_id: 1,
          project_name: 'Alpha',
          start_date: '2026-02-01',
          due_date: '2026-02-03',
          ratio_done: 0,
          status_id: 1,
          status_name: 'New',
          lock_version: 1,
          editable: true,
          display_order: 0,
        },
        {
          id: 102,
          subject: 'Task B',
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
        {
          id: 103,
          subject: 'Task C',
          project_id: 1,
          project_name: 'Alpha',
          start_date: '2026-02-10',
          due_date: '2026-02-12',
          ratio_done: 0,
          status_id: 1,
          status_name: 'New',
          lock_version: 1,
          editable: true,
          display_order: 2,
        },
      ],
      relations: [{ id: 1, issue_from_id: 101, issue_to_id: 103, relation_type: 'precedes' }],
      versions: [],
      statuses: [{ id: 1, name: 'New', is_closed: false }],
      project: { id: 1, name: 'Alpha' },
      permissions: { editable: true, viewable: true },
    },
  });

  await waitForInitialRender(page);
  await expect(await getRenderedTaskOrder(page)).toEqual(['101', '102', '103']);

  await enableDependencyOrganization(page);

  await expect.poll(() => getRenderedTaskOrder(page)).toEqual(['101', '103', '102']);
});

test('organize by dependency keeps cross-version dependency tasks adjacent', async ({ page }) => {
  await setupMockApp(page, {
    preferences: {
      groupByProject: true,
      showVersions: true,
      sortConfig: { key: 'startDate', direction: 'asc' },
    },
    mockData: {
      tasks: [
        {
          id: 101,
          subject: 'Task A',
          project_id: 1,
          project_name: 'Alpha',
          start_date: '2026-02-01',
          due_date: '2026-02-03',
          ratio_done: 0,
          status_id: 1,
          status_name: 'New',
          lock_version: 1,
          editable: true,
          display_order: 0,
          fixed_version_id: 1,
        },
        {
          id: 102,
          subject: 'Task B',
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
          fixed_version_id: 1,
        },
        {
          id: 103,
          subject: 'Task C',
          project_id: 1,
          project_name: 'Alpha',
          start_date: '2026-02-10',
          due_date: '2026-02-12',
          ratio_done: 0,
          status_id: 1,
          status_name: 'New',
          lock_version: 1,
          editable: true,
          display_order: 2,
          fixed_version_id: 2,
        },
      ],
      relations: [{ id: 1, issue_from_id: 101, issue_to_id: 103, relation_type: 'precedes' }],
      versions: [
        { id: 1, name: 'v1', effective_date: '2026-02-20', status: 'open', project_id: 1 },
        { id: 2, name: 'v2', effective_date: '2026-02-25', status: 'open', project_id: 1 },
      ],
      statuses: [{ id: 1, name: 'New', is_closed: false }],
      project: { id: 1, name: 'Alpha' },
      permissions: { editable: true, viewable: true },
    },
  });

  await waitForInitialRender(page);
  await expect(page.getByText('v1')).toBeVisible();
  await expect(page.getByText('v2')).toBeVisible();

  await enableDependencyOrganization(page);

  await expect.poll(() => getRenderedTaskOrder(page)).toEqual(['101', '103', '102']);
  await expect(page.getByText('v1')).toHaveCount(0);
  await expect(page.getByText('v2')).toHaveCount(0);
});
