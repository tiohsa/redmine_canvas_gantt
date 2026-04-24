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
  fixed_version_id?: number;
  fixed_version_name?: string;
  category_id?: number;
  category_name?: string;
  tracker_id?: number;
  tracker_name?: string;
  priority_id?: number;
  priority_name?: string;
  has_children?: boolean;
};

type MockData = {
  tasks: RawTask[];
  relations: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  statuses: Array<{ id: number; name: string; is_closed: boolean }>;
  project: { id: number; name: string };
  permissions: { editable: boolean; viewable: boolean };
  filter_options?: {
    projects?: Array<{ id: number | string; name: string }>;
    assignees?: Array<{ id: number | null; name: string | null; project_ids?: Array<number | string> }>;
  };
  initial_state?: Record<string, unknown>;
};

type SetupOptions = {
  mockData?: MockData;
  preferences?: Record<string, unknown>;
  onPatchTask?: (payload: unknown) => void;
  onCreateRelation?: (payload: unknown) => void;
  onUpdateRelation?: (relationId: string, payload: unknown) => void;
  onDeleteRelation?: (relationId: string) => void;
  onBulkCreateSubtasks?: (payload: unknown) => void;
  failTaskPatch?: boolean;
  failTaskPatchWhen?: (taskId: string, payload: unknown) => boolean;
  failRelationWhenHidden?: boolean;
  failBulkCreateWhenParentHidden?: boolean;
  savedQueries?: Array<{ id: number; name: string; is_public: boolean; project_id: number | null }>;
  editProjects?: Array<{ id: number; name: string }>;
  editTrackers?: Array<{ id: number; name: string }>;
  editCategories?: Array<{ id: number; name: string }>;
  editVersions?: Array<{ id: number; name: string }>;
  editAssignees?: Array<{ id: number; name: string }>;
  editOptionsByProject?: Record<string, {
    trackers?: Array<{ id: number; name: string }>;
    categories?: Array<{ id: number; name: string }>;
    versions?: Array<{ id: number; name: string }>;
    assignees?: Array<{ id: number; name: string }>;
  }>;
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
      tracker_id: current.tracker_id ?? 1,
      fixed_version_id: current.fixed_version_id ?? 1,
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

const cloneData = (data: MockData): MockData => JSON.parse(JSON.stringify(data)) as MockData;

const parseSelectedIds = (url: URL, key: string): string[] =>
  url.searchParams.getAll(`${key}[]`).concat(url.searchParams.getAll(key)).flatMap((value) => (
    value.split(/[|,]/).map((entry) => entry.trim()).filter(Boolean)
  ));

const deriveInitialState = (url: URL, data: MockData): Record<string, unknown> => {
  const statusIds = parseSelectedIds(url, 'status_ids').map(Number).filter(Number.isFinite);
  const projectIds = parseSelectedIds(url, 'project_ids').filter((id) => id !== 'none' && id !== '_none');
  const queryId = url.searchParams.get('query_id');
  const memberProjectsOnly = url.searchParams.get('member_projects_only') === '1';

  return {
    ...(data.initial_state ?? {}),
    ...(queryId && /^\d+$/.test(queryId) ? { queryId: Number(queryId) } : {}),
    ...(statusIds.length > 0 ? { selectedStatusIds: statusIds } : {}),
    ...(projectIds.length > 0 ? { selectedProjectIds: projectIds } : {}),
    ...(memberProjectsOnly ? { memberProjectsOnly: true } : {}),
  };
};

const filterByQuery = (route: Route, data: MockData): MockData => {
  const url = new URL(route.request().url());
  const selectedStatuses = parseSelectedIds(url, 'status_ids').map((v) => Number(v)).filter(Number.isFinite);
  const selectedProjects = parseSelectedIds(url, 'project_ids').filter((id) => id !== 'none' && id !== '_none');
  const visibleProjectIds = new Set(selectedProjects);

  const tasks = data.tasks.filter((task) => {
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(task.status_id)) return false;
    if (visibleProjectIds.size > 0 && !visibleProjectIds.has(String(task.project_id))) return false;
    return true;
  });

  return {
    ...data,
    tasks,
    relations: data.relations.filter((relation) => {
      const taskIds = new Set(tasks.map((task) => String(task.id)));
      return taskIds.has(String(relation.issue_from_id)) && taskIds.has(String(relation.issue_to_id));
    }),
    initial_state: deriveInitialState(url, data),
  };
};

const isTaskVisibleInCurrentRequest = (route: Route, data: MockData, taskId: string): boolean => {
  const filtered = filterByQuery(route, data);
  return filtered.tasks.some((task) => String(task.id) === taskId);
};

const isRelationVisibleInCurrentRequest = (route: Route, data: MockData, relationId: string): boolean => {
  const filtered = filterByQuery(route, data);
  return filtered.relations.some((relation) => String(relation.id) === relationId);
};

