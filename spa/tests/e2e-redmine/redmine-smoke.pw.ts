import { expect, test } from '@playwright/test';

const adminLogin = async (baseURL: string, page: import('@playwright/test').Page) => {
  await page.goto(`${baseURL}/login`);
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin');
  await page.getByRole('button', { name: /login|sign in/i }).click();

  const passwordChangeField = page.locator('#new_password');
  if (await passwordChangeField.isVisible().catch(() => false)) {
    await passwordChangeField.fill('admin');
    await page.locator('#new_password_confirmation').fill('admin');
    await page.getByRole('button', { name: /apply|save/i }).click();
  }
};

test('renders canvas gantt page in Redmine', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  await adminLogin(redmineBase, page);

  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByRole('heading', { name: '403' })).toHaveCount(0);
});
