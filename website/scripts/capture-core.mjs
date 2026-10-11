// Run only against the prepared disposable manual-demo environment.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const base = process.env.REDMINE_CAPTURE_URL ?? 'http://127.0.0.1:3101';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Capture requires a local disposable Redmine.');
const passwordFile = process.env.REDMINE_CAPTURE_PASSWORD_FILE;
if (!passwordFile) throw new Error('Set REDMINE_CAPTURE_PASSWORD_FILE to the demo password file.');
const phase = process.argv[2] ?? 'overview';
if (!['overview', 'date', 'schedule', 'comparison', 'dependency', 'dependency-poster'].includes(phase)) throw new Error('Unknown capture phase.');
const images = fileURLToPath(new URL('../public/images/', import.meta.url));
const raw = process.env.REDMINE_CAPTURE_RAW_DIR ?? '/tmp/canvas-gantt-manual-recordings';
await mkdir(raw, { recursive: true });
await mkdir(images, { recursive: true });
const browser = await chromium.launch();
const auth = await browser.newContext({ viewport: { width: 1900, height: 700 }, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
const login = await auth.newPage();
await login.goto(base + '/login');
await login.locator('#username').fill('manual-demo');
await login.locator('#password').fill((await readFile(passwordFile, 'utf8')).trim());
await login.getByRole('button', { name: 'Login', exact: true }).click();
await login.waitForURL(url => !url.pathname.includes('/login'));
const context = await browser.newContext({ storageState: await auth.storageState(), viewport: { width: 1900, height: 700 }, locale: 'en-US', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 1, colorScheme: 'light', ...(phase === 'schedule' || phase === 'dependency' ? { recordVideo: { dir: raw, size: { width: 1900, height: 700 } } } : {}) });
await auth.close();
const videoStart = Date.now();
const page = await context.newPage();
const errors = [];
page.on('response',r=>{if(r.request().method()==='POST') console.log('POST',new URL(r.url()).pathname,r.status())});
page.on('pageerror', error => errors.push(error.message));
let payload;
const data = page.waitForResponse(r => r.url().includes('/canvas_gantt/data') && r.status() === 200);
await page.goto(base + '/projects/manual-demo/canvas_gantt?set_filter=1&f[]=status_id&op[status_id]=*&c[]=id&c[]=subject' + (phase === 'date' ? '&c[]=start_date&c[]=due_date' : ''));
payload = await (await data).json();
await page.getByText('Implement pages', { exact: true }).first().waitFor();
await page.getByRole('button', { name: 'Day', exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Today', exact: true }).click();
await page.waitForTimeout(300);
await page.mouse.move(1200, 450);
await page.mouse.wheel(480, 0);
await page.waitForTimeout(300);
const root = page.locator('#redmine-canvas-gantt-root');
const taskId = subject => String(payload.tasks.find(t => t.subject === subject).id);
async function screenshot(name, clip) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.mouse.move(0, 0);
  if (clip) await page.screenshot({ path: images + name + '.png', clip, animations: 'disabled', caret: 'hide' });
  else if (phase.startsWith('dependency')) await page.screenshot({ path: images + name + '.png', animations: 'disabled', caret: 'hide' });
  else await root.screenshot({ path: images + name + '.png', animations: 'disabled', caret: 'hide' });
}
async function select(id) {
  await page.getByTestId('task-row-' + id).click({position:{x:110,y:18}});
  await page.getByTestId('task-row-' + id).hover({position:{x:110,y:18}});
  await expect(page.getByTestId('task-resize-handle-end-' + id)).toBeVisible();
}
async function handles(id) {
  const start = await page.getByTestId('task-resize-handle-start-' + id).boundingBox();
  const end = await page.getByTestId('task-resize-handle-end-' + id).boundingBox();
  return { x: (start.x + start.width / 2 + end.x + end.width / 2) / 2, y: start.y + start.height / 2, start, end };
}
async function drag(x, y, dx) {
  await page.mouse.move(x, y); await page.waitForTimeout(700);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 35 });
  await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(900);
}
let recordingFrom;
let recordingEndedAt;
if (phase === 'overview') await screenshot('canvas-gantt-overview-en');
if (phase === 'date') {
  const id = taskId('Gather requirements');
  // Shrink Subject through its real column resize handle so date columns fit.
  const column = await page.getByTestId('sidebar-column-resize-handle-subject').boundingBox();
  await drag(column.x + column.width / 2, column.y + column.height / 2, -170);
  await page.getByTestId(`cell-${id}-startDate`).dblclick();
  await screenshot('date-cell-edit-en', { x: 165, y: 300, width: 260, height: 355 });
}
if (phase === 'schedule') {
  await page.getByTestId('baseline-save-menu-button').click();
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('baseline'));
  await page.getByTestId('baseline-save-project-button').click();
  expect((await saved).status()).toBe(200);
  await page.getByTestId('display-settings-menu-button').click();
  const toggle = page.getByRole('switch', { name: 'Auto Save', exact: true });
  if (await toggle.isChecked()) await page.locator('label').filter({ has: toggle }).click();
  await page.getByTestId('display-settings-menu-button').click();
  const id = taskId('Prepare launch');
  await select(id);
  await screenshot('schedule-edit-poster');
  recordingFrom = (Date.now() - videoStart) / 1000;
  await page.waitForTimeout(1700);
  let h = await handles(id);
  await drag(h.x, h.y, 80);
  await screenshot('pending-save-en', { x: 20, y: 134, width: 1862, height: 455 });
  await page.waitForTimeout(1700);
  await select(id); h = await handles(id);
  await drag(h.end.x + h.end.width / 2, h.y, 80);
  await page.waitForTimeout(1500);
  const savedSchedule = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('schedule_mutation'));
  await page.getByTitle('Save changes', { exact: true }).click();
  expect((await savedSchedule).status()).toBe(200);
  await page.waitForTimeout(2500);
  recordingEndedAt = Date.now();
  await page.setViewportSize({ width: 1900, height: 900 });
  await page.getByTestId('baseline-save-menu-button').click();
  await page.getByTestId('baseline-toggle-checkbox').check();
  await page.getByTestId('baseline-save-menu-button').click();
  await select(id);
  const comparison = await page.getByTestId('baseline-diff-popover').boundingBox();
  await screenshot('baseline-compare-en', { x: comparison.x - 380, y: comparison.y - 170, width: comparison.width + 410, height: comparison.height + 190 });
}
if (phase === 'comparison') {
  await page.setViewportSize({ width: 1900, height: 900 });
  await page.getByTestId('baseline-save-menu-button').click();
  await page.getByTestId('baseline-toggle-checkbox').check();
  await page.getByTestId('baseline-save-menu-button').click();
  await select(taskId('Prepare launch'));
  const comparison = await page.getByTestId('baseline-diff-popover').boundingBox();
  await screenshot('baseline-compare-en', { x: comparison.x - 380, y: comparison.y - 170, width: comparison.width + 410, height: comparison.height + 190 });
}
if (phase === 'dependency-poster') {
  await page.getByTitle('Full Screen', { exact: true }).click();
  await select(taskId('Gather requirements'));
  await screenshot('dependency-create-poster');
}
if (phase === 'dependency') {
  await page.getByTitle('Full Screen', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('relation-settings-menu-button').click();
  await page.getByTestId('relation-auto-apply-toggle').uncheck();
  await page.getByTestId('relation-settings-save-button').click();
  const from = taskId('Gather requirements'), to = taskId('Review the design');
  await select(from);
  await screenshot('dependency-create-poster');
  recordingFrom = (Date.now() - videoStart) / 1000;
  await page.waitForTimeout(2000);
  await select(from);
  const origin = await handles(from);
  const targetRow = await page.getByTestId('task-row-' + to).boundingBox();
  // Fixture: origin spans two days; target starts eleven days later and spans four.
  const dayWidth = (origin.end.x - origin.start.x) / 2;
  const target = { x: origin.start.x + origin.start.width / 2 + dayWidth * 13, y: targetRow.y + targetRow.height / 2 };
  await page.mouse.move(origin.x, origin.y);
  const handle = await page.getByTestId('dependency-handle-right-' + from).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.waitForTimeout(1000); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 60 });
  await page.waitForTimeout(1000); await page.mouse.up();
  await page.waitForTimeout(500);
  await page.getByTestId('relation-editor').waitFor();
  const editor = await page.getByTestId('relation-editor').boundingBox();
  await screenshot('relation-editor-en', { x: editor.x - 30, y: editor.y - 20, width: editor.width + 60, height: editor.height + 40 });
  await page.waitForTimeout(4000);
  const response = page.waitForResponse(r => r.request().method() === 'POST' && /relations/.test(r.url()));
  await page.getByTestId('relation-save-button').click();
  expect([200, 201]).toContain((await response).status());
  await page.waitForTimeout(3500);
}
const clip = await root.boundingBox();
if (phase === 'schedule') clip.height = 552;
if (phase === 'dependency') Object.assign(clip, { x: 0, y: 0, width: 1900, height: 700 });
const recordingTo = ((recordingEndedAt ?? Date.now()) - videoStart) / 1000;
const video = page.video();
await context.close();
if (video) await writeFile(raw + '/' + phase + '.json', JSON.stringify({ source: await video.path(), start: recordingFrom, duration: recordingTo - recordingFrom, clip, errors }, null, 2));
console.log(JSON.stringify({ phase, clip, errors }));
await browser.close();
expect(errors).toEqual([]);
