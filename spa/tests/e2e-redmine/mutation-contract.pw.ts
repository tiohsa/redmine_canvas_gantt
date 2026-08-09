import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { adminLogin } from './helpers';

type CanvasConfig = {
  apiBase: string;
  authToken: string;
};

const uniqueName = (prefix: string) => `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
const restAuthorization = `Basic ${Buffer.from('admin:admin').toString('base64')}`;

const ensureCanvasGanttModuleEnabled = async (redmineBase: string, page: Page, projectIdentifier: string) => {
  await page.goto(`${redmineBase}/projects/${projectIdentifier}/settings/modules`);

  const moduleToggle = page.getByLabel('Canvas Gantt');
  await expect(moduleToggle).toBeVisible();

  if (!(await moduleToggle.isChecked())) {
    await moduleToggle.check();
    await page.getByRole('button', { name: /save|apply/i }).click();
  }
};

const ensureProject = async (page: Page, identifier: string, name: string, parentIdentifier?: string): Promise<number> => {
  const result = await page.evaluate(async ({ identifier, name, parentIdentifier, restAuthorization }) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: restAuthorization
    };
    const existing = await fetch(`/projects/${identifier}.json`, {
      headers
    });
    if (existing.ok) return { status: existing.status, payload: await existing.json().catch(() => ({})) };

    const parentProject = parentIdentifier
      ? await fetch(`/projects/${parentIdentifier}.json`, { headers })
      : null;
    const parentPayload = parentProject && parentProject.ok ? await parentProject.json().catch(() => ({})) : {};

    const response = await fetch('/projects.json', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project: {
          name,
          identifier,
          parent_id: (parentPayload as { project?: { id?: number } }).project?.id,
          enabled_module_names: ['issue_tracking', 'canvas_gantt'],
          tracker_ids: [1, 2, 3]
        }
      })
    });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  }, { identifier, name, parentIdentifier, restAuthorization });

  expect([200, 201]).toContain(result.status);
  const projectId = (result.payload as { project?: { id?: number } }).project?.id;
  expect(projectId).toEqual(expect.any(Number));
  return projectId!;
};

const createIssue = async (
  page: Page,
  projectIdentifier: string,
  fields: { subject: string; startDate?: string; dueDate?: string }
): Promise<number> => {
  const result = await page.evaluate(async ({ projectIdentifier, fields, restAuthorization }) => {
    const response = await fetch('/issues.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: restAuthorization
      },
      body: JSON.stringify({
        issue: {
          project_id: projectIdentifier,
          tracker_id: 1,
          subject: fields.subject,
          start_date: fields.startDate,
          due_date: fields.dueDate
        }
      })
    });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  }, { projectIdentifier, fields, restAuthorization });

  expect(result.status).toBe(201);
  const issueId = (result.payload as { issue?: { id?: number } }).issue?.id;
  expect(issueId).toEqual(expect.any(Number));
  return issueId!;
};

const createPrecedesRelation = async (page: Page, fromIssueId: number, toIssueId: number) => {
  const result = await page.evaluate(async ({ fromIssueId, toIssueId }) => {
    const config = (window as Window & { RedmineCanvasGantt: CanvasConfig & { authToken: string } }).RedmineCanvasGantt;
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

const loadCanvasPage = async (page: Page, redmineBase: string, projectIdentifier = 'ecookbook', query = '') => {
  await page.goto(`${redmineBase}/projects/${projectIdentifier}/canvas_gantt${query}`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
};

const enableAutoSave = async (page: Page) => {
  await page.getByTestId('display-settings-menu-button').click();
  const autoSave = page.getByLabel('Auto Save');
  if (!(await autoSave.isChecked())) await autoSave.check({ force: true });
  await expect(autoSave).toBeChecked();
};

const disableAutoSave = async (page: Page) => {
  await page.getByTestId('display-settings-menu-button').click();
  const autoSave = page.getByLabel('Auto Save');
  if (await autoSave.isChecked()) await autoSave.uncheck({ force: true });
  await expect(autoSave).not.toBeChecked();
};

const fetchRestIssue = async (page: Page, issueId: number): Promise<{
  subject: string;
  startDate: string | null;
  dueDate: string | null;
  projectId: number;
  statusId: number;
}> => {
  const result = await page.evaluate(async ({ issueId, restAuthorization }) => {
    const response = await fetch(`/issues/${issueId}.json`, {
      headers: {
        Accept: 'application/json',
        Authorization: restAuthorization
      }
    });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  }, { issueId, restAuthorization });

  expect(result.status).toBe(200);
  const issue = (result.payload as {
    issue?: {
      subject?: string;
      start_date?: string;
      due_date?: string;
      project?: { id?: number };
      status?: { id?: number };
    };
  }).issue;
  expect(issue).toBeTruthy();
  expect(issue?.project?.id).toEqual(expect.any(Number));
  expect(issue?.status?.id).toEqual(expect.any(Number));

  return {
    subject: issue!.subject ?? '',
    startDate: issue!.start_date ?? null,
    dueDate: issue!.due_date ?? null,
    projectId: issue!.project!.id!,
    statusId: issue!.status!.id!
  };
};

const updateIssueThroughRedmineRest = async (page: Page, issueId: number, fields: Record<string, unknown>) => {
  const result = await page.evaluate(async ({ issueId, fields, restAuthorization }) => {
    const response = await fetch(`/issues/${issueId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: restAuthorization
      },
      body: JSON.stringify({ issue: fields })
    });
    return { status: response.status, body: await response.text() };
  }, { issueId, fields, restAuthorization });

  expect([200, 204]).toContain(result.status);
};

