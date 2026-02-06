import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test('displays task details', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  const panel = page.getByTestId('task-detail-panel');
  await expect(panel).toContainText('#101');
  await expect(panel).toContainText('Implement sidebar resize behavior');
});

test('edits task subject', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, { onPatchTask: (payload) => patchPayloads.push(payload) });
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await page.getByTestId('detail-row-subject').click();
  const input = page.getByTestId('detail-row-subject').locator('input').first();
  await input.fill('Panel edited subject');
  await page.getByTestId('detail-row-statusId').click();

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { subject?: string } };
  expect(payload.task?.subject).toBe('Panel edited subject');
});

test('edits start date', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, { onPatchTask: (payload) => patchPayloads.push(payload) });
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await page.getByTestId('detail-row-startDate').click();
  const input = page.getByTestId('detail-row-startDate').locator('input[type="date"]').first();
  await input.fill('2026-02-03');
  await input.press('Enter');

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { start_date?: string } };
  expect(payload.task?.start_date).toBe('2026-02-03');
});

test('edits due date', async ({ page }) => {
  const patchPayloads: unknown[] = [];
  await setupMockApp(page, { onPatchTask: (payload) => patchPayloads.push(payload) });
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').dispatchEvent('click');
  await page.getByTestId('detail-row-dueDate').click();
  const input = page.getByTestId('detail-row-dueDate').locator('input[type="date"]').first();
  await input.fill('2026-02-11');
  await input.press('Enter');

  await expect.poll(() => patchPayloads.length).toBeGreaterThan(0);
  const payload = patchPayloads[0] as { task?: { due_date?: string } };
  expect(payload.task?.due_date).toBe('2026-02-11');
});
