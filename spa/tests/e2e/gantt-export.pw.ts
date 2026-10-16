import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const DAY_MS = 24 * 60 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FIRST_TASK_SUBJECT = 'A very long English task title that must remain fully visible in the exported image';

const setExportLabels = async (page: Page) => {
  await page.evaluate(() => {
    const config = (window as typeof window & {
      RedmineCanvasGantt?: { i18n?: Record<string, string> };
    }).RedmineCanvasGantt;
    if (!config) return;
    config.i18n = {
      ...config.i18n,
      label_export: 'Export',
      label_export_png: 'Export PNG',
      label_export_full_png: 'Export full PNG',
      label_export_csv: 'Export CSV',
      label_export_png_too_large: 'The full PNG is too large.',
    };
  });
};

const installExportTasks = async (page: Page, count: number) => page.evaluate(async (taskCount) => {
  const [{ useTaskStore }, { useUIStore }] = await Promise.all([
    import('/src/stores/TaskStore.ts'),
    import('/src/stores/UIStore.ts'),
  ]);
  const store = useTaskStore.getState();
  const template = store.tasks[0];
  if (!template) throw new Error('A task template is required');

  const firstDate = Date.UTC(2026, 0, 1);
  const tasks = Array.from({ length: taskCount }, (_, index) => ({
    ...template,
    id: String(9000 + index),
    subject: index === 1 ? '日本語の長いタスクタイトルも画像内に表示されることを確認する' : `Export task ${index + 1}`,
    projectId: '1',
    projectName: 'Project',
    parentId: undefined,
    hasChildren: false,
    displayOrder: index,
    startDate: firstDate + index * 5 * 24 * 60 * 60 * 1000,
    dueDate: firstDate + (index * 5 + 4) * 24 * 60 * 60 * 1000,
    ratioDone: 0,
  }));
  store.setAutoSave(false);
  store.setTasks(tasks);
  useUIStore.setState({ showTaskTitles: true, showTaskBarDates: true });
  store.updateViewport({
    startDate: firstDate,
    scrollX: 600,
    scrollY: store.viewport.rowHeight * 8,
    scale: 12 / (24 * 60 * 60 * 1000),
  });
  store.updateTask('9000', { subject: 'A very long English task title that must remain fully visible in the exported image' });
  useTaskStore.setState({
    selectedTaskId: '9000',
    draftRelation: {
      from: '9000',
      to: String(9000 + taskCount - 1),
      type: 'precedes',
      anchor: { x: 100, y: 100 },
    },
  });
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}, count);