const patchIssueThroughPlugin = async (
  page: Page,
  issueId: number,
  task: Record<string, unknown>
): Promise<{ status: number; payload: unknown }> => page.evaluate(async ({ issueId, task }) => {
  const config = (window as Window & {
    RedmineCanvasGantt: CanvasConfig;
  }).RedmineCanvasGantt;
  const response = await fetch(`${config.apiBase}/tasks/${issueId}.json`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': config.authToken,
      Accept: 'application/json'
    },
    body: JSON.stringify({ task })
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}, { issueId, task });

test('real Redmine optimistic-lock conflict is terminal for the stale plugin mutation', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');

  const originalSubject = uniqueName('Canvas Gantt stale conflict');
  const remoteSubject = `${originalSubject} remote`;
  const localSubject = `${originalSubject} local`;
  const issueId = await createIssue(page, 'ecookbook', {
    subject: originalSubject,
    startDate: '2027-08-10',
    dueDate: '2027-08-11'
  });

  await loadCanvasPage(page, redmineBase);
  await updateIssueThroughRedmineRest(page, issueId, { subject: remoteSubject });

  const staleMutation = await patchIssueThroughPlugin(page, issueId, {
    subject: localSubject,
    lock_version: 1
  });

  expect(staleMutation.status).toBe(409);
  const after = await fetchRestIssue(page, issueId);
  expect(after.subject).toBe(remoteSubject);
  expect(after.subject).not.toBe(localSubject);
});

