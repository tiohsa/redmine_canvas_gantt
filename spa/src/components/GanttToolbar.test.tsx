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
import { navigateToRedminePath } from '../utils/navigation';
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

    it('shows names beside header icons from saved queries through chart settings', () => {
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        const labels = Array.from(document.querySelectorAll(
            '.gantt-toolbar-left .gantt-toolbar-labeled-button .gantt-toolbar-button-label'
        )).map((element) => element.textContent);

        expect(labels).toEqual([
            'Query',
            'Cols',
            'Workload',
            'Proj.',
            'Tracker',
            'Ver.',
            'Assignee',
            'Status',
            'Settings',
            'Link'
        ]);
        expect(screen.getByRole('button', { name: 'Month' })).toHaveTextContent('M');
        expect(screen.getByRole('button', { name: 'Week' })).toHaveTextContent('W');
        expect(screen.getByRole('button', { name: 'Day' })).toHaveTextContent('D');
    });

    it('keeps responsive left and right toolbar groups addressable without changing controls', () => {
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        expect(document.querySelector('.gantt-toolbar')).toBeInTheDocument();
        expect(document.querySelector('.gantt-toolbar-left')).toBeInTheDocument();
        expect(document.querySelector('.gantt-toolbar-right')).toBeInTheDocument();
        expect(screen.getByTestId('display-settings-menu-button'))
            .toHaveAttribute('aria-label', 'Settings');
        expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('title', 'Today');
        expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    });

    it('renders workload menu labels from frontend i18n payload', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_workload: 'ワークロード',
                label_workload_short: 'ワークロード',
                label_show_workload: 'ワークロードパネルを表示',
                label_capacity_threshold: '負荷しきい値 (時間/日)',
                label_leaf_issues_only: '末端チケットのみ',
                label_include_closed_issues: '完了チケットを含める',
                label_today_onward_only: '今日以降のみ'
            }
        };

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('ワークロード'));

        expect(within(screen.getByTitle('ワークロード').parentElement as HTMLElement).getAllByText('ワークロード')).toHaveLength(2);
        expect(screen.getByText('ワークロードパネルを表示')).toBeInTheDocument();
        expect(screen.getByText('負荷しきい値 (時間/日)')).toBeInTheDocument();
        expect(screen.getByText('末端チケットのみ')).toBeInTheDocument();
        expect(screen.getByText('完了チケットを含める')).toBeInTheDocument();
        expect(screen.getByText('今日以降のみ')).toBeInTheDocument();
    });

    it('renders and toggles ticket visibility in the display settings popup', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_toggle_task_titles: 'タイトル表示切替'
            }
        };

        useUIStore.setState({
            ...useUIStore.getState(),
            showTaskTitles: true
        } as never);

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('display-settings-menu-button'));
        const button = screen.getByLabelText('タイトル表示切替');
        expect(button).toBeInTheDocument();

        fireEvent.click(button);
        expect((useUIStore.getState() as ReturnType<typeof useUIStore.getState> & { showTaskTitles: boolean }).showTaskTitles).toBe(false);

        fireEvent.click(button);
        expect((useUIStore.getState() as ReturnType<typeof useUIStore.getState> & { showTaskTitles: boolean }).showTaskTitles).toBe(true);
    });

    it('renders and toggles task bar dates in the display settings popup', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_toggle_task_bar_dates: 'バー日付表示切替'
            }
        };

        useUIStore.setState({ ...useUIStore.getState(), showTaskBarDates: false } as never);
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('display-settings-menu-button'));
        const button = screen.getByLabelText('バー日付表示切替');

        fireEvent.click(button);
        expect(useUIStore.getState().showTaskBarDates).toBe(true);
    });

    it('keeps the Today button icon-only while preserving its accessible name', () => {
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

        const todayButton = screen.getByRole('button', { name: 'Today' });
        expect(todayButton).toBeInTheDocument();
        expect(todayButton.querySelector('svg')).toBeInTheDocument();
        expect(todayButton.textContent?.trim()).toBe('');
    });

    it('does not render pane maximization buttons directly in the toolbar', () => {
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

        expect(screen.queryByTestId('maximize-left-pane-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('maximize-right-pane-button')).not.toBeInTheDocument();
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

        const baselineButton = screen.getByRole('button', { name: 'Save Baseline' });
        const topButton = screen.getByTitle('Top');

        expect(baselineButton).toBeInTheDocument();
        expect(screen.getAllByTestId('baseline-save-menu-button')).toHaveLength(1);
        expect(topButton.nextElementSibling).toContainElement(baselineButton);
        expect(baselineButton.querySelectorAll('svg')).toHaveLength(1);

        fireEvent.click(baselineButton);
        const baselineSaveMenu = await screen.findByTestId('baseline-save-menu');
        expect(within(baselineSaveMenu).getByRole('checkbox', { name: 'Show baseline comparison' })).toBeDisabled();

        await act(async () => {
            fireEvent.click(within(baselineSaveMenu).getByRole('button', { name: 'Save whole project as baseline' }));
            await Promise.resolve();
        });

        expect(saveBaselineMock).toHaveBeenCalledWith(
            expect.objectContaining({ scope: 'project' }),
            expect.stringMatching(/^mutation:/)
        );
        expect(useBaselineStore.getState().hasBaseline).toBe(true);
        expect(screen.getByRole('button', { name: 'Save Baseline' })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Save Baseline' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show baseline comparison' }));
        expect(useUIStore.getState().showBaseline).toBe(true);
    });

    it('keeps only the baseline visibility action for view-only users', () => {
        useTaskStore.setState({
            ...useTaskStore.getState(),
            permissions: { editable: false, viewable: true, baselineEditable: false }
        });
        useBaselineStore.setState({ hasBaseline: true });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('baseline-save-menu-button'));
        const menu = screen.getByTestId('baseline-save-menu');

        expect(within(menu).getByRole('checkbox', { name: 'Show baseline comparison' })).toBeInTheDocument();
        expect(within(menu).queryByTestId('baseline-save-filtered-button')).not.toBeInTheDocument();
        expect(within(menu).queryByTestId('baseline-save-project-button')).not.toBeInTheDocument();
    });

    it('shows a disabled visibility action when no baseline exists', () => {
        useTaskStore.setState({
            ...useTaskStore.getState(),
            permissions: { editable: false, viewable: true, baselineEditable: false }
        });
        useBaselineStore.setState({ hasBaseline: false });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('baseline-save-menu-button'));
        expect(screen.getByRole('checkbox', { name: 'Show baseline comparison' })).toBeDisabled();
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
                label_query: 'クエリ',
                label_query_short: 'クエリ',
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

        expect(screen.getByTestId('query-menu-button')).toHaveTextContent('クエリ');
        expect(await within(screen.getByTestId('query-menu')).findByText('保存済みクエリ')).toBeInTheDocument();
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

    it('opens the save-custom-query dialog without query_id so Redmine treats it as a new query', async () => {
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
            projectSelectionExplicit: true,
            selectedVersionIds: ['4'],
            queryContext: {
                baseQueryId: 12,
                overrides: {
                    status: { mode: 'subset', values: [1, 2] },
                    assignee: { mode: 'subset', values: [7] },
                    version: { mode: 'subset', values: ['4'] }
                }
            },
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
                '/redmine/projects/ecookbook/issues?f%5B%5D=status_id&op%5Bstatus_id%5D=%3D&v%5Bstatus_id%5D%5B%5D=1&v%5Bstatus_id%5D%5B%5D=2&f%5B%5D=assigned_to_id&op%5Bassigned_to_id%5D=%3D&v%5Bassigned_to_id%5D%5B%5D=7&f%5B%5D=project_id&op%5Bproject_id%5D=%3D&v%5Bproject_id%5D%5B%5D=3&f%5B%5D=fixed_version_id&op%5Bfixed_version_id%5D=%3D&v%5Bfixed_version_id%5D%5B%5D=4&f%5B%5D=subproject_id&op%5Bsubproject_id%5D=%21*&set_filter=1&group_by=assigned_to&sort=start_date%3Adesc&c%5B%5D=id&c%5B%5D=subject&c%5B%5D=status&c%5B%5D=assigned_to&c%5B%5D=start_date&c%5B%5D=due_date&c%5B%5D=done_ratio'
            );
        });
    });

    it('opens Redmine query edit with query_id preserved from the query menu', async () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            redmineBase: '/redmine'
        };

        useTaskStore.setState({
            activeQueryId: 12,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['3'],
            projectSelectionExplicit: true,
            selectedVersionIds: ['4'],
            queryContext: {
                baseQueryId: 12,
                overrides: {
                    status: { mode: 'subset', values: [1, 2] },
                    assignee: { mode: 'subset', values: [7] },
                    version: { mode: 'subset', values: ['4'] }
                }
            },
            sortConfig: { key: 'startDate', direction: 'desc' },
            groupByProject: false,
            groupByAssignee: true,
            showSubprojects: false
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
        fireEvent.click(screen.getByTestId('query-menu-button'));
        fireEvent.click(await screen.findByText('Edit Query in Redmine'));

        expect(vi.mocked(navigateToRedminePath)).toHaveBeenCalledWith(
            '/projects/ecookbook/issues?query_id=12&f%5B%5D=status_id&op%5Bstatus_id%5D=%3D&v%5Bstatus_id%5D%5B%5D=1&v%5Bstatus_id%5D%5B%5D=2&f%5B%5D=assigned_to_id&op%5Bassigned_to_id%5D=%3D&v%5Bassigned_to_id%5D%5B%5D=7&f%5B%5D=project_id&op%5Bproject_id%5D=%3D&v%5Bproject_id%5D%5B%5D=3&f%5B%5D=fixed_version_id&op%5Bfixed_version_id%5D=%3D&v%5Bfixed_version_id%5D%5B%5D=4&f%5B%5D=subproject_id&op%5Bsubproject_id%5D=%21*&set_filter=1&group_by=assigned_to&sort=start_date%3Adesc&c%5B%5D=id&c%5B%5D=subject&c%5B%5D=status&c%5B%5D=assigned_to&c%5B%5D=start_date&c%5B%5D=due_date&c%5B%5D=done_ratio'
        );
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

    it('keeps the display sharing control in the chart popup', () => {
        const config = getCanvasGanttConfig();
        window.RedmineCanvasGantt = {
            ...config,
            i18n: {
                ...(config.i18n ?? {}),
                label_share_display_settings_across_projects: '設定を全プロジェクトで共通化'
            }
        };
        window.localStorage.clear();

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

        const displaySettingsButton = screen.getByTestId('display-settings-menu-button');
        const workloadButton = screen.getByTitle('Workload');
        const projectButton = screen.getByTitle('Filter by project');
        const assigneeButton = screen.getByTitle('Assignee Filter');
        const versionButton = screen.getByTitle('Filter by version');

        expect(workloadButton.compareDocumentPosition(displaySettingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        expect(projectButton.parentElement).toHaveClass('gantt-toolbar-project-filter');
        expect(assigneeButton.parentElement).toHaveClass('gantt-toolbar-assignee-filter');
        expect(versionButton.parentElement).toHaveClass('gantt-toolbar-version-filter');
        expect(displaySettingsButton.parentElement).toHaveClass('gantt-toolbar-display-settings');

        fireEvent.click(displaySettingsButton);

        const displayMenu = screen.getByTestId('display-settings-menu');
        expect(displayMenu).toBeInTheDocument();
        expect(within(displayMenu).getByLabelText('設定を全プロジェクトで共通化')).toBeInTheDocument();
        expect(screen.queryByTestId('display-settings-scope-menu-button')).not.toBeInTheDocument();
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

        expect(within(screen.getByTestId('relation-settings-menu')).getByText('依存関係')).toBeInTheDocument();
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

        expect(within(screen.getByTestId('relation-settings-menu')).getByText('Dependency Settings')).toBeInTheDocument();
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

    it('shows the task name column checked and enabled by default', () => {
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));

        const subjectCheckbox = screen.getByLabelText('Task Name');
        expect(subjectCheckbox).toBeChecked();
        expect(subjectCheckbox).not.toBeDisabled();
    });

    it('keeps task name checked when toggling another column', () => {
        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Columns'));

        const subjectCheckbox = screen.getByLabelText('Task Name');
        const projectCheckbox = screen.getByLabelText('Project');

        expect(subjectCheckbox).toBeChecked();
        expect(projectCheckbox).not.toBeChecked();

        fireEvent.click(projectCheckbox);

        expect(subjectCheckbox).toBeChecked();
        expect(projectCheckbox).toBeChecked();
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

        expect(screen.getByLabelText('Task Name')).not.toBeChecked();
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
            'timer',
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
            display?: {
                projects?: Record<string, { visibleColumns?: string[] }>;
            };
        };

        expect(storedPreferences.display?.projects?.['project:1']?.visibleColumns).toContain('cf:101');

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

    it('lists no-version after regular versions in the version filter menu', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [] as never,
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: []
            },
            versions: [
                { id: 'v2', name: 'Version 2', projectId: 'p1', status: 'open' },
                { id: 'v1', name: 'Version 1', projectId: 'p1', status: 'open' }
            ],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1'],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            modifiedTaskIds: new Set(),
            autoSave: true,
            showVersions: false
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by version'));

        const selectAll = screen.getByLabelText('Select All').closest('label');
        const version1 = screen.getByLabelText('Version 1').closest('label');
        const version2 = screen.getByLabelText('Version 2').closest('label');
        const noVersion = screen.getByLabelText('(No version)').closest('label');
        const showVersionHeaders = screen.getByLabelText('Show version headers').closest('label');

        expect(selectAll).not.toBeNull();
        expect(version1).not.toBeNull();
        expect(version2).not.toBeNull();
        expect(noVersion).not.toBeNull();
        expect(showVersionHeaders).not.toBeNull();

        expect(selectAll!.compareDocumentPosition(version1!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(version1!.compareDocumentPosition(version2!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(version2!.compareDocumentPosition(noVersion!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(noVersion!.compareDocumentPosition(showVersionHeaders!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    describe('project candidate search', () => {
        const projects = [
            { id: 'p1', name: 'Project Alpha' },
            { id: 'p2', name: 'Project Beta' },
            { id: 'p3', name: 'Redmine Canvas Gantt' },
            { id: 'p4', name: '製造管理' },
            { id: 'p5', name: '製造システム' },
            { id: 'p6', name: '営業システム' }
        ];
        const response = (candidates = projects) => ({
            tasks: [], relations: [], versions: [], statuses: [], customFields: [],
            filterOptions: { projects: candidates, assignees: [] },
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });
        const openProjects = () => {
            fireEvent.click(screen.getByTestId('project-filter-menu-button'));
            return screen.getByRole('searchbox');
        };
        const search = (value: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value } });

        beforeEach(() => {
            useTaskStore.setState({
                filterOptions: { projects, assignees: [] },
                selectedProjectIds: [], memberProjectsOnly: false, groupByProject: false
            });
            vi.mocked(apiClient.fetchData).mockResolvedValue(response());
        });

        it.each(['canvas', 'CANVAS', '  canvas  '])('matches project names with %j', (query) => {
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search(query);
            expect(screen.getByLabelText('Redmine Canvas Gantt')).toBeInTheDocument();
            projects.filter(({ id }) => id !== 'p3').forEach(({ name }) => {
                expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
            });
        });

        it('matches Japanese names and restores all candidates for whitespace-only input', () => {
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('製造');
            expect(screen.getByLabelText('製造管理')).toBeInTheDocument();
            expect(screen.getByLabelText('製造システム')).toBeInTheDocument();
            expect(screen.queryByLabelText('営業システム')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Project Alpha')).not.toBeInTheDocument();
            search('   ');
            projects.forEach(({ name }) => expect(screen.getByLabelText(name)).toBeInTheDocument());
        });

        it('preserves hidden selections and adds a matching project through the existing store action', async () => {
            useTaskStore.setState({ selectedProjectIds: ['p1', 'p2'] });
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('canvas');
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
            fireEvent.click(screen.getByLabelText('Redmine Canvas Gantt'));
            await waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2', 'p3']);
            expect(screen.getByRole('searchbox')).toHaveValue('canvas');
            search('');
            ['Project Alpha', 'Project Beta', 'Redmine Canvas Gantt'].forEach((name) => {
                expect(screen.getByLabelText(name)).toBeChecked();
            });
        });

        it('uses all official candidates for Select All, including when there are no matches', async () => {
            useTaskStore.setState({ selectedProjectIds: ['p3'] });
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('canvas');
            expect(screen.getByLabelText('Select All')).not.toBeChecked();
            fireEvent.click(screen.getByLabelText('Select All'));
            await waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
            expect(useTaskStore.getState().selectedProjectIds).toEqual(expect.arrayContaining(projects.map(({ id }) => id)));
            expect(useTaskStore.getState().selectedProjectIds).toHaveLength(projects.length);
            expect(screen.getByLabelText('Select All')).toBeChecked();
            search('no match');
            expect(screen.getByLabelText('Select All')).toBeChecked();
            fireEvent.click(screen.getByLabelText('Select All'));
            await waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(2));
            expect(useTaskStore.getState().selectedProjectIds).toEqual([]);
        });

        it('bases the outside-candidate warning on official candidates, not search matches', () => {
            useTaskStore.setState({ selectedProjectIds: ['p1'], memberProjectsOnly: true });
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('canvas');
            expect(screen.queryByText(/Some selected projects are hidden/)).not.toBeInTheDocument();
            act(() => useTaskStore.setState({ selectedProjectIds: ['outside'] }));
            expect(screen.getByText(/Some selected projects are hidden/)).toBeInTheDocument();
        });

        it('reapplies search to refreshed member candidates and prioritizes loading', async () => {
            let resolve!: (value: ReturnType<typeof response>) => void;
            vi.mocked(apiClient.fetchData).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('canvas');
            fireEvent.click(screen.getByLabelText('Show member projects in filter'));
            expect(screen.getByText('Loading...')).toBeInTheDocument();
            expect(screen.queryByText('No matching projects')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Redmine Canvas Gantt')).not.toBeInTheDocument();
            await act(async () => resolve(response([
                { id: 'p7', name: 'Canvas Member' }, projects[0]
            ])));
            expect(screen.getByRole('searchbox')).toHaveValue('canvas');
            expect(screen.getByLabelText('Canvas Member')).toBeInTheDocument();
            expect(screen.queryByLabelText('Project Alpha')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Redmine Canvas Gantt')).not.toBeInTheDocument();
            expect(apiClient.fetchData).toHaveBeenCalledWith(expect.objectContaining({
                query: expect.objectContaining({ memberProjectsOnly: true })
            }));
        });

        it('keeps load errors visible instead of showing no matches', async () => {
            vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('Candidates unavailable'));
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('no match');
            expect(screen.getByText('No matching projects')).toBeInTheDocument();
            fireEvent.click(screen.getByLabelText('Show member projects in filter'));
            expect(await screen.findByText('Candidates unavailable')).toBeInTheDocument();
            expect(screen.queryByText('No matching projects')).not.toBeInTheDocument();
            search('still no match');
            expect(screen.getByText('Candidates unavailable')).toBeInTheDocument();
            expect(screen.queryByText('No matching projects')).not.toBeInTheDocument();
        });

        it('keeps Clear and grouping independent of search and preserves the active indicator', async () => {
            useTaskStore.setState({ selectedProjectIds: ['p1', 'p2'] });
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            const button = screen.getByTestId('project-filter-menu-button');
            openProjects();
            search('canvas');
            fireEvent.click(screen.getByText('Clear'));
            await waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
            expect(useTaskStore.getState().selectedProjectIds).toEqual([]);
            expect(button.querySelector('div')).toBeNull();
            fireEvent.click(screen.getByLabelText('Group by project'));
            expect(useTaskStore.getState().groupByProject).toBe(true);
            expect(button.querySelector('div')).not.toBeNull();
            fireEvent.click(screen.getByLabelText('Group by project'));
            expect(useTaskStore.getState().groupByProject).toBe(false);
            expect(button.querySelector('div')).toBeNull();
            expect(screen.getByRole('searchbox')).toHaveValue('canvas');
        });

        it.each(['toggle', 'outside', 'other menu'])('resets search when closed by %s', (closeBy) => {
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            search('canvas');
            if (closeBy === 'toggle') fireEvent.click(screen.getByTestId('project-filter-menu-button'));
            if (closeBy === 'outside') fireEvent.mouseDown(document.body);
            if (closeBy === 'other menu') fireEvent.click(screen.getByTestId('tracker-filter-menu-button'));
            expect(screen.queryByTestId('project-menu')).not.toBeInTheDocument();
            expect(openProjects()).toHaveValue('');
            projects.forEach(({ name }) => expect(screen.getByLabelText(name)).toBeInTheDocument());
        });

        it('does not change saved-query state, URL, storage or API calls while searching', async () => {
            useTaskStore.getState().applyResolvedQueryState({ queryId: 12, selectedProjectIds: ['p1', 'p2'] });
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            const stateBefore = useTaskStore.getState();
            const urlBefore = window.location.href;
            const storageBefore = { ...window.localStorage };
            openProjects();
            await act(async () => search('canvas'));
            expect(useTaskStore.getState()).toBe(stateBefore);
            expect(useTaskStore.getState().activeQueryId).toBe(12);
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
            expect(window.location.href).toBe(urlBefore);
            expect({ ...window.localStorage }).toEqual(storageBefore);
            expect(apiClient.fetchData).not.toHaveBeenCalled();
            expect(apiClient.fetchQueries).not.toHaveBeenCalled();
        });

        it('renders localized search and empty-state text with controls outside the candidate list', () => {
            getCanvasGanttConfig().i18n = {
                label_project_search_placeholder: 'プロジェクトを検索',
                label_no_matching_projects: '一致するプロジェクトがありません'
            };
            render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);
            openProjects();
            const input = screen.getByRole('searchbox', { name: 'プロジェクトを検索' });
            expect(input).toHaveAttribute('placeholder', 'プロジェクトを検索');
            const menu = screen.getByTestId('project-menu');
            const list = menu.querySelector('.gantt-toolbar-project-candidate-list');
            expect(list).toContainElement(screen.getByLabelText('Project Alpha'));
            [input, screen.getByLabelText('Select All'), screen.getByLabelText('Show member projects in filter'),
                screen.getByLabelText('Group by project'), screen.getByText('Clear')].forEach((control) => {
                expect(list).not.toContainElement(control);
                expect(menu).toContainElement(control);
            });
            expect(menu.style.overflowY).toBe('');
            search('no match');
            expect(screen.getByText('一致するプロジェクトがありません')).toBeInTheDocument();
        });
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

    it('toggles member-project candidates filter and prunes hidden project selections', async () => {
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
            selectedProjectIds: ['p1', 'p2'],
            selectedAssigneeIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            memberProjectsOnly: false
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                memberProjectsOnly: true,
                selectedProjectIds: ['p1', 'p2']
            }
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by project'));
        fireEvent.click(screen.getByLabelText('Show member projects in filter'));

        await waitFor(() => {
            expect(apiClient.fetchData).toHaveBeenCalledWith(expect.objectContaining({
                query: expect.objectContaining({
                    memberProjectsOnly: true
                })
            }));
        });
        await waitFor(() => {
            expect(useTaskStore.getState().memberProjectsOnly).toBe(true);
        });
        await waitFor(() => {
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
        });
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });

    it('does not fall back to task-derived project options in the project filter', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [
                { id: '1', subject: 'Task 1', projectId: 'p1', projectName: 'Alpha', statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false },
                { id: '2', subject: 'Task 2', projectId: 'p2', projectName: 'Beta', statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false }
            ] as never,
            filterOptions: {
                projects: [],
                assignees: []
            },
            selectedProjectIds: [],
            selectedAssigneeIds: [],
            selectedVersionIds: [],
            taskStatuses: [],
            selectedStatusIds: [],
            memberProjectsOnly: false
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTitle('Filter by project'));

        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
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

    it('scopes tracker candidates by projects without dropping a selected out-of-scope tracker', () => {
        useTaskStore.setState({
            filterText: '',
            allTasks: [] as never,
            filterOptions: {
                projects: [
                    { id: 'p1', name: 'Alpha' },
                    { id: 'p2', name: 'Beta' }
                ],
                assignees: [],
                trackers: [
                    { id: 10, name: 'Bug', projectIds: ['p1'] },
                    { id: 20, name: 'Feature', projectIds: ['p2'] },
                    { id: 30, name: 'Support', projectIds: ['p2'] }
                ]
            },
            versions: [],
            selectedAssigneeIds: [],
            selectedProjectIds: ['p1'],
            selectedVersionIds: [],
            selectedTrackerIds: [20],
            selectedStatusIds: [1],
            taskStatuses: [],
            modifiedTaskIds: new Set(),
            autoSave: true
        });

        render(<GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />);

        fireEvent.click(screen.getByTestId('tracker-filter-menu-button'));
        expect(screen.getByText('Bug')).toBeInTheDocument();
        expect(screen.getByText('Feature')).toBeInTheDocument();
        expect(screen.queryByText('Support')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Feature')).toBeChecked();

        fireEvent.click(screen.getByLabelText('Bug'));

        expect(useTaskStore.getState().selectedTrackerIds).toEqual([20, 10]);
        expect(useTaskStore.getState().selectedStatusIds).toEqual([1]);
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
