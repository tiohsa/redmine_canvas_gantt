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
        label_issue_new: `${prefix} New issue`,
        label_filter_tasks: `${prefix} Filter Tasks`,
        label_edit_query_in_redmine: `${prefix} Edit Query`,
        label_column_plural: `${prefix} Columns`,
        label_assigned_to_filter: `${prefix} Assignee Filter`,
        label_project_filter: `${prefix} Project Filter`,
        label_version_filter: `${prefix} Version Filter`,
        label_status_filter: `${prefix} Status Filter`,
        label_progress_line: `${prefix} Progress Line`,
        label_toggle_hierarchy_lines: `${prefix} Hierarchy Lines`,
        label_toggle_task_bar_dates: `${prefix} Task Bar Dates`,
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
        help_desc_saved_queries: `${prefix} saved queries description`,
        help_desc_display_settings: `${prefix} display settings description`,
        help_desc_baseline: `${prefix} baseline description`,
        help_desc_issue_new: `${prefix} new issue description`,
        help_desc_filter_tasks: `${prefix} filter description`,
        help_desc_edit_query: `${prefix} query description`,
        help_desc_columns: `${prefix} columns description`,
        help_desc_workload: `${prefix} workload description`,
        help_desc_assignee_filter: `${prefix} assignee description`,
        help_desc_project_filter: `${prefix} project description`,
        help_desc_version_filter: `${prefix} version description`,
        help_desc_status_filter: `${prefix} status description`,
        help_desc_task_bar_dates: `${prefix} task bar dates description`,
        help_desc_hierarchy_lines: `${prefix} hierarchy lines description`,
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
        expect(screen.getByText('日本語 saved queries description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Display Settings')).toBeInTheDocument();
        expect(screen.getByText('日本語 display settings description')).toBeInTheDocument();
        expect(screen.getByText('日本語 baseline description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Workload')).toBeInTheDocument();
        expect(screen.getByText('日本語 Row Height / 日本語 Font Size')).toBeInTheDocument();
        expect(screen.getByText('日本語 left pane description')).toBeInTheDocument();
        expect(screen.getByText('日本語 New issue')).toBeInTheDocument();
        expect(screen.getByText('日本語 new issue description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Assignee Filter')).toBeInTheDocument();
        expect(screen.getByText('日本語 assignee description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Project Filter')).toBeInTheDocument();
        expect(screen.getByText('日本語 project description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Version Filter')).toBeInTheDocument();
        expect(screen.getByText('日本語 version description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Status Filter')).toBeInTheDocument();
        expect(screen.getByText('日本語 status description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Task Bar Dates')).toBeInTheDocument();
        expect(screen.getByText('日本語 task bar dates description')).toBeInTheDocument();
        expect(screen.getByText('日本語 Hierarchy Lines')).toBeInTheDocument();
        expect(screen.getByText('日本語 hierarchy lines description')).toBeInTheDocument();
        expect(screen.getByText('日本語 workload description')).toBeInTheDocument();
        expect(screen.getByText('日本語 previous next month description')).toBeInTheDocument();
        expect(screen.getByText('日本語 full screen description')).toBeInTheDocument();
        expect(screen.getByText('日本語 drag and drop description')).toBeInTheDocument();
        expect(screen.getByText('日本語 dependency creation description')).toBeInTheDocument();
        expect(screen.getByText('日本語 inline edit description')).toBeInTheDocument();
        expect(screen.getByText('日本語 context menu description')).toBeInTheDocument();
        expect(screen.getByText('日本語 unscheduled task description')).toBeInTheDocument();
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
        expect(screen.getByText('English saved queries description')).toBeInTheDocument();
        expect(screen.getByText('English Display Settings')).toBeInTheDocument();
        expect(screen.getByText('English display settings description')).toBeInTheDocument();
        expect(screen.getByText('English baseline description')).toBeInTheDocument();
        expect(screen.getByText('English Workload')).toBeInTheDocument();
        expect(screen.getByText('English Row Height / English Font Size')).toBeInTheDocument();
        expect(screen.getByText('English left pane description')).toBeInTheDocument();
        expect(screen.getByText('English New issue')).toBeInTheDocument();
        expect(screen.getByText('English new issue description')).toBeInTheDocument();
        expect(screen.getByText('English Assignee Filter')).toBeInTheDocument();
        expect(screen.getByText('English assignee description')).toBeInTheDocument();
        expect(screen.getByText('English Project Filter')).toBeInTheDocument();
        expect(screen.getByText('English project description')).toBeInTheDocument();
        expect(screen.getByText('English Version Filter')).toBeInTheDocument();
        expect(screen.getByText('English version description')).toBeInTheDocument();
        expect(screen.getByText('English Status Filter')).toBeInTheDocument();
        expect(screen.getByText('English status description')).toBeInTheDocument();
        expect(screen.getByText('English Task Bar Dates')).toBeInTheDocument();
        expect(screen.getByText('English task bar dates description')).toBeInTheDocument();
        expect(screen.getByText('English Hierarchy Lines')).toBeInTheDocument();
        expect(screen.getByText('English hierarchy lines description')).toBeInTheDocument();
        expect(screen.getByText('English workload description')).toBeInTheDocument();
        expect(screen.getByText('English previous next month description')).toBeInTheDocument();
        expect(screen.getByText('English full screen description')).toBeInTheDocument();
        expect(screen.getByText('English drag and drop description')).toBeInTheDocument();
        expect(screen.getByText('English dependency creation description')).toBeInTheDocument();
        expect(screen.getByText('English inline edit description')).toBeInTheDocument();
        expect(screen.getByText('English context menu description')).toBeInTheDocument();
        expect(screen.getByText('English unscheduled task description')).toBeInTheDocument();
        expect(screen.getByText('English auto save description')).toBeInTheDocument();
        expect(screen.getByText('English save description')).toBeInTheDocument();
        expect(screen.getByText('English cancel description')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'English Close' })).toBeInTheDocument();
        expect(screen.queryByText('日本語 Help')).not.toBeInTheDocument();
        expect(screen.queryByText('日本語 Close')).not.toBeInTheDocument();
    });

    it('uses the matching toolbar SVG geometry for the documented toolbar actions', () => {
        setTranslations('en');
        useUIStore.setState({ ...useUIStore.getInitialState(), isHelpDialogOpen: true }, true);

        render(<HelpDialog />);

        const expectSvg = (testId: string, width: string, childSelector: string, attributes: Record<string, string>) => {
            const svg = ['help-icon-calendar', 'help-icon-organize-dependency'].includes(testId)
                ? screen.getAllByTestId(testId)[0]
                : screen.getByTestId(testId);
            expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
            expect(svg).toHaveAttribute('width', width);
            expect(svg).toHaveAttribute('height', width);
            expect(svg).toHaveAttribute('stroke-width', '2');
            const child = svg.querySelector(childSelector);
            expect(child).not.toBeNull();
            Object.entries(attributes).forEach(([name, value]) => {
                expect(child).toHaveAttribute(name, value);
            });
        };

        expectSvg('help-icon-plus', '18', 'line', { x1: '12', y1: '5', x2: '12', y2: '19' });
        expectSvg('help-icon-assignee', '16', 'path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' });
        expectSvg('help-icon-project', '16', 'path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' });
        expectSvg('help-icon-version', '16', 'path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' });
        expectSvg('help-icon-status', '16', 'path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' });
        expectSvg('help-icon-hierarchy', '16', 'path', { d: 'M7 5v14' });
        expectSvg('help-icon-calendar', '16', 'rect', { x: '3', y: '5', width: '18', height: '16', rx: '2' });
        expectSvg('help-icon-star', '16', 'path', { d: 'M12 2l3 5h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z' });
        expectSvg('help-icon-task-titles', '16', 'path', { d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z' });
        expectSvg('help-icon-organize-dependency', '16', 'path', { d: 'M5 6h6v6H5z' });
        expectSvg('help-icon-relation', '16', 'path', { d: 'M4 12h6' });
        expectSvg('help-icon-auto-save', '18', 'polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' });
        expectSvg('help-icon-save', '18', 'path', { d: 'M5 3h11l3 3v15H5z' });
        expectSvg('help-icon-month-navigation', '18', 'polyline', { points: '15 18 9 12 15 6' });
        expectSvg('help-icon-today-calendar', '16', 'rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' });

        const expectItemIcon = (title: string, testId: string) => {
            const titleElement = screen.getByText(title);
            expect(titleElement.parentElement?.previousElementSibling?.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();
        };

        expectItemIcon('English New issue', 'help-icon-plus');
        expectItemIcon('English Assignee Filter', 'help-icon-assignee');
        expectItemIcon('English Project Filter', 'help-icon-project');
        expectItemIcon('English Version Filter', 'help-icon-version');
        expectItemIcon('English Status Filter', 'help-icon-status');
        expectItemIcon('English Task Bar Dates', 'help-icon-calendar');
        expectItemIcon('English Hierarchy Lines', 'help-icon-hierarchy');
        expectItemIcon('English Orphan Points', 'help-icon-star');
        expectItemIcon('English Task Titles', 'help-icon-task-titles');
        expectItemIcon('English Organize by Dependency', 'help-icon-organize-dependency');
        expectItemIcon('English Dependency Settings', 'help-icon-relation');
        expectItemIcon('English Draw Dependencies', 'help-icon-organize-dependency');
        expectItemIcon('English Auto Save', 'help-icon-auto-save');
        expectItemIcon('English Save', 'help-icon-save');
    });
});
