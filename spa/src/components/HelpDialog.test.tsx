import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpDialog } from './HelpDialog';
import { useUIStore } from '../stores/UIStore';

const buildHelpTranslations = (language: 'ja' | 'en'): Record<string, string> => {
    const prefix = language === 'ja' ? '日本語' : 'English';

    return {
        label_help: `${prefix} Help`,
        help_label_layout_filters: `${prefix} Layout and Filters`,
        help_label_timeline_view: `${prefix} Timeline and View Controls`,
        help_label_editing_saving: `${prefix} Editing and Saving`,
        label_saved_queries: `${prefix} Saved Queries`,
        label_display_settings: `${prefix} Display Settings`,
        label_workload: `${prefix} Workload`,
        label_row_height: `${prefix} Row Height`,
        label_font_size: `${prefix} Font Size`,
        label_maximize_left_pane: `${prefix} Maximize List`,
        label_maximize_right_pane: `${prefix} Maximize Chart`,
        label_filter_tasks: `${prefix} Filter Tasks`,
        label_edit_query_in_redmine: `${prefix} Edit Query`,
        label_column_plural: `${prefix} Columns`,
        label_assigned_to_filter: `${prefix} Assignee Filter`,
        label_project_filter: `${prefix} Project Filter`,
        label_version_filter: `${prefix} Version Filter`,
        label_status_filter: `${prefix} Status Filter`,
        label_progress_line: `${prefix} Progress Line`,
        label_toggle_hierarchy_lines: `${prefix} Hierarchy Lines`,
        label_toggle_points_orphans: `${prefix} Orphan Points`,
        label_toggle_task_titles: `${prefix} Task Titles`,
        label_organize_by_dependency: `${prefix} Organize by Dependency`,
        label_relation_title: `${prefix} Dependency Settings`,
        help_label_zoom: `${prefix} Zoom`,
        help_label_fullscreen: `${prefix} Full Screen`,
        help_label_autosave: `${prefix} Auto Save`,
        button_top: `${prefix} Top`,
        button_save: `${prefix} Save`,
        button_cancel: `${prefix} Cancel`,
        button_close: `${prefix} Close`,
        help_desc_maximize_left: `${prefix} left pane description`,
        help_desc_maximize_right: `${prefix} right pane description`,
        help_desc_filter_tasks: `${prefix} filter description`,
        help_desc_edit_query: `${prefix} query description`,
        help_desc_columns: `${prefix} columns description`,
        help_desc_workload: `${prefix} workload description`,
        help_desc_assignee_filter: `${prefix} assignee description`,
        help_desc_project_filter: `${prefix} project description`,
        help_desc_version_filter: `${prefix} version description`,
        help_desc_status_filter: `${prefix} status description`,
        help_desc_progress_line: `${prefix} progress description`,
        help_desc_dependency_settings: `${prefix} dependency settings description`,
        help_desc_export: `${prefix} export description`,
        help_desc_points_orphans: `${prefix} orphan points description`,
        help_desc_task_titles: `${prefix} task titles description`,
        help_desc_prev_next_month: `${prefix} previous next month description`,
        help_desc_today: `${prefix} today description`,
        help_desc_zoom: `${prefix} zoom description`,
        help_desc_row_height: `${prefix} row height description`,
        help_desc_fullscreen: `${prefix} full screen description`,
        help_desc_autosave: `${prefix} auto save description`,
        help_desc_save: `${prefix} save description`,
        help_desc_cancel: `${prefix} cancel description`,
        help_op_drag_drop: `${prefix} Drag and Drop`,
        help_op_drag_drop_desc: `${prefix} drag and drop description`,
        help_op_dependency: `${prefix} Draw Dependencies`,
        help_op_dependency_desc: `${prefix} dependency creation description`,
        help_op_inline_edit: `${prefix} Inline Editing`,
        help_op_inline_edit_desc: `${prefix} inline edit description`,
        help_op_context_menu: `${prefix} Context Menu`,
        help_op_context_menu_desc: `${prefix} context menu description`,
        help_op_unscheduled: `${prefix} Schedule Tasks`,
        help_op_unscheduled_desc: `${prefix} unscheduled task description`
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

        expect(screen.getByRole('heading', { name: '日本語 Help' })).toBeInTheDocument();
        expect(screen.getByText('日本語 Layout and Filters')).toBeInTheDocument();
        expect(screen.getByText('日本語 Timeline and View Controls')).toBeInTheDocument();
        expect(screen.getByText('日本語 Editing and Saving')).toBeInTheDocument();
        expect(screen.getByText('日本語 Saved Queries')).toBeInTheDocument();
        expect(screen.getByText('日本語 Display Settings')).toBeInTheDocument();
        expect(screen.getByText('日本語 Workload')).toBeInTheDocument();
        expect(screen.getByText('日本語 Row Height / 日本語 Font Size')).toBeInTheDocument();
        expect(screen.getByText('日本語 left pane description')).toBeInTheDocument();
        expect(screen.getByText('日本語 workload description')).toBeInTheDocument();
        expect(screen.getByText('日本語 previous next month description')).toBeInTheDocument();
        expect(screen.getByText('日本語 full screen description')).toBeInTheDocument();
        expect(screen.getByText('日本語 drag and drop description')).toBeInTheDocument();
        expect(screen.getByText('日本語 auto save description')).toBeInTheDocument();
        expect(screen.getByText('日本語 save description')).toBeInTheDocument();
        expect(screen.getByText('日本語 cancel description')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '日本語 Close' })).toBeInTheDocument();
        expect(screen.queryByText('English Layout and Filters')).not.toBeInTheDocument();
        expect(screen.queryByText('English Close')).not.toBeInTheDocument();
    });

    it('renders help dialog in English using frontend i18n payload', () => {
        setTranslations('en');
        useUIStore.setState({ ...useUIStore.getInitialState(), isHelpDialogOpen: true }, true);

        render(<HelpDialog />);

        expect(screen.getByRole('heading', { name: 'English Help' })).toBeInTheDocument();
        expect(screen.getByText('English Layout and Filters')).toBeInTheDocument();
        expect(screen.getByText('English Timeline and View Controls')).toBeInTheDocument();
        expect(screen.getByText('English Editing and Saving')).toBeInTheDocument();
        expect(screen.getByText('English Saved Queries')).toBeInTheDocument();
        expect(screen.getByText('English Display Settings')).toBeInTheDocument();
        expect(screen.getByText('English Workload')).toBeInTheDocument();
        expect(screen.getByText('English Row Height / English Font Size')).toBeInTheDocument();
        expect(screen.getByText('English left pane description')).toBeInTheDocument();
        expect(screen.getByText('English workload description')).toBeInTheDocument();
        expect(screen.getByText('English previous next month description')).toBeInTheDocument();
        expect(screen.getByText('English full screen description')).toBeInTheDocument();
        expect(screen.getByText('English drag and drop description')).toBeInTheDocument();
        expect(screen.getByText('English auto save description')).toBeInTheDocument();
        expect(screen.getByText('English save description')).toBeInTheDocument();
        expect(screen.getByText('English cancel description')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'English Close' })).toBeInTheDocument();
        expect(screen.queryByText('日本語 Help')).not.toBeInTheDocument();
        expect(screen.queryByText('日本語 Close')).not.toBeInTheDocument();
    });
});
