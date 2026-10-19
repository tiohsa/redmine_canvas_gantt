import { expect, test, type Page } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

const baselineSnapshot = {
  snapshot_id: 'baseline-snapshot-1',
  project_id: 1,
  captured_at: '2026-10-17T10:30:00Z',
  captured_by_id: 1,
  captured_by_name: 'Test User',
  scope: 'filtered',
  tasks_by_issue_id: {
    '101': {
      issue_id: 101,
      baseline_start_date: '2026-10-01',
      baseline_due_date: '2026-10-05',
    },
  },
};

const installBaselineData = async (
  page: Page,
  editable: boolean | (() => boolean),
  snapshot: () => typeof baselineSnapshot = () => baselineSnapshot,
) => {
  await page.route('**/canvas_gantt/data.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...defaultMockData,
        permissions: {
          ...defaultMockData.permissions,
          baseline_editable: typeof editable === 'function' ? editable() : editable,
        },
        baseline: snapshot(),
      }),
    });
  });
};

const routeIssuePages = async (page: Page) => {
  await page.route('**/issues/101', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="content" style="height:1200px"><h2>Issue #101</h2><a href="/issues/101/time_entries/new">Log time</a></main></body></html>',
    });
  });
  await page.route('**/issues/101/time_entries/new', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="content" style="height:120px"><form id="new_time_entry"><input name="time_entry[hours]" value="1"></form></main></body></html>',
    });
  });
};

const openIssueDialog = async (page: Page) => {
  await page.getByRole('link', { name: defaultMockData.tasks[0].subject, exact: true }).dispatchEvent('click');
  await expect(page.getByTestId('issue-dialog-header')).toBeVisible();
  await expect(page.frameLocator('iframe').locator('h2')).toHaveText('Issue #101');
};

const openBaselineDeleteDialog = async (page: Page) => {
  await page.getByTestId('baseline-save-menu-button').click();
  await page.getByTestId('baseline-delete-button').click();
  return page.getByRole('alertdialog');
};