test('linked downstream shift does not publish a self-induced conflict', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');

  const originId = await createIssue(page, 'ecookbook', {
    subject: uniqueName('Canvas Gantt linked origin')
  });
  const downstreamId = await createIssue(page, 'ecookbook', {
    subject: uniqueName('Canvas Gantt linked downstream')
  });

  await loadCanvasPage(page, redmineBase, 'ecookbook');
  await createPrecedesRelation(page, originId, downstreamId);
  await updateIssueThroughRedmineRest(page, originId, {
    start_date: '2027-08-10',
    due_date: '2027-08-12'
  });
  await loadCanvasPage(page, redmineBase, 'ecookbook', '?sort=id:desc');
  const downstreamBefore = await fetchRestIssue(page, downstreamId);
  expect(downstreamBefore.startDate).not.toBeNull();

  await page.getByTestId('relation-settings-menu-button').click();
  await page.getByTestId('auto-schedule-move-mode-select').selectOption('linked_downstream_shift');
  await page.getByTestId('relation-settings-menu').getByRole('button', { name: /save/i }).click();
  await page.getByTestId('display-settings-menu-button').click();
  const autoSave = page.getByLabel('Auto Save');
  if (!(await autoSave.isChecked())) await autoSave.check({ force: true });
  await expect(autoSave).toBeChecked();

  const originRow = page.getByTestId(`task-row-${originId}`);
  const mutationStatuses: number[] = [];
  page.on('response', (response) => {
    if (response.request().method() === 'PATCH' && response.url().includes('/tasks/')) {
      mutationStatuses.push(response.status());
    }
  });
  await originRow.dispatchEvent('click');
  await originRow.dispatchEvent('mousemove');
  const startHandle = page.getByTestId(`task-resize-handle-start-${originId}`);
  const endHandle = page.getByTestId(`task-resize-handle-end-${originId}`);
  await expect(startHandle).toBeVisible();
  await expect(endHandle).toBeVisible();
  const startBox = await startHandle.boundingBox();
  const endBox = await endHandle.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  const x = ((startBox!.x + startBox!.width / 2) + (endBox!.x + endBox!.width / 2)) / 2;
  const y = startBox!.y + startBox!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => mutationStatuses.length).toBeGreaterThan(0);
  await expect(page.getByTestId(`task-conflict-${originId}`)).toHaveCount(0);
  await expect(page.getByTestId(`task-conflict-${downstreamId}`)).toHaveCount(0);
  await expect.poll(async () => {
    const task = await fetchRestIssue(page, downstreamId);
    return { startDate: task.startDate, dueDate: task.dueDate };
  }).not.toEqual({ startDate: downstreamBefore.startDate, dueDate: downstreamBefore.dueDate });
  const downstreamAfter = await fetchRestIssue(page, downstreamId);
  const originAfter = await fetchRestIssue(page, originId);
  expect(originAfter.startDate).not.toBeNull();
  expect(originAfter.dueDate).not.toBeNull();

  await page.reload();
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  await expect(page.getByTestId(`task-conflict-${originId}`)).toHaveCount(0);
  await expect(page.getByTestId(`task-conflict-${downstreamId}`)).toHaveCount(0);
  await expect(fetchRestIssue(page, downstreamId)).resolves.toMatchObject({
    startDate: downstreamAfter.startDate,
    dueDate: downstreamAfter.dueDate
  });
});

test('two independent Canvas sessions preserve the first saved remote edit after a real 409', async ({ browser, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const setupContext = await browser.newContext();
  const sessionA = await browser.newContext();
  const sessionB = await browser.newContext();

  try {
    const setupPage = await setupContext.newPage();
    await adminLogin(redmineBase, setupPage);
    await ensureCanvasGanttModuleEnabled(redmineBase, setupPage, 'ecookbook');

    const originalSubject = uniqueName('Canvas Gantt two-session conflict');
    const subjectA = `${originalSubject} session A`;
    const subjectB = `${originalSubject} session B`;
    const issueId = await createIssue(setupPage, 'ecookbook', {
      subject: originalSubject,
      startDate: '2027-08-10',
      dueDate: '2027-08-11'
    });

    const pageA = await sessionA.newPage();
    const pageB = await sessionB.newPage();
    await adminLogin(redmineBase, pageA);
    await adminLogin(redmineBase, pageB);
    await loadCanvasPage(pageA, redmineBase);
    await loadCanvasPage(pageB, redmineBase);

    const savedByB = await patchIssueThroughPlugin(pageB, issueId, {
      subject: subjectB,
      lock_version: 1
    });
    expect(savedByB.status).toBe(200);

    const staleByA = await patchIssueThroughPlugin(pageA, issueId, {
      subject: subjectA,
      lock_version: 1
    });
    expect(staleByA.status).toBe(409);

    const after = await fetchRestIssue(setupPage, issueId);
    expect(after.subject).toBe(subjectB);
    expect(after.subject).not.toBe(subjectA);
  } finally {
    await sessionB.close();
    await sessionA.close();
    await setupContext.close();
  }
});

test('sidebar inline status edit surfaces a real conflict without overwriting the remote issue', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');

  const originalSubject = uniqueName('Canvas Gantt inline conflict');
  const remoteSubject = `${originalSubject} remote`;
  const issueId = await createIssue(page, 'ecookbook', {
    subject: originalSubject,
    startDate: '2027-08-10',
    dueDate: '2027-08-11'
  });

  await loadCanvasPage(page, redmineBase, 'ecookbook', '?sort=id:desc');
  await enableAutoSave(page);

  const statusCell = page.getByTestId(`cell-${issueId}-status`);
  await expect(statusCell).toBeVisible();

  await updateIssueThroughRedmineRest(page, issueId, { subject: remoteSubject });

  await statusCell.dblclick();
  const statusSelect = statusCell.locator('select');
  await expect(statusSelect).toBeVisible();
  const nextStatus = await statusSelect.evaluate((select) => {
    const current = (select as HTMLSelectElement).value;
    const option = Array.from((select as HTMLSelectElement).options).find((candidate) => candidate.value !== current);
    return option?.value ?? '';
  });
  expect(nextStatus).not.toBe('');
  await statusSelect.selectOption(nextStatus);

  const conflictPanel = page.getByTestId(`task-conflict-${issueId}`);
  await expect(conflictPanel).toBeVisible();
  const after = await fetchRestIssue(page, issueId);
  expect(after.subject).toBe(remoteSubject);

  await page.getByTestId(`conflict-use-remote-${issueId}`).click();
  await expect(conflictPanel).toHaveCount(0);
  const afterUseRemote = await fetchRestIssue(page, issueId);
  expect(afterUseRemote.subject).toBe(remoteSubject);
});

