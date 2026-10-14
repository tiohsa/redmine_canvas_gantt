import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const toolbarMetrics = async (page: import('@playwright/test').Page) => page.evaluate(() => {
  const toolbar = document.querySelector<HTMLElement>('.gantt-toolbar');
  const left = document.querySelector<HTMLElement>('.gantt-toolbar-left');
  const right = document.querySelector<HTMLElement>('.gantt-toolbar-right');
  if (!toolbar || !left || !right) throw new Error('Toolbar groups are missing');

  const toolbarRect = toolbar.getBoundingClientRect();
  const keyCounts = new Map<string, number>();
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')]
    .filter(button => button.getClientRects().length > 0)
    .map(button => {
      const rect = button.getBoundingClientRect();
      const baseKey = button.dataset.testid || button.getAttribute('aria-label') || button.title;
      const occurrence = keyCounts.get(baseKey) ?? 0;
      keyCounts.set(baseKey, occurrence + 1);
      return {
        key: `${baseKey}#${occurrence}`,
        testId: button.dataset.testid ?? '',
        name: button.getAttribute('aria-label') ?? button.title,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    });
  const manualActions = ['manual-save-button', 'discard-manual-changes-button'].map(testId => {
    const button = toolbar.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return {
      name: button.getAttribute('aria-label'),
      width: rect.width,
      text: button.textContent,
      hasIcon: Boolean(button.querySelector('svg[aria-hidden="true"]'))
    };
  });
  const overlaps = buttons.flatMap((first, index) => buttons.slice(index + 1).filter(second => (
    first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
  )).map(second => [first.name, second.name]));

  return {
    toolbar: { left: toolbarRect.left, right: toolbarRect.right, top: toolbarRect.top, bottom: toolbarRect.bottom },
    left: left.getBoundingClientRect().toJSON(),
    right: right.getBoundingClientRect().toJSON(),
    leftGap: Number.parseFloat(getComputedStyle(left).columnGap),
    labelsVisible: [...left.querySelectorAll('.gantt-toolbar-button-label')].some(label => getComputedStyle(label).display !== 'none'),
    buttons,
    manualActions,
    overlaps,
  };
});

const expectPopupInViewport = async (page: import('@playwright/test').Page, testId: string) => {
  const popup = page.getByTestId(testId);
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
};

test.beforeEach(async ({ page }) => {
  await setupMockApp(page);
});

test('preserves existing button dimensions when manual actions appear', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ modifiedTaskIds: new Set(), autoSave: false });
  });

  for (const width of [1920, 1600, 1545, 1544, 1400, 1217, 1201, 1200, 1000, 999, 950, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByTestId('manual-save-button')).toBeHidden();
    const cleanMetrics = await toolbarMetrics(page);
    const cleanButtons = new Map(cleanMetrics.buttons.map(button => [button.key, button]));

    await page.evaluate(async () => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      useTaskStore.setState({ modifiedTaskIds: new Set(['101']), autoSave: false });
    });
    await expect(page.getByTestId('manual-save-button')).toBeVisible();
    await expect(page.getByTestId('discard-manual-changes-button')).toBeVisible();
    await expect(page.getByTestId('manual-save-button')).toHaveAccessibleName('Save');
    await expect(page.getByTestId('discard-manual-changes-button')).toHaveAccessibleName('Cancel');

    const dirtyMetrics = await toolbarMetrics(page);
    const toolbarWidth = dirtyMetrics.toolbar.right - dirtyMetrics.toolbar.left;
    const expectedDirtyGap = toolbarWidth > 1200 ? 7 : 2;
    const expectedCleanGap = toolbarWidth > 1200 ? 8 : 2;
    expect(dirtyMetrics.leftGap, `dirty left gap at ${width}px`).toBe(expectedDirtyGap);
    expect(cleanMetrics.leftGap, `clean left gap at ${width}px`).toBe(expectedCleanGap);
    expect(dirtyMetrics.labelsVisible, `dirty labels at ${width}px (toolbar ${toolbarWidth}px)`).toBe(toolbarWidth > 1200);
    expect(dirtyMetrics.labelsVisible).toBe(cleanMetrics.labelsVisible);
    expect(dirtyMetrics.overlaps, `dirty overlaps at ${width}px`).toEqual([]);
    for (const button of dirtyMetrics.buttons) {
      expect(button.left, `${button.name} left at dirty ${width}px`).toBeGreaterThanOrEqual(dirtyMetrics.toolbar.left - 1);
      expect(button.right, `${button.name} right at dirty ${width}px`).toBeLessThanOrEqual(dirtyMetrics.toolbar.right + 1);
      expect(button.top, `${button.name} top at dirty ${width}px`).toBeGreaterThanOrEqual(dirtyMetrics.toolbar.top - 1);
      expect(button.bottom, `${button.name} bottom at dirty ${width}px`).toBeLessThanOrEqual(dirtyMetrics.toolbar.bottom + 1);
    }
    for (const action of dirtyMetrics.manualActions) {
      expect(action).not.toBeNull();
      expect(action!.width).toBe(32);
      expect(action!.text).toBe('');
      expect(action!.hasIcon).toBe(true);
    }

    for (const button of dirtyMetrics.buttons.filter(button => !['manual-save-button', 'discard-manual-changes-button'].includes(button.testId))) {
      const cleanButton = cleanButtons.get(button.key);
      expect(cleanButton, `${button.key} exists when clean at ${width}px`).toBeDefined();
      expect(button.width, `${button.key} width at ${width}px`).toBe(cleanButton!.width);
      expect(button.height, `${button.key} height at ${width}px`).toBe(cleanButton!.height);
    }
    expect(dirtyMetrics.buttons.map(button => button.key).filter(key => !key.startsWith('manual-save-button#') && !key.startsWith('discard-manual-changes-button#')))
      .toEqual(cleanMetrics.buttons
        .filter(button => !['manual-save-button', 'discard-manual-changes-button'].includes(button.testId))
        .map(button => button.key));
    if (width === 1920) {
      const buttonTops = dirtyMetrics.buttons.map(button => button.top);
      expect(Math.max(...buttonTops) - Math.min(...buttonTops), 'roomy toolbar buttons stay in one row').toBeLessThanOrEqual(8);
    }
    if (width === 1920 || width === 1600) {
      expect(Math.abs(cleanMetrics.toolbar.right - cleanMetrics.right.right - 24)).toBeLessThanOrEqual(1);
      expect(Math.abs(dirtyMetrics.toolbar.right - dirtyMetrics.right.right - 24)).toBeLessThanOrEqual(1);
      expect(Math.abs(cleanMetrics.right.right - dirtyMetrics.right.right)).toBeLessThanOrEqual(1);
    }

    await page.evaluate(async () => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      useTaskStore.setState({ modifiedTaskIds: new Set(), autoSave: false });
    });
  }

  await page.setViewportSize({ width: 1600, height: 800 });
  await expect(page.getByTestId('manual-save-button')).toBeHidden();
});

