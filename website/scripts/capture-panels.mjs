import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(scriptDir, '../public/images');
const baseUrl = process.env.REDMINE_CAPTURE_URL;
const passwordFile = process.env.REDMINE_CAPTURE_PASSWORD_FILE;

if (baseUrl && !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname)) throw new Error('Capture requires a local disposable Redmine.');
if (!baseUrl || !passwordFile) {
  throw new Error('Set REDMINE_CAPTURE_URL and REDMINE_CAPTURE_PASSWORD_FILE for a prepared demo Redmine instance.');
}

const password = (await readFile(passwordFile, 'utf8')).trim();
if (!password) throw new Error('The capture password file is empty.');

await mkdir(imageDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error));
const redmineUrl = baseUrl.replace(/\/$/, '');
const projectUrl = new URL('/projects/manual-demo/canvas_gantt', `${redmineUrl}/`).toString();

const unionClip = (boxes, padding = 12) => {
  const viewport = page.viewportSize();
  const visibleBoxes = boxes.filter(Boolean);
  if (visibleBoxes.length === 0) throw new Error('No visible UI bounds were available for a screenshot.');
  const x = Math.max(0, Math.floor(Math.min(...visibleBoxes.map(box => box.x)) - padding));
  const y = Math.max(0, Math.floor(Math.min(...visibleBoxes.map(box => box.y)) - padding));
  const right = Math.min(viewport.width, Math.ceil(Math.max(...visibleBoxes.map(box => box.x + box.width)) + padding));
  const bottom = Math.min(viewport.height, Math.ceil(Math.max(...visibleBoxes.map(box => box.y + box.height)) + padding));
  return { x, y, width: right - x, height: bottom - y };
};

const captureBounds = async (filename, boxes, padding = 12, maxWidth = Infinity) => {
  const clip = unionClip(boxes, padding);
  if (clip.width > maxWidth) throw new Error(`Screenshot crop for ${filename} is ${clip.width}px wide; expected at most ${maxWidth}px.`);
  await page.screenshot({ path: path.join(imageDir, filename), clip });
  console.log(`Captured ${filename} (${clip.width}x${clip.height})`);
};

const captureMenu = async (button, menu, filename) => {
  await button.click();
  await menu.waitFor({ state: 'visible' });
  await captureBounds(filename, [await button.boundingBox(), await menu.boundingBox()], 12, 680);
  await button.click();
};

