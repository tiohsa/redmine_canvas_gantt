import { expect, test } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

const dataWithProjectCandidates = (projectIds: number[], selectedProjectIds?: string[]) => ({
  ...defaultMockData,
  tasks: defaultMockData.tasks.filter((task) => projectIds.includes(task.project_id)),
  filter_options: {
    projects: projectIds.map((id) => ({
      id: String(id),
      name: id === 1 ? 'Alpha' : 'Beta',
    })),
    assignees: [
      { id: 10, name: 'Jane Doe', project_ids: ['1'] },
      { id: 12, name: 'Mary Major', project_ids: ['2'] },
    ],
  },
  initial_state: selectedProjectIds
    ? { selectedProjectIds }
    : undefined,
});

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('filters tasks by text', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Filter Tasks').click();
  await page.getByPlaceholder('Filter by subject...').fill('login');

  await expect(page.getByRole('link', { name: 'Fix login flow' })).toBeVisible();
  await expect(page.getByText('Release prep')).toHaveCount(0);
});

test('clears filter on button click', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Filter Tasks').click();
  await page.getByPlaceholder('Filter by subject...').fill('login');
  await page.getByRole('button', { name: 'Clear' }).first().click();

  await expect(page.getByRole('link', { name: 'Fix login flow' })).toBeVisible();
});

test('filters by status', async ({ page }) => {
  await waitForInitialRender(page);

  await page.getByTitle('Status').click();
  await page.getByRole('button', { name: 'Clear' }).first().click();
  await page.getByLabel('Closed').check();
  await expect(page.getByText('Implement sidebar resize behavior')).toHaveCount(0);
  await expect(page.getByText('Fix login flow')).toHaveCount(0);
});

test('keeps backend project candidates visible after selecting a project', async ({ page }) => {
  await page.route('**/projects/1/canvas_gantt/data.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dataWithProjectCandidates([1, 2])),
    });
  });

  await waitForInitialRender(page);

  await page.getByTitle('Filter by project').click();
  await page.getByLabel('Alpha').check();

  await expect(page.getByLabel('Alpha')).toBeVisible();
  await expect(page.getByLabel('Beta')).toBeVisible();
});

test('reloads member project candidates and prunes hidden project selections', async ({ page }) => {
  const dataRequests: string[] = [];
  await page.route('**/projects/1/canvas_gantt/data.json**', async (route) => {
    const url = new URL(route.request().url());
    dataRequests.push(url.search);
    const memberProjectsOnly = url.searchParams.get('member_projects_only') === '1';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        memberProjectsOnly
          ? dataWithProjectCandidates([1], ['1'])
          : dataWithProjectCandidates([1, 2]),
      ),
    });
  });

  await waitForInitialRender(page);

  await page.getByTitle('Filter by project').click();
  await page.getByLabel('Alpha').check();
  await page.getByLabel('Beta').check();
  await page.getByLabel('Show only my member projects').check();

  await expect
    .poll(() => dataRequests.some((search) => new URLSearchParams(search).get('member_projects_only') === '1'))
    .toBe(true);
  await expect(page.getByLabel('Alpha')).toBeVisible();
  await expect(page.getByLabel('Beta')).toHaveCount(0);
});

test('keeps saved query scope while applying an additional status filter', async ({ page }) => {
  const dataRequests: string[] = [];
  await page.route('**/projects/1/canvas_gantt/data.json**', async (route) => {
    const url = new URL(route.request().url());
    dataRequests.push(url.search);
    const selectedStatuses = url.searchParams.getAll('status_ids[]').map(Number);
    const tasks = selectedStatuses.length > 0
      ? defaultMockData.tasks.filter((task) => selectedStatuses.includes(task.status_id))
      : defaultMockData.tasks;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...defaultMockData,
        tasks,
        initial_state: {
          queryId: url.searchParams.get('query_id') ? Number(url.searchParams.get('query_id')) : undefined,
          selectedStatusIds: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        },
      }),
    });
  });
  await page.route('**/projects/1/canvas_gantt/queries.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queries: [{ id: 44, name: 'Visible member work', is_public: true, project_id: 1 }],
      }),
    });
  });

  await waitForInitialRender(page);
  await page.getByTestId('query-menu-button').click();
  await page.getByLabel('Visible member work').check();
  await page.getByTitle('Status').click();
  await page.getByRole('button', { name: 'Clear' }).first().click();
  await page.getByLabel('Closed').check();

  await expect
    .poll(() => dataRequests.some((search) => {
      const params = new URLSearchParams(search);
      return params.get('query_id') === '44' && params.getAll('status_ids[]').includes('3');
    }))
    .toBe(true);
  await expect(page.getByRole('link', { name: 'Release prep' })).toBeVisible();
  await expect(page.getByText('Implement sidebar resize behavior')).toHaveCount(0);
});
