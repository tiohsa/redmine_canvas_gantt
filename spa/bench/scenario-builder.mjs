import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const FIXTURES_DIR = resolve(BENCH_DIR, 'fixtures');
const STATUSES = [
  { id: 1, name: 'New', is_closed: false },
  { id: 2, name: 'In Progress', is_closed: false },
  { id: 3, name: 'Closed', is_closed: true }
];

const formatDate = (dayOffset) => {
  const date = new Date(Date.UTC(2026, 0, 1 + dayOffset));
  return date.toISOString().slice(0, 10);
};

const createTask = (index, overrides = {}) => {
  const projectId = 1;
  const startOffset = index % 30;
  const duration = 5 + (index % 7);

  return {
    id: index + 1,
    subject: `Benchmark Task ${index + 1}`,
    project_id: projectId,
    project_name: 'Canvas Gantt Bench',
    start_date: formatDate(startOffset),
    due_date: formatDate(startOffset + duration),
    ratio_done: (index * 7) % 100,
    status_id: STATUSES[index % STATUSES.length].id,
    status_name: STATUSES[index % STATUSES.length].name,
    assigned_to_id: (index % 12) + 1,
    assigned_to_name: `User ${(index % 12) + 1}`,
    lock_version: 1,
    editable: true,
    display_order: index,
    ...overrides
  };
};

const buildFlatTasks = (taskCount) => Array.from({ length: taskCount }, (_, index) => createTask(index));

const buildHierarchyTasks = (taskCount, branchFactor = 10) => {
  const tasks = [];

  for (let index = 0; index < taskCount; index += 1) {
    const parentIndex = index === 0 ? null : Math.floor((index - 1) / branchFactor);
    tasks.push(createTask(index, {
      parent_id: parentIndex === null ? undefined : parentIndex + 1,
      has_children: (index * branchFactor) + 1 < taskCount
    }));
  }

  return tasks;
};

const buildDependencyRelations = (taskCount) => {
  const relations = [];

  for (let index = 1; index < taskCount; index += 1) {
    relations.push({
      id: index,
      issue_from_id: index,
      issue_to_id: index + 1,
      relation_type: 'precedes'
    });
  }

  return relations;
};

const buildPayload = (fixture) => {
  const taskCount = Number(fixture.taskCount ?? 0);
  const kind = fixture.kind;
  const branchFactor = Number(fixture.branchFactor ?? 10);

  if (!Number.isInteger(taskCount) || taskCount <= 0) {
    throw new Error(`Invalid taskCount for fixture ${fixture.name}`);
  }

  let tasks;
  let relations = [];

  switch (kind) {
    case 'flat':
      tasks = buildFlatTasks(taskCount);
      break;
    case 'hierarchy':
      tasks = buildHierarchyTasks(taskCount, branchFactor);
      break;
    case 'dependency':
      tasks = buildFlatTasks(taskCount);
      relations = buildDependencyRelations(taskCount);
      break;
    default:
      throw new Error(`Unsupported fixture kind: ${kind}`);
  }

  return {
    tasks,
    relations,
    versions: [
      {
        id: 1,
        name: 'Bench Milestone',
        effective_date: '2026-03-31',
        status: 'open',
        project_id: 1
      }
    ],
    statuses: STATUSES,
    custom_fields: [],
    project: { id: 1, name: 'Canvas Gantt Bench' },
    permissions: { editable: true, viewable: true }
  };
};

export const loadFixtures = async () => {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name);

  const fixtures = [];
  for (const file of files) {
    const raw = await readFile(resolve(FIXTURES_DIR, file), 'utf8');
    fixtures.push(JSON.parse(raw));
  }

  return fixtures.sort((left, right) => {
    const leftOrder = Number(left.order ?? Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(right.order ?? Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name).localeCompare(String(right.name), 'en');
  });
};

export const createScenario = (fixture) => ({
  name: fixture.name,
  kind: fixture.kind,
  taskCount: fixture.taskCount,
  payload: buildPayload(fixture)
});