test('keeps Japanese Settings and Workload controls on the same row when manual actions appear', async ({ page }) => {
  await waitForInitialRender(page);
  await page.setViewportSize({ width: 1500, height: 800 });
  await page.evaluate(() => {
    const config = (window as typeof window & { RedmineCanvasGantt?: { i18n: Record<string, string> } }).RedmineCanvasGantt;
    if (!config) throw new Error('Gantt locale configuration is unavailable');
    Object.assign(config.i18n, {
      button_save: '保存',
      button_cancel: 'キャンセル',
      field_assigned_to: '担当者',
      field_project: 'プロジェクト',
      field_status: 'ステータス',
      field_tracker: 'トラッカー',
      field_version: 'バージョン',
      label_assigned_to_short: '担当',
      label_column_short: '列',
      label_dependencies_short: '依存',
      label_day: '日',
      label_discard_changes: '変更を破棄',
      label_month: '月',
      label_next_month: '次の月',
      label_prev_month: '前の月',
      label_project_short: 'Proj.',
      label_query_short: 'クエリ',
      label_save_changes_with_counts: '保存（チケット %{tasks} / 関連 %{relations}）',
      label_settings: '設定',
      label_status_short: 'ステータス',
      label_today: '今日',
      label_version_short: 'Ver.',
      label_week: '週',
      label_workload: 'ワークロード',
      label_workload_short: '工数'
    });
  });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ modifiedTaskIds: new Set(), autoSave: false });
  });

  const cleanMetrics = await toolbarMetrics(page);
  expect(cleanMetrics.leftGap).toBe(8);
  const getPositions = (metrics: Awaited<ReturnType<typeof toolbarMetrics>>) => {
    const settings = metrics.buttons.find(button => button.testId === 'display-settings-menu-button');
    const workload = metrics.buttons.find(button => button.testId === 'workload-menu-button');
    expect(settings).toBeDefined();
    expect(workload).toBeDefined();
    return { settings: settings!, workload: workload! };
  };
  const cleanPositions = getPositions(cleanMetrics);
  expect(cleanPositions.settings.name).toBe('設定');
  expect(cleanPositions.workload.name).toBe('ワークロード');
  await expect(page.locator('.gantt-toolbar-workload .gantt-toolbar-button-label')).toHaveText('工数');

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ modifiedTaskIds: new Set(['101']), autoSave: false });
  });
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  const dirtyMetrics = await toolbarMetrics(page);
  expect(dirtyMetrics.leftGap).toBe(7);
  expect(dirtyMetrics.overlaps).toEqual([]);
  const dirtyPositions = getPositions(dirtyMetrics);
  await expect(page.locator('.gantt-toolbar-workload .gantt-toolbar-button-label')).toHaveText('工数');
  expect(dirtyPositions.settings.top).toBe(dirtyPositions.workload.top);
  expect(dirtyPositions.settings.top).toBe(cleanPositions.settings.top);
  expect(dirtyPositions.workload.top).toBe(cleanPositions.workload.top);
  expect(dirtyPositions.settings.width).toBe(cleanPositions.settings.width);
  expect(dirtyPositions.workload.width).toBe(cleanPositions.workload.width);
  expect(Math.abs(cleanMetrics.toolbar.right - cleanMetrics.right.right - 24)).toBeLessThanOrEqual(1);
  expect(Math.abs(dirtyMetrics.toolbar.right - dirtyMetrics.right.right - 24)).toBeLessThanOrEqual(1);
});

