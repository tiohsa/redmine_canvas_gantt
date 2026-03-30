import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpDialog } from './HelpDialog';
import { useUIStore } from '../stores/UIStore';

const buildHelpTranslations = (language: 'ja' | 'en'): Record<string, string> => {
    if (language === 'ja') {
        return {
            label_help: '日本語ヘルプ',
            help_label_layout_filters: '日本語レイアウトと絞り込み',
            label_maximize_left_pane: '日本語一覧最大化',
            label_maximize_right_pane: '日本語チャート最大化',
            label_issue_new: '日本語新規チケット',
            label_filter_tasks: '日本語絞り込み',
            label_edit_query_in_redmine: '日本語クエリ編集',
            label_column_plural: '日本語カラム',
            label_workload: '日本語ワークロード',
            field_assigned_to: '日本語担当者',
            label_project_plural: '日本語プロジェクト',
            label_version_plural: '日本語バージョン',
            field_status: '日本語ステータス',
            label_progress_line: '日本語進捗ライン',
            label_relation_title: '日本語依存関係',
            label_organize_by_dependency: '日本語依存整理',
            label_toggle_points_orphans: '日本語ポイント切替',
            label_prev_month: '日本語前月',
            label_next_month: '日本語次月',
            label_today: '日本語今日',
            help_label_zoom: '日本語ズーム',
            label_row_height: '日本語行高',
            button_top: '日本語トップ',
            help_label_fullscreen: '日本語全画面',
            help_label_autosave: '日本語自動保存',
            help_label_timeline_view: '日本語タイムライン',
            help_label_editing_saving: '日本語編集と保存',
            help_desc_maximize_left: '日本語 左ペイン説明',
            help_desc_maximize_right: '日本語 右ペイン説明',
            help_desc_issue_new: '日本語 新規作成説明',
            help_desc_filter_tasks: '日本語 フィルタ説明',
            help_desc_edit_query: '日本語 クエリ編集説明',
            help_desc_columns: '日本語 カラム説明',
            help_desc_workload: '日本語 ワークロード説明',
            help_desc_assignee_filter: '日本語 担当者説明',
            help_desc_project_filter: '日本語 プロジェクト説明',
            help_desc_version_filter: '日本語 バージョン説明',
            help_desc_status_filter: '日本語 ステータス説明',
            help_desc_progress_line: '日本語 進捗説明',
            help_desc_dependency_settings: '日本語 依存設定説明',
            help_desc_export: '日本語 エクスポート説明',
            help_desc_organize_by_dependency: '日本語 依存整理説明',
            help_desc_points_orphans: '日本語 ポイント説明',
            help_desc_prev_next_month: '日本語 前月次月説明',
            help_desc_today: '日本語 今日説明',
            help_desc_zoom: '日本語 ズーム説明',
            help_desc_row_height: '日本語 行高説明',
            help_desc_fullscreen: '日本語 全画面説明',
            help_desc_autosave: '日本語 自動保存説明',
            help_desc_save: '日本語 保存説明',
            help_desc_cancel: '日本語 キャンセル説明',
            help_desc_top: '日本語 トップ説明',
            help_op_drag_drop: '日本語ドラッグ',
            help_op_drag_drop_desc: '日本語 ドラッグ説明',
            help_op_dependency: '日本語依存作成',
            help_op_dependency_desc: '日本語 依存作成説明',
            help_op_inline_edit: '日本語インライン編集',
            help_op_inline_edit_desc: '日本語 インライン説明',
            help_op_context_menu: '日本語コンテキストメニュー',
            help_op_context_menu_desc: '日本語 コンテキスト説明',
            help_op_unscheduled: '日本語日程設定',
            help_op_unscheduled_desc: '日本語 日程設定説明',
            button_close: '日本語閉じる'
        };
    }

    return {
        label_help: 'English Help',
        help_label_layout_filters: 'English Layout and Filters',
        label_maximize_left_pane: 'English Maximize List',
        label_maximize_right_pane: 'English Maximize Chart',
        label_issue_new: 'English New Issue',
        label_filter_tasks: 'English Filter',
        label_edit_query_in_redmine: 'English Edit Query',
        label_column_plural: 'English Columns',
        label_workload: 'English Workload',
        field_assigned_to: 'English Assignee',
        label_project_plural: 'English Projects',
        label_version_plural: 'English Versions',
        field_status: 'English Status',
        label_progress_line: 'English Progress',
        label_relation_title: 'English Dependency',
        label_organize_by_dependency: 'English Organize',
        label_toggle_points_orphans: 'English Orphans',
        label_prev_month: 'English Previous Month',
        label_next_month: 'English Next Month',
        label_today: 'English Today',
        help_label_zoom: 'English Zoom',
        label_row_height: 'English Row Height',
        button_top: 'English Top',
        help_label_fullscreen: 'English Full Screen',
        help_label_autosave: 'English Auto Save',
        help_label_timeline_view: 'English Timeline and View',
        help_label_editing_saving: 'English Editing and Saving',
        help_desc_maximize_left: 'English left pane description',
        help_desc_maximize_right: 'English right pane description',
        help_desc_issue_new: 'English new issue description',
        help_desc_filter_tasks: 'English filter description',
        help_desc_edit_query: 'English query editor description',
        help_desc_columns: 'English columns description',
        help_desc_workload: 'English workload description',
        help_desc_assignee_filter: 'English assignee description',
        help_desc_project_filter: 'English project description',
        help_desc_version_filter: 'English version description',
        help_desc_status_filter: 'English status description',
        help_desc_progress_line: 'English progress description',
        help_desc_dependency_settings: 'English dependency settings description',
        help_desc_export: 'English export description',
        help_desc_organize_by_dependency: 'English organize description',
        help_desc_points_orphans: 'English orphan points description',
        help_desc_prev_next_month: 'English previous next month description',
        help_desc_today: 'English today description',
        help_desc_zoom: 'English zoom description',
        help_desc_row_height: 'English row height description',
        help_desc_fullscreen: 'English full screen description',
        help_desc_autosave: 'English auto save description',
        help_desc_save: 'English save description',
        help_desc_cancel: 'English cancel description',
        help_desc_top: 'English top description',
        help_op_drag_drop: 'English Drag and Drop',
        help_op_drag_drop_desc: 'English drag and drop description',
        help_op_dependency: 'English Dependencies',
        help_op_dependency_desc: 'English dependency creation description',
        help_op_inline_edit: 'English Inline Editing',
        help_op_inline_edit_desc: 'English inline edit description',
        help_op_context_menu: 'English Context Menu',
        help_op_context_menu_desc: 'English context menu description',
        help_op_unscheduled: 'English Schedule Tasks',
        help_op_unscheduled_desc: 'English unscheduled task description',
        button_close: 'English Close'
    };
};

