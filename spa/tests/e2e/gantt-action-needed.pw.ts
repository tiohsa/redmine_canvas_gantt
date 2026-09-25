import { expect, test, type Locator } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => { await setupMockApp(page); });

const expectActionLayout = async (dialog: Locator, width: number) => {
  const problems = await dialog.evaluate(element => {
    const bounds = (node: Element) => node.getBoundingClientRect();
    const outside = (inner: DOMRect, outer: DOMRect) =>
      inner.left < outer.left - 1 || inner.right > outer.right + 1 ||
      inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1;
    const list = element.querySelector('.action-needed-list')!;
    const rows = Array.from(list.querySelectorAll('.action-needed-row'));
    const errors: string[] = [];
    if (rows.length !== 25) errors.push(`expected 25 rows, found ${rows.length}`);
    rows.forEach((row, index) => {
      const rowBox = bounds(row);
      const content = row.querySelector('.action-needed-row-top')!;
      const subject = row.querySelector('.action-needed-subject')!;
      if (outside(bounds(content), rowBox) || outside(bounds(subject), rowBox)) errors.push(`row ${index} content`);
      if (subject.scrollWidth > subject.clientWidth + 1 || row.scrollWidth > row.clientWidth + 1) errors.push(`row ${index} horizontal overflow`);
      if (row.scrollHeight > row.clientHeight + 1) errors.push(`row ${index} vertical overflow`);
      if (index + 1 < rows.length && rowBox.bottom > bounds(rows[index + 1]).top + 1) errors.push(`row ${index} overlap`);
    });
    if (list.scrollWidth > list.clientWidth + 1) errors.push('list horizontal overflow');
    const overload = element.querySelector('.action-needed-overload')!;
    if (outside(bounds(overload.querySelector('.action-needed-overload-text')!), bounds(overload))) errors.push('overload text');
    if (bounds(overload).right > bounds(element).right + 1) errors.push('overload horizontal overflow');
    element.querySelectorAll('.action-needed-filters button').forEach((button, index) => {
      if (outside(bounds(button.firstElementChild!), bounds(button))) errors.push(`filter ${index}`);
    });
    return errors;
  });
  expect(problems, `action layout at ${width}px`).toEqual([]);
};