export const setupMockApp = async (page: Page, options?: SetupOptions) => {
  const data = cloneData(options?.mockData ?? defaultMockData);
  const preferences = {
    groupByProject: false,
    visibleColumns: ['id', 'subject', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone'],
    sidebarWidth: 420,
    viewport: {
      scrollX: 0,
      scrollY: 0,
    },
    ...options?.preferences,
  };

  await page.addInitScript((initialPreferences) => {
    localStorage.clear();
    localStorage.setItem('canvasGantt:preferences', JSON.stringify(initialPreferences));
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
        test_mode: '1',
      },
    };
  }, preferences);

  await page.route('**/canvas_gantt/queries.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ queries: options?.savedQueries ?? [] }),
    });
  });

  await page.route('**/canvas_gantt/data.json**', async (route) => {
    const payload = filterByQuery(route, data);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/canvas_gantt/tasks/*/edit_meta.json**', async (route) => {
    const url = new URL(route.request().url());
    const taskId = url.pathname.match(/tasks\/(\d+)\/edit_meta\.json$/)?.[1] ?? '101';
    const meta = createEditMeta(taskId, data);
    const targetProjectId = url.searchParams.get('target_project_id') ?? String(meta.task.project_id);
    const projectOptions = options?.editOptionsByProject?.[targetProjectId];
    meta.options.projects = options?.editProjects ?? meta.options.projects;
    meta.options.trackers = projectOptions?.trackers ?? options?.editTrackers ?? meta.options.trackers;
    meta.options.categories = projectOptions?.categories ?? options?.editCategories ?? meta.options.categories;
    meta.options.versions = projectOptions?.versions ?? options?.editVersions ?? meta.options.versions;
    meta.options.assignees = projectOptions?.assignees ?? options?.editAssignees ?? meta.options.assignees;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meta),
    });
  });

  await page.route('**/canvas_gantt/tasks/*.json**', async (route) => {
    if (route.request().method() === 'PATCH') {
      const taskId = route.request().url().match(/tasks\/(\d+)\.json/)?.[1] ?? '';
      const body = route.request().postDataJSON();
      options?.onPatchTask?.(body);

      if (options?.failTaskPatch || options?.failTaskPatchWhen?.(taskId, body)) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Update failed' }) });
        return;
      }

      const task = data.tasks.find((entry) => String(entry.id) === taskId);
      const fields = (body as { task?: Record<string, unknown> }).task ?? {};
      if (task) {
        if (typeof fields.subject === 'string') task.subject = fields.subject;
        if (typeof fields.status_id === 'number') task.status_id = fields.status_id;
        if (typeof fields.done_ratio === 'number') task.ratio_done = fields.done_ratio;
        if (typeof fields.project_id === 'number') task.project_id = fields.project_id;
        if (fields.fixed_version_id === null) {
          delete task.fixed_version_id;
          delete task.fixed_version_name;
        }
        if (fields.category_id === null) {
          delete task.category_id;
          delete task.category_name;
        }
        task.lock_version += 1;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lock_version: task?.lock_version ?? 2, task_id: taskId }) });
      return;
    }

    await route.fallback();
  });

  await page.route('**/canvas_gantt/relations.json**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      options?.onCreateRelation?.(body);
      const relationBody = (body as { relation?: Record<string, unknown> }).relation ?? {};
      const nextId = String(data.relations.length + 100);
      const relation = {
        id: nextId,
        issue_from_id: relationBody.issue_from_id,
        issue_to_id: relationBody.issue_to_id,
        relation_type: relationBody.relation_type,
        ...(typeof relationBody.delay === 'number' ? { delay: relationBody.delay } : {}),
      };
      data.relations.push(relation);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relation }) });
      return;
    }

    await route.fallback();
  });

  await page.route('**/canvas_gantt/relations/*.json**', async (route) => {
    const relationId = route.request().url().match(/relations\/([^/]+)\.json/)?.[1] ?? '';
    if (options?.failRelationWhenHidden && !isRelationVisibleInCurrentRequest(route, data, relationId)) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Relation is outside current view' }) });
      return;
    }

    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      options?.onUpdateRelation?.(relationId, body);
      const relation = data.relations.find((entry) => String(entry.id) === relationId);
      const relationBody = (body as { relation?: Record<string, unknown> }).relation ?? {};
      if (relation) {
        relation.relation_type = relationBody.relation_type ?? relation.relation_type;
        if (typeof relationBody.delay === 'number') relation.delay = relationBody.delay;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relation }) });
      return;
    }

    if (route.request().method() === 'DELETE') {
      options?.onDeleteRelation?.(relationId);
      data.relations = data.relations.filter((entry) => String(entry.id) !== relationId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fallback();
  });

  await page.route('**/canvas_gantt/subtasks/bulk.json**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      options?.onBulkCreateSubtasks?.(body);
      const parentId = String((body as { parent_issue_id?: unknown }).parent_issue_id ?? '');
      if (options?.failBulkCreateWhenParentHidden && !isTaskVisibleInCurrentRequest(route, data, parentId)) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Parent is outside current view' }) });
        return;
      }
      const subjects = Array.isArray((body as { subjects?: unknown }).subjects) ? (body as { subjects: string[] }).subjects : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          success_count: subjects.length,
          fail_count: 0,
          results: subjects.map((subject, index) => ({ status: 'ok', subject, issue_id: 900 + index })),
        }),
      });
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
