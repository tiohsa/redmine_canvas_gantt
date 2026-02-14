import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test('selects task on click', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await expect(page.getByTestId('task-row-101')).toHaveClass(/is-selected/);
});

test.skip('edits status inline', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, { onPatchTask: (payload) => patchPayloads.push(payload) });
  await waitForInitialRender(page);

  await page.getByTestId('cell-101-status').dblclick({ force: true });
  const select = page.locator('[data-testid="task-row-101"] select').first();
  await select.selectOption({ label: 'Closed' });

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { status_id?: number } };
  expect(payload.task?.status_id).toBe(3);
});

test.skip('saves on blur', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, { onPatchTask: (payload) => patchPayloads.push(payload) });
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await expect
    .poll(() => page.getByTestId('detail-row-subject').evaluate((el) => getComputedStyle(el).cursor))
    .toBe('pointer');
  await page.getByTestId('detail-row-subject').click();
  const input = page.getByTestId('detail-row-subject').locator('input[type="text"]').first();
  await input.fill('Updated subject by blur');
  await page.getByTestId('detail-row-statusId').click();

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { subject?: string } };
  expect(payload.task?.subject).toBe('Updated subject by blur');
});