test('keeps right controls contained and left labels compact across breakpoint boundaries', async ({ page }) => {
  await waitForInitialRender(page);

  for (const width of [1920, 1600, 1201, 1200, 1199, 1000, 999, 880, 865, 864, 701, 700, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await toolbarMetrics(page);
    expect(metrics.right.right, `right group at ${width}px`).toBeLessThanOrEqual(metrics.toolbar.right + 1);
    expect(metrics.right.left, `right group at ${width}px`).toBeGreaterThanOrEqual(metrics.toolbar.left - 1);
    expect(metrics.overlaps, `overlaps at ${width}px`).toEqual([]);
    for (const button of metrics.buttons) {
      expect(button.left, `${button.name} left at ${width}px`).toBeGreaterThanOrEqual(metrics.toolbar.left - 1);
      expect(button.right, `${button.name} right at ${width}px`).toBeLessThanOrEqual(metrics.toolbar.right + 1);
    }
    const toolbarWidth = metrics.toolbar.right - metrics.toolbar.left;
    if (toolbarWidth > 1200) expect(metrics.labelsVisible, `labels at ${width}px (toolbar ${toolbarWidth}px)`).toBe(true);
    else expect(metrics.labelsVisible, `labels at ${width}px (toolbar ${toolbarWidth}px)`).toBe(false);
    if (toolbarWidth > 864) {
      expect(metrics.left.top, `left row at ${width}px`).toBe(metrics.right.top);
    } else {
      expect(metrics.right.top, `right row at ${width}px`).toBeGreaterThan(metrics.left.top);
    }
  }
});

test('responds to a narrow embedded toolbar and preserves primary interactions', async ({ page }) => {
  await waitForInitialRender(page);
  await page.locator('.app-container').evaluate((app: HTMLElement) => {
    app.style.width = '680px';
    app.style.maxWidth = '680px';
  });

  const metrics = await toolbarMetrics(page);
  expect(metrics.overlaps).toEqual([]);
  expect(metrics.right.right).toBeLessThanOrEqual(metrics.toolbar.right + 1);
  expect(metrics.labelsVisible).toBe(false);

  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ modifiedTaskIds: new Set(['101']), autoSave: false });
  });
  await expect(page.getByTestId('manual-save-button')).toBeVisible();
  await expect(page.getByTestId('discard-manual-changes-button')).toBeVisible();
  const dirtyMetrics = await toolbarMetrics(page);
  expect(dirtyMetrics.overlaps).toEqual([]);
  for (const button of dirtyMetrics.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(dirtyMetrics.toolbar.left - 1);
    expect(button.right).toBeLessThanOrEqual(dirtyMetrics.toolbar.right + 1);
  }
  await page.getByTestId('baseline-save-menu-button').click();
  const baselineMenu = page.getByTestId('baseline-save-menu');
  await expect(baselineMenu).toBeVisible();
  const popup = await baselineMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(popup).not.toBeNull();
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await page.getByTestId('baseline-save-menu-button').click();

  await page.getByTestId('display-settings-menu-button').click();
  await expectPopupInViewport(page, 'display-settings-menu');
  await page.getByTestId('display-settings-menu-button').click();
  await page.getByTestId('query-menu-button').click();
  await expectPopupInViewport(page, 'query-menu');
  await page.getByTestId('query-menu-button').click();
  await page.getByTestId('column-menu-button').click();
  await expectPopupInViewport(page, 'column-menu');
  await page.getByTestId('column-menu-button').click();
  await page.getByTestId('relation-settings-menu-button').click();
  await expectPopupInViewport(page, 'relation-settings-menu');
  await page.getByTestId('relation-settings-menu-button').click();
  await page.getByTestId('workload-menu-button').click();
  await expectPopupInViewport(page, 'workload-menu');
  await page.getByTestId('workload-menu-button').click();
  await page.getByTestId('project-filter-menu-button').click();
  await expectPopupInViewport(page, 'project-menu');
  await page.getByTestId('project-filter-menu-button').click();
  await page.getByTitle('Filter Tasks').click();
  await expectPopupInViewport(page, 'filter-menu');
  await page.getByTitle('Filter Tasks').click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toBeVisible();
});
