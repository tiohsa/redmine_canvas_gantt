import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from './TaskStore';
import type { Task } from '../types';
import { ZOOM_SCALES } from '../utils/grid';

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
        const maxScroll2 = 100 * 32 - 600; // 2600

        updateViewport({ scrollY: 5000 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(maxScroll2);
    });
});

describe('TaskStore zoom behavior', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setZoomLevel は表示範囲の左端を維持する', () => {
        const { setZoomLevel } = useTaskStore.getState();
        const initialScale = ZOOM_SCALES[1];
        useTaskStore.setState({
            viewport: {
                ...useTaskStore.getState().viewport,
                startDate: 1000,
                scrollX: 500, // visibleStart = 1000 + 500/scale
                scale: initialScale
            }
        });

        const expectedVisibleStart = 1000 + 500 / initialScale;

        setZoomLevel(2); // Zoom in

        const newViewport = useTaskStore.getState().viewport;
        const newScale = ZOOM_SCALES[2];
        const newVisibleStart = newViewport.startDate + newViewport.scrollX / newScale;

        expect(newVisibleStart).toBeCloseTo(expectedVisibleStart, 5);
    });

    it('setViewMode は表示範囲の左端を維持する', () => {
        const { setViewMode } = useTaskStore.getState();
        // Start at Week (zoom 1)
        useTaskStore.setState({ viewMode: 'Week', zoomLevel: 1 });
        const initialViewport = useTaskStore.getState().viewport;

        // Move scroll
        useTaskStore.setState({ viewport: { ...initialViewport, scrollX: 300 } });

        // Switch to Month (zoom 0)
        setViewMode('Month');

        const { viewMode, zoomLevel, viewport } = useTaskStore.getState();
        const expectedScrollX = 300 * (ZOOM_SCALES[0] / ZOOM_SCALES[1]);
        expect(viewMode).toBe('Month');
        expect(zoomLevel).toBe(0);
        expect(viewport.scrollX).toBeCloseTo(expectedScrollX, 6);
    });
});

describe('TaskStore assignee filter', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setSelectedAssigneeIds はタスクをフィルタリングする', () => {
        const mockTasks = [
            { id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A', startDate: 0, dueDate: 0 },
            { id: '2', subject: 'Task 2', assignedToId: 11, assignedToName: 'User B', startDate: 0, dueDate: 0 },
            { id: '3', subject: 'Task 3', assignedToId: null, assignedToName: 'None', startDate: 0, dueDate: 0 },
        ] as any;

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
        const initialTasks = [
            { id: '1', subject: 'Task A', assignedToId: 10, assignedToName: 'User A', startDate: 0, dueDate: 0, editable: true },
            { id: '2', subject: 'Task B', assignedToId: 11, assignedToName: 'User B', startDate: 0, dueDate: 0, editable: true },
            { id: '3', subject: 'Task C', assignedToId: 10, assignedToName: 'User A', startDate: 0, dueDate: 0, editable: true },
        ] as any[];

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
        const initialTasks = [
            { id: '1', subject: 'Task A', assignedToId: 10, editable: true },
            { id: '2', subject: 'Task B', assignedToId: 11, editable: true },
            { id: '3', subject: 'Task C', assignedToId: 10, editable: true },
        ] as any[];

        setTasks(initialTasks);
        setSelectedAssigneeIds([10]); // Filter [1, 3]

        removeTask('1'); // Remove visible task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);

        removeTask('2'); // Remove hidden task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);
    });
});
