import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore } from './TaskStore';
import type { Task } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { apiClient } from '../api/client';
import { useUIStore } from './UIStore';
import { AutoScheduleMoveMode } from '../types/constraints';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchData: vi.fn(),
        updateTask: vi.fn(),
        updateTaskFields: vi.fn()
    }
}));

const MONDAY = Date.UTC(2026, 0, 5);
const TUESDAY = Date.UTC(2026, 0, 6);
const WEDNESDAY = Date.UTC(2026, 0, 7);
const THURSDAY = Date.UTC(2026, 0, 8);
const FRIDAY = Date.UTC(2026, 0, 9);
const DAY = 24 * 60 * 60 * 1000;

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: 0,
    dueDate: 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('TaskStore viewport clamping', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('updateViewport は scrollY を rowCount に合わせてクランプする', () => {
        const { updateViewport } = useTaskStore.getState();
        useTaskStore.setState({ rowCount: 10 });

        updateViewport({ scrollY: 999999 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(0); // If height > content, it clamps to 0?
        // Wait, if rowCount=10, height=600, rowHeight=32 -> content=320. 320 < 600. maxScroll=0.

        useTaskStore.setState({ rowCount: 100 }); // 3200px
        const BOTTOM_PADDING_PX = 40;
        const maxScroll2 = 100 * 32 + BOTTOM_PADDING_PX - 600; // 2640

        updateViewport({ scrollY: 5000 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(maxScroll2);
    });
});

describe('TaskStore zoom behavior', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setZoomLevel は表示範囲の中央を維持する', () => {
        const { setZoomLevel } = useTaskStore.getState();
        const initialViewport = useTaskStore.getState().viewport;
        const initialScale = ZOOM_SCALES[1];
        useTaskStore.setState({
            viewport: {
                ...initialViewport,
                startDate: 1000,
                scrollX: 500, // visibleStart = 1000 + 500/scale
                scale: initialScale
            }
        });

        const expectedCenter = 1000 + (500 + initialViewport.width / 2) / initialScale;

        setZoomLevel(2); // Zoom in

        const newViewport = useTaskStore.getState().viewport;
        const newScale = ZOOM_SCALES[2];
        const newCenter = newViewport.startDate + (newViewport.scrollX + newViewport.width / 2) / newScale;

        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });

    it('setViewMode は表示範囲の中央を維持する', () => {
        const { setViewMode } = useTaskStore.getState();
        // Start at Week (zoom 1)
        const ONE_DAY = 24 * 60 * 60 * 1000;
        useTaskStore.setState({
            viewMode: 'Week',
            zoomLevel: 1,
            viewport: {
                ...useTaskStore.getState().viewport,
                startDate: 0,
                scrollX: 1600,
                scale: ZOOM_SCALES[1],
                width: 800,
                height: 600
            },
            allTasks: [
                buildTask({ id: 'range', startDate: 0, dueDate: ONE_DAY * 800 })
            ]
        });
        const initialViewport = useTaskStore.getState().viewport;
        const expectedCenter = initialViewport.startDate + (1600 + initialViewport.width / 2) / ZOOM_SCALES[1];

        // Switch to Month (zoom 0)
        setViewMode('Month');

        const { viewMode, zoomLevel, viewport } = useTaskStore.getState();
        const newCenter = viewport.startDate + (viewport.scrollX + viewport.width / 2) / ZOOM_SCALES[0];
        expect(viewMode).toBe('Month');
        expect(zoomLevel).toBe(0);
        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });

    it('setZoomLevel はタスク範囲が未定でも中央を維持する', () => {
        const { setZoomLevel } = useTaskStore.getState();
        useTaskStore.setState({
            allTasks: [],
            viewport: {
                ...useTaskStore.getState().viewport,
                startDate: 1000,
                scrollX: 500,
                scale: ZOOM_SCALES[0]
            }
        });

        const initialViewport = useTaskStore.getState().viewport;
        const expectedCenter = 1000 + (500 + initialViewport.width / 2) / ZOOM_SCALES[0];

        setZoomLevel(2);

        const newViewport = useTaskStore.getState().viewport;
        const newCenter = newViewport.startDate + (newViewport.scrollX + newViewport.width / 2) / ZOOM_SCALES[2];

        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });
});