test('pages many loaded issues, preserves scope state, and focuses an unscheduled read-only issue', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    const tasks = Array.from({ length: 80 }, (_, index) => ({ ...base, id: String(index + 1000),
      subject: `Needs plan ${index}`, startDate: undefined, dueDate: undefined,
      assignedToId: null, estimatedHours: 2, hasPhysicalChildren: false, editable: false, rowIndex: index }));
    useTaskStore.getState().setTasks(tasks);
    window.RedmineCanvasGantt!.redmineBase = '/redmine';
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true,
      focusTask: (taskId: string) => { localStorage.setItem('focusedActionTask', taskId); return { status: 'ok' }; } });
  });
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('aria-label', 'Action needed: 80');
  await expect(page.getByTestId('action-needed-indicator')).toHaveClass(/action-needed-trigger-indicator-ready/);
  await expect(page.getByTestId('action-needed-button')).not.toContainText('80');
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  await expect(dialog.locator('.action-needed-metrics')).toHaveCount(0);
  await expect(dialog.locator('.action-needed-header-icon')).toHaveCount(0);
  await expect(dialog.getByRole('navigation', { name: 'Filter by reason' })).toBeVisible();
  expect(await dialog.locator('.action-needed-filters').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: /All\s*80/ })).toHaveAttribute('aria-pressed', 'true');
  const list = page.getByTestId('action-needed-list');
  const rows = list.locator('.action-needed-row');
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText('#1000');
  await expect(rows.first()).toContainText('Needs plan 0');
  await expect(rows.first()).not.toContainText('Missing start or due date');
  await expect(dialog.locator('.action-needed-detail-pane')).toContainText('Missing start or due date');
  await dialog.getByRole('button', { name: 'Next page' }).click();
  await expect(rows.first()).toContainText('#1025');
  await expect(dialog.locator('.action-needed-pagination')).toContainText('2 / 4');
  await rows.first().click();
  await expect(dialog).toBeVisible();
  await expect(rows.first()).toHaveAttribute('aria-current', 'true');
  const detail = dialog.locator('.action-needed-detail-pane');
  await expect(detail).toContainText('#1025');
  await expect(detail).toContainText('Needs plan 25');
  await expect(detail).toContainText('Missing start or due date');
  const issueLink = detail.getByRole('link', { name: 'Open this issue' });
  await expect(issueLink).toHaveAttribute('href', '/redmine/issues/1025');
  await expect(issueLink).toHaveAttribute('target', '_blank');
  await expect(issueLink).toHaveAttribute('rel', 'noopener noreferrer');
  await detail.getByRole('button', { name: 'Show in Gantt' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('focusedActionTask'))).toBe('1025');
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ dataReadStatus: 'loading' });
  });
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('data-load-state', 'loading');
  await expect(page.getByTestId('action-needed-indicator')).toHaveClass(/action-needed-trigger-indicator-loading/);
  await page.getByTestId('action-needed-button').click();
  await expect(page.getByText('Loading current issues')).toBeVisible();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.setState({ dataReadStatus: 'error' });
  });
  await expect(page.getByText(/could not be loaded/)).toBeVisible();
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('data-load-state', 'error');
  await expect(page.getByTestId('action-needed-indicator')).toHaveClass(/action-needed-trigger-indicator-error/);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useTaskStore.getState().setTasks([]);
    useTaskStore.setState({ dataReadStatus: 'ready' });
  });
  await expect(page.getByTestId('action-needed-button')).toHaveAttribute('aria-label', 'Action needed: 0');
  await expect(page.getByTestId('action-needed-indicator')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /All\s*0/ })).toBeVisible();
  await expect(dialog.getByText('No matching issues')).toBeVisible();
  await expect(dialog.locator('.action-needed-detail-pane')).toBeEmpty();
});

test('keeps fullscreen open on Escape and traps focus inside the dialog', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().setFullScreen(true);
  });
  const trigger = page.getByTestId('action-needed-button');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const close = dialog.getByRole('button', { name: 'Close' }).first();
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: /Planned overload/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.app-container')).toHaveClass(/is-fullscreen/);
});

test('keeps Ctrl+F and typing out of the background filter while a dialog is open', async ({ page }) => {
  await waitForInitialRender(page);
  await page.keyboard.press('Control+f');
  const filter = page.getByPlaceholder('Filter by subject...');
  await filter.fill('login');
  await page.getByTitle('Filter Tasks').click();
  await expect(filter).toHaveCount(0);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().setFullScreen(true);
  });
  const trigger = page.getByTestId('action-needed-button');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const close = dialog.getByRole('button', { name: 'Close' }).first();
  await expect(close).toBeFocused();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('backgroundMustStayUnchanged');
  await expect(close).toBeFocused();
  await expect(filter).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.app-container')).toHaveClass(/is-fullscreen/);
  expect(await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().filterText;
  })).toBe('login');
});

test('preserves an open background filter until the modal closes', async ({ page }) => {
  await waitForInitialRender(page);
  await page.keyboard.press('Control+f');
  const filter = page.getByPlaceholder('Filter by subject...');
  await filter.fill('sidebar');
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    useUIStore.getState().setFullScreen(true);
  });
  const trigger = page.getByTestId('action-needed-button');
  // Keyboard activation leaves the background menu open (no outside mousedown).
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  await page.keyboard.press('Control+f');
  await expect(dialog.getByRole('button', { name: 'Close' }).first()).toBeFocused();
  await page.keyboard.type('backgroundMustNotChange');
  await expect(filter).toHaveValue('sidebar');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(filter).toHaveValue('sidebar');
  await expect(page.locator('.app-container')).toHaveClass(/is-fullscreen/);
  await page.keyboard.press('Escape');
  await expect(filter).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().filterText;
  })).toBe('');
});

