import { expect, test } from '@playwright/test';
import { defaultMockData, setupMockApp, waitForInitialRender } from './support/mockApp';

test.beforeEach(async ({ page }) => { await setupMockApp(page); });

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
    useTaskStore.setState({ dataReadStatus: 'ready', initialDataLoaded: true });
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
  await expect(dialog.locator('.action-needed-total')).toHaveText('80');
  const list = page.getByTestId('action-needed-list');
  await expect(list.locator('button')).toHaveCount(25);
  await expect(list.locator('button').first()).toContainText('Missing start or due date');
  expect(await list.locator('button').first().evaluate(row => row.getBoundingClientRect().height)).toBeLessThan(75);
  await page.getByRole('button', { name: '›' }).click();
  await expect(list.locator('button').first()).toContainText('#1025');
  await list.locator('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Action needed' })).toHaveCount(0);
  const selected = await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/TaskStore.ts');
    return useTaskStore.getState().selectedTaskId;
  });
  expect(selected).toBe('1025');
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

test('keeps the dialog header and close control visible while its body scrolls', async ({ page }) => {
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
  const body = dialog.locator('.action-needed-body');
  const scrollTop = await body.evaluate(element => {
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
    useTaskStore.getState().setTasks(Array.from({ length: 25 }, (_, index) => ({ ...base,
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
    const overflow = await dialog.evaluate(element => {
      const bounds = (node: Element) => node.getBoundingClientRect();
      const outside = (inner: DOMRect, outer: DOMRect) =>
        inner.left < outer.left - 1 || inner.right > outer.right + 1 ||
        inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1;
      const list = element.querySelector('.action-needed-list')!;
      const rowElements = Array.from(list.querySelectorAll('.action-needed-row'));
      const problems: string[] = [];
      rowElements.forEach((row, index) => {
        const rowBox = bounds(row);
        const subject = bounds(row.querySelector('.action-needed-subject')!);
        const summary = bounds(row.querySelector('.action-needed-row-summary')!);
        const chevron = bounds(row.querySelector('.action-needed-chevron')!);
        if (outside(subject, rowBox) || outside(summary, rowBox)) problems.push(`row ${index} content`);
        if (subject.right > chevron.left + 1) problems.push(`row ${index} chevron`);
        if (index + 1 < rowElements.length && rowBox.bottom > bounds(rowElements[index + 1]).top + 1) {
          problems.push(`row ${index} overlap`);
        }
      });
      if (list.scrollWidth > list.clientWidth + 1) problems.push('list horizontal overflow');
      const overload = element.querySelector('.action-needed-overload')!;
      if (outside(bounds(overload.querySelector('.action-needed-overload-text')!), bounds(overload))) {
        problems.push('overload text');
      }
      if (bounds(overload).right > bounds(element).right + 1) problems.push('overload horizontal overflow');
      element.querySelectorAll('.action-needed-filters button').forEach((button, index) => {
        if (outside(bounds(button.firstElementChild!), bounds(button))) problems.push(`filter ${index}`);
      });
      return problems;
    });
    expect(overflow, `layout at ${width}px`).toEqual([]);
  }
  // Simulate theme defaults separately from Redmine's standard button rule.
  await page.addStyleTag({ content: 'button { box-sizing: content-box; white-space: nowrap; }' });
  const themeOverflow = await dialog.evaluate(element => {
    const list = element.querySelector('.action-needed-list')!;
    const row = list.querySelector('.action-needed-row')!;
    const subject = row.querySelector('.action-needed-subject')!.getBoundingClientRect();
    const chevron = row.querySelector('.action-needed-chevron')!.getBoundingClientRect();
    const overload = element.querySelector('.action-needed-overload')!;
    return {
      list: list.scrollWidth > list.clientWidth + 1,
      row: row.getBoundingClientRect().right > list.getBoundingClientRect().right + 1,
      subject: subject.right > chevron.left + 1,
      overload: overload.getBoundingClientRect().right > element.getBoundingClientRect().right + 1,
    };
  });
  expect(themeOverflow).toEqual({ list: false, row: false, subject: false, overload: false });
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
  await expect(dialog).not.toContainText('Jane');
  await expect(dialog).not.toContainText('Threshold');
  await overload.click();
  await expect(dialog).toHaveCount(0);
  const state = await page.evaluate(async () => {
    const { useWorkloadStore } = await import('/src/stores/WorkloadStore.ts');
    return { visible: useWorkloadStore.getState().workloadPaneVisible,
      focused: useWorkloadStore.getState().focusedHistogramBar };
  });
  expect(state).toEqual({ visible: true, focused: null });
});

test('shows one primary reason and a compact count for other reasons', async ({ page }) => {
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
  await expect(row).toContainText(/Overdue.*and 2 more/);
  await expect(row).toHaveAttribute('aria-label', /Overdue, No assignee, No estimated hours/);
  await expect(row.locator('.action-needed-primary')).toHaveCount(1);
  await expect(row.locator('.action-needed-reason')).toHaveCount(0);
});