describe('TaskStore assignee filter', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setSelectedAssigneeIds はタスクをフィルタリングする', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task 2', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task 3', assignedToId: undefined, assignedToName: 'None' }),
        ];

        const { setTasks, setSelectedAssigneeIds } = useTaskStore.getState();
        setTasks(mockTasks);

        // Filter by User A
        setSelectedAssigneeIds([10]);
        expect(useTaskStore.getState().tasks.length).toBe(1);
        expect(useTaskStore.getState().tasks[0].id).toBe('1');

        // Filter by User A and None
        setSelectedAssigneeIds([10, null]);
        expect(useTaskStore.getState().tasks.length).toBe(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toContain('1');
        expect(useTaskStore.getState().tasks.map(t => t.id)).toContain('3');

        // Clear filter
        setSelectedAssigneeIds([]);
        expect(useTaskStore.getState().tasks.length).toBe(3);
    });

    it('setGroupByAssignee は担当者ヘッダーでグルーピングする', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task 2', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task 3', assignedToId: 10, assignedToName: 'User A' })
        ];

        const { setTasks, setGroupByAssignee } = useTaskStore.getState();
        setTasks(mockTasks);
        setGroupByAssignee(true);

        const rows = useTaskStore.getState().layoutRows;
        const headerRows = rows.filter((row) => row.type === 'header');

        expect(useTaskStore.getState().groupByAssignee).toBe(true);
        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(headerRows.length).toBe(2);
        expect(headerRows.every((row) => row.type === 'header' && row.groupKind === 'assignee')).toBe(true);
    });
});

describe('TaskStore version label visibility', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('Ver表示ONなら選択なしでもバージョン名を表示する', () => {
        const { setTasks, setVersions, setSelectedVersionIds } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Version 1',
                effectiveDate: 0,
                startDate: 0,
                ratioDone: 0,
                projectId: 'p1',
                status: 'open'
            }
        ]);

        setTasks([
            buildTask({
                id: 't1',
                projectId: 'p1',
                fixedVersionId: 'v1',
                startDate: 0,
                dueDate: 0
            })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow?.name).toBe('Version 1');

        setSelectedVersionIds(['v1']);
        const selectedVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(selectedVersionRow?.name).toBe('Version 1');
    });
});

describe('TaskStore filter hierarchy', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setFilterText は親タスクを子タスクの上に表示する', () => {
        const tasks = [
            buildTask({ id: 'parent', subject: 'Parent', hasChildren: true }),
            buildTask({ id: 'child', subject: 'Child Match', parentId: 'parent' })
        ];

        const { setTasks, setFilterText } = useTaskStore.getState();
        setTasks(tasks);
        setFilterText('Match');

        const visibleTasks = useTaskStore.getState().tasks;
        expect(visibleTasks.map(task => task.id)).toEqual(['parent', 'child']);
    });
});

describe('TaskStore project filter with subproject toggle', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('サブプロジェクト非表示でもPJフィルタ選択は表示する', () => {
        const { setTasks, setSelectedProjectIds } = useTaskStore.getState();

        useTaskStore.setState({
            showSubprojects: false,
            currentProjectId: 'p1'
        });

        setTasks([
            buildTask({ id: 't1', projectId: 'p1', projectName: 'P1' }),
            buildTask({ id: 't2', projectId: 'p2', projectName: 'P2' })
        ]);

        setSelectedProjectIds(['p2']);

        const visibleIds = useTaskStore.getState().tasks.map(t => t.id);
        expect(visibleIds).toEqual(['t2']);
    });
});

