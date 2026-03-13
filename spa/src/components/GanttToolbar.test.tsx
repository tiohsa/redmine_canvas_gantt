import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GanttToolbar } from './GanttToolbar';
import { RelationType } from '../types/constraints';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import '../stores/preferencesWatcher';

const getCanvasGanttConfig = (): NonNullable<Window['RedmineCanvasGantt']> => {
    const config = window.RedmineCanvasGantt;
    if (!config) throw new Error('RedmineCanvasGantt config is not initialized');
    return config;
};

describe('GanttToolbar shortcuts', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.RedmineCanvasGantt = {
            ...(window.RedmineCanvasGantt ?? {
                projectId: 1,
                apiBase: '',
                redmineBase: '',
                authToken: '',
                apiKey: '',
                nonWorkingWeekDays: [],
                i18n: {}
            }),
            settings: {
                ...(window.RedmineCanvasGantt?.settings ?? {}),
            }
        };
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            settings: {
                ...(config.settings ?? {}),
            }
        };
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
    });

    it('opens filter input with Ctrl+F and cancels with Escape', async () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);

        fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

        const filterInput = await screen.findByPlaceholderText(/filter by subject/i);
        await waitFor(() => {
            expect(document.activeElement).toBe(filterInput);
        });

        fireEvent.change(filterInput, { target: { value: 'abc' } });
        expect(useTaskStore.getState().filterText).toBe('abc');

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByPlaceholderText(/filter by subject/i)).not.toBeInTheDocument();
            expect(useTaskStore.getState().filterText).toBe('');
        });
    });

    it('toggles left and right pane maximization buttons', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);

        const leftMaxButton = screen.getByTestId('maximize-left-pane-button');
        const rightMaxButton = screen.getByTestId('maximize-right-pane-button');

        fireEvent.click(leftMaxButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(false);

        fireEvent.click(rightMaxButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(false);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);

        fireEvent.click(rightMaxButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);
    });


    it('shows relation settings button in toolbar', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);
        expect(screen.getByTestId('relation-settings-menu-button')).toBeInTheDocument();
    });

    it('updates row height via checkbox list menu and keeps it open', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true,
            viewport: {
                ...useTaskStore.getState().viewport,
                rowHeight: 36
            }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);

        const rowHeightButton = screen.getByTestId('row-height-menu-button');
        expect(rowHeightButton).toHaveTextContent('M');

        fireEvent.click(rowHeightButton);
        expect(screen.getByTestId('row-height-menu')).toBeInTheDocument();
        expect(screen.getByLabelText('M')).toBeChecked();

        fireEvent.click(screen.getByLabelText('XL'));
        expect(useTaskStore.getState().viewport.rowHeight).toBe(52);
        expect(screen.getByTestId('row-height-menu')).toBeInTheDocument();
        expect(screen.getByLabelText('XL')).toBeChecked();
        expect(screen.getByTestId('row-height-menu-button')).toHaveTextContent('XL');

        fireEvent.click(screen.getByLabelText('S'));
        expect(useTaskStore.getState().viewport.rowHeight).toBe(28);
        expect(screen.getByTestId('row-height-menu')).toBeInTheDocument();
        expect(screen.getByLabelText('S')).toBeChecked();
        expect(screen.getByTestId('row-height-menu-button')).toHaveTextContent('S');

        fireEvent.click(rowHeightButton);
        expect(screen.queryByTestId('row-height-menu')).not.toBeInTheDocument();

        fireEvent.click(rowHeightButton);
        expect(screen.getByTestId('row-height-menu')).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByTestId('row-height-menu')).not.toBeInTheDocument();
    });

    it('saves relation settings from toolbar menu', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);
        fireEvent.click(screen.getByTestId('relation-settings-menu-button'));
        fireEvent.change(screen.getByTestId('relation-default-type-select'), { target: { value: RelationType.Relates } });
        fireEvent.click(screen.getByTestId('relation-auto-calculate-toggle'));
        fireEvent.click(screen.getByTestId('relation-auto-apply-toggle'));
        fireEvent.click(screen.getByTestId('relation-settings-save-button'));

        expect(useUIStore.getState().defaultRelationType).toBe(RelationType.Relates);
        expect(useUIStore.getState().autoCalculateDelay).toBe(false);
        expect(useUIStore.getState().autoApplyDefaultRelation).toBe(false);
    });

    it('localizes relation default setting labels', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_relation_type_precedes: '先行',
                label_relation_type_relates: '関連',
                label_relation_type_blocks: 'ブロック',
                label_relation_auto_calculate_delay: 'delay を自動計算',
                label_relation_auto_apply_default: 'デフォルト依存関係を自動適用'
            },
            settings: {
                ...(config.settings ?? {})
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);
        fireEvent.click(screen.getByTestId('relation-settings-menu-button'));

        expect(screen.getByRole('option', { name: '先行' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '関連' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'ブロック' })).toBeInTheDocument();
        expect(screen.getByText('delay を自動計算')).toBeInTheDocument();
        expect(screen.getByText('デフォルト依存関係を自動適用')).toBeInTheDocument();
    });

    it('localizes the help button title', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_help: 'ヘルプ'
            },
            settings: {
                ...(config.settings ?? {})
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} />);

        expect(screen.getByTitle('ヘルプ')).toBeInTheDocument();
    });

});