test('sidebar inline status edit keep-local retry persists the local status after a real conflict', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');
  const pluginPatchBodies: Array<Record<string, unknown>> = [];
  const pluginPatchStatuses: number[] = [];

  const originalSubject = uniqueName('Canvas Gantt keep local conflict');
  const remoteSubject = `${originalSubject} remote`;
  const issueId = await createIssue(page, 'ecookbook', {
    subject: originalSubject,
    startDate: '2027-08-10',
    dueDate: '2027-08-11'
  });

  await loadCanvasPage(page, redmineBase, 'ecookbook', '?sort=id:desc');
  await enableAutoSave(page);
  page.on('request', (request) => {
    if (request.method() !== 'PATCH' || !request.url().includes(`/tasks/${issueId}.json`)) return;
    const body = request.postDataJSON() as { task?: Record<string, unknown> } | null;
    if (body?.task) pluginPatchBodies.push(body.task);
  });
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() !== 'PATCH' || !request.url().includes(`/tasks/${issueId}.json`)) return;
    pluginPatchStatuses.push(response.status());
  });
  const before = await fetchRestIssue(page, issueId);

  const statusCell = page.getByTestId(`cell-${issueId}-status`);
  await expect(statusCell).toBeVisible();

  await updateIssueThroughRedmineRest(page, issueId, { subject: remoteSubject });

  await statusCell.dblclick();
  const statusSelect = statusCell.locator('select');
  await expect(statusSelect).toBeVisible();
  const nextStatus = await statusSelect.evaluate((select) => {
    const current = (select as HTMLSelectElement).value;
    const option = Array.from((select as HTMLSelectElement).options).find((candidate) => candidate.value !== current);
    return option?.value ?? '';
  });
  expect(nextStatus).not.toBe('');
  expect(Number(nextStatus)).not.toBe(before.statusId);
  await statusSelect.selectOption(nextStatus);

  const conflictPanel = page.getByTestId(`task-conflict-${issueId}`);
  await expect(conflictPanel).toBeVisible();
  const staleRequestCount = pluginPatchBodies.length;
  const staleResponseCount = pluginPatchStatuses.length;
  await page.getByTestId(`conflict-keep-local-${issueId}`).click();
  await expect.poll(() => pluginPatchBodies.length).toBeGreaterThan(staleRequestCount);
  const keepLocalRetryBody = pluginPatchBodies[staleRequestCount];
  expect(keepLocalRetryBody).toEqual(expect.objectContaining({
    status_id: Number(nextStatus),
    lock_version: expect.any(Number)
  }));
  expect(Number(keepLocalRetryBody?.lock_version)).toBeGreaterThan(1);
  await expect.poll(() => pluginPatchStatuses.length).toBeGreaterThan(staleResponseCount);
  expect(pluginPatchStatuses.slice(staleResponseCount)).toContain(200);
  await expect(conflictPanel).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByText('Loading Canvas Gantt...')).toHaveCount(0);
  const afterKeepLocal = await fetchRestIssue(page, issueId);
  expect(afterKeepLocal.subject).toBe(remoteSubject);
  expect(afterKeepLocal.statusId).toBe(Number(nextStatus));
});

