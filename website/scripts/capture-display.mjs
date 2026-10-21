// Capture actual controls from a disposable Redmine with manual-demo.rb loaded.
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const base = process.env.REDMINE_CAPTURE_URL;
const passwordFile = process.env.REDMINE_CAPTURE_PASSWORD_FILE;
const locale = process.env.REDMINE_CAPTURE_LOCALE ?? 'en';
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || !passwordFile) {
  throw new Error('Set a local disposable REDMINE_CAPTURE_URL and REDMINE_CAPTURE_PASSWORD_FILE.');
}
if (!['ja', 'en'].includes(locale)) throw new Error('Capture locale must be ja or en.');
const browser = await chromium.launch({ executablePath: process.env.REDMINE_CAPTURE_CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1900, height: 900 }, locale: locale === 'ja' ? 'ja-JP' : 'en-US', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = fileURLToPath(new URL('../public/images/', import.meta.url));
try {
  await page.goto(`${base}/login`);
  await page.locator('#username').fill('manual-demo');
  await page.locator('#password').fill((await readFile(passwordFile, 'utf8')).trim());
  await page.locator('input[name="login"]').click();
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
  await page.goto(`${base}/projects/manual-demo/canvas_gantt`);
  const settings = page.getByTestId('display-settings-menu');
  await page.getByTestId('display-settings-menu-button').click();
  await expect(settings).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await settings.screenshot({ path: `${output}display-settings-${locale}.png` });
  await page.getByTestId('issue-dialog-width-select').scrollIntoViewIfNeeded();
  await page.getByTestId('issue-dialog-size-reset').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('issue-dialog-width-select')).toBeVisible();
  await expect(page.getByTestId('issue-dialog-height-percent-select')).toBeVisible();
  await page.getByTestId('issue-dialog-width-select').locator('xpath=ancestor::div[2]').screenshot({ path: `${output}issue-dialog-settings-${locale}.png` });
  await page.getByTestId('display-settings-menu-button').click();
  await page.getByTestId('export-menu-button').click();
  const menu = page.getByTestId('export-menu');
  await expect(menu).toContainText(locale === 'ja' ? '全体をPNG出力' : 'Export full PNG');
  await menu.screenshot({ path: `${output}export-menu-${locale}.png` });
  const downloadPromise = page.waitForEvent('download');
  await menu.getByText(locale === 'ja' ? '全体をPNG出力' : 'Export full PNG', { exact: true }).click();
  const download = await downloadPromise;
  if (await download.failure()) throw new Error('Full PNG download failed');
  await download.saveAs(`/tmp/manual-full-export-${locale}.png`);
  if (errors.length) throw new Error(errors.join(' | '));
  console.log(`Captured settings, dialog size, and export menu (${locale}); full PNG download succeeded; no page errors.`);
} finally {
  await context.close();
  await browser.close();
}
