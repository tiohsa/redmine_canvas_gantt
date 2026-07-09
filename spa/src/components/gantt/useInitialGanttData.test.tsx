import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInitialGanttData } from './useInitialGanttData';
import { GanttToolbar } from '../GanttToolbar';
import { useTaskStore } from '../../stores/TaskStore';
import { resetCanvasGanttTestState } from '../../test/testSetup';
import { saveLastUsedSharedQueryState } from '../../utils/sharedQueryState';
import type { GanttExportHandle } from '../../export/types';

const fetchDataMock = vi.fn();
const fetchQueriesMock = vi.fn();

vi.mock('../../api/client', () => ({
    apiClient: {
        fetchData: (...args: unknown[]) => fetchDataMock(...args),
        fetchQueries: (...args: unknown[]) => fetchQueriesMock(...args)
    }
}));

const exportRef: { current: GanttExportHandle | null } = {
    current: {
        exportPng: async () => undefined,
        exportCsv: async () => undefined
    }
};

const Harness = () => {
    const viewportFromStorage = useTaskStore(state => state.viewportFromStorage);
    const updateViewport = useTaskStore(state => state.updateViewport);

    useInitialGanttData({
        viewportFromStorage,
        updateViewport
    });

    return null;
};

describe('useInitialGanttData persistence', () => {
    beforeEach(() => {
        resetCanvasGanttTestState();
        window.history.replaceState({}, '', '/projects/ecookbook/canvas_gantt');
        fetchDataMock.mockReset();
        fetchQueriesMock.mockReset();
        fetchQueriesMock.mockResolvedValue([]);
        fetchDataMock.mockImplementation(async (args?: { query?: unknown; rawSearch?: string }) => ({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [{ id: 'p1', name: 'Project 1' }], assignees: [] },
            statuses: [],
            customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: args?.query
        }));
    });

    it('restores shared query filters from storage on a bare canvas gantt URL', async () => {
        saveLastUsedSharedQueryState({
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [null, 7],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['_none', 'v2'],
            groupBy: 'assignee',
            showSubprojects: false
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {
                    selectedStatusIds: [1, 2],
                    selectedAssigneeIds: [null, 7],
                    selectedProjectIds: ['p1'],
                    selectedVersionIds: ['_none', 'v2'],
                    groupBy: 'assignee',
                    showSubprojects: false
                }
            });
        });

        await waitFor(() => {
            expect(useTaskStore.getState().selectedStatusIds).toEqual([1, 2]);
            expect(useTaskStore.getState().selectedAssigneeIds).toEqual([null, 7]);
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1']);
            expect(useTaskStore.getState().selectedVersionIds).toEqual(['_none', 'v2']);
            expect(useTaskStore.getState().groupByAssignee).toBe(true);
            expect(useTaskStore.getState().groupByProject).toBe(false);
            expect(useTaskStore.getState().showSubprojects).toBe(false);
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.getAll('status_ids[]')).toEqual(['1', '2']);
        expect(url.searchParams.getAll('assigned_to_ids[]')).toEqual(['none', '7']);
        expect(url.searchParams.getAll('project_ids[]')).toEqual(['p1']);
        expect(url.searchParams.getAll('fixed_version_ids[]')).toEqual(['none', 'v2']);
        expect(url.searchParams.get('group_by')).toBe('assigned_to');
        expect(url.searchParams.get('show_subprojects')).toBe('0');
    });

    it('restores an explicit empty project selection from storage on a bare canvas gantt URL', async () => {
        saveLastUsedSharedQueryState({
            selectedProjectIds: []
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {
                    selectedProjectIds: []
                }
            });
        });

        await waitFor(() => {
            expect(useTaskStore.getState().selectedProjectIds).toEqual([]);
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.getAll('project_ids[]')).toEqual(['none']);
    });

    it('restores a stored saved query id before initial data resolves and checks its radio', async () => {
        saveLastUsedSharedQueryState({
            queryId: 12
        });
        fetchDataMock.mockImplementationOnce(() => new Promise(() => undefined));
        fetchQueriesMock.mockResolvedValue([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 }
        ]);

        render(
            <>
                <Harness />
                <GanttToolbar zoomLevel={1} onZoomChange={() => {}} exportRef={exportRef} />
            </>
        );

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalled();
            expect(useTaskStore.getState().activeQueryId).toBe(12);
        });

        fireEvent.click(screen.getByTestId('query-menu-button'));

        expect(await screen.findByRole('radio', { name: 'Open issues' })).toBeChecked();
    });

    it('restores project grouping as an override for a stored saved query', async () => {
        saveLastUsedSharedQueryState({
            queryId: 12,
            groupBy: 'project'
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {
                    queryId: 12,
                    groupBy: 'project'
                }
            });
        });

        await waitFor(() => {
            expect(useTaskStore.getState().activeQueryId).toBe(12);
            expect(useTaskStore.getState().groupByProject).toBe(true);
            expect(useTaskStore.getState().groupByAssignee).toBe(false);
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.get('query_id')).toBe('12');
        expect(url.searchParams.get('group_by')).toBe('project');

        fetchDataMock.mockClear();
        await useTaskStore.getState().applySavedQuery(18);

        expect(fetchDataMock).toHaveBeenCalledWith({
            query: {
                queryId: 18
            }
        });
    });

    it('does not treat a stored saved query id alone as an explicit project grouping override', async () => {
        saveLastUsedSharedQueryState({
            queryId: 12
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {
                    queryId: 12
                }
            });
        });

        fetchDataMock.mockClear();
        await useTaskStore.getState().applySavedQuery(18);

        expect(fetchDataMock).toHaveBeenCalledWith({
            query: {
                queryId: 18
            }
        });
    });

    it('restores an explicit no-grouping selection from storage', async () => {
        saveLastUsedSharedQueryState({
            groupBy: null
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {
                    groupBy: null
                }
            });
        });

        await waitFor(() => {
            expect(useTaskStore.getState().groupByProject).toBe(false);
            expect(useTaskStore.getState().groupByAssignee).toBe(false);
        });

        expect(new URL(window.location.href).searchParams.get('group_by')).toBe('none');
    });

    it('preserves the active saved query when initial data omits initialState', async () => {
        saveLastUsedSharedQueryState({
            queryId: 12,
            selectedStatusIds: [1],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['v2']
        });
        useTaskStore.setState({
            selectedStatusIds: [1],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['v2']
        });
        fetchDataMock.mockImplementationOnce(async () => ({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [{ id: 'p1', name: 'Project 1' }], assignees: [] },
            statuses: [],
            customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: true }
        }));

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(useTaskStore.getState().activeQueryId).toBe(12);
            expect(useTaskStore.getState().selectedStatusIds).toEqual([1]);
            expect(useTaskStore.getState().selectedAssigneeIds).toEqual([7]);
            expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1']);
            expect(useTaskStore.getState().selectedVersionIds).toEqual(['v2']);
        });
    });

    it('does not restore memberProjectsOnly from shared query state', async () => {
        saveLastUsedSharedQueryState({
            memberProjectsOnly: true
        });

        render(<Harness />);

        await waitFor(() => {
            expect(fetchDataMock).toHaveBeenCalledWith({
                rawSearch: undefined,
                query: {}
            });
        });

        await waitFor(() => {
            expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.get('member_projects_only')).toBeNull();
    });
});
