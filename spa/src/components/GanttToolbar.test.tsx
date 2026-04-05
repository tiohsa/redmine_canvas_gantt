import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GanttToolbar } from './GanttToolbar';
import { AutoScheduleMoveMode, RelationType } from '../types/constraints';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { useBaselineStore } from '../stores/BaselineStore';
import type { GanttExportHandle } from '../export/types';
import { apiClient } from '../api/client';
import '../stores/preferencesWatcher';
import { resetCanvasGanttTestState } from '../test/testSetup';
import { setVisibleColumnsForTest } from '../test/columnTestHelpers';
import type { CustomFieldMeta } from '../types/editMeta';

vi.mock('../utils/navigation', () => ({
    navigateToRedminePath: vi.fn()
}));

vi.mock('../api/client', () => ({
    apiClient: {
        saveBaseline: vi.fn(),
        fetchData: vi.fn(),
        fetchQueries: vi.fn()
    }
}));

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
        vi.clearAllMocks();
        resetCanvasGanttTestState();
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([]);
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

    it('shows baseline controls and saves a snapshot when permissions allow', async () => {
        const saveBaselineMock = vi.mocked(apiClient.saveBaseline);
        saveBaselineMock.mockResolvedValue({
            status: 'ok',
            baseline: {
                snapshotId: 'baseline-1',
                projectId: '1',
                capturedAt: '2026-04-01T00:00:00.000Z',
                capturedById: 1,
                capturedByName: 'Alice',
                scope: 'project',
                tasksByIssueId: {}
            },
            warnings: []
        });

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
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        const saveBaselineButton = screen.getByRole('button', { name: 'Save Baseline' });
        const showBaselineButton = screen.getByRole('button', { name: 'Show Baseline' });

        expect(saveBaselineButton).toBeInTheDocument();
        expect(showBaselineButton).toBeInTheDocument();
        expect(showBaselineButton).toBeDisabled();

        fireEvent.click(saveBaselineButton);
        const baselineSaveMenu = await screen.findByTestId('baseline-save-menu');

        await act(async () => {
            fireEvent.click(within(baselineSaveMenu).getByRole('button', { name: 'Save whole project as baseline' }));
            await Promise.resolve();
        });

        expect(saveBaselineMock).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project' }));
        expect(useBaselineStore.getState().hasBaseline).toBe(true);
        expect(screen.getByRole('button', { name: 'Show Baseline' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'Show Baseline' }));
        expect(useUIStore.getState().showBaseline).toBe(true);
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

        expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/projects/ecookbook/issues/new');
    });

    it('loads and displays saved queries from the query menu', async () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_saved_queries: 'Saved queries'
            }
        };
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));

        expect(await screen.findByText('Open issues')).toBeInTheDocument();
        expect(apiClient.fetchQueries).toHaveBeenCalledTimes(1);
    });

    it('renders saved query menu labels from frontend i18n payload', async () => {
        const config = getCanvasGanttConfig();
        let resolveQueries: ((value: { id: number; name: string; isPublic: boolean; projectId: number }[]) => void) | undefined;
        vi.mocked(apiClient.fetchQueries).mockImplementation(
            () => new Promise((resolve) => {
                resolveQueries = resolve;
            })
        );
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_saved_queries: '保存済みクエリ',
                label_loading_saved_queries: '保存済みクエリを読み込み中...',
                label_no_saved_queries: '保存済みクエリはありません',
                label_clear_saved_query: '保存済みクエリを解除',
                label_save_custom_query: 'この条件を保存'
            }
        };

        useTaskStore.setState({
            activeQueryId: 12
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));

        expect(await screen.findByText('保存済みクエリ')).toBeInTheDocument();
        expect(screen.getByText('保存済みクエリを読み込み中...')).toBeInTheDocument();

        await act(async () => {
            resolveQueries?.([]);
            await Promise.resolve();
        });

        expect(await screen.findByText('保存済みクエリはありません')).toBeInTheDocument();
        expect(screen.getByTestId('clear-saved-query-button')).toHaveTextContent('保存済みクエリを解除');
        expect(screen.getByTestId('save-custom-query-button')).toHaveTextContent('この条件を保存');
    });

    it('shows saved queries as a single-select radio group and marks the active query', async () => {
        useTaskStore.setState({
            activeQueryId: 12
        });
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 },
            { id: 18, name: 'Team backlog', isPublic: false, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));

        const activeRadio = await screen.findByRole('radio', { name: 'Open issues' });
        const inactiveRadio = await screen.findByRole('radio', { name: 'Team backlog' });

        expect(activeRadio).toBeChecked();
        expect(inactiveRadio).not.toBeChecked();
    });

    it('applies a saved query selection and refreshes data', async () => {
        const applySavedQuery = vi.fn().mockImplementation(async (queryId: number) => {
            useTaskStore.setState({ activeQueryId: queryId });
        });
        useTaskStore.setState({
            applySavedQuery
        });
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByTestId('saved-query-item-12'));

        await waitFor(() => {
            expect(useTaskStore.getState().activeQueryId).toBe(12);
            expect(applySavedQuery).toHaveBeenCalledWith(12);
            expect(screen.getByTestId('query-menu')).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: 'Open issues' })).toBeChecked();
        });
    });

    it('marks a saved query as selected immediately while apply is still in flight', async () => {
        let resolveApply: (() => void) | undefined;
        const applySavedQuery = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
            resolveApply = resolve;
        }));
        useTaskStore.setState({
            applySavedQuery,
            activeQueryId: null
        });
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByTestId('saved-query-item-12'));

        expect(screen.getByRole('radio', { name: 'Open issues' })).toBeChecked();

        resolveApply?.();
    });

    it('keeps the saved query checked after data refresh when the response omits initial state', async () => {
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByTestId('saved-query-item-12'));

        await waitFor(() => {
            expect(apiClient.fetchData).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(screen.getByRole('radio', { name: 'Open issues' })).toBeChecked();
        });
    });

    it('clears the active saved query without dropping the current shared filters', async () => {
        const clearSavedQuery = vi.fn().mockImplementation(async () => {
            useTaskStore.setState({
                activeQueryId: null,
                selectedStatusIds: [1, 2],
                selectedProjectIds: ['3']
            });
        });
        useTaskStore.setState({
            activeQueryId: 12,
            selectedStatusIds: [1, 2],
            selectedProjectIds: ['3'],
            clearSavedQuery
        });
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByTestId('clear-saved-query-button'));

        await waitFor(() => {
            expect(useTaskStore.getState().activeQueryId).toBeNull();
            expect(useTaskStore.getState().selectedStatusIds).toEqual([1, 2]);
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['3']);
            expect(clearSavedQuery).toHaveBeenCalledTimes(1);
        });
    });

    it('opens the saved query editor in the iframe dialog from the query menu', async () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            redmineBase: '/redmine',
            i18n: {
                ...(config.i18n ?? {}),
                label_save_custom_query: 'Save custom query'
            }
        };

        useTaskStore.setState({
            activeQueryId: 12,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'startDate', direction: 'desc' },
            groupByProject: false,
            groupByAssignee: true,
            showSubprojects: false
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByTestId('save-custom-query-button'));

        await waitFor(() => {
            expect(useUIStore.getState().queryDialogUrl).toBe(
                '/redmine/projects/ecookbook/issues?query_id=12&f%5B%5D=status_id&op%5Bstatus_id%5D=%3D&v%5Bstatus_id%5D%5B%5D=1&v%5Bstatus_id%5D%5B%5D=2&f%5B%5D=assigned_to_id&op%5Bassigned_to_id%5D=%3D&v%5Bassigned_to_id%5D%5B%5D=7&f%5B%5D=project_id&op%5Bproject_id%5D=%3D&v%5Bproject_id%5D%5B%5D=3&f%5B%5D=fixed_version_id&op%5Bfixed_version_id%5D=%3D&v%5Bfixed_version_id%5D%5B%5D=4&f%5B%5D=subproject_id&op%5Bsubproject_id%5D=%21*&set_filter=1&group_by=assigned_to&sort=start_date%3Adesc&c%5B%5D=id&c%5B%5D=subject&c%5B%5D=status&c%5B%5D=assigned_to&c%5B%5D=start_date&c%5B%5D=due_date&c%5B%5D=done_ratio'
            );
        });
    });

    it('reloads saved queries only once after the query dialog closes', async () => {
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('query-menu-button'));
        await screen.findByText('Open issues');
        expect(apiClient.fetchQueries).toHaveBeenCalledTimes(1);

        act(() => {
            useUIStore.getState().closeQueryDialog();
        });

        await waitFor(() => {
            expect(apiClient.fetchQueries).toHaveBeenCalledTimes(2);
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(apiClient.fetchQueries).toHaveBeenCalledTimes(2);
    });

    it('does not show open in new tab action in the query menu', async () => {
        vi.mocked(apiClient.fetchQueries).mockResolvedValue([]);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));

        await screen.findByTestId('save-custom-query-button');
        expect(screen.queryByText(/open in new tab/i)).not.toBeInTheDocument();
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
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));

        expect(screen.getByLabelText('Notifications')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /reset/i }));
        expect(useUIStore.getState().visibleColumns).toEqual(['id', 'subject', 'notification', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone']);
    });

    it('toggles category column when clicking the row label text', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByText('Category'));

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'category')?.visible).toBe(true);
        expect(useUIStore.getState().visibleColumns).toContain('category');
    });

    it('toggles category column when clicking the row background', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByText('Category'));

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'category')?.visible).toBe(true);
        expect(useUIStore.getState().visibleColumns).toContain('category');
    });

    it('toggles category column when clicking its checkbox', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByLabelText('Category'));

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'category')?.visible).toBe(true);
        expect(useUIStore.getState().visibleColumns).toContain('category');
    });

    it('does not toggle a column when clicking its drag handle', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByLabelText('Reorder Category'));

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'category')?.visible).toBe(false);
        expect(useUIStore.getState().visibleColumns).not.toContain('category');
    });

    it('toggles the task name column when clicking its row label', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByText('Task Name'));

        expect(screen.getByLabelText('Task Name')).not.toBeDisabled();
        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'subject')?.visible).toBe(false);
        expect(useUIStore.getState().visibleColumns).not.toContain('subject');
    });

    it('toggles the task name column from keyboard interaction', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        const taskNameRow = screen.getByText('Task Name').closest('[role="button"]');
        expect(taskNameRow).not.toBeNull();

        fireEvent.keyDown(taskNameRow!, { key: 'Enter' });

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'subject')?.visible).toBe(false);
        expect(useUIStore.getState().visibleColumns).not.toContain('subject');
    });

    it('drags category column to a new position', () => {
        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'category', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'category', 'status'], columnSettings });

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

        fireEvent.click(screen.getByTitle('Columns'));
        const categoryHandle = screen.getByLabelText('Reorder Category');
        const statusHandle = screen.getByLabelText('Reorder Status');

        fireEvent.dragStart(categoryHandle);
        fireEvent.dragOver(statusHandle);
        fireEvent.drop(statusHandle);
        fireEvent.dragEnd(categoryHandle);

        expect(useUIStore.getState().columnSettings.map((column) => column.key)).toEqual([
            'id',
            'subject',
            'notification',
            'project',
            'tracker',
            'category',
            'status',
            'priority',
            'assignee',
            'author',
            'startDate',
            'dueDate',
            'estimatedHours',
            'ratioDone',
            'spentHours',
            'version',
            'createdOn',
            'updatedOn'
        ]);
        expect(useUIStore.getState().visibleColumns).toEqual(['id', 'subject', 'category', 'status']);
    });

    it('toggles custom field columns in the column menu', () => {
        const customFields: CustomFieldMeta[] = [
            { id: 101, name: 'Client Code', fieldFormat: 'string', isRequired: false }
        ];
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
            customFields
        });

        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByText('Client Code'));

        const storedPreferences = JSON.parse(window.localStorage.getItem('canvasGantt:preferences') ?? '{}') as {
            projects?: Record<string, { visibleColumns?: string[] }>;
        };

        expect(storedPreferences.projects?.['project:1']?.visibleColumns).toContain('cf:101');

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'cf:101')?.visible).toBe(true);
        expect(useUIStore.getState().visibleColumns).toContain('cf:101');
    });

    it('drags custom field columns in the column menu', () => {
        const customFields: CustomFieldMeta[] = [{ id: 101, name: 'Client Code', fieldFormat: 'string', isRequired: false } as CustomFieldMeta];
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
            customFields
        });

        const { columnSettings } = setVisibleColumnsForTest(['id', 'subject', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));
        fireEvent.click(screen.getByText('Client Code'));
        const customHandle = screen.getByLabelText('Reorder Client Code');
        const statusHandle = screen.getByLabelText('Reorder Status');

        fireEvent.dragStart(customHandle);
        fireEvent.dragOver(statusHandle);
        fireEvent.drop(statusHandle);
        fireEvent.dragEnd(customHandle);

        expect(useUIStore.getState().columnSettings.find((column) => column.key === 'cf:101')?.visible).toBe(true);
        expect(useUIStore.getState().visibleColumns).toContain('cf:101');
    });

    it('toggles assignee filter items when clicking the label text', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', assignedToId: 10, assignedToName: 'User A', statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false },
                { id: '2', subject: 'Task 2', projectId: 'p1', projectName: 'Alpha', assignedToId: 11, assignedToName: 'User B', statusId: 1, lockVersion: 0, editable: true, rowIndex: 1, hasChildren: false }
            ] as never,
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

        fireEvent.click(screen.getByTitle('Assignee Filter'));
        fireEvent.click(screen.getByText('User A'));

        expect(useTaskStore.getState().selectedAssigneeIds).toContain(10);
    });

    it('keeps unassigned selection checked after a refresh round-trip', async () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', assignedToId: null, statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false }
            ] as never,
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [
                    { id: null, name: null, projectIds: ['p1'] },
                    { id: 10, name: 'User A', projectIds: ['p1'] }
                ]
            },
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1'],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [
                    { id: null, name: null, projectIds: ['p1'] },
                    { id: 10, name: 'User A', projectIds: ['p1'] }
                ]
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                selectedAssigneeIds: [null],
                selectedProjectIds: ['p1']
            }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Assignee Filter'));
        fireEvent.click(screen.getByText('Unassigned'));

        await waitFor(() => {
            expect(useTaskStore.getState().selectedAssigneeIds).toEqual([null]);
        });

        expect(screen.getByLabelText('Unassigned')).toBeChecked();
    });

    it('keeps select-all checked after a refresh round-trip', async () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', assignedToId: null, statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false },
                { id: '2', subject: 'Task 2', projectId: 'p1', projectName: 'Alpha', assignedToId: 10, assignedToName: 'User A', statusId: 1, lockVersion: 0, editable: true, rowIndex: 1, hasChildren: false }
            ] as never,
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [
                    { id: null, name: null, projectIds: ['p1'] },
                    { id: 10, name: 'User A', projectIds: ['p1'] }
                ]
            },
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            selectedAssigneeIds: [null, 10],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['_none', 'v1'],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [
                    { id: null, name: null, projectIds: ['p1'] },
                    { id: 10, name: 'User A', projectIds: ['p1'] }
                ]
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                selectedAssigneeIds: [null, 10],
                selectedVersionIds: ['_none', 'v1'],
                selectedProjectIds: ['p1']
            }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Assignee Filter'));
        expect(screen.getByLabelText('Select All')).toBeChecked();
        expect(screen.getByLabelText('Unassigned')).toBeChecked();

        fireEvent.click(screen.getByTitle('Assignee Filter'));
        fireEvent.click(screen.getByTitle('Filter by version'));

        expect(screen.getByLabelText('Select All')).toBeChecked();
        expect(screen.getByLabelText('(No version)')).toBeChecked();

    });

    it('keeps no-version checked after a refresh round-trip', async () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', assignedToId: 10, assignedToName: 'User A', statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false }
            ] as never,
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [{ id: 10, name: 'User A', projectIds: ['p1'] }]
            },
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1'],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: [{ id: 10, name: 'User A', projectIds: ['p1'] }]
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                selectedProjectIds: ['p1'],
                selectedVersionIds: ['_none']
            }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by version'));
        fireEvent.click(screen.getByLabelText('(No version)'));

        await waitFor(() => {
            expect(useTaskStore.getState().selectedVersionIds).toEqual(['_none']);
        });

        expect(screen.getByLabelText('(No version)')).toBeChecked();
    });

    it('keeps all descendant projects visible in the project filter menu after a project is selected', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false }
            ] as never,
            filterOptions: {
                projects: [
                    { id: 'p1', name: 'Alpha' },
                    { id: 'p2', name: 'Beta' }
                ],
                assignees: []
            },
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1'],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by project'));

        expect(screen.getByText('Alpha')).toBeInTheDocument();
        expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('scopes assignee and version options by selected projects while keeping selected out-of-scope entries visible', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                {
                    id: '1',
                    subject: 'Task 1',
                    projectId: 'p1',
                    projectName: 'Alpha',
                    assignedToId: 10,
                    assignedToName: 'User A',
                    fixedVersionId: 'v1',
                    statusId: 1,
                    lockVersion: 0,
                    editable: true,
                    rowIndex: 0,
                    hasChildren: false
                }
            ] as never,
            filterOptions: {
                projects: [
                    { id: 'p1', name: 'Alpha' },
                    { id: 'p2', name: 'Beta' }
                ],
                assignees: [
                    { id: 10, name: 'User A', projectIds: ['p1'] },
                    { id: 20, name: 'User B', projectIds: ['p2'] },
                    { id: 30, name: 'User C', projectIds: ['p2'] }
                ]
            },
            versions: [
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' },
                { id: 'v2', name: 'Version 2', projectId: 'p2', status: 'open' },
                { id: 'v3', name: 'Version 3', projectId: 'p2', status: 'open' }
            ],
            selectedAssigneeIds: [20],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['v2'],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Assignee Filter'));
        expect(screen.getByText('User A')).toBeInTheDocument();
        expect(screen.getByText('User B')).toBeInTheDocument();
        expect(screen.queryByText('User C')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Filter by version'));
        expect(screen.getByText('Version 1')).toBeInTheDocument();
        expect(screen.getByText('Version 2')).toBeInTheDocument();
        expect(screen.queryByText('Version 3')).not.toBeInTheDocument();
    });

    it('toggles the project select-all checkbox between all projects and no explicit project selection after refresh', async () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [] as never,
            filterOptions: {
                projects: [
                    { id: 'p1', name: 'Alpha' },
                    { id: 'p2', name: 'Beta' }
                ],
                assignees: []
            },
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1', 'p2'],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        vi.mocked(apiClient.fetchData)
            .mockResolvedValueOnce({
                tasks: [],
                relations: [],
                versions: [],
                filterOptions: {
                    projects: [
                        { id: 'p1', name: 'Alpha' },
                        { id: 'p2', name: 'Beta' }
                    ],
                    assignees: []
                },
                statuses: [],
                customFields: [],
                project: { id: '1', name: 'Project' },
                permissions: { editable: true, viewable: true, baselineEditable: true },
                initialState: { selectedProjectIds: [] }
            })
            .mockResolvedValueOnce({
                tasks: [],
                relations: [],
                versions: [],
                filterOptions: {
                    projects: [
                        { id: 'p1', name: 'Alpha' },
                        { id: 'p2', name: 'Beta' }
                    ],
                    assignees: []
                },
                statuses: [],
                customFields: [],
                project: { id: '1', name: 'Project' },
                permissions: { editable: true, viewable: true, baselineEditable: true },
                initialState: { selectedProjectIds: ['p1', 'p2'] }
            });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by project'));

        const selectAll = screen.getByLabelText('Select All') as HTMLInputElement;

        await waitFor(() => {
            expect(selectAll.checked).toBe(true);
        });

        fireEvent.click(selectAll);

        await waitFor(() => {
            expect(useTaskStore.getState().selectedProjectIds).toEqual([]);
        });

        expect(selectAll.checked).toBe(false);

        fireEvent.click(selectAll);

        await waitFor(() => {
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
        });

        expect(selectAll.checked).toBe(true);
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
