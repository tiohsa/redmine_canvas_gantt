import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpDialog } from './HelpDialog';
import { useUIStore } from '../stores/UIStore';

const translations = (prefix: string): Record<string, string> => ({
    label_help: `${prefix} Help`,
    label_help_toolbar_icons: `${prefix} Header Menu Icons`,
    label_settings: `${prefix} Settings`,
    label_saved_queries: `${prefix} Query`,
    label_column_plural: `${prefix} Cols`,
    label_workload: `${prefix} Workload`,
    label_assigned_to_filter: `${prefix} Assignee`,
    label_project_filter: `${prefix} Proj.`,
    label_version_filter: `${prefix} Ver.`,
    label_status_filter: `${prefix} Status`,
    label_relation_title: `${prefix} Link`,
    label_maximize_left_pane: `${prefix} Maximize List`,
    label_maximize_right_pane: `${prefix} Maximize Chart`,
    label_standard_view: `${prefix} Standard`,
    label_issue_new: `${prefix} New issue`,
    label_filter_tasks: `${prefix} Subject filter`,
    help_desc_settings: `${prefix} settings description`,
    help_desc_maximize_left: `${prefix} left pane description`,
    help_desc_maximize_right: `${prefix} right pane description`,
    help_desc_saved_queries: `${prefix} query description`,
    help_desc_columns: `${prefix} columns description`,
    help_desc_workload: `${prefix} workload description`,
    help_desc_assignee_filter: `${prefix} assignee description`,
    help_desc_project_filter: `${prefix} project description`,
    help_desc_version_filter: `${prefix} version description`,
    help_desc_status_filter: `${prefix} status description`,
    help_desc_dependency_settings: `${prefix} link description`,
    help_desc_issue_new: `${prefix} new issue description`,
    button_close: `${prefix} Close`,
    help_label_timeline_view: `${prefix} Timeline and View Controls`,
    help_label_editing_saving: `${prefix} Editing and Saving`,
    button_save: `${prefix} Save`,
    button_cancel: `${prefix} Cancel`
});

const openHelp = (prefix: string) => {
    window.RedmineCanvasGantt = { ...(window.RedmineCanvasGantt ?? {}), i18n: translations(prefix) } as typeof window.RedmineCanvasGantt;
    useUIStore.setState({ ...useUIStore.getInitialState(), isHelpDialogOpen: true }, true);
    render(<HelpDialog />);
};

describe('HelpDialog', () => {
    beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));

    it.each([['日本語'], ['English']])('renders the current menu structure in %s', (prefix) => {
        openHelp(prefix);
        expect(screen.getByRole('heading', { name: `${prefix} Help` })).toBeInTheDocument();
        expect(screen.getByText(`${prefix} Header Menu Icons`)).toBeInTheDocument();
        expect(screen.getByText(`${prefix} Settings`)).toBeInTheDocument();
        expect(screen.getByText(`${prefix} settings description`)).toBeInTheDocument();
        expect(screen.queryByText(`${prefix} Chart`)).not.toBeInTheDocument();
        expect(screen.queryByText(`${prefix} Display`)).not.toBeInTheDocument();
        expect(screen.queryByText(`${prefix} Auto Save`)).not.toBeInTheDocument();
        expect(screen.queryByText(`${prefix} left pane description`)).not.toBeInTheDocument();
    });

    it('uses the Settings icon geometry and keeps Save/Cancel conditional documentation', () => {
        openHelp('English');
        const icon = screen.getByTestId('help-icon-chart-settings');
        expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
        expect(icon).toHaveAttribute('width', '16');
        expect(icon.querySelector('line')).toHaveAttribute('x1', '3');
        expect(screen.getByText('English Save')).toBeInTheDocument();
        expect(screen.getByText('English Cancel')).toBeInTheDocument();
    });

    it('uses the BaselineControls icon for Baseline', () => {
        openHelp('English');
        const icon = screen.getByTestId('help-icon-baseline');
        expect(icon.querySelector('path')).toHaveAttribute('d', 'M4 5h16v14H4z');
        expect(icon.querySelectorAll('path')).toHaveLength(3);
    });
});
