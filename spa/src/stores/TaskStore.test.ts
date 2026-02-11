import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore } from './TaskStore';
import type { Task } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { apiClient } from '../api/client';
import { useUIStore } from './UIStore';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchData: vi.fn(),
        updateTask: vi.fn()
    }
}));

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
});
