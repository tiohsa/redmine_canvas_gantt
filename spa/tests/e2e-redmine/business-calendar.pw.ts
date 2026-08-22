import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { adminLogin } from './helpers';

type CanvasConfig = {
  apiBase: string;
  authToken: string;
};

const restAuthorization = `Basic ${Buffer.from('admin:admin').toString('base64')}`;

const createIssue = async (
  page: Page,
  subject: string,
  startDate: string,
  dueDate: string
): Promise<number> => {
  const result = await page.evaluate(async ({ subject, startDate, dueDate, restAuthorization }) => {
    const response = await fetch('/issues.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: restAuthorization
      },
      body: JSON.stringify({
        issue: {
          project_id: 'ecookbook',
          tracker_id: 1,
          subject,
          start_date: startDate,
          due_date: dueDate
        }
      })
    });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  }, { subject, startDate, dueDate, restAuthorization });

  expect(result.status).toBe(201);
  const issueId = (result.payload as { issue?: { id?: number } }).issue?.id;
  expect(issueId).toEqual(expect.any(Number));
  return issueId!;
};

const fetchRestSchedule = async (page: Page, issueId: number) => {
  const result = await page.evaluate(async ({ issueId, restAuthorization }) => {
    const config = (window as Window & { RedmineCanvasGantt: CanvasConfig }).RedmineCanvasGantt;
    const response = await fetch(`/issues/${issueId}.json`, {
      headers: {
        Accept: 'application/json',
        Authorization: restAuthorization
      }
    });
    const payload = await response.json().catch(() => ({}));
    const dataResponse = await fetch(`${config.apiBase}/data.json`);
    const dataPayload = await dataResponse.json().catch(() => ({}));
    return { status: response.status, payload, dataPayload };
  }, { issueId, restAuthorization });

  expect(result.status).toBe(200);
  const issue = (result.payload as {
    issue?: {
      start_date?: string;
      due_date?: string;
      lock_version?: number;
    };
  }).issue;
  const task = (result.dataPayload as {
    tasks?: Array<{ id?: number; lock_version?: number }>;
  }).tasks?.find((entry) => entry.id === issueId);
  expect(issue).toBeTruthy();
  return {
    startDate: issue?.start_date ?? null,
    dueDate: issue?.due_date ?? null,
    lockVersion: task?.lock_version ?? issue?.lock_version ?? 1
  };
};

const createPrecedesRelation = async (page: Page, fromIssueId: number, toIssueId: number) => {
  const result = await page.evaluate(async ({ fromIssueId, toIssueId }) => {
    const config = (window as Window & { RedmineCanvasGantt: CanvasConfig }).RedmineCanvasGantt;
    const response = await fetch(`${config.apiBase}/relations.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': config.authToken
      },
      body: JSON.stringify({
        relation: {
          issue_from_id: fromIssueId,
          issue_to_id: toIssueId,
          relation_type: 'precedes',
          delay: 0
        }
      })
    });
    return { status: response.status, body: await response.text() };
  }, { fromIssueId, toIssueId });

  expect([200, 201], result.body).toContain(result.status);
};

const scheduleMutation = async (
  page: Page,
  operationId: string,
  change: {
    taskId: number;
    baseRevision: number;
    startDate: string;
    dueDate: string;
  }
) => page.evaluate(async ({ operationId, change }) => {
  const config = (window as Window & { RedmineCanvasGantt: CanvasConfig }).RedmineCanvasGantt;
  const response = await fetch(`${config.apiBase}/schedule_mutation.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRF-Token': config.authToken
    },
    body: JSON.stringify({
      operation_id: operationId,
      base_revisions: { [change.taskId]: change.baseRevision },
      changes: [{
        task_id: change.taskId,
        start_date: change.startDate,
        due_date: change.dueDate
      }]
    })
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}, { operationId, change });

const fetchCanvasSchedule = async (page: Page, issueId: number) => {
  const result = await page.evaluate(async ({ issueId }) => {
    const config = (window as Window & { RedmineCanvasGantt: CanvasConfig }).RedmineCanvasGantt;
    const response = await fetch(`${config.apiBase}/data.json`);
    const payload = await response.json() as {
      tasks?: Array<{ id?: number; start_date?: string | null; due_date?: string | null }>;
    };
    const task = payload.tasks?.find((entry) => entry.id === issueId);
    return { status: response.status, task };
  }, { issueId });

  expect(result.status).toBe(200);
  expect(result.task).toBeTruthy();
  return {
    startDate: result.task?.start_date ?? null,
    dueDate: result.task?.due_date ?? null
  };
};

test('loads the YAML business calendar through data.json', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  const payload = await page.evaluate(async () => {
    const config = (window as Window & {
      RedmineCanvasGantt: { apiBase: string };
    }).RedmineCanvasGantt;
    const response = await window.fetch(`${config.apiBase}/data.json`);
    return { status: response.status, payload: await response.json() };
  });

  expect(payload.status).toBe(200);
  expect(payload.payload.businessCalendar.status).toBe('ok');
  expect(payload.payload.businessCalendar.defaultCalendarId).toBe('company-us');
  expect(payload.payload.businessCalendar.calendars['company-us'].days['2027-08-12']).toEqual({
    name: 'Company summer holiday',
    type: 'non_working'
  });
});

