import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { adminLogin } from './helpers';

type CanvasConfig = {
  apiBase: string;
  authToken: string;
  nonWorkingWeekDays: number[];
};

type BusinessCalendarApiPayload = {
  status: string;
  defaultCalendarId: string;
  projectCalendarIds: Record<string, string>;
  calendars: Record<string, {
    id: string;
    name: string;
    nonWorkingWeekDays: number[];
    days: Record<string, { name: string; type: string }>;
  }>;
};

type CanvasDataApiPayload = Record<string, unknown> & {
  businessCalendar: BusinessCalendarApiPayload;
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

const pinCalendarTestTime = async (page: Page) => {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+09:00'));
};

const showHolidayInDayView = async (page: Page, holiday: string) => {
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  const backgroundCanvas = page.getByTestId('gantt-background-canvas');
  const nextMonth = page.getByRole('button', { name: /next month/i });

  for (let month = 0; month < 24; month += 1) {
    const renderedDays = await backgroundCanvas.getAttribute('data-business-calendar-non-working-days');
    if (renderedDays?.split(',').includes(holiday)) break;
    await nextMonth.click();
    await expect.poll(
      () => backgroundCanvas.getAttribute('data-business-calendar-non-working-days')
    ).not.toBe(renderedDays);
  }

  await expect.poll(
    () => backgroundCanvas.getAttribute('data-business-calendar-non-working-days'),
    { timeout: 5_000 }
  ).toContain(holiday);
};

const expectCsvModeCalendar = (
  payload: CanvasDataApiPayload,
  originalProjectIds: string[],
  nonWorkingWeekDays: number[],
  holiday: string
) => {
  const calendar = payload.businessCalendar;
  expect(calendar.status).toBe('ok');
  expect(calendar.defaultCalendarId).toBe('global');
  expect(calendar.calendars.global.id).toBe('global');
  expect(calendar.calendars.global.nonWorkingWeekDays).toEqual(nonWorkingWeekDays);
  expect(Object.keys(calendar.projectCalendarIds).sort()).toEqual([...originalProjectIds].sort());
  expect(Object.values(calendar.projectCalendarIds).every((calendarId) => calendarId === 'global')).toBe(true);
  expect(calendar.calendars.global.days[holiday]).toEqual({ name: 'Holiday', type: 'non_working' });
};

const normalizeConfiguredWeekDays = (value: unknown): number[] => {
  expect(Array.isArray(value)).toBe(true);
  const weekDays = value as unknown[];
  expect(weekDays.every((day) => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6)).toBe(true);
  return [...new Set(weekDays as number[])].sort((left, right) => left - right);
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

test('keeps the calendar validation banner through fallback and stale states, then clears it after recovery', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);

  let validationStatus: 'invalid' | 'stale' | 'valid' = 'invalid';
  try {
    await page.route('**/canvas_gantt/data.json**', async (route) => {
      const responseValidationStatus = validationStatus;
      const response = await route.fetch();
      const data = await response.json() as Record<string, unknown> & { businessCalendar: Record<string, unknown> };
      const message = responseValidationStatus === 'stale'
        ? 'The last valid calendar is still in use.'
        : 'Redmine weekdays are being used as a fallback.';
      data.businessCalendar = {
        ...data.businessCalendar,
        status: responseValidationStatus === 'invalid' ? 'error' : 'ok',
        validationStatus: responseValidationStatus,
        validationMessage: responseValidationStatus === 'valid' ? null : message,
        diagnostic: responseValidationStatus === 'valid' ? null : {
          code: 'INVALID_DATE', file: 'holiday.csv', line: 2,
          message: 'A calendar date is invalid.', cause: 'Date is invalid.', value: '2027/2/30'
        }
      };
      await route.fulfill({ response, json: data });
    });

    const expectCalendarResponse = async (
      expectedStatus: 'invalid' | 'stale' | 'valid',
      trigger: () => Promise<unknown>
    ) => {
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === 'GET' && url.pathname.endsWith('/canvas_gantt/data.json');
      });
      await trigger();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const data = await response.json() as { businessCalendar?: { validationStatus?: string } };
      expect(data.businessCalendar?.validationStatus).toBe(expectedStatus);
    };

    await expectCalendarResponse('invalid', () => page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`));
    const banner = page.getByRole('alert');
    await expect(banner).toContainText('Redmine weekdays are being used as a fallback.');
    await expect(banner).toContainText('holiday.csv:2');

    await page.waitForTimeout(4_000);
    await expect(banner).toBeVisible();

    validationStatus = 'stale';
    await expectCalendarResponse('stale', () => page.reload());
    await expect(page.getByRole('alert')).toContainText('The last valid calendar is still in use.');

    validationStatus = 'valid';
    await expectCalendarResponse('valid', () => page.reload());
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('keeps clean toolbar controls from overlapping at the standard viewport', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';

  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  const controls = [
    page.getByTestId('display-settings-menu-button'),
    page.getByRole('button', { name: /previous month/i }),
    page.getByRole('button', { name: /next month/i }),
    page.getByRole('button', { name: 'Today' })
  ];
  for (const control of controls) await expect(control).toBeVisible();

  const boxes = await Promise.all(controls.map(control => control.boundingBox()));
  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    expect(boxes[firstIndex]).not.toBeNull();
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      expect(boxes[secondIndex]).not.toBeNull();
      const first = boxes[firstIndex]!;
      const second = boxes[secondIndex]!;
      const overlaps = first.x < second.x + second.width
        && first.x + first.width > second.x
        && first.y < second.y + second.height
        && first.y + first.height > second.y;
      expect(overlaps, `toolbar controls ${firstIndex} and ${secondIndex} overlap`).toBe(false);
    }
  }
});

test('renders a YAML holiday in the day-view Gantt background', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const holiday = '2027-08-12';

  await pinCalendarTestTime(page);
  await adminLogin(redmineBase, page);
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  await showHolidayInDayView(page, holiday);
});

// The UI route uses the server's YAML-backed data response, replacing only businessCalendar with a CSV-equivalent payload.
// Actual CSV loading is covered by the Ruby Loader → Resolver specs.
test('renders the CSV-equivalent payload in the day-view Gantt background', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const holiday = '2027-02-11';
  const originalPayloadContextBySearch = new Map<string, { projectIds: string[]; nonWorkingWeekDays: number[] }>();

  await pinCalendarTestTime(page);
  await page.route((url) => url.pathname.endsWith('/data.json'), async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as CanvasDataApiPayload;
    const originalCalendar = payload.businessCalendar;
    const requestUrl = new URL(route.request().url());
    const originalProjectIds = Object.keys(originalCalendar.projectCalendarIds);
    const configuredWeekDays = await page.evaluate(() => (
      (window as Window & { RedmineCanvasGantt: CanvasConfig }).RedmineCanvasGantt.nonWorkingWeekDays
    ));
    const nonWorkingWeekDays = normalizeConfiguredWeekDays(configuredWeekDays);
    originalPayloadContextBySearch.set(requestUrl.search, { projectIds: originalProjectIds, nonWorkingWeekDays });
    await route.fulfill({
      response,
      json: {
        ...payload,
        businessCalendar: {
          status: 'ok',
          revision: 'csv-equivalent-ui-fixture',
          defaultCalendarId: 'global',
          projectCalendarIds: Object.fromEntries(originalProjectIds.map((projectId) => [projectId, 'global'])),
          calendars: {
            global: {
              id: 'global',
              name: 'Global holidays',
              nonWorkingWeekDays,
              days: { [holiday]: { name: 'Holiday', type: 'non_working' } }
            }
          },
          warnings: []
        }
      }
    });
  });

  await adminLogin(redmineBase, page);
  const firstDataResponsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith('/data.json')
  ));
  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();

  const firstDataResponse = await firstDataResponsePromise;
  expect(firstDataResponse.status()).toBe(200);
  const firstPayload = await firstDataResponse.json() as CanvasDataApiPayload;
  const firstSearch = new URL(firstDataResponse.url()).search;
  const firstOriginalContext = originalPayloadContextBySearch.get(firstSearch);
  expect(firstOriginalContext).toBeDefined();
  expectCsvModeCalendar(
    firstPayload,
    firstOriginalContext?.projectIds ?? [],
    firstOriginalContext?.nonWorkingWeekDays ?? [],
    holiday
  );

  const queryPayload = await page.evaluate(async () => {
    const config = (window as Window & {
      RedmineCanvasGantt: { apiBase: string };
    }).RedmineCanvasGantt;
    const response = await window.fetch(`${config.apiBase}/data.json?group_by=none`);
    return {
      status: response.status,
      search: new URL(response.url).search,
      payload: await response.json()
    };
  });
  expect(queryPayload.status).toBe(200);
  const queryOriginalContext = originalPayloadContextBySearch.get(queryPayload.search);
  expect(queryOriginalContext).toBeDefined();
  expectCsvModeCalendar(
    queryPayload.payload as CanvasDataApiPayload,
    queryOriginalContext?.projectIds ?? [],
    queryOriginalContext?.nonWorkingWeekDays ?? [],
    holiday
  );

  await showHolidayInDayView(page, holiday);
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