test('restores row focus during a delayed refresh and gives the dialog priority over fullscreen Escape', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/UIStore.ts');
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    useUIStore.getState().setFullScreen(true);
    useTaskStore.getState().setFilterText('login');
  });
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/canvas_gantt/data.json**', async route => {
    await responseGate;
    await route.fulfill({ json: defaultMockData });
  });
  const trigger = page.getByTestId('action-needed-button');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const row = dialog.locator('.action-needed-row').first();
  await row.focus();
  await expect(row).toBeFocused();
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    void useTaskStore.getState().refreshData();
  });
  await expect(dialog.getByText('Loading current issues')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' }).first()).toBeFocused();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('mustNotEditTheFilter');
  await expect(page.getByPlaceholder('Filter by subject...')).toHaveCount(0);
  // Exercise Escape even if focus is lost outside React's dialog event path.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.app-container')).toHaveClass(/is-fullscreen/);
  expect(await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().filterText;
  })).toBe('login');
  release();
  await expect(trigger).toHaveAttribute('data-load-state', 'ready');
});

test('keeps the header fixed while the issue list scrolls independently', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    useTaskStore.getState().setTasks(Array.from({ length: 25 }, (_, index) => ({ ...base,
      id: String(index + 1000), subject: `Needs plan ${index}`, startDate: undefined, dueDate: undefined,
      assignedToId: null, estimatedHours: 2, hasPhysicalChildren: false, rowIndex: index })));
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
  });
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const list = dialog.locator('.action-needed-list');
  const scrollTop = await list.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  const bounds = await dialog.evaluate(element => {
    const dialogBox = element.getBoundingClientRect();
    const headerBox = element.querySelector('.action-needed-header')!.getBoundingClientRect();
    const closeBox = element.querySelector('.action-needed-close-icon')!.getBoundingClientRect();
    return { dialogTop: dialogBox.top, dialogBottom: dialogBox.bottom, headerTop: headerBox.top,
      closeTop: closeBox.top, closeBottom: closeBox.bottom,
      dialogScrollTop: element.scrollTop, horizontalOverflow: element.scrollWidth > element.clientWidth };
  });
  expect(bounds.dialogScrollTop).toBe(0);
  expect(bounds.headerTop).toBeGreaterThanOrEqual(bounds.dialogTop);
  expect(bounds.closeTop).toBeGreaterThanOrEqual(bounds.dialogTop);
  expect(bounds.closeBottom).toBeLessThanOrEqual(bounds.dialogBottom);
  expect(bounds.horizontalOverflow).toBe(false);
  const expandedHeight = await dialog.evaluate(element => element.getBoundingClientRect().height);
  await dialog.getByRole('button', { name: /Overdue\s*0/ }).click();
  await expect(dialog.locator('.action-needed-row')).toHaveCount(0);
  expect(await dialog.evaluate(element => element.getBoundingClientRect().height)).toBe(expandedHeight);
  await dialog.getByRole('button', { name: /All\s*25/ }).click();
  await expect(dialog.locator('.action-needed-list .action-needed-row').first()).toBeVisible();
  await expect(dialog.locator('.action-needed-overload')).toBeVisible();
  await expect(dialog.locator('.action-needed-footer')).toHaveCount(0);
});

