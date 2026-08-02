import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

type ManifestEntry = {
  file?: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
};

const collectManifestAssetPaths = (manifest: Record<string, ManifestEntry>): string[] => {
  const references = new Set<string>();
  const visitedEntries = new Set<string>();

  const visit = (entryKey: string) => {
    if (visitedEntries.has(entryKey)) return;
    const entry = manifest[entryKey];
    if (!entry) return;
    visitedEntries.add(entryKey);

    [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])].forEach((reference) => {
      if (reference) references.add(reference);
    });
    [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])].forEach(visit);
  };

  Object.keys(manifest).forEach(visit);
  return [...references];
};

test('renders canvas gantt page in Redmine', async ({ page, baseURL }) => {
  const redmineBase = baseURL ?? 'http://127.0.0.1:3000';
  const relativeRoot = new URL(redmineBase).pathname.replace(/\/$/, '');
  const expectedAssetPrefix = `${relativeRoot}/plugin_assets/redmine_canvas_gantt/build/`;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedScriptResponses: string[] = [];
  const failedBuildAssetResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    const req = response.request();
    const responsePath = new URL(response.url()).pathname;
    if (responsePath.startsWith(expectedAssetPrefix) && !response.ok() && response.status() !== 304) {
      failedBuildAssetResponses.push(`${response.status()} ${response.url()}`);
    }
    if (req.resourceType() !== 'script' || response.ok() || response.status() === 304) return;
    if (!response.ok()) {
      failedScriptResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await adminLogin(redmineBase, page);

  await page.goto(`${redmineBase}/projects/ecookbook/canvas_gantt`);
  await expect(page.locator('#redmine-canvas-gantt-root')).toBeVisible();
  await expect(page.getByRole('heading', { name: '403' })).toHaveCount(0);

  const loadingText = page.getByText('Loading Canvas Gantt...');
  await expect(loadingText).toHaveCount(0);

  const memberProjectsResponse = await page.evaluate(async () => {
    const config = (window as Window & {
      RedmineCanvasGantt: { apiBase: string };
    }).RedmineCanvasGantt;
    const response = await window.fetch(`${config.apiBase}/data.json?member_projects_only=1`);

    return {
      status: response.status,
      payload: await response.json()
    };
  });

  expect(memberProjectsResponse.status).toBe(200);
  expect(memberProjectsResponse.payload).toHaveProperty('filter_options.projects');

  const buildAssetUrls = await page.locator('script[src], link[href]').evaluateAll((elements) =>
    elements
      .map((element) => element.getAttribute('src') ?? element.getAttribute('href'))
      .filter((url): url is string => Boolean(url?.includes('/plugin_assets/redmine_canvas_gantt/build/')))
  );

  expect(buildAssetUrls.length).toBeGreaterThan(0);
  expect(buildAssetUrls.every((url) => url.startsWith(expectedAssetPrefix))).toBe(true);

  const manifestPath = fileURLToPath(new URL('../../../assets/build/.vite/manifest.json', import.meta.url));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, ManifestEntry>;
  const manifestAssetUrls = collectManifestAssetPaths(manifest).map((assetPath) => (
    new URL(`${expectedAssetPrefix}${assetPath}`, redmineBase).toString()
  ));
  const manifestAssetResponses = await page.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    return { url, status: response.status };
  })), manifestAssetUrls);

  expect(manifestAssetResponses.filter(({ status }) => (
    !(status >= 200 && status < 300) && status !== 304
  ))).toEqual([]);
  expect(failedBuildAssetResponses).toEqual([]);
  expect(failedScriptResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