describe('TaskStore dependency grouping', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('依存関係のあるタスクを隣接して表示する', () => {
        const tasks = [
            buildTask({ id: 'a', subject: 'A', displayOrder: 1 }),
            buildTask({ id: 'b', subject: 'B', displayOrder: 2 }),
            buildTask({ id: 'c', subject: 'C', displayOrder: 3 })
        ];

        const { setTasks, setRelations, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        const orderedIds = useTaskStore.getState().tasks.map(task => task.id);
        expect(orderedIds).toEqual(['a', 'c', 'b']);
    });

    it('sortConfig があっても依存関係の塊を優先して表示する', () => {
        useTaskStore.setState({
            groupByProject: false,
            groupByAssignee: false,
            showVersions: false,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', displayOrder: 2, startDate: 3 })
        ];

        const { setTasks, setRelations, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'c', 'b']);
    });

    it('依存整理中は version を跨ぐ依存タスクを隣接表示し version 行を出さない', () => {
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v2', displayOrder: 2, startDate: 3 })
        ];
        const versions = [
            { id: 'v1', name: 'Version 1', effectiveDate: 10, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Version 2', effectiveDate: 20, projectId: 'p1', status: 'open' }
        ];

        const { setTasks, setRelations, setVersions, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setVersions(versions);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'c', 'b']);
        expect(useTaskStore.getState().layoutRows.some(row => row.type === 'version')).toBe(false);
        expect(useTaskStore.getState().layoutRows.filter(row => row.type === 'header')).toHaveLength(1);
    });

    it('依存整理を無効にすると sort と version grouping を維持する', () => {
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v2', displayOrder: 2, startDate: 3 })
        ];
        const versions = [
            { id: 'v1', name: 'Version 1', effectiveDate: 10, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Version 2', effectiveDate: 20, projectId: 'p1', status: 'open' }
        ];

        const { setTasks, setRelations, setVersions } = useTaskStore.getState();
        setTasks(tasks);
        setVersions(versions);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'b', 'c']);
        expect(useTaskStore.getState().layoutRows.filter(row => row.type === 'version')).toHaveLength(2);
    });
});

describe('TaskStore scheduling state and relation-driven recalculation', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
    });

    it('addRelation recalculates downstream tasks and marks them modified', () => {
        const { setTasks, addRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY })
        ]);

        addRelation({ id: 'r1', from: 'A', to: 'B', type: 'precedes' });

        const state = useTaskStore.getState();
        const movedTask = state.allTasks.find((task) => task.id === 'B');
        expect(movedTask?.startDate).toBe(TUESDAY);
        expect(movedTask?.dueDate).toBe(WEDNESDAY);
        expect(state.modifiedTaskIds.has('B')).toBe(true);
    });

    it('setRelations derives cyclic scheduling state from loaded data', () => {
        const { setTasks, setRelations } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: 0, dueDate: 1 }),
            buildTask({ id: 'B', startDate: 2, dueDate: 3 })
        ]);

        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
            { id: 'r2', from: 'B', to: 'A', type: 'precedes' }
        ]);

        expect(useTaskStore.getState().schedulingStates.A.state).toBe('cyclic');
        expect(useTaskStore.getState().schedulingStates.B.state).toBe('cyclic');
    });

    it('derives critical path metrics from loaded tasks and relations', () => {
        const { setTasks, setRelations } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ]);

        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        const state = useTaskStore.getState();
        expect(state.criticalPathMetrics.A?.critical).toBe(true);
        expect(state.criticalPathMetrics.B?.critical).toBe(true);
        expect(state.criticalPathProjectFinish).toBe(THURSDAY);
    });

    it('updateTask shifts downstream chain together in linked downstream mode', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY }),
            buildTask({ id: 'C', startDate: Date.UTC(2026, 0, 8), dueDate: Date.UTC(2026, 0, 8) })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
            { id: 'r2', from: 'B', to: 'C', type: 'precedes' }
        ]);

        updateTask('A', { startDate: TUESDAY, dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'C')?.startDate).toBe(Date.UTC(2026, 0, 9));
    });

    it('updateTask leaves downstream tasks untouched when auto scheduling is off', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        updateTask('A', { startDate: TUESDAY, dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(WEDNESDAY);
        expect(state.schedulingStates.A.state).toBe('conflicted');
        expect(state.schedulingStates.B.state).toBe('conflicted');
    });

    it('rejects linked shift when external dependency would be violated', () => {
        const addNotification = vi.fn();
        useUIStore.setState({
            autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift,
            addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
        });
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'P', startDate: MONDAY, dueDate: THURSDAY }),
            buildTask({ id: 'A', startDate: FRIDAY, dueDate: FRIDAY + DAY }),
            buildTask({ id: 'B', startDate: FRIDAY + DAY * 3, dueDate: FRIDAY + DAY * 4 })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
            { id: 'r2', from: 'P', to: 'B', type: 'precedes' }
        ]);

        updateTask('A', { startDate: THURSDAY, dueDate: FRIDAY });

        expect(useTaskStore.getState().allTasks.find((task) => task.id === 'A')?.startDate).toBe(FRIDAY);
        expect(useTaskStore.getState().allTasks.find((task) => task.id === 'B')?.startDate).toBe(FRIDAY + DAY * 3);
        expect(addNotification).toHaveBeenCalledTimes(1);
        expect(String(addNotification.mock.calls[0]?.[0])).toContain('external dependency');
    });
});

