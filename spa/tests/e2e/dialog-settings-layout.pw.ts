import { expect, test } from '@playwright/test';
import { setupMockApp, waitForInitialRender } from './support/mockApp';

const japaneseLabels = {
  label_settings: '表示設定',
  label_manual_scheduling: '手動スケジュール',
  label_date_placement: '日付の配置',
  label_date_placement_working_days: '稼働日に合わせて配置',
  label_date_placement_calendar_days: 'カレンダー上の任意の日に配置',
  label_calculation_and_performance: '計算とパフォーマンス',
  help_desc_calculate_critical_path: 'クリティカルパスと余裕日数を計算します。無効にしても依存関係と自動スケジュールは使用できます。',
  label_display_short: '表示',
  label_progress_line: '進捗ライン',
  label_organize_by_dependency: '依存関係に基づいて並べ替え',
  label_show_start_date_only: '開始日のみのチケット',
  label_show_due_date_only: '期日のみのチケット',
  label_toggle_task_titles: 'チケット名',
  label_toggle_task_bar_dates: 'タスクバーの日付',
  label_toggle_hierarchy_lines: '階層線',
  label_issue_dialog_settings: 'チケットダイアログ',
  label_issue_dialog_width: '幅',
  label_issue_dialog_width_compact: 'コンパクト（900 px）',
  label_issue_dialog_width_standard: '標準（1200 px）',
  label_issue_dialog_width_wide: 'ワイド（1500 px）',
  label_issue_dialog_height: '高さ',
  label_issue_dialog_height_auto: '自動',
  label_issue_dialog_height_fixed: '固定',
  label_issue_dialog_height_percent: '固定時の高さ（%）',
  label_issue_dialog_reset: 'リセット',
  label_pane_layout: 'ペインのレイアウト',
  label_maximize_left_pane: '一覧を最大化',
  label_standard_view: '標準',
  label_maximize_right_pane: 'チャートを最大化',
  label_row_height: '行の高さ',
  label_font_size: 'フォントサイズ',
};

for (const width of [1280, 375]) {
  for (const language of ['en', 'ja'] as const) {
    test(`keeps display settings controls within the ${width}px viewport (${language})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await setupMockApp(page);
      await waitForInitialRender(page);
      if (language === 'ja') {
        await page.evaluate((labels) => {
          const config = (window as Window & { RedmineCanvasGantt?: { i18n?: Record<string, string> } }).RedmineCanvasGantt;
          if (config?.i18n) Object.assign(config.i18n, labels);
        }, japaneseLabels);
      }
      await page.getByTestId('display-settings-menu-button').click();

      const menu = page.getByTestId('display-settings-menu');
      await expect(menu.getByText(language === 'ja' ? '表示設定' : 'Settings', { exact: true })).toBeVisible();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds).toBeTruthy();
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);

      const selectCount = await menu.locator('select').count();
      expect(selectCount).toBe(6);
      for (let index = 0; index < selectCount; index += 1) {
        const select = menu.locator('select').nth(index);
        const selectBounds = await select.boundingBox();
        const labelBounds = await select.locator('xpath=ancestor::label[1]').boundingBox();
        expect(selectBounds).toBeTruthy();
        expect(labelBounds).toBeTruthy();
        expect(selectBounds!.x).toBeGreaterThanOrEqual(labelBounds!.x);
        expect(selectBounds!.x + selectBounds!.width).toBeLessThanOrEqual(labelBounds!.x + labelBounds!.width);
      }

      const scrollState = await menu.evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      expect(scrollState.overflowY).toBe('auto');
      expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
      await menu.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    });
  }
}

test('keeps the open display settings menu in the viewport across toolbar reflows', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  await setupMockApp(page);
  await waitForInitialRender(page);
  const button = page.getByTestId('display-settings-menu-button');
  const menu = page.getByTestId('display-settings-menu');
  await button.click();

  for (const width of [1920, 1280, 768, 375, 1920]) {
    await page.setViewportSize({ width, height: 760 });
    await expect(menu).toBeVisible();
    await expect.poll(async () => {
      const bounds = await menu.boundingBox();
      return bounds !== null && bounds.x >= 12 && bounds.x + bounds.width <= width - 12;
    }).toBe(true);
    const buttonBounds = await button.boundingBox();
    const menuBounds = await menu.boundingBox();
    expect(menuBounds!.y).toBeGreaterThanOrEqual(buttonBounds!.y + buttonBounds!.height);
  }

  await page.mouse.click(1910, 750);
  await expect(menu).toBeHidden();
  await button.click();
  await expect(menu).toBeVisible();
  const reopenedBounds = await menu.boundingBox();
  expect(reopenedBounds!.x).toBeGreaterThanOrEqual(12);
  expect(reopenedBounds!.x + reopenedBounds!.width).toBeLessThanOrEqual(1908);
});
