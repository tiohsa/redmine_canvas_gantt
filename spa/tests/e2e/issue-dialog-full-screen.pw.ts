import { expect, test, type Route } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

const issueSubject = defaultMockData.tasks[0].subject;

test('persists fill-viewport preference and tracks the viewport across issue and non-issue routes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fulfillIssuePage = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="content" style="height:1200px"><h2>Issue #101</h2><a href="/issues/101/time_entries/new">Log time</a></main></body></html>',
    });
  };
  await page.route('**/issues/101', fulfillIssuePage);
  await page.route('**/issues/101/edit', fulfillIssuePage);
  await page.route('**/issues/101/time_entries/new', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="content" style="height:120px"><h2>Time entry</h2><a href="/issues/101/edit">Return to issue</a></main></body></html>',
    });
  });
  await page.route('**/queries/1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><main id="content">Query</main></body></html>',
    });
  });
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByTestId('display-settings-menu-button').click();
  const fillViewportSwitch = page.getByRole('switch', { name: 'Fill viewport' });
  await fillViewportSwitch.check();
  await expect(page.getByTestId('issue-dialog-width-select')).toBeDisabled();
  await expect(page.getByTestId('issue-dialog-height-mode-select')).toBeDisabled();
  await expect.poll(async () => page.evaluate(async () => {
    const { loadDisplayPreferences } = await import('/src/utils/preferences.ts');
    return loadDisplayPreferences('1').issueDialogFullScreen;
  })).toBe(true);

  await page.reload();
  await page.getByTestId('cell-101-subject').waitFor({ state: 'visible' });
  await page.getByTestId('display-settings-menu-button').click();
  await expect(page.getByRole('switch', { name: 'Fill viewport' })).toBeChecked();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: issueSubject, exact: true }).dispatchEvent('click');
  const panel = page.getByTestId('issue-dialog-panel');
  await expect(panel).toHaveAttribute('data-dialog-size-target', 'issue');
  await expect(panel).toHaveAttribute('data-dialog-full-screen', 'true');
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(1280);
  await expect.poll(async () => (await panel.boundingBox())?.height).toBe(800);

  await page.setViewportSize({ width: 1024, height: 600 });
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(1024);
  await expect.poll(async () => (await panel.boundingBox())?.height).toBe(600);

  await page.frameLocator('iframe').getByRole('link', { name: 'Log time' }).click();
  await expect(panel).toHaveAttribute('data-dialog-size-target', 'time-entry');
  await expect(panel).toHaveAttribute('data-dialog-full-screen', 'false');
  await expect.poll(async () => (await panel.boundingBox())?.width).toBeLessThan(1024);
  await page.frameLocator('iframe').getByRole('link', { name: 'Return to issue' }).click();
  await expect(panel).toHaveAttribute('data-dialog-size-target', 'issue');
  await expect(panel).toHaveAttribute('data-dialog-full-screen', 'true');
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(1024);

  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().openQueryDialog('/queries/1');
  });
  await expect(panel).toHaveAttribute('data-dialog-size-target', 'query');
  await expect(panel).toHaveAttribute('data-dialog-full-screen', 'false');
  await expect.poll(async () => (await panel.boundingBox())?.width).toBeLessThan(1024);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Close issue dialog', exact: true }).click();
  await expect(panel).toHaveCount(0);

  await page.getByTestId('display-settings-menu-button').click();
  await page.getByTestId('issue-dialog-size-reset').click();
  await expect(page.getByRole('switch', { name: 'Fill viewport' })).not.toBeChecked();
  await expect(page.getByTestId('issue-dialog-width-select')).toBeEnabled();
  await expect(page.getByTestId('issue-dialog-width-select')).toHaveValue('1200');
  await expect(page.getByTestId('issue-dialog-height-mode-select')).toHaveValue('auto');
  await expect(page.getByTestId('issue-dialog-height-percent-select')).toHaveValue('80');
});
