import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

test('deletes dependency via context menu', async ({ page }) => {
  const deleted: string[] = [];
  await setupMockApp(page, { onDeleteRelation: (id) => deleted.push(id) });
  await waitForInitialRender(page);

  await page.getByTestId('task-row-101').click({ button: 'right', force: true });
  await expect(page.getByText('Remove dependency')).toBeVisible();

  await page.getByTestId('remove-relation-1').click();
  await expect.poll(() => deleted.length).toBe(1);
  expect(deleted[0]).toBe('1');
});