test('contains multiline rows and controls under Redmine 6 button styles', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await waitForInitialRender(page);
  await page.addStyleTag({ content: `
    input, select, button { height: 24px; margin-top: 1px; margin-bottom: 1px; }
  ` });
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const base = useTaskStore.getState().allTasks[0];
    const subjects = [
      '期限超過の確認が必要な長い日本語のチケット件名'.repeat(3),
      'UnbrokenEnglishSubject'.repeat(9),
      `https://example.com/${'long-path-segment'.repeat(12)}`,
    ];
    useTaskStore.getState().setTasks(Array.from({ length: 26 }, (_, index) => ({ ...base,
      id: String(index + 1000), subject: subjects[index % subjects.length],
      startDate: undefined, dueDate: undefined, assignedToId: null,
      estimatedHours: 2, hasPhysicalChildren: false, rowIndex: index })));
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
  });
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const rows = dialog.locator('.action-needed-row');
  await expect(rows).toHaveCount(25);

  for (const width of [800, 360]) {
    await page.setViewportSize({ width, height: 600 });
    await expectActionLayout(dialog, width);
  }
  // Simulate theme defaults separately from Redmine's standard button rule.
  await page.addStyleTag({ content: 'button { box-sizing: content-box; white-space: nowrap; }' });
  for (const width of [800, 360]) {
    await page.setViewportSize({ width, height: 600 });
    await expectActionLayout(dialog, width);
  }
  expect(await dialog.locator('.action-needed-close-icon').evaluate(node => node.getBoundingClientRect().height)).toBe(32);
  expect(await dialog.locator('.action-needed-pagination button').first().evaluate(node => node.getBoundingClientRect().height)).toBe(26);
});

test('shows a compact planned overload entry and opens the workload pane', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    const issue = useTaskStore.getState().allTasks[0];
    const daily = { dateStr: '2026-09-23', timestamp: 0, plannedLoad: 10, isPlannedOverload: true,
      plannedContributions: [{ task: issue, dailyLoad: 10 }], actualHours: 0, actualContributions: [], isActualOverload: false };
    useWorkloadStore.setState({ workloadPaneVisible: true, capacityThreshold: 8,
      workloadData: { assignees: new Map([[10, { assigneeId: 10, assigneeName: 'Jane',
        dailyWorkloads: new Map([['2026-09-23', daily]]), plannedTotal: 10, plannedPeak: 10, actualTotal: 0, actualPeak: 0 }]]),
      plannedOverloadedAssigneeCount: 1, plannedOverloadedDayCount: 1, actualOverloadedAssigneeCount: 0, actualOverloadedDayCount: 0 } });
  });
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const overload = dialog.getByRole('button', { name: /Planned overload 1 assignee-days/ });
  await expect(dialog.locator('.action-needed-overload-row')).toHaveCount(0);
  await expect(overload).not.toContainText('Jane');
  await expect(overload).not.toContainText('Threshold');
  await overload.click();
  await expect(dialog).toHaveCount(0);
  const state = await page.evaluate(async () => {
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    return { visible: useWorkloadStore.getState().workloadPaneVisible,
      focused: useWorkloadStore.getState().focusedHistogramBar };
  });
  expect(state).toEqual({ visible: true, focused: null });
});