try {
  await page.goto(`${redmineUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill('manual-demo');
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 20_000 });
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Canvas Gantt...', { exact: true }).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await page.locator('.gantt-toolbar-status-filter').waitFor({ state: 'visible', timeout: 30_000 });

  const statusButton = page.locator('.gantt-toolbar-status-filter button').first();
  await captureMenu(statusButton, page.locator('.gantt-toolbar-status-filter > div'), 'status-filter-en.png');
  await captureMenu(page.getByTestId('display-settings-menu-button'), page.getByTestId('display-settings-menu'), 'display-settings-en.png');
  await captureMenu(page.getByTestId('export-menu-button'), page.getByTestId('export-menu'), 'export-menu-en.png');
  await captureMenu(page.getByTestId('baseline-save-menu-button'), page.getByTestId('baseline-save-menu'), 'baseline-save-en.png');

  const workloadMenuButton = page.getByTestId('workload-menu-button');
  await workloadMenuButton.click();
  const showWorkload = page.getByLabel('Show Workload Pane');
  if (!(await showWorkload.isChecked())) await showWorkload.check();
  await workloadMenuButton.click();
  await page.getByTestId('workload-canvas').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.mouse.move(1200, 450);
  await page.mouse.wheel(480, 0);
  await page.waitForTimeout(700);
  const ganttColumn = page.locator('.rcg-gantt-scroll-pane').locator('xpath=../..');
  const timelineHeaderCanvas = ganttColumn.locator('canvas').first();
  const ganttRows = page.locator('.rcg-gantt-scroll-pane');
  const workloadSidebar = page.getByTestId('workload-sidebar');
  const workloadPanel = page.getByTestId('workload-canvas-panel');
  await captureBounds('workload-en.png', [
    await timelineHeaderCanvas.boundingBox(),
    await ganttRows.boundingBox(),
    await workloadSidebar.boundingBox(),
    await workloadPanel.boundingBox()
  ], 10);

  await page.getByRole('button', { name: /cols|columns/i }).click();
  const timerColumn = page.getByRole('checkbox', { name: /work timer|timer/i });
  if (!(await timerColumn.isChecked())) await timerColumn.check({ force: true });
  await page.getByRole('button', { name: /cols|columns/i }).click();
  const timerStart = page.locator('[data-testid^="task-timer-start-"]').first();
  await timerStart.scrollIntoViewIfNeeded();
  await timerStart.click();
  await page.getByTestId('timer-start-modal').waitFor({ state: 'visible' });
  await page.getByTestId('timer-start-modal').getByRole('button', { name: /start|begin/i }).waitFor({ state: 'visible' }).catch(() => {});
  await captureBounds('work-timer-en.png', [await page.getByTestId('timer-start-modal').boundingBox()], 30);
  await page.keyboard.press('Escape');

  const firstTaskRow = page.locator('[data-testid^="task-row-"]').first();
  await firstTaskRow.scrollIntoViewIfNeeded();
  await firstTaskRow.click({ button: 'right' });
  await page.getByTestId('context-menu-add-child-task').click();
  const issueFrame = page.frameLocator('iframe[src*="/issues/new"]');
  await issueFrame.locator('#issue-form').waitFor({ state: 'visible', timeout: 15_000 });
  const parentTaskField = issueFrame.locator('input[name="issue[parent_issue_id]"]');
  if (!(await parentTaskField.inputValue())) throw new Error('The new child issue form did not preserve its parent task.');
  const bulkHeading = page.getByText('Bulk Ticket Creation', { exact: true });
  await bulkHeading.waitFor({ state: 'visible' });
  await bulkHeading.click();
  await page.getByRole('button', { name: 'Table input', exact: true }).click();
  const subtaskTable = page.getByTestId('bulk-subtask-table');
  await subtaskTable.waitFor({ state: 'visible' });
  await page.getByLabel('Subject 1').fill('Review project requirements');
  await page.getByRole('button', { name: /add row/i }).click();
  await page.getByLabel('Subject 2').fill('Prepare implementation plan');
  await page.getByRole('button', { name: /add row/i }).click();
  await page.getByLabel('Subject 3').fill('Share delivery update');
  const issueDialogHeader = page.getByTestId('issue-dialog-header');
  const issueDialogFooter = page.getByTestId('issue-dialog-footer');
  await captureBounds('bulk-subtasks-en.png', [
    await issueDialogHeader.boundingBox(),
    await subtaskTable.boundingBox(),
    await issueDialogFooter.boundingBox()
  ], 18);
  await page.keyboard.press('Escape');

  await page.goto(`${redmineUrl}/roles/1/edit`, { waitUntil: 'domcontentloaded' });
  const canvasGroupHeading = page.getByText(/^Canvas gantt$/i).first();
  await canvasGroupHeading.waitFor({ state: 'visible', timeout: 15_000 });
  const groupBox = await canvasGroupHeading.boundingBox();
  const permissionBoxes = await Promise.all([
    page.getByText('View canvas gantt', { exact: true }).first().boundingBox(),
    page.getByText('Manage canvas gantt baseline', { exact: true }).first().boundingBox()
  ]);
  const visibleBoxes = [groupBox, ...permissionBoxes].filter(Boolean);
  const left = Math.min(...visibleBoxes.map(box => box.x)) - 20;
  const top = Math.min(...visibleBoxes.map(box => box.y)) - 10;
  const right = Math.max(...visibleBoxes.map(box => box.x + box.width)) + 12;
  const bottom = Math.max(...visibleBoxes.map(box => box.y + box.height)) + 10;
  const permissionClip = {
    x: Math.max(0, Math.floor(left)),
    y: Math.max(110, Math.floor(top)),
    width: Math.min(page.viewportSize().width - Math.max(0, Math.floor(left)), Math.ceil(right - Math.max(0, Math.floor(left)))),
    height: Math.min(page.viewportSize().height - Math.max(110, Math.floor(top)), Math.ceil(bottom - Math.max(110, Math.floor(top))))
  };
  await page.screenshot({ path: path.join(imageDir, 'permissions-en.png'), clip: permissionClip });
  console.log(`Captured permissions-en.png (${permissionClip.width}x${permissionClip.height})`);
  if (pageErrors.length !== 0) {
    throw new Error(`Expected zero browser page errors, observed ${pageErrors.length}: ${pageErrors.map(error => error.message).join(' | ')}`);
  }
  console.log('Verified zero browser page errors.');
} finally {
  await context.close();
  await browser.close();
}