test('Auto Save OFF defers the inline mutation until the manual Save action', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');

  const issueId = await createIssue(page, 'ecookbook', {
    subject: uniqueName('Canvas Gantt manual save')
  });

  await loadCanvasPage(page, redmineBase, 'ecookbook', '?sort=id:desc');
  await disableAutoSave(page);

  const before = await fetchRestIssue(page, issueId);
  const pluginPatchStatuses: number[] = [];
  page.on('response', (response) => {
    if (response.request().method() === 'PATCH' && response.url().includes(`/tasks/${issueId}.json`)) {
      pluginPatchStatuses.push(response.status());
    }
  });

  const statusCell = page.getByTestId(`cell-${issueId}-status`);
  await expect(statusCell).toBeVisible();
  await statusCell.dblclick();
  const statusSelect = statusCell.locator('select');
  await expect(statusSelect).toBeVisible();
  const nextStatus = await statusSelect.evaluate((select) => {
    const current = (select as HTMLSelectElement).value;
    const option = Array.from((select as HTMLSelectElement).options).find((candidate) => candidate.value !== current);
    return option?.value ?? '';
  });
  expect(nextStatus).not.toBe('');
  await statusSelect.selectOption(nextStatus);

  const saveButton = page.getByTitle('Save changes');
  await expect(saveButton).toBeVisible();
  expect(pluginPatchStatuses).toHaveLength(0);
  const beforeManualSave = await fetchRestIssue(page, issueId);
  expect(beforeManualSave.statusId).toBe(before.statusId);

  await saveButton.click();
  await expect.poll(() => pluginPatchStatuses.length).toBeGreaterThan(0);
  expect(pluginPatchStatuses).toContain(200);
  const afterManualSave = await fetchRestIssue(page, issueId);
  expect(afterManualSave.statusId).toBe(Number(nextStatus));
});

test('plugin task mutation returns not_found for an issue outside the current Redmine scope', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');
  await loadCanvasPage(page, redmineBase);

  const missingIssueId = 999_999_999;
  const result = await patchIssueThroughPlugin(page, missingIssueId, {
    subject: uniqueName('Canvas Gantt missing task'),
    lock_version: 1
  });

  expect(result.status).toBe(404);
  expect(result.payload).toEqual(expect.objectContaining({
    error: expect.any(String)
  }));
});

test('plugin task mutation rejects a non-working-day interval that would invert dates', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');

  const issueId = await createIssue(page, 'ecookbook', {
    subject: uniqueName('Canvas Gantt invalid interval'),
    startDate: '2027-01-04',
    dueDate: '2027-01-06'
  });

  await loadCanvasPage(page, redmineBase);

  const result = await patchIssueThroughPlugin(page, issueId, {
    start_date: '2027-01-03',
    due_date: '2027-01-03',
    date_update_mode: 'direct_edit',
    lock_version: 1
  });

  expect(result.status).toBe(422);
  expect(result.payload).toEqual(expect.objectContaining({
    errors: expect.arrayContaining([expect.any(String)])
  }));

  const after = await fetchRestIssue(page, issueId);
  expect(after.startDate).toBe('2027-01-04');
  expect(after.dueDate).toBe('2027-01-06');
});

test('project move plus date update uses the destination project calendar', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);
  const destinationProjectId = await ensureProject(page, 'us-project', 'US Calendar Project', 'ecookbook');
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'ecookbook');
  await ensureCanvasGanttModuleEnabled(redmineBase, page, 'us-project');

  const issueId = await createIssue(page, 'ecookbook', {
    subject: uniqueName('Canvas Gantt destination calendar'),
    startDate: '2027-07-02',
    dueDate: '2027-07-06'
  });

  await loadCanvasPage(page, redmineBase);

  const moveResult = await patchIssueThroughPlugin(page, issueId, {
    project_id: destinationProjectId,
    start_date: '2027-07-04',
    due_date: '2027-07-06',
    date_update_mode: 'project_move',
    lock_version: 1
  });

  expect(moveResult.status).toBe(200);

  const after = await fetchRestIssue(page, issueId);
  expect(after.projectId).toBe(destinationProjectId);
  expect(after.startDate).toBe('2027-07-05');
  expect(after.dueDate).toBe('2027-07-06');
});