describe('TaskStore filter persistence', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('updateTask preserves assignee filter', () => {
        const { setTasks, setSelectedAssigneeIds, updateTask } = useTaskStore.getState();
        const initialTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task A', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task B', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task C', assignedToId: 10, assignedToName: 'User A' }),
        ];

        setTasks(initialTasks);
        setSelectedAssigneeIds([10]); // Filter for User A (Task 1 & 3)

        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);

        // Update Task 1
        updateTask('1', { subject: 'Task A Updated' });

        // Filter should still be active
        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);
        expect(useTaskStore.getState().tasks.find(t => t.id === '1')?.subject).toBe('Task A Updated');

        // Update Task 2 (hidden) -> should remain hidden
        updateTask('2', { subject: 'Task B Updated' });
        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);
    });

    it('removeTask respects active filters', () => {
        const { setTasks, setSelectedAssigneeIds, removeTask } = useTaskStore.getState();
        const initialTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task A', assignedToId: 10 }),
            buildTask({ id: '2', subject: 'Task B', assignedToId: 11 }),
            buildTask({ id: '3', subject: 'Task C', assignedToId: 10 }),
        ];

        setTasks(initialTasks);
        setSelectedAssigneeIds([10]); // Filter [1, 3]

        removeTask('1'); // Remove visible task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);

        removeTask('2'); // Remove hidden task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);
    });
});