test('renders a YAML holiday in the day-view Gantt background', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const holiday = '2027-08-12';

  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  await page.getByRole('button', { name: 'Day', exact: true }).click();
  const backgroundCanvas = page.getByTestId('gantt-background-canvas');
  const nextMonth = page.getByRole('button', { name: /next month/i });

  for (let month = 0; month < 24; month += 1) {
    const renderedDays = await backgroundCanvas.getAttribute('data-business-calendar-non-working-days');
    if (renderedDays?.split(',').includes(holiday)) break;
    await nextMonth.click();
    await page.waitForTimeout(50);
  }

  await expect.poll(
    () => backgroundCanvas.getAttribute('data-business-calendar-non-working-days'),
    { timeout: 5_000 }
  ).toContain(holiday);
});

test('schedule mutation relation callbacks use the custom holiday calendar', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const holiday = '2027-08-12';
  const expectedSuccessorDate = '2027-08-13';

  await adminLogin(redmineBase, page);
  const predecessorId = await createIssue(
    page,
    `Calendar callback predecessor ${Date.now()}`,
    '2027-08-09',
    '2027-08-10'
  );
  const successorId = await createIssue(
    page,
    `Calendar callback successor ${Date.now()}`,
    '2027-08-11',
    '2027-08-11'
  );

  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await createPrecedesRelation(page, predecessorId, successorId);

  const predecessor = await fetchRestSchedule(page, predecessorId);
  const mutation = await scheduleMutation(page, `schedule:calendar-callback-${Date.now()}`, {
    taskId: predecessorId,
    baseRevision: predecessor.lockVersion,
    startDate: '2027-08-10',
    dueDate: '2027-08-11'
  });

  expect(mutation.status).toBe(200);
  expect((mutation.payload as { status?: string }).status).toBe('ok');

  const successorAfterMutation = await fetchRestSchedule(page, successorId);
  expect(successorAfterMutation.startDate).toBe(expectedSuccessorDate);
  expect(successorAfterMutation.dueDate).toBe(expectedSuccessorDate);

  const responseSuccessor = (mutation.payload as {
    entities?: Array<{ id?: number; start_date?: string; due_date?: string; lock_version?: number }>;
    revisions?: Record<string, number>;
  }).entities?.find((entity) => entity.id === successorId);
  expect(responseSuccessor).toMatchObject({
    id: successorId,
    start_date: expectedSuccessorDate,
    due_date: expectedSuccessorDate,
    lock_version: successorAfterMutation.lockVersion
  });
  expect((mutation.payload as { revisions?: Record<string, number> }).revisions?.[String(successorId)])
    .toBe(successorAfterMutation.lockVersion);

  await page.reload();
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  const canvasSuccessor = await fetchCanvasSchedule(page, successorId);
  expect(canvasSuccessor).toEqual({ startDate: expectedSuccessorDate, dueDate: expectedSuccessorDate });

  // Keep the fixture date visible in the test's intent; the expected value is
  // deliberately fixed rather than computed through a production calendar helper.
  expect(holiday).toBe('2027-08-12');
});
