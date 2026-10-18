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

test.describe('issue dialog display settings', () => {
  test('applies the configured width and fixed height, then preserves the fixed size while iframe content changes', async ({ page }) => {
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
    await page.frameLocator('iframe').getByRole('link', { name: 'Log time' }).click();
    await expect(panel).toHaveAttribute('data-dialog-size-target', 'time-entry');
    await expect.poll(async () => (await panel.boundingBox())?.height).toBeLessThan(fixedHeight);
  });

  test('keeps a configured wide dialog within a narrow viewport', async ({ page }) => {
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
  test('hides deletion for viewers and lets an editor cancel without sending DELETE', async ({ page }) => {
    let baselineEditable = false;
    await setupMockApp(page);
    await installBaselineData(page, () => baselineEditable);
    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);

    baselineEditable = true;
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

  test('deletes only the confirmed snapshot ID and clears the baseline after success', async ({ page }) => {
    const deletePayloads: unknown[] = [];
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      deletePayloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          completeness: 'complete',
          baseline: null,
          deleted_snapshot_id: baselineSnapshot.snapshot_id,
        }),
      });
    });
    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await expect(page.getByRole('alertdialog', { name: 'Delete baseline' })).toBeVisible();
    await page.getByTestId('baseline-delete-confirm-button').click();

    await expect.poll(() => deletePayloads).toEqual([{ snapshot_id: baselineSnapshot.snapshot_id }]);
    await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);
  });

  test('wraps a long translated warning and unbroken saver name on a narrow viewport', async ({ page }) => {
    const longName = 'SaverNameWithoutAnySpaces'.repeat(8);
    await setupMockApp(page);
    await installBaselineData(page, true, () => ({ ...baselineSnapshot, captured_by_name: longName }));
    await page.setViewportSize({ width: 375, height: 760 });
    await waitForInitialRender(page);
    await page.evaluate(() => {
      const config = (window as Window & { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt;
      if (config?.i18n) {
        config.i18n.label_baseline_delete_irreversible = '翻訳済み警告文'.repeat(18);
      }
    });
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();

    const dialog = page.getByRole('alertdialog', { name: 'Delete baseline' });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const dialogBox = await dialog.boundingBox();
    const wrapping = await dialog.evaluate((element) => {
      const panel = element as HTMLElement;
      const saver = panel.querySelector('dd:nth-of-type(2)') as HTMLElement;
      const warning = panel.querySelector('#baseline-delete-warning') as HTMLElement;
      return {
        panelWhiteSpace: getComputedStyle(panel).whiteSpace,
        panelOverflowWrap: getComputedStyle(panel).overflowWrap,
        panelScrollWidth: panel.scrollWidth,
        panelClientWidth: panel.clientWidth,
        saverOverflowWrap: getComputedStyle(saver).overflowWrap,
        saverRight: saver.getBoundingClientRect().right,
        panelRight: panel.getBoundingClientRect().right,
        warningHeight: warning.getBoundingClientRect().height,
        warningLineHeight: Number.parseFloat(getComputedStyle(warning).lineHeight),
      };
    });

    expect(dialogBox).toBeTruthy();
    expect(dialogBox!.width).toBeLessThanOrEqual(375);
    expect(documentWidth).toBeLessThanOrEqual(375);
    expect(wrapping.panelWhiteSpace).toBe('normal');
    expect(wrapping.panelOverflowWrap).toBe('anywhere');
    expect(wrapping.panelScrollWidth).toBeLessThanOrEqual(wrapping.panelClientWidth);
    expect(wrapping.saverRight).toBeLessThanOrEqual(wrapping.panelRight);
    expect(wrapping.saverOverflowWrap).toBe('anywhere');
    expect(wrapping.warningHeight).toBeGreaterThan(wrapping.warningLineHeight * 2);
    await expect(dialog).toContainText(longName);
    await expect(dialog).toContainText('翻訳済み警告文'.repeat(18));
  });

  test('keeps a long Japanese confirmation inside short viewports and scrolls to both actions', async ({ page }) => {
    const longName = '保存者名'.repeat(24);
    await setupMockApp(page);
    await installBaselineData(page, true, () => ({ ...baselineSnapshot, captured_by_name: longName }));
    await waitForInitialRender(page);
    for (const viewport of [{ width: 1280, height: 320 }, { width: 375, height: 320 }]) {
      await page.setViewportSize(viewport);
      if (viewport.width !== 1280) await page.reload();
      await waitForInitialRender(page);
      await page.evaluate(() => {
        const config = (window as Window & { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt;
        if (config?.i18n) {
          config.i18n.label_baseline_delete_irreversible = 'この操作は取り消せません。'.repeat(20);
        }
      });
      await page.getByTestId('baseline-save-menu-button').click();
      await page.getByTestId('baseline-delete-button').click();

      const dialog = page.getByRole('alertdialog', { name: 'Delete baseline' });
      const panelBounds = await dialog.boundingBox();
      const scrollMetrics = await dialog.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        whiteSpace: getComputedStyle(element).whiteSpace,
      }));
      expect(panelBounds).toBeTruthy();
      expect(panelBounds!.y).toBeGreaterThanOrEqual(15);
      expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(viewport.height - 15);
      expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
      expect(scrollMetrics.overflowY).toBe('auto');
      expect(scrollMetrics.whiteSpace).toBe('normal');

      const panel = dialog;
      await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const cancel = page.getByTestId('baseline-delete-cancel-button');
      const confirm = page.getByTestId('baseline-delete-confirm-button');
      await expect(cancel).toBeVisible();
      await expect(confirm).toBeVisible();
      await confirm.click({ trial: true });
      await cancel.focus();
      await page.keyboard.press('Tab');
      await expect(confirm).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      await expect(dialog).toContainText(longName);
      await expect(dialog).toContainText('この操作は取り消せません。'.repeat(20));
      await cancel.click();
    }
  });

  test('refreshes on a stale snapshot conflict and never retries the old ID', async ({ page }) => {
    let serverSnapshot = baselineSnapshot;
    const updatedSnapshot = {
      ...baselineSnapshot,
      snapshot_id: 'baseline-snapshot-2',
      captured_by_name: 'Updated User',
    };
    const deletePayloads: Array<{ snapshot_id?: string }> = [];
    await setupMockApp(page);
    await installBaselineData(page, true, () => serverSnapshot);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      const payload = route.request().postDataJSON() as { snapshot_id?: string };
      deletePayloads.push(payload);
      if (payload.snapshot_id === baselineSnapshot.snapshot_id) {
        serverSnapshot = updatedSnapshot;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'The baseline was updated by another user.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          completeness: 'complete',
          baseline: null,
          deleted_snapshot_id: updatedSnapshot.snapshot_id,
        }),
      });
    });
    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await page.getByTestId('baseline-delete-confirm-button').click();

    await expect(page.getByText('The baseline was updated by another user.')).toBeVisible();
    await expect(page.getByText('Baseline deleted')).toHaveCount(0);
    expect(deletePayloads).toEqual([{ snapshot_id: baselineSnapshot.snapshot_id }]);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await expect(page.getByRole('alertdialog')).toContainText('Updated User');
    await page.getByTestId('baseline-delete-confirm-button').click();

    await expect.poll(() => deletePayloads).toEqual([
      { snapshot_id: baselineSnapshot.snapshot_id },
      { snapshot_id: updatedSnapshot.snapshot_id },
    ]);
    await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);
  });

  test('blocks a second confirmation while DELETE is pending and a data refresh completes', async ({ page }) => {
    let finishDelete: (() => void) | undefined;
    const deleteGate = new Promise<void>((resolve) => { finishDelete = resolve; });
    let deleteRequestCount = 0;
    let markDeleteStarted: (() => void) | undefined;
    const deleteStarted = new Promise<void>((resolve) => { markDeleteStarted = resolve; });
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      deleteRequestCount += 1;
      markDeleteStarted?.();
      await deleteGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          completeness: 'complete',
          baseline: null,
          deleted_snapshot_id: baselineSnapshot.snapshot_id,
        }),
      });
    });

    try {
      await waitForInitialRender(page);
      await page.getByTestId('baseline-save-menu-button').click();
      await page.getByTestId('baseline-delete-button').click();
      const confirmButton = page.getByTestId('baseline-delete-confirm-button');
      await confirmButton.click();
      await deleteStarted;
      await confirmButton.dispatchEvent('click');

      const dataRefresh = page.waitForResponse((response) => (
        response.url().includes('/canvas_gantt/data.json') && response.request().method() === 'GET'
      ));
      await page.getByRole('button', { name: 'Status', exact: true }).dispatchEvent('click');
      await page.getByRole('checkbox', { name: 'Select All' }).dispatchEvent('click');
      await dataRefresh;
      expect(deleteRequestCount).toBe(1);

      finishDelete();
      await expect(page.getByTestId('baseline-delete-button')).toHaveCount(0);
      expect(deleteRequestCount).toBe(1);
    } finally {
      finishDelete?.();
    }
  });

  test('reconciles an unknown DELETE result without retrying when the snapshot still exists', async ({ page }) => {
    let deleteRequestCount = 0;
    await setupMockApp(page);
    await installBaselineData(page, true);
    await page.route('**/canvas_gantt/baseline.json', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      deleteRequestCount += 1;
      await route.abort('failed');
    });

    await waitForInitialRender(page);
    await page.getByTestId('baseline-save-menu-button').click();
    await page.getByTestId('baseline-delete-button').click();
    await page.getByTestId('baseline-delete-confirm-button').click();

    await expect(page.getByText('Could not confirm whether the baseline was deleted.')).toBeVisible();
    expect(deleteRequestCount).toBe(1);
    await page.getByTestId('baseline-save-menu-button').click();
    await expect(page.getByTestId('baseline-delete-button')).toBeVisible();
    expect(deleteRequestCount).toBe(1);
  });
});
