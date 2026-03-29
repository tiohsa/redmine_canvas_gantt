import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GanttToolbar } from './GanttToolbar';
import { AutoScheduleMoveMode, RelationType } from '../types/constraints';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { GanttExportHandle } from '../export/types';
import '../stores/preferencesWatcher';

const getCanvasGanttConfig = (): NonNullable<Window['RedmineCanvasGantt']> => {
    const config = window.RedmineCanvasGantt;
    if (!config) throw new Error('RedmineCanvasGantt config is not initialized');
    return config;
};

describe('GanttToolbar shortcuts', () => {
    const exportRef: React.RefObject<GanttExportHandle | null> = {
        current: {
            exportPng: async () => undefined,
            exportCsv: async () => undefined
        }
    };

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

    const setStatusFilterState = (selectedStatusIds: number[] = []) => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [],
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            taskStatuses: [
                { id: 1, name: 'New', isClosed: false },
                { id: 2, name: 'In Progress', isClosed: false },
                { id: 3, name: 'Closed', isClosed: true },
                { id: 4, name: 'Rejected', isClosed: true }
            ],
            selectedStatusIds,
            modifiedTaskIds: new Set(),
            autoSave: true,
            setSelectedStatusFromServer: (ids: number[]) => {
                useTaskStore.setState({ selectedStatusIds: ids });
            }
        });
    };

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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

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

    it('renders workload menu labels from frontend i18n payload', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_workload: 'ワークロード',
                label_show_workload: 'ワークロードパネルを表示',
                label_capacity_threshold: '負荷しきい値 (時間/日)',
                label_leaf_issues_only: '末端チケットのみ',
                label_include_closed_issues: '完了チケットを含める',
                label_today_onward_only: '今日以降のみ'
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('ワークロード'));

        expect(screen.getByText('ワークロード')).toBeInTheDocument();
        expect(screen.getByText('ワークロードパネルを表示')).toBeInTheDocument();
        expect(screen.getByText('負荷しきい値 (時間/日)')).toBeInTheDocument();
        expect(screen.getByText('末端チケットのみ')).toBeInTheDocument();
        expect(screen.getByText('完了チケットを含める')).toBeInTheDocument();
        expect(screen.getByText('今日以降のみ')).toBeInTheDocument();
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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        expect(screen.getByTestId('relation-settings-menu-button')).toBeInTheDocument();
    });

    it('opens new issue dialog with redmineBase prefix', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            redmineBase: '/redmine',
            i18n: {
                ...(config.i18n ?? {}),
                label_issue_new: 'New issue'
            }
        };

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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTitle('New issue'));

        expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/projects/1/issues/new');
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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('relation-settings-menu-button'));
        fireEvent.change(screen.getByTestId('relation-default-type-select'), { target: { value: RelationType.Relates } });
        fireEvent.click(screen.getByTestId('relation-auto-calculate-toggle'));
        fireEvent.click(screen.getByTestId('relation-auto-apply-toggle'));
        fireEvent.change(screen.getByTestId('auto-schedule-move-mode-select'), { target: { value: AutoScheduleMoveMode.Off } });
        fireEvent.click(screen.getByTestId('relation-settings-save-button'));

        expect(useUIStore.getState().defaultRelationType).toBe(RelationType.Relates);
        expect(useUIStore.getState().autoCalculateDelay).toBe(false);
        expect(useUIStore.getState().autoApplyDefaultRelation).toBe(false);
        expect(useUIStore.getState().autoScheduleMoveMode).toBe(AutoScheduleMoveMode.Off);
    });

    it('localizes relation default setting labels', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_relation_title: '依存関係',
                label_relation_type: '依存関係種別',
                label_relation_type_precedes: '先行',
                label_relation_type_relates: '関連',
                label_relation_type_blocks: 'ブロック',
                label_relation_auto_calculate_delay: 'delay を自動計算',
                label_relation_auto_apply_default: 'デフォルト依存関係を自動適用',
                label_auto_schedule_move_mode: '自動スケジュール移動モード',
                label_auto_schedule_move_mode_off: 'OFF',
                label_auto_schedule_move_mode_constraint_push: '制約押し出し',
                label_auto_schedule_move_mode_linked_shift: '連動タスク一括移動',
                button_reset: 'リセット',
                button_save: '保存'
            },
            settings: {
                ...(config.settings ?? {})
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('relation-settings-menu-button'));

        expect(screen.getByText('依存関係')).toBeInTheDocument();
        expect(screen.getByText('依存関係種別')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '先行' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '関連' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'ブロック' })).toBeInTheDocument();
        expect(screen.getByText('delay を自動計算')).toBeInTheDocument();
        expect(screen.getByText('デフォルト依存関係を自動適用')).toBeInTheDocument();
        expect(screen.getByText('自動スケジュール移動モード')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'OFF' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '制約押し出し' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '連動タスク一括移動' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'リセット' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });

    it('localizes relation settings dialog labels in english', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_relation_title: 'Dependency Settings',
                label_relation_type: 'Dependency type',
                label_relation_type_precedes: 'Finish to Start',
                label_relation_type_relates: 'Reference only',
                label_relation_type_blocks: 'Blocks work',
                label_relation_auto_calculate_delay: 'Auto-calculate delay',
                label_relation_auto_apply_default: 'Apply defaults automatically',
                label_auto_schedule_move_mode: 'Move related tasks',
                label_auto_schedule_move_mode_off: 'OFF mode',
                label_auto_schedule_move_mode_constraint_push: 'Constraint push mode',
                label_auto_schedule_move_mode_linked_shift: 'Linked shift mode',
                button_reset: 'Reset settings',
                button_save: 'Save settings'
            },
            settings: {
                ...(config.settings ?? {})
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('relation-settings-menu-button'));

        expect(screen.getByText('Dependency Settings')).toBeInTheDocument();
        expect(screen.getByText('Dependency type')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Finish to Start' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Reference only' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Blocks work' })).toBeInTheDocument();
        expect(screen.getByText('Auto-calculate delay')).toBeInTheDocument();
        expect(screen.getByText('Apply defaults automatically')).toBeInTheDocument();
        expect(screen.getByText('Move related tasks')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'OFF mode' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Constraint push mode' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Linked shift mode' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset settings' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument();
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

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        expect(screen.getByTitle('ヘルプ')).toBeInTheDocument();
    });

    it('opens export menu and invokes CSV export', async () => {
        const csvExport = vi.fn().mockResolvedValue(undefined);
        const localExportRef: React.RefObject<GanttExportHandle | null> = {
            current: {
                exportPng: async () => undefined,
                exportCsv: csvExport
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={localExportRef} />);

        fireEvent.click(screen.getByTestId('export-menu-button'));
        fireEvent.click(screen.getByText('Export CSV'));

        await waitFor(() => {
            expect(csvExport).toHaveBeenCalledTimes(1);
        });
    });

    it('shows notification column in the column menu and includes it in reset flow', () => {
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
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'] });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));

        expect(screen.getByLabelText('Notifications')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /reset/i }));
        expect(useUIStore.getState().visibleColumns).toEqual(['notification', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone']);
    });

    it('toggles completed and incomplete status groups', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                field_status: 'Status',
                label_all_select: 'Select All',
                label_status_completed: 'Completed',
                label_status_incomplete: 'Incomplete',
                label_clear_filter: 'Clear'
            }
        };

        setStatusFilterState();
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Status'));
        fireEvent.click(screen.getByLabelText('Completed'));
        expect(useTaskStore.getState().selectedStatusIds).toEqual([3, 4]);

        fireEvent.click(screen.getByLabelText('Incomplete'));
        expect(useTaskStore.getState().selectedStatusIds).toEqual([3, 4, 1, 2]);

        fireEvent.click(screen.getByLabelText('Completed'));
        expect(useTaskStore.getState().selectedStatusIds).toEqual([1, 2]);
    });

    it('recomputes grouped status checkbox states from individual selections', async () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                field_status: 'Status',
                label_all_select: 'Select All',
                label_status_completed: 'Completed',
                label_status_incomplete: 'Incomplete',
                label_clear_filter: 'Clear'
            }
        };

        setStatusFilterState([1, 3]);
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Status'));

        const selectAll = screen.getByLabelText('Select All') as HTMLInputElement;
        const completed = screen.getByLabelText('Completed') as HTMLInputElement;
        const incomplete = screen.getByLabelText('Incomplete') as HTMLInputElement;

        await waitFor(() => {
            expect(selectAll.checked).toBe(false);
            expect(selectAll.indeterminate).toBe(true);
            expect(completed.checked).toBe(false);
            expect(completed.indeterminate).toBe(true);
            expect(incomplete.checked).toBe(false);
            expect(incomplete.indeterminate).toBe(true);
        });

        fireEvent.click(screen.getByLabelText('In Progress'));

        await waitFor(() => {
            expect(useTaskStore.getState().selectedStatusIds).toEqual([1, 3, 2]);
            expect(incomplete.checked).toBe(true);
            expect(incomplete.indeterminate).toBe(false);
            expect(selectAll.checked).toBe(false);
            expect(selectAll.indeterminate).toBe(true);
        });

        fireEvent.click(screen.getByLabelText('Rejected'));

        await waitFor(() => {
            expect(useTaskStore.getState().selectedStatusIds).toEqual([1, 3, 2, 4]);
            expect(selectAll.checked).toBe(true);
            expect(selectAll.indeterminate).toBe(false);
            expect(completed.checked).toBe(true);
            expect(completed.indeterminate).toBe(false);
        });
    });

});