const readPngDimensions = async (page: Page, saveTo?: string) => {
  const download = await page.waitForEvent('download', { timeout: 15_000 });
  if (saveTo) await download.saveAs(saveTo);
  const filePath = await download.path();
  if (!filePath) throw new Error('PNG download has no local path');
  const bytes = await readFile(filePath);
  expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  return {
    bytes,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

const takeExportStateSnapshot = async (page: Page) => page.evaluate(async () => {
  const { useTaskStore } = await import('/src/stores/TaskStore.ts');
  const state = useTaskStore.getState();
  return JSON.parse(JSON.stringify({
    viewport: state.viewport,
    modifiedTaskIds: [...state.modifiedTaskIds].sort(),
    localTaskPatches: state.localTaskPatches,
    selectedTaskId: state.selectedTaskId,
    firstTask: state.tasks.find(task => task.id === '9000'),
    lastTask: state.tasks[state.tasks.length - 1],
  }));
});

const getExportMetrics = async (page: Page) => page.evaluate(async ({ dayMs, firstSubject }) => {
  const [{ useTaskStore }, { GANTT_HEADER_HEIGHT }, { canvasFonts }, { TASK_BAR_DATE_GAP, TASK_TITLE_OFFSET_WITH_DATES }] = await Promise.all([
    import('/src/stores/TaskStore.ts'),
    import('/src/constants.ts'),
    import('/src/styles/designTokens.ts'),
    import('/src/renderers/taskLabels.ts'),
  ]);
  const state = useTaskStore.getState();
  const first = state.tasks.find(task => task.id === '9000');
  const last = state.tasks.find(task => task.id === '9035');
  if (!first?.startDate || !last?.startDate) throw new Error('Export endpoint tasks are missing dates');
  const scale = state.viewport.scale;
  const textContext = document.createElement('canvas').getContext('2d');
  if (!textContext) throw new Error('Could not create a text measurement context');
  textContext.font = canvasFonts.body;
  await document.fonts.load(canvasFonts.body, `${firstSubject}6/29日本語の長いタスクタイトル`);
  textContext.textAlign = 'right';
  const titleMetrics = textContext.measureText(firstSubject);
  textContext.textAlign = 'left';
  const lastDateMetrics = textContext.measureText('6/29');
  const firstBarLeft = 33 + titleMetrics.actualBoundingBoxLeft + TASK_TITLE_OFFSET_WITH_DATES;
  const lastBarLeft = firstBarLeft + (last.startDate - first.startDate) * scale;
  const lastBarRight = lastBarLeft + 5 * dayMs * scale;
  const dateRangeWidth = (last.startDate - first.startDate + 5 * dayMs) * scale;
  const leftPadding = 32 + TASK_TITLE_OFFSET_WITH_DATES + titleMetrics.actualBoundingBoxLeft + 1;
  const rightPadding = 32 + TASK_BAR_DATE_GAP + lastDateMetrics.actualBoundingBoxRight + 1;
  return {
    viewport: state.viewport,
    rowCount: state.rowCount,
    headerHeight: GANTT_HEADER_HEIGHT,
    devicePixelRatio: window.devicePixelRatio,
    firstRowIndex: first.rowIndex,
    lastRowIndex: last.rowIndex,
    firstStartDate: first.startDate,
    lastStartDate: last.startDate,
    firstScreenX: (first.startDate - state.viewport.startDate) * scale - state.viewport.scrollX,
    lastScreenX: (last.startDate - state.viewport.startDate) * scale - state.viewport.scrollX,
    firstFullX: firstBarLeft + 2.5 * dayMs * scale,
    lastFullX: lastBarLeft + 2.5 * dayMs * scale,
    firstTitleInkLeft: 33,
    firstTitleInkRight: 33 + titleMetrics.actualBoundingBoxLeft + titleMetrics.actualBoundingBoxRight,
    lastDueLabelLeft: lastBarRight + 10,
    lastDueLabelRight: lastBarRight + 10 + lastDateMetrics.actualBoundingBoxLeft + lastDateMetrics.actualBoundingBoxRight,
    expectedFullWidth: Math.ceil(dateRangeWidth + leftPadding + rightPadding),
    firstOutsideX: 24,
    lastOutsideX: 32 + (last.startDate - first.startDate) * scale - 8,
    rowHeight: state.viewport.rowHeight,
    viewportCanvasHeight: (() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="gantt-background-canvas"]');
      if (!canvas) throw new Error('Gantt viewport canvas is missing');
      return Number.parseFloat(canvas.style.height) || canvas.height / window.devicePixelRatio;
    })(),
  };
}, { dayMs: DAY_MS, firstSubject: FIRST_TASK_SUBJECT });