test.describe('issue dialog display settings', () => {
  test('uses defaults, persists preferences, shares them globally, and resets them', async ({ page }) => {
    await setupMockApp(page);
    await waitForInitialRender(page);
    await page.getByTestId('display-settings-menu-button').click();

    const width = page.getByTestId('issue-dialog-width-select');
    const heightMode = page.getByTestId('issue-dialog-height-mode-select');
    const heightPercent = page.getByTestId('issue-dialog-height-percent-select');
    await expect(width).toHaveValue('1200');
    await expect(heightMode).toHaveValue('auto');
    await expect(heightPercent).toHaveValue('80');

    await width.selectOption('900');
    await heightMode.selectOption('fixed');
    await heightPercent.selectOption('65');
    await page.reload();
    await waitForInitialRender(page);
    await page.getByTestId('display-settings-menu-button').click();
    await expect(page.getByTestId('issue-dialog-width-select')).toHaveValue('900');
    await expect(page.getByTestId('issue-dialog-height-mode-select')).toHaveValue('fixed');
    await expect(page.getByTestId('issue-dialog-height-percent-select')).toHaveValue('65');

    await page.getByRole('switch', { name: 'Share settings across all projects' }).click();
    await page.getByTestId('issue-dialog-width-select').selectOption('1500');
    const projectPreferences = await page.evaluate(async () => {
      const { loadDisplayPreferences } = await import('/src/utils/preferences.ts');
      return loadDisplayPreferences('2');
    });
    expect(projectPreferences).toMatchObject({
      issueDialogWidthPx: 1500,
      issueDialogHeightMode: 'fixed',
      issueDialogHeightPercent: 65,
    });

    await page.getByTestId('issue-dialog-size-reset').click();
    await expect(page.getByTestId('issue-dialog-width-select')).toHaveValue('1200');
    await expect(page.getByTestId('issue-dialog-height-mode-select')).toHaveValue('auto');
    await expect(page.getByTestId('issue-dialog-height-percent-select')).toHaveValue('80');
  });

  test('applies fixed issue dimensions and returns to automatic sizing after routing into Time Entry', async ({ page }) => {
    await routeIssuePages(page);
    await setupMockApp(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForInitialRender(page);
    await page.getByTestId('display-settings-menu-button').click();
    await page.getByTestId('issue-dialog-width-select').selectOption('900');
    await page.getByTestId('issue-dialog-height-mode-select').selectOption('fixed');
    await page.getByTestId('issue-dialog-height-percent-select').selectOption('80');

    await openIssueDialog(page);
    const panel = page.getByTestId('issue-dialog-panel');
    await expect(panel).toHaveAttribute('data-dialog-size-target', 'issue');
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(900);
    await expect.poll(async () => (await panel.boundingBox())?.height).toBe(720);

    const fixedHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
    const issueContent = page.frameLocator('iframe').locator('#content');
    await issueContent.evaluate((element) => { (element as HTMLElement).style.height = '1600px'; });
    await expect.poll(async () => (await panel.boundingBox())?.height).toBe(fixedHeight);

    await page.evaluate(async () => {
      const { useUIStore } = await import('/src/stores/UIStore.ts');
      useUIStore.getState().setIssueDialogHeightMode('auto');
    });
    await expect.poll(async () => (await panel.boundingBox())?.height).toBe(810);
    await issueContent.evaluate((element) => { (element as HTMLElement).style.height = '120px'; });
    await expect.poll(async () => (await panel.boundingBox())?.height).toBe(600);

    await page.frameLocator('iframe').getByRole('link', { name: 'Log time' }).click();
    await expect(panel).toHaveAttribute('data-dialog-size-target', 'time-entry');
    await expect.poll(async () => (await panel.boundingBox())?.height).toBeLessThan(600);
  });

  test('keeps a configured wide issue dialog within a narrow viewport', async ({ page }) => {
    await routeIssuePages(page);
    await setupMockApp(page, { preferences: { issueDialogWidthPx: 1500 } });
    await page.setViewportSize({ width: 375, height: 760 });
    await waitForInitialRender(page);
    await openIssueDialog(page);

    const panel = page.getByTestId('issue-dialog-panel');
    const bounds = await panel.boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.width).toBeLessThanOrEqual(375 * 0.98 + 1);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('baseline deletion', () => {
  test('hides deletion from viewers and lets an editor cancel without sending DELETE', async ({ page }) => {
    let editable = false;
    await setupMockApp(page);
    await installBaselineData(page, () => editable);
    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);

    editable = true;
    await page.reload();
    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    const deleteRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().includes('/canvas_gantt/baseline.json')) {
        deleteRequests.push(request.url());
      }
    });
    await page.getByTestId('baseline-delete-cancel-button').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(deleteRequests).toEqual([]);
  });

  test('deletes only the confirmed snapshot and clears it after success', async ({ page }) => {
    const payloads: unknown[] = [];
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      payloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', completeness: 'complete', baseline: null, deleted_snapshot_id: baselineSnapshot.snapshot_id }),
      });
    });

    await waitForInitialRender(page);
    const dialog = await openBaselineDeleteDialog(page);
    await expect(dialog).toContainText('Test User');
    await expect(dialog).toContainText('Filtered view');
    await page.getByTestId('baseline-delete-confirm-button').click();
    await expect.poll(() => payloads).toEqual([{ snapshot_id: baselineSnapshot.snapshot_id }]);
    await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);
  });

  test('keeps long confirmation metadata usable on a narrow short viewport with keyboard focus guards', async ({ page }) => {
    const longName = 'SaverNameWithoutAnySpaces'.repeat(8);
    await setupMockApp(page);
    await installBaselineData(page, true, () => ({ ...baselineSnapshot, captured_by_name: longName }));
    await page.setViewportSize({ width: 375, height: 320 });
    await waitForInitialRender(page);
    await page.evaluate(() => {
      const config = (window as Window & { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt;
      if (config?.i18n) config.i18n.label_baseline_delete_irreversible = 'この操作は取り消せません。'.repeat(20);
    });
    const dialog = await openBaselineDeleteDialog(page);
    const dialogBox = await dialog.boundingBox();
    const metrics = await dialog.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      whiteSpace: getComputedStyle(element).whiteSpace,
      overflowWrap: getComputedStyle(element).overflowWrap,
    }));
    expect(dialogBox).toBeTruthy();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(320);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.whiteSpace).toBe('normal');
    expect(metrics.overflowWrap).toBe('anywhere');
    await expect(dialog).toContainText(longName);
    await expect(dialog).toContainText('この操作は取り消せません。'.repeat(20));

    const cancel = page.getByTestId('baseline-delete-cancel-button');
    const confirm = page.getByTestId('baseline-delete-confirm-button');
    await cancel.focus();
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('refreshes a changed snapshot after conflict and never retries the old ID', async ({ page }) => {
    let serverSnapshot = baselineSnapshot;
    const updatedSnapshot = { ...baselineSnapshot, snapshot_id: 'baseline-snapshot-2', captured_by_name: 'Updated User' };
    const payloads: Array<{ snapshot_id?: string }> = [];
    await setupMockApp(page);
    await installBaselineData(page, true, () => serverSnapshot);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      const payload = route.request().postDataJSON() as { snapshot_id?: string };
      payloads.push(payload);
      serverSnapshot = updatedSnapshot;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The baseline was updated by another user.' }) });
    });
    await waitForInitialRender(page);
    await openBaselineDeleteDialog(page);
    await page.getByTestId('baseline-delete-confirm-button').click();
    await expect(page.getByText('The baseline was updated by another user.')).toBeVisible();
    expect(payloads).toEqual([{ snapshot_id: baselineSnapshot.snapshot_id }]);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await expect(page.getByRole('alertdialog')).toContainText('Updated User');
    expect(payloads).toHaveLength(1);
  });

  test('does not issue a second DELETE while the first request is pending', async ({ page }) => {
    let finishDelete: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { finishDelete = resolve; });
    let deleteCount = 0;
    let started: (() => void) | undefined;
    const deleteStarted = new Promise<void>((resolve) => { started = resolve; });
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCount += 1;
      started?.();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', completeness: 'complete', baseline: null, deleted_snapshot_id: baselineSnapshot.snapshot_id }),
      });
    });

    try {
      await waitForInitialRender(page);
      await openBaselineDeleteDialog(page);
      const confirm = page.getByTestId('baseline-delete-confirm-button');
      await confirm.click();
      await deleteStarted;
      await confirm.dispatchEvent('click');
      await expect(confirm).toBeDisabled();
      expect(deleteCount).toBe(1);
      finishDelete();
      await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);
      expect(deleteCount).toBe(1);
    } finally {
      finishDelete?.();
    }
  });

  test('reconciles a network failure by refreshing without retrying DELETE', async ({ page }) => {
    let deleteCount = 0;
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCount += 1;
      await route.abort('failed');
    });
    await waitForInitialRender(page);
    await openBaselineDeleteDialog(page);
    await page.getByTestId('baseline-delete-confirm-button').click();
    await expect(page.getByText('Could not confirm whether the baseline was deleted.')).toBeVisible();
    expect(deleteCount).toBe(1);
    await page.getByTestId('baseline-save-menu-button').click();
    await expect(page.getByTestId('baseline-delete-button')).toBeVisible();
    expect(deleteCount).toBe(1);
  });

  test('releases the dialog after DELETE and reconciliation timeouts while preserving the snapshot', async ({ page }) => {
    await page.clock.install();
    await setupMockApp(page);
    await installBaselineData(page, true);

    let deleteCount = 0;
    let deleteRequested = false;
    let finishDeleteRoute: (() => void) | undefined;
    let startDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => { startDelete = resolve; });
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCount += 1;
      deleteRequested = true;
      startDelete();
      await new Promise<void>((resolve) => { finishDeleteRoute = resolve; });
    });

    let finishRefreshRoute: (() => void) | undefined;
    let refreshBlocked = false;
    let startRefresh!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { startRefresh = resolve; });
    await page.route('**/canvas_gantt/data.json**', async (route) => {
      if (!deleteRequested || refreshBlocked) return route.fallback();
      refreshBlocked = true;
      startRefresh();
      await new Promise<void>((resolve) => { finishRefreshRoute = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...defaultMockData, baseline: baselineSnapshot }),
      });
    });

    try {
      await waitForInitialRender(page);
      await openBaselineDeleteDialog(page);
      await page.getByTestId('baseline-delete-confirm-button').click();
      await deleteStarted;

      await page.clock.fastForward(15_000);
      await refreshStarted;
      await page.clock.fastForward(10_000);

      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(page.getByText('Could not confirm whether the baseline was deleted.')).toBeVisible();
      const baselineState = await page.evaluate(async () => {
        const { useBaselineStore } = await import('/src/stores/BaselineStore.ts');
        const { snapshot, hasBaseline } = useBaselineStore.getState();
        return { snapshotId: snapshot?.snapshotId, hasBaseline };
      });
      expect(baselineState).toEqual({ snapshotId: baselineSnapshot.snapshot_id, hasBaseline: true });
      expect(deleteCount).toBe(1);

      await page.getByTestId('baseline-save-menu-button').click();
      await expect(page.getByTestId('baseline-delete-button')).toBeVisible();
    } finally {
      finishDeleteRoute?.();
      finishRefreshRoute?.();
    }
  });

  test('refreshes server state after a 5xx unknown result without resending DELETE', async ({ page }) => {
    let serverSnapshot = baselineSnapshot;
    const updatedSnapshot = { ...baselineSnapshot, snapshot_id: 'baseline-snapshot-2', captured_by_name: 'Recovered User' };
    let deleteCount = 0;
    await setupMockApp(page);
    await installBaselineData(page, true, () => serverSnapshot);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCount += 1;
      serverSnapshot = updatedSnapshot;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
    });
    await waitForInitialRender(page);
    await openBaselineDeleteDialog(page);
    await page.getByTestId('baseline-delete-confirm-button').click();
    await expect(page.getByText('Could not confirm whether the baseline was deleted.')).toBeVisible();
    expect(deleteCount).toBe(1);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await expect(page.getByRole('alertdialog')).toContainText('Recovered User');
    expect(deleteCount).toBe(1);
  });
});
