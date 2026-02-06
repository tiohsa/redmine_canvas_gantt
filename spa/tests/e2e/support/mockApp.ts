import type { Page, Route } from '@playwright/test';

type RawTask = {
  id: number;
  subject: string;
  project_id: number;
  project_name: string;
  start_date: string;
  due_date: string;
  ratio_done: number;
  status_id: number;
  status_name: string;
  assigned_to_id?: number;
  assigned_to_name?: string;
  lock_version: number;
  editable: boolean;
  display_order: number;
  parent_id?: number;
  has_children?: boolean;
};

type MockData = {
  tasks: RawTask[];
  relations: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  statuses: Array<{ id: number; name: string; is_closed: boolean }>;
  project: { id: number; name: string };
  permissions: { editable: boolean; viewable: boolean };
};

type SetupOptions = {
  mockData?: MockData;
  onPatchTask?: (payload: unknown) => void;
  onDeleteRelation?: (relationId: string) => void;
  failTaskPatch?: boolean;
};

const defaultMockData: MockData = {
  tasks: [
    {
      id: 101,
      subject: 'Implement sidebar resize behavior',
      project_id: 1,
      project_name: 'Alpha',
      start_date: '2026-02-01',
      due_date: '2026-02-10',
      ratio_done: 40,
      status_id: 1,
      status_name: 'New',
      assigned_to_id: 10,
      assigned_to_name: 'Jane Doe',
      lock_version: 1,
      editable: true,
      display_order: 0,
    },
    {
      id: 102,
      subject: 'Fix login flow',
      project_id: 1,
      project_name: 'Alpha',
      start_date: '2026-02-05',
      due_date: '2026-02-12',
      ratio_done: 10,
      status_id: 2,
      status_name: 'In Progress',
      assigned_to_id: 11,
      assigned_to_name: 'John Smith',
      lock_version: 1,
      editable: true,
      display_order: 1,
      parent_id: 101,
    },
    {
      id: 201,
      subject: 'Release prep',
      project_id: 2,
      project_name: 'Beta',
      start_date: '2026-02-08',
      due_date: '2026-02-18',
      ratio_done: 90,
      status_id: 3,
      status_name: 'Closed',
      assigned_to_id: 12,
      assigned_to_name: 'Mary Major',
      lock_version: 1,
      editable: true,
      display_order: 2,
    },
  ],
  relations: [
    { id: 1, issue_from_id: 101, issue_to_id: 102, relation_type: 'precedes' },
  ],
  versions: [
    { id: 1, name: 'v1.0', effective_date: '2026-02-28', status: 'open', project_id: 1 },
  ],
  statuses: [
    { id: 1, name: 'New', is_closed: false },
    { id: 2, name: 'In Progress', is_closed: false },
    { id: 3, name: 'Closed', is_closed: true },
  ],
  project: { id: 1, name: 'Canvas Gantt' },
  permissions: { editable: true, viewable: true },
};

const createEditMeta = (taskId: string, data: MockData) => {
  const task = data.tasks.find((t) => String(t.id) === taskId);
  const current = task ?? data.tasks[0];

  return {
    task: {
      id: current.id,
      subject: current.subject,
      assigned_to_id: current.assigned_to_id ?? null,
      status_id: current.status_id,
      done_ratio: current.ratio_done,
      due_date: current.due_date,
      start_date: current.start_date,
      priority_id: 1,
      category_id: null,
      estimated_hours: 8,
      project_id: current.project_id,
      tracker_id: 1,
      fixed_version_id: 1,
      lock_version: current.lock_version,
    },
    editable: {
      subject: true,
      assigned_to_id: true,
      status_id: true,
      done_ratio: true,
      due_date: true,
      start_date: true,
      priority_id: true,
      category_id: true,
      estimated_hours: true,
      project_id: true,
      tracker_id: true,
      fixed_version_id: true,
      custom_field_values: true,
    },
    options: {
      statuses: data.statuses.map((s) => ({ id: s.id, name: s.name })),
      assignees: [
        { id: 10, name: 'Jane Doe' },
        { id: 11, name: 'John Smith' },
        { id: 12, name: 'Mary Major' },
      ],
      priorities: [{ id: 1, name: 'Normal' }],
      categories: [],
      projects: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
      ],
      trackers: [{ id: 1, name: 'Task' }],
      versions: [{ id: 1, name: 'v1.0' }],
      custom_fields: [],
    },
    custom_field_values: {},
  };
};

const filterByStatusQuery = (route: Route, data: MockData): MockData => {
  const url = new URL(route.request().url());
  const selected = url.searchParams.getAll('status_ids[]').map((v) => Number(v));
  if (selected.length === 0) return data;

  return {
    ...data,
    tasks: data.tasks.filter((t) => selected.includes(t.status_id)),
  };
};

export const setupMockApp = async (page: Page, options?: SetupOptions) => {
  const data = options?.mockData ?? defaultMockData;

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('canvasGantt:preferences', JSON.stringify({
      groupByProject: false,
      visibleColumns: ['id', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone'],
      sidebarWidth: 420,
      viewport: {
        scrollX: 0,
        scrollY: 0,
      },
    }));
    (window as Window & { RedmineCanvasGantt?: unknown }).RedmineCanvasGantt = {
      projectId: 1,
      apiBase: '/projects/1/canvas_gantt',
      redmineBase: '',
      authToken: 'test-token',
      apiKey: 'test-api-key',
      i18n: {
        field_subject: 'Task Name',
        field_status: 'Status',
        field_assigned_to: 'Assignee',
      },
      settings: {
        inline_edit_subject: '1',
        inline_edit_assigned_to: '1',
        inline_edit_status: '1',
        inline_edit_done_ratio: '1',
        inline_edit_due_date: '1',
        inline_edit_start_date: '1',
      },
    };
  });

  await page.route('**/projects/1/canvas_gantt/data.json**', async (route) => {
    const payload = filterByStatusQuery(route, data);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/projects/1/canvas_gantt/tasks/*/edit_meta.json', async (route) => {
    const taskId = route.request().url().match(/tasks\/(\d+)\/edit_meta\.json$/)?.[1] ?? '101';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createEditMeta(taskId, data)),
    });
  });

  await page.route('**/projects/1/canvas_gantt/tasks/*.json', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      options?.onPatchTask?.(body);

      if (options?.failTaskPatch) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Update failed' }) });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lock_version: 2 }) });
      return;
    }

    await route.fallback();
  });

  await page.route('**/projects/1/canvas_gantt/relations/*.json', async (route) => {
    if (route.request().method() === 'DELETE') {
      const relationId = route.request().url().match(/relations\/([^/]+)\.json$/)?.[1] ?? '';
      options?.onDeleteRelation?.(relationId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fallback();
  });
};

export const waitForInitialRender = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
};

export { defaultMockData };