const samplePngPixels = async (page: Page, pngBase64: string, points: Array<{ x: number; y: number }>) =>
  page.evaluate(async ({ base64, samplePoints }) => {
    const blob = await fetch(`data:image/png;base64,${base64}`).then(response => response.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create PNG pixel inspection context');
    context.drawImage(bitmap, 0, 0);
    const pixels = samplePoints.map(({ x, y }) => [...context.getImageData(x, y, 1, 1).data]);
    bitmap.close();
    return pixels;
  }, { base64: pngBase64, samplePoints: points });

const countDarkPixels = async (page: Page, pngBase64: string, rect: { x: number; y: number; width: number; height: number }, threshold = 130) =>
  page.evaluate(async ({ base64, region, maxChannel }) => {
    const blob = await fetch(`data:image/png;base64,${base64}`).then(response => response.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create PNG text inspection context');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(region.x, region.y, region.width, region.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 255 && Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) < maxChannel) count += 1;
    }
    bitmap.close();
    return count;
  }, { base64: pngBase64, region: rect, maxChannel: threshold });

const openExportMenu = async (page: Page) => {
  await page.getByTestId('export-menu-button').click();
};

const assertFullExportAtDpr = async (browser: Browser, dpr: number, baseURL: string | undefined, saveTo: string) => {
  const context = await browser.newContext({
    baseURL,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
  });

  try {
    const page = await context.newPage();
    await setupMockApp(page, { preferences: { sidebarWidth: 500 } });
    await waitForInitialRender(page);
    await setExportLabels(page);
    await installExportTasks(page, 36);

    const metrics = await getExportMetrics(page);
    expect(metrics.devicePixelRatio).toBe(dpr);
    expect(metrics.viewport.scrollX).toBeGreaterThan(0);
    expect(metrics.viewport.scrollY).toBeGreaterThan(0);
    expect(metrics.firstScreenX).toBeLessThan(0);
    expect(metrics.lastScreenX).toBeGreaterThan(metrics.viewport.width);

    await openExportMenu(page);
    const viewportDownloadPromise = readPngDimensions(page);
    await page.getByRole('button', { name: 'Export PNG' }).click();
    const viewportPng = await viewportDownloadPromise;
    expect(viewportPng.width).toBe(Math.round(metrics.viewport.width));
    expect(viewportPng.height).toBe(metrics.headerHeight + Math.round(metrics.viewportCanvasHeight));

    await openExportMenu(page);
    const before = await takeExportStateSnapshot(page);
    const fullDownloadPromise = readPngDimensions(page, saveTo);
    await page.getByRole('button', { name: 'Export full PNG' }).click();
    const fullPng = await fullDownloadPromise;
    // Browser text metrics produce ideal bounds; the renderer floors bar coordinates and snaps text anchors, allowing one CSS pixel of rounding.
    expect(Math.abs(fullPng.width - metrics.expectedFullWidth)).toBeLessThanOrEqual(1);
    expect(fullPng.width).toBeGreaterThan(viewportPng.width);
    expect(fullPng.height).toBeGreaterThan(viewportPng.height);
    expect(fullPng.height).toBe(metrics.headerHeight + Math.ceil(metrics.rowCount * metrics.rowHeight));
    expect(metrics.firstTitleInkLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.firstTitleInkRight).toBeLessThan(fullPng.width);
    expect(metrics.lastDueLabelRight).toBeLessThan(fullPng.width);

    const firstY = metrics.headerHeight + metrics.firstRowIndex * metrics.rowHeight + metrics.rowHeight / 2;
    const lastY = metrics.headerHeight + metrics.lastRowIndex * metrics.rowHeight + metrics.rowHeight / 2;
    const pixels = await samplePngPixels(page, fullPng.bytes.toString('base64'), [
      { x: Math.floor(metrics.firstFullX), y: Math.floor(firstY) },
      { x: Math.floor(metrics.firstOutsideX), y: Math.floor(firstY) },
      { x: Math.floor(metrics.lastFullX), y: Math.floor(lastY) },
      { x: Math.floor(metrics.lastOutsideX), y: Math.floor(lastY) },
    ]);
    for (const [red, green, blue, alpha] of [pixels[0], pixels[2]]) {
      expect(alpha).toBe(255);
      expect(Math.max(red, green, blue)).toBeLessThan(245);
    }
    expect(pixels[0]).not.toEqual(pixels[1]);
    expect(pixels[2]).not.toEqual(pixels[3]);
    const pngBase64 = fullPng.bytes.toString('base64');
    expect(await countDarkPixels(page, pngBase64, {
      x: Math.floor(metrics.firstTitleInkLeft),
      y: Math.floor(firstY - 8),
      width: Math.ceil(metrics.firstTitleInkRight - metrics.firstTitleInkLeft),
      height: 16,
    })).toBeGreaterThan(8);
    expect(await countDarkPixels(page, pngBase64, {
      x: Math.floor(metrics.lastDueLabelLeft),
      y: Math.floor(lastY - 8),
      width: Math.ceil(metrics.lastDueLabelRight - metrics.lastDueLabelLeft),
      height: 16,
    }, 200)).toBeGreaterThan(4);

    expect(await takeExportStateSnapshot(page)).toEqual(before);
  } finally {
    await context.close();
  }
};

test('exports viewport and full-range PNGs at DPR 1 and 2 without changing viewport or local edits', async ({ browser, baseURL }, testInfo) => {
  await assertFullExportAtDpr(browser, 1, baseURL, testInfo.outputPath('full-dpr-1.png'));
  await assertFullExportAtDpr(browser, 2, baseURL, testInfo.outputPath('full-dpr-2.png'));
});

test('rejects an oversized full PNG with a notification and no download', async ({ page }) => {
  await setupMockApp(page);
  await waitForInitialRender(page);
  await setExportLabels(page);
  await installExportTasks(page, 280);
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });

  await openExportMenu(page);
  const before = await takeExportStateSnapshot(page);
  await page.getByRole('button', { name: 'Export full PNG' }).click();
  await expect(page.getByText('The full PNG is too large.')).toBeVisible();
  await page.waitForTimeout(250);

  expect(downloadCount).toBe(0);
  expect(await takeExportStateSnapshot(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export full PNG' })).toBeEnabled();
});
