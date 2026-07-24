import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

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