describe('TaskStore saveChanges ordering', () => {
    const addNotification = vi.fn();

    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState({ addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void });
        addNotification.mockReset();
        vi.mocked(apiClient.updateTask).mockReset();
        vi.mocked(apiClient.fetchData).mockReset();
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            customFields: [],
            statuses: [],
            project: { id: 'p1', name: 'P1' },
            permissions: { editable: true, viewable: true }
        });
    });

    it('saveChanges updates parent before child for nested tasks', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        updateTask('child', { dueDate: 5 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['parent', 'child']);
    });

    it('saveChanges updates ancestors before descendant in deep hierarchy', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'grand', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'parent', parentId: 'grand', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        updateTask('child', { dueDate: 7 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['grand', 'parent', 'child']);
    });

    it('saveChanges notifies error when any update fails', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'child') {
                return { status: 'error', error: 'Child date is out of parent range' };
            }
            return { status: 'ok', lockVersion: 1 };
        });

        updateTask('child', { dueDate: 5 });
        await saveChanges();

        expect(addNotification).toHaveBeenCalledTimes(1);
        const [message, type] = addNotification.mock.calls[0];
        expect(String(message)).toContain('#child');
        expect(type).toBe('error');
    });

    it('saveChanges retries tasks that fail due to transient ordering constraints', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'child', startDate: 3, dueDate: 5 }),
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 })
        ]);

        let parentSaved = false;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'child' && !parentSaved) {
                return { status: 'error', error: 'Date constraint violation' };
            }
            if (task.id === 'parent') {
                parentSaved = true;
            }
            return { status: 'ok', lockVersion: 2 };
        });

        updateTask('child', { startDate: 1, dueDate: 3 });
        updateTask('parent', { startDate: 0, dueDate: 0 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['child', 'parent', 'child']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges resolves conflict when server already applied dependent updates', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: 10, dueDate: 17, lockVersion: 1 }),
            buildTask({ id: '19', startDate: 17, dueDate: 24, lockVersion: 1 })
        ]);

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === '18') {
                return { status: 'ok', lockVersion: 2 };
            }
            if (task.id === '19') {
                return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
            }
            return { status: 'ok', lockVersion: 1 };
        });

        const latestTasks = [
            buildTask({ id: '18', startDate: 11, dueDate: 17, lockVersion: 2 }),
            buildTask({ id: '19', startDate: 18, dueDate: 25, lockVersion: 2 })
        ];
        vi.mocked(apiClient.fetchData)
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true }
            })
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true }
            });

        updateTask('18', { startDate: 11, dueDate: 17 });
        updateTask('19', { startDate: 18, dueDate: 25 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges saves downstream dependency updates before their predecessor', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: THURSDAY, dueDate: FRIDAY }),
            buildTask({ id: '19', startDate: Date.UTC(2026, 0, 13), dueDate: Date.UTC(2026, 0, 14) })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 1 }
        ]);
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });

        updateTask('18', { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['19', '18']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges retries a predecessor after delay mismatch once successor is saved', async () => {
        const { setTasks, setRelations, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: THURSDAY, dueDate: FRIDAY }),
            buildTask({ id: '19', startDate: Date.UTC(2026, 0, 13), dueDate: Date.UTC(2026, 0, 14) })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 1 }
        ]);
        useTaskStore.setState({
            modifiedTaskIds: new Set(['18', '19']),
            allTasks: [
                buildTask({ id: '18', startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12), lockVersion: 1 }),
                buildTask({ id: '19', startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15), lockVersion: 1 })
            ]
        });

        let successorSaved = false;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === '18' && !successorSaved) {
                return { status: 'error', error: 'Delay does not match the current task dates.' };
            }
            if (task.id === '19') {
                successorSaved = true;
            }
            return { status: 'ok', lockVersion: 2 };
        });

        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['19', '18']);
        expect(addNotification).not.toHaveBeenCalled();
    });
});

describe('TaskStore drag parent updates', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.updateTaskFields).mockReset();
    });

    it('moveTaskToRoot updates only local state when autoSave is OFF', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: false });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1 })
        ]);

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('ok');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().modifiedTaskIds.has('child')).toBe(true);
        expect(vi.mocked(apiClient.updateTaskFields)).not.toHaveBeenCalled();
    });

    it('moveTaskToRoot sends parent_issue_id null when autoSave is ON', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3
        });

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('ok');
        expect(vi.mocked(apiClient.updateTaskFields)).toHaveBeenCalledWith('child', {
            parent_issue_id: null,
            lock_version: 2
        });
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(3);
    });

    it('moveTaskAsChild rolls back when API response parentId does not match target', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'source', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3
        });

        const result = await moveTaskAsChild('source', 'parent');

        expect(result.status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'source')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'source')?.lockVersion).toBe(2);
    });

    it('moveTaskToRoot rolls back when API response still has parentId', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            parentId: 'parent'
        });

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBe('parent');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(2);
    });
});