for (const width of [360, 767, 768]) {
  test(`shows the action needed panes and keeps controls within ${width}px`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'responsive geometry is checked in Chromium');
    await page.setViewportSize({ width, height: 600 });
    await waitForInitialRender(page);
    await page.evaluate(async () => {
      const { useTaskStore } = await import('/src/stores/TaskStore.ts');
      const base = useTaskStore.getState().allTasks[0];
      const subject = '期限超過の確認が必要な長い日本語の件名'.repeat(55) +
        'UnbrokenEnglishSubject'.repeat(30) + `https://example.com/${'long-path-segment'.repeat(35)}`;
      useTaskStore.getState().setTasks([{ ...base, id: '9001', subject, startDate: undefined,
        dueDate: undefined, assignedToId: null, estimatedHours: undefined, rowIndex: 0 }]);
      useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
    });
    const trigger = page.getByTestId('action-needed-button');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Action needed' });
    const listPane = dialog.locator('.action-needed-list-pane');
    const detail = dialog.locator('.action-needed-detail-pane');
    const search = listPane.getByRole('searchbox');
    const row = listPane.locator('.action-needed-row');
    const controls = await dialog.evaluate(element => {
      const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const header = rect('.action-needed-header');
      const close = rect('.action-needed-close-icon');
      const overload = rect('.action-needed-overload');
      return { dialogLeft: box.left, dialogRight: box.right, headerLeft: header.left,
        headerRight: header.right, closeLeft: close.left, closeRight: close.right,
        overloadLeft: overload.left, overloadRight: overload.right,
        overloadBottom: overload.bottom, dialogBottom: box.bottom };
    });
    expect(controls.dialogLeft).toBeGreaterThanOrEqual(0);
    expect(controls.dialogRight).toBeLessThanOrEqual(width);
    for (const edge of [controls.headerLeft, controls.closeLeft, controls.overloadLeft]) {
      expect(edge).toBeGreaterThanOrEqual(controls.dialogLeft - 1);
    }
    for (const edge of [controls.headerRight, controls.closeRight, controls.overloadRight]) {
      expect(edge).toBeLessThanOrEqual(controls.dialogRight + 1);
    }
    expect(controls.overloadBottom).toBeLessThanOrEqual(controls.dialogBottom + 1);

    if (width === 768) {
      await expect(listPane).toBeVisible();
      await expect(detail).toBeVisible();
      const panes = await dialog.evaluate(element => {
        const list = element.querySelector('.action-needed-list-pane')!.getBoundingClientRect();
        const detail = element.querySelector('.action-needed-detail-pane')!.getBoundingClientRect();
        return { listRight: list.right, detailLeft: detail.left, listWidth: list.width, detailWidth: detail.width };
      });
      expect(panes.listRight).toBeLessThan(panes.detailLeft);
      expect(panes.listWidth).toBeGreaterThan(0);
      expect(panes.detailWidth).toBeGreaterThan(0);
    } else {
      await expect(listPane).toBeVisible();
      await expect(detail).toBeHidden();
      await row.click();
      await expect(listPane).toBeHidden();
      await expect(detail).toBeVisible();
      const back = detail.getByRole('button', { name: 'Back to list' });
      await expect(back).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(detail.getByRole('link', { name: 'Open this issue' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(back).toBeFocused();
      const overflow = await detail.evaluate(element => {
        const heading = element.querySelector('h3')!;
        return { pane: element.scrollWidth > element.clientWidth + 1,
          heading: heading.scrollWidth > heading.clientWidth + 1,
          scrollable: element.scrollHeight > element.clientHeight };
      });
      expect(overflow).toEqual({ pane: false, heading: false, scrollable: true });
      expect(await detail.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollTop; })).toBeGreaterThan(0);
      await back.click();
      await expect(listPane).toBeVisible();
      await expect(detail).toBeHidden();
      await expect(search).toBeFocused();
      await dialog.locator('.action-needed-close-icon').focus();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.locator('.action-needed-overload')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.locator('.action-needed-close-icon')).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('keeps reasons in the selected issue detail instead of the compact list row', async ({ page }) => {
  await waitForInitialRender(page);
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    const issue = useTaskStore.getState().allTasks[0];
    useTaskStore.getState().setTasks([{ ...issue, id: '9001', subject: 'Three reasons',
      startDate: new Date(2020, 8, 1).getTime(), dueDate: new Date(2020, 8, 22).getTime(),
      assignedToId: null, estimatedHours: undefined }]);
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
  });
  await page.getByTestId('action-needed-button').click();
  const dialog = page.getByRole('dialog', { name: 'Action needed' });
  const row = dialog.locator('.action-needed-row');
  await expect(row).toContainText(/#9001\s*Three reasons/);
  await expect(row).not.toContainText('Overdue');
  await expect(row.locator('.action-needed-badge')).toHaveCount(0);
  await expect(row).toHaveAttribute('aria-label', /Overdue, No assignee, No estimated hours/);
  await row.click();
  await expect(dialog).toBeVisible();
  const detail = dialog.locator('.action-needed-detail-pane');
  await expect(detail).toContainText('3 reasons');
  await expect(detail.locator('.action-needed-badge')).toHaveCount(3);
  await expect(detail).toContainText('Overdue');
  await expect(detail).toContainText('No assignee');
  await expect(detail).toContainText('No estimated hours');
});