const setTranslations = (language: 'ja' | 'en') => {
    const current = window.RedmineCanvasGantt ?? {
        projectId: 1,
        apiBase: '',
        redmineBase: '',
        authToken: '',
        apiKey: '',
        nonWorkingWeekDays: [],
        i18n: {},
        settings: {}
    };

    window.RedmineCanvasGantt = {
        ...current,
        i18n: {
            ...(current.i18n ?? {}),
            ...buildHelpTranslations(language)
        }
    };
};

describe('HelpDialog', () => {
    beforeEach(() => {
        useUIStore.setState(useUIStore.getInitialState(), true);
    });

    it('renders help dialog in Japanese using frontend i18n payload', () => {
        setTranslations('ja');
        useUIStore.setState({ ...useUIStore.getInitialState(), isHelpDialogOpen: true }, true);

        render(<HelpDialog />);

        expect(screen.getByText('日本語ヘルプ')).toBeInTheDocument();
        expect(screen.getByText('日本語レイアウトと絞り込み')).toBeInTheDocument();
        expect(screen.getByText('日本語タイムライン')).toBeInTheDocument();
        expect(screen.getByText('日本語編集と保存')).toBeInTheDocument();
        expect(screen.getByText('日本語 左ペイン説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 クエリ編集説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 ワークロード説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 エクスポート説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 前月次月説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 トップ説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 ドラッグ説明')).toBeInTheDocument();
        expect(screen.getByText('日本語 保存説明')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '日本語閉じる' })).toBeInTheDocument();
        expect(screen.queryByText('1. Layout and Filters')).not.toBeInTheDocument();
        expect(screen.queryByText('Close')).not.toBeInTheDocument();
    });

    it('renders help dialog in English using frontend i18n payload', () => {
        setTranslations('en');
        useUIStore.setState({ ...useUIStore.getInitialState(), isHelpDialogOpen: true }, true);

        render(<HelpDialog />);

        expect(screen.getByText('English Help')).toBeInTheDocument();
        expect(screen.getByText('English Layout and Filters')).toBeInTheDocument();
        expect(screen.getByText('English Timeline and View')).toBeInTheDocument();
        expect(screen.getByText('English Editing and Saving')).toBeInTheDocument();
        expect(screen.getByText('English left pane description')).toBeInTheDocument();
        expect(screen.getByText('English query editor description')).toBeInTheDocument();
        expect(screen.getByText('English workload description')).toBeInTheDocument();
        expect(screen.getByText('English export description')).toBeInTheDocument();
        expect(screen.getByText('English previous next month description')).toBeInTheDocument();
        expect(screen.getByText('English top description')).toBeInTheDocument();
        expect(screen.getByText('English drag and drop description')).toBeInTheDocument();
        expect(screen.getByText('English save description')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'English Close' })).toBeInTheDocument();
        expect(screen.queryByText('日本語ヘルプ')).not.toBeInTheDocument();
        expect(screen.queryByText('日本語閉じる')).not.toBeInTheDocument();
    });
});
