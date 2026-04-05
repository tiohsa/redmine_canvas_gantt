import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInitialGanttData } from './useInitialGanttData';
import { useTaskStore } from '../../stores/TaskStore';
import { resetCanvasGanttTestState } from '../../test/testSetup';
import { saveLastUsedSharedQueryState } from '../../utils/sharedQueryState';

const fetchDataMock = vi.fn();

vi.mock('../../api/client', () => ({
    apiClient: {
        fetchData: (...args: unknown[]) => fetchDataMock(...args)
    }
}));

const Harness = () => {
    const viewportFromStorage = useTaskStore(state => state.viewportFromStorage);
    const setTasks = useTaskStore(state => state.setTasks);
    const setRelations = useTaskStore(state => state.setRelations);
    const setVersions = useTaskStore(state => state.setVersions);
    const setFilterOptions = useTaskStore(state => state.setFilterOptions);
    const setCustomFields = useTaskStore(state => state.setCustomFields);
    const updateViewport = useTaskStore(state => state.updateViewport);

    useInitialGanttData({
        viewportFromStorage,
        setTasks,
        setRelations,
        setVersions,
        setFilterOptions,
        setCustomFields,
        updateViewport
    });

    return null;
};

describe('useInitialGanttData persistence', () => {
    beforeEach(() => {
        resetCanvasGanttTestState();
        window.history.replaceState({}, '', '/projects/ecookbook/canvas_gantt');
        fetchDataMock.mockReset();
        fetchDataMock.mockImplementation(async (args?: { query?: unknown; rawSearch?: string }) => ({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
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

    it('preserves the active saved query when initial data omits initialState', async () => {
        useTaskStore.setState({
            activeQueryId: 12,
            selectedStatusIds: [1],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['p1'],
            selectedVersionIds: ['v2']
        });
        fetchDataMock.mockImplementationOnce(async () => ({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
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
});
