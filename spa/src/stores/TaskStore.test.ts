import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore, derivedRecalculationCounters, resetDerivedRecalculationCounters } from './TaskStore';
import type { Task } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { apiClient } from '../api/client';
import { useUIStore } from './UIStore';
import { AutoScheduleMoveMode } from '../types/constraints';
import { loadLastUsedSharedQueryState } from '../utils/sharedQueryState';
import { configureBusinessCalendar } from '../utils/businessCalendar';
import { createReadContext } from './taskStore/stateContract';

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

const buildApiData = (tasks: Task[]) => ({
    tasks,
    relations: [],
    versions: [],
    filterOptions: { projects: [], assignees: [] },
    statuses: [],
    customFields: [],
    project: { id: 'p1', name: 'P1' },
    permissions: { editable: true, viewable: true, baselineEditable: true }
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

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

describe('TaskStore canonical mutation reconciliation', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('keeps the server canonical value after settling the committed generation', () => {
        const original = buildTask({ id: 'canonical-task', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(original.id, { subject: 'local intent' });
        const generation = useTaskStore.getState().editGenerations[original.id];

        useTaskStore.getState().applyTaskMutationMetadata(original.id, {
            completeness: 'partial',
            entity: { id: original.id, subject: 'server normalized', lockVersion: 2 },
            revision: 2
        });
        useTaskStore.getState().commitTaskOperation(original.id, generation, 2);

        expect(useTaskStore.getState().allTasks.find(task => task.id === original.id)?.subject)
            .toBe('server normalized');
    });

    it('reapplies only a later local generation over the server canonical value', () => {
        const original = buildTask({ id: 'pending-task', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(original.id, { subject: 'first intent' });
        const committedGeneration = useTaskStore.getState().editGenerations[original.id];
        useTaskStore.getState().updateTask(original.id, { subject: 'later intent' });

        useTaskStore.getState().applyTaskMutationMetadata(original.id, {
            completeness: 'partial',
            entity: { id: original.id, subject: 'server normalized', lockVersion: 2 },
            revision: 2
        });
        useTaskStore.getState().commitTaskOperation(original.id, committedGeneration, 2);

        expect(useTaskStore.getState().allTasks.find(task => task.id === original.id)?.subject)
            .toBe('later intent');
        expect(useTaskStore.getState().localTaskPatches[original.id]).toHaveLength(1);
    });

    it('keeps a projection-only local change out of modified task ownership', () => {
        const original = buildTask({ id: 'projection-only', subject: 'persisted', statusId: 1 });
        useTaskStore.getState().setTasks([original]);

        useTaskStore.getState().updateTask(
            original.id,
            { subject: 'server projection', statusId: 2 },
            {}
        );

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === original.id)).toMatchObject({
            subject: 'server projection',
            statusId: 2
        });
        expect(state.localTaskPatches[original.id]).toEqual([
            expect.objectContaining({
                projection: { subject: 'server projection', statusId: 2 },
                mutationIntent: {}
            })
        ]);
        expect(state.modifiedTaskIds.has(original.id)).toBe(false);
    });

    it('rolls back failed Tracker Preview materialization while preserving a later generation', () => {
        const original = buildTask({
            id: 'tracker-preview',
            trackerId: 1,
            trackerName: 'Tracker A',
            statusId: 1,
            statusName: 'S1',
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { [original.id]: original },
                revisions: { [original.id]: original.lockVersion },
                context: null
            }
        });
        useTaskStore.getState().updateTask(
            original.id,
            { trackerId: 2, trackerName: 'Tracker B', statusId: 2, statusName: 'S2' },
            { trackerId: 2 }
        );
        const failedGeneration = useTaskStore.getState().editGenerations[original.id];
        useTaskStore.getState().updateTask(original.id, { subject: 'later local edit' });

        useTaskStore.getState().rollbackTaskOperation(original.id, failedGeneration);

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === original.id)).toMatchObject({
            trackerId: 1,
            trackerName: 'Tracker A',
            statusId: 1,
            statusName: 'S1',
            subject: 'later local edit'
        });
        expect(state.localTaskPatches[original.id]).toEqual([
            expect.objectContaining({ generation: failedGeneration + 1, mutationIntent: { subject: 'later local edit' } })
        ]);
        expect(state.modifiedTaskIds.has(original.id)).toBe(true);
    });

    it('manual save serializes the intended value when projection differs', async () => {
        const original = buildTask({ id: 'divergent-intent', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(
            original.id,
            { subject: 'server projection' },
            { subject: 'explicit intended value' }
        );
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 2 });

        await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: original.id, subject: 'server projection' }),
            expect.any(String),
            { subject: 'explicit intended value' }
        );
    });

    it('settles schedule-owned and residual fields independently in one manual save', async () => {
        const original = buildTask({ id: 'mixed-fields', subject: 'persisted', dueDate: TUESDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [{ id: original.id, dueDate: WEDNESDAY, lockVersion: 2 }],
            revisions: { [original.id]: 2 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            entity: { id: original.id, subject: 'local subject', lockVersion: 3 }
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...original, dueDate: WEDNESDAY, subject: 'local subject', lockVersion: 3 }
        ]));

        try {
            useTaskStore.getState().setTasks([original]);
            useTaskStore.getState().updateTask(original.id, { dueDate: WEDNESDAY, subject: 'local subject' });

            const failures = await useTaskStore.getState().saveChanges();

            expect(failures).toEqual(new Map());
            expect(scheduleMutation).toHaveBeenCalledTimes(1);
            expect(scheduleMutation.mock.calls[0][0][0]).toMatchObject({
                taskId: original.id,
                dueDate: WEDNESDAY
            });
            expect(apiClient.updateTask).toHaveBeenCalledWith(
                expect.objectContaining({ id: original.id, lockVersion: 2 }),
                expect.any(String),
                { subject: 'local subject' }
            );
            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
            expect(useTaskStore.getState().localTaskPatches[original.id]).toBeUndefined();
            expect(useTaskStore.getState().allTasks[0]).toMatchObject({
                dueDate: WEDNESDAY,
                subject: 'local subject',
                lockVersion: 3
            });
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('keeps local schedule intent without creating task conflicts on a topology conflict', async () => {
        const tasks = [
            buildTask({ id: 'topology-A', dueDate: TUESDAY, lockVersion: 1 }),
            buildTask({ id: 'topology-B', dueDate: TUESDAY, lockVersion: 1 })
        ];
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            errors: ['The schedule topology changed while the operation was running.'],
            failure: {
                kind: 'conflict' as const,
                resourceRole: 'scope' as const,
                resourceType: 'schedule_scope',
                remoteAvailability: 'needs_refresh' as const
            }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData(tasks));

        try {
            useTaskStore.getState().setTasks(tasks);
            useTaskStore.getState().updateTask('topology-A', { dueDate: WEDNESDAY });
            useTaskStore.getState().updateTask('topology-B', { dueDate: WEDNESDAY });

            const failures = await useTaskStore.getState().saveChanges();
            const state = useTaskStore.getState();

            expect(failures).toEqual(new Map([
                ['topology-A', 'The schedule topology changed while the operation was running.'],
                ['topology-B', 'The schedule topology changed while the operation was running.']
            ]));
            expect(state.modifiedTaskIds).toEqual(new Set(['topology-A', 'topology-B']));
            expect(state.localTaskPatches['topology-A']).toHaveLength(1);
            expect(state.localTaskPatches['topology-B']).toHaveLength(1);
            expect(state.taskConflicts).toEqual({});
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('refreshes and retains a local schedule intent for a single-task topology conflict', async () => {
        const task = buildTask({ id: 'topology-single', dueDate: TUESDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            errors: ['The schedule topology changed while the operation was running.'],
            failure: {
                kind: 'conflict' as const,
                resourceRole: 'scope' as const,
                resourceType: 'schedule_scope',
                remoteAvailability: 'needs_refresh' as const
            }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([task]));

        try {
            useTaskStore.getState().setTasks([task]);
            useTaskStore.getState().updateTask(task.id, { dueDate: WEDNESDAY });

            const failures = await useTaskStore.getState().saveChanges();
            await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
            const state = useTaskStore.getState();

            expect(failures).toEqual(new Map([
                [task.id, 'The schedule topology changed while the operation was running.']
            ]));
            expect(state.modifiedTaskIds).toEqual(new Set([task.id]));
            expect(state.localTaskPatches[task.id]).toEqual([
                expect.objectContaining({
                    projection: expect.objectContaining({ dueDate: WEDNESDAY }),
                    mutationIntent: expect.objectContaining({ dueDate: WEDNESDAY })
                })
            ]);
            expect(state.taskConflicts).toEqual({});
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });
});

describe('TaskStore bar operation rollback', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('restores the task and clears its optimistic patch after a terminal failure', () => {
        const original = buildTask({
            id: 'bar-task',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0].startDate).toBe(WEDNESDAY);
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');

        useTaskStore.getState().rollbackBarOperation(operationId);

        const state = useTaskStore.getState();
        expect(state.allTasks[0]).toMatchObject(original);
        expect(state.modifiedTaskIds).not.toContain('bar-task');
        expect(state.localTaskPatches['bar-task']).toBeUndefined();
    });

    it('does not rollback a later edit owned by a newer generation', () => {
        const original = buildTask({
            id: 'bar-task',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('bar-task', {
            startDate: FRIDAY,
            dueDate: FRIDAY
        });

        useTaskStore.getState().rollbackBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0].startDate).toBe(FRIDAY);
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');
    });

    it('rolls back only the bar fields when a later edit changes another field', () => {
        const original = buildTask({
            id: 'bar-task',
            subject: 'original',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('bar-task', { subject: 'later edit' });

        useTaskStore.getState().rollbackBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0]).toMatchObject({
            subject: 'later edit',
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');
    });

    it('keeps a later bar operation outside the earlier operation baseline', () => {
        const taskA = buildTask({ id: 'bar-a', startDate: MONDAY, dueDate: TUESDAY });
        const taskB = buildTask({ id: 'bar-b', startDate: MONDAY, dueDate: TUESDAY });
        useTaskStore.setState({ allTasks: [taskA, taskB], tasks: [taskA, taskB] });

        const firstOperation = useTaskStore.getState().beginBarOperation('bar-a');
        useTaskStore.getState().updateTask('bar-a', { dueDate: WEDNESDAY });
        useTaskStore.getState().endBarOperation(firstOperation);

        const secondOperation = useTaskStore.getState().beginBarOperation('bar-b');
        useTaskStore.getState().updateTask('bar-b', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(secondOperation);

        useTaskStore.getState().rollbackBarOperation(firstOperation);

        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-a')?.dueDate).toBe(TUESDAY);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-b')?.dueDate).toBe(THURSDAY);
    });

    it('does not let an older save callback complete a newer bar operation', () => {
        const original = buildTask({ id: 'bar-task', startDate: MONDAY, dueDate: TUESDAY });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const olderOperation = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: WEDNESDAY });
        useTaskStore.getState().endBarOperation(olderOperation);
        const olderGeneration = useTaskStore.getState().barOperations[olderOperation].entityGenerations['bar-task'];

        const newerOperation = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(newerOperation);
        const newerGeneration = useTaskStore.getState().barOperations[newerOperation].entityGenerations['bar-task'];

        expect(newerGeneration).toBeGreaterThan(olderGeneration);
        useTaskStore.getState().completeBarOperationTask('bar-task', olderGeneration);

        expect(useTaskStore.getState().barOperations[olderOperation]).toBeUndefined();
        expect(useTaskStore.getState().barOperations[newerOperation]).toBeDefined();
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
        window.localStorage.clear();
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

    it('setSelectedAssigneeIds は last-used shared query state を保存する', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' })
        ];

        const { setTasks, setSelectedAssigneeIds } = useTaskStore.getState();
        setTasks(mockTasks);
        setSelectedAssigneeIds([10]);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            selectedAssigneeIds: [10]
        });
    });
});

describe('TaskStore tracker filter', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([]));
    });

    it('filters tasks by tracker and preserves the other selections', () => {
        const { setTasks, setSelectedTrackerIds } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'bug', trackerId: 3 }),
            buildTask({ id: 'feature', trackerId: 8 }),
            buildTask({ id: 'unknown', trackerId: undefined })
        ]);
        useTaskStore.setState({ selectedStatusIds: [2] });

        setSelectedTrackerIds([3]);

        expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['bug']);
        expect(useTaskStore.getState().selectedStatusIds).toEqual([2]);
        expect(useTaskStore.getState().queryContext.overrides).toEqual({
            tracker: { mode: 'subset', values: [3] }
        });
    });
});

describe('TaskStore shared query persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('does not persist an unspecified Canvas Project scope', () => {
        useTaskStore.getState().applyResolvedQueryState({});

        expect(loadLastUsedSharedQueryState(1)).toEqual({ groupBy: null });
        expect(new URL(window.location.href).searchParams.has('canvas_project_ids[]')).toBe(false);
    });

    it('persists an explicitly empty Canvas Project scope', () => {
        useTaskStore.getState().setSelectedProjectIds([]);

        expect(useTaskStore.getState().projectSelectionExplicit).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            canvasProjectIds: []
        });
        expect(new URL(window.location.href).searchParams.get('canvas_project_ids[]')).toBe('none');
    });

    it('applyResolvedQueryState は query_id と shared state を保存する', () => {
        useTaskStore.getState().applyResolvedQueryState({
            queryId: 12,
            selectedStatusIds: [1, 2],
            groupBy: 'assignee',
            showSubprojects: false
        });

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1, 2],
            groupBy: 'assignee',
            showSubprojects: false
        });
    });

    it('applySavedQuery replaces Redmine query overrides while preserving Canvas project scope', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                queryId: 12,
                groupBy: 'assignee'
            }
        });

        useTaskStore.getState().setGroupByProject(true);
        useTaskStore.setState({
            queryContext: {
                baseQueryId: 7,
                overrides: {
                    assignee: { mode: 'subset', values: [7] }
                }
            },
            isQueryModified: true
        });
        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: { queryId: 12 },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(useTaskStore.getState().queryContext).toEqual({
            baseQueryId: 12,
            overrides: {}
        });
        expect(useTaskStore.getState().isQueryModified).toBe(false);
        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'assignee'
        });
    });

    it('applySavedQuery preserves member project candidates when the filter is enabled', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'member-project', name: 'Member project' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12 }
        });
        useTaskStore.setState({ memberProjectsOnly: true });

        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: {
                queryId: 12,
                memberProjectsOnly: true
            },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().filterOptions.projects).toEqual([
            { id: 'member-project', name: 'Member project' }
        ]);
        expect(useTaskStore.getState().memberProjectsOnly).toBe(true);
    });

    it('setGroupByProject preserves showSubprojects when enabling project grouping', () => {
        useTaskStore.setState({ showSubprojects: false });

        useTaskStore.getState().setGroupByProject(true);

        expect(useTaskStore.getState().groupByProject).toBe(true);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
        expect(useTaskStore.getState().explicitGroupByOverride).toBe('project');
        expect(useTaskStore.getState().showSubprojects).toBe(false);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            showSubprojects: false
        });
    });

    it('setGroupByProject preserves showSubprojects when disabling project grouping', () => {
        useTaskStore.setState({
            groupByProject: true,
            groupByAssignee: false,
            showSubprojects: true
        });

        useTaskStore.getState().setGroupByProject(false);

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
        expect(useTaskStore.getState().showSubprojects).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null
        });
    });

    it('applySavedQuery sends the saved query with the independent Canvas project scope', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                queryId: 12,
                selectedStatusIds: [3]
            }
        });
        useTaskStore.setState({
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['p1'],
            projectSelectionExplicit: true,
            selectedVersionIds: ['v1']
        });

        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: {
                queryId: 12,
                canvasProjectIds: ['p1']
            },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(useTaskStore.getState().selectedStatusIds).toEqual([3]);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [3],
            groupBy: null,
            canvasProjectIds: ['p1']
        });
    });

    it('does not restore the previous Canvas grouping when a saved query has no group_by', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12, groupBy: null }
        });
        useTaskStore.setState({ groupByProject: true, groupByAssignee: false });

        await useTaskStore.getState().applySavedQuery(12);

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
    });

    it('keeps an explicit group_by override ahead of a server initial-state default', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            ...buildApiData([]),
            initialState: { groupBy: 'project' }
        });
        useTaskStore.setState({
            explicitGroupByOverride: null,
            groupByProject: false,
            groupByAssignee: false
        });

        await useTaskStore.getState().refreshData();

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
    });

    it('preserves Canvas showSubprojects when a saved query is applied', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12, groupBy: 'project' }
        });
        useTaskStore.setState({ showSubprojects: false, selectedProjectIds: ['p1', 'p2'], projectSelectionExplicit: true });

        await useTaskStore.getState().applySavedQuery(12);

        expect(useTaskStore.getState().showSubprojects).toBe(false);
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
    });

    it('setMemberProjectsOnly refreshes data without pruning hidden selected projects or sharing the UI flag', async () => {
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
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                memberProjectsOnly: true,
                canvasProjectIds: ['p1', 'p2']
            }
        });

        await useTaskStore.getState().setMemberProjectsOnly(true);

        expect(apiClient.fetchData).toHaveBeenCalled();
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null,
            canvasProjectIds: ['p1', 'p2']
        });
    });
});

describe('TaskStore version layout exclusivity', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('turning on version headers disables dependency organization', () => {
        useTaskStore.setState({ organizeByDependency: true, showVersions: false });

        useTaskStore.getState().setShowVersions(true);

        expect(useTaskStore.getState().showVersions).toBe(true);
        expect(useTaskStore.getState().organizeByDependency).toBe(false);
    });

    it('turning on dependency organization disables version headers', () => {
        useTaskStore.setState({ organizeByDependency: false, showVersions: true });

        useTaskStore.getState().setOrganizeByDependency(true);

        expect(useTaskStore.getState().organizeByDependency).toBe(true);
        expect(useTaskStore.getState().showVersions).toBe(false);
    });
});

describe('TaskStore API data application', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    vi.mocked(apiClient.fetchData).mockReset();
  });

  it('preserves user-owned hidden columns when mutation refresh reapplies query initial state', () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);

    useTaskStore.getState().applyApiData({
      ...buildApiData([]),
      initialState: { visibleColumns: ['id', 'subject', 'status'] }
    });

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('user');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('restores preferences at a saved-query boundary when query columns disappear', () => {
    const preferenceState = useUIStore.getInitialState();
    const initialLoadContext = createReadContext({
      generation: 1,
      projectId: 'p1',
      query: { visibleColumns: ['status', 'subject'] },
      scope: {},
      purpose: 'initial_load'
    });
    const savedQueryContext = createReadContext({
      generation: 2,
      projectId: 'p1',
      query: { queryId: 12 },
      scope: {},
      purpose: 'saved_query'
    });

    useTaskStore.getState().applyApiData({
      ...buildApiData([]),
      initialState: { visibleColumns: ['status', 'subject'] }
    }, initialLoadContext);

    let uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['status', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['status', 'subject']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);

    useTaskStore.getState().applyApiData(
      { ...buildApiData([]), initialState: {} },
      savedQueryContext
    );

    uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(preferenceState.visibleColumns);
    expect(uiState.columnSettings).toEqual(preferenceState.columnSettings);
    expect(uiState.columnStateSource).toBe('preference');
    expect(uiState.columnsExplicitInQuery).toBe(false);
  });

  it('preserves query-owned columns when a regular refresh omits column state', async () => {
    useUIStore.getState().applyQueryVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: {}
    });

    await useTaskStore.getState().refreshData();

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('applies explicit saved-query columns at the query boundary after a user change', async () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: { queryId: 12, visibleColumns: ['status'] }
    });

    await useTaskStore.getState().applySavedQuery(12);

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['status']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['status']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('preserves user-owned columns when saved-query response omits column state', async () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: { queryId: 12 }
    });

    await useTaskStore.getState().applySavedQuery(12);

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('user');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('restores preferences when clearing query-owned saved-query columns', async () => {
    const preferenceState = useUIStore.getInitialState();
    useUIStore.getState().applyQueryVisibleColumns(['status', 'subject']);
    useTaskStore.getState().restoreActiveQueryId(12);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: {}
    });

    await useTaskStore.getState().clearSavedQuery();

    const uiState = useUIStore.getState();
    expect(useTaskStore.getState().activeQueryId).toBeNull();
    expect(uiState.visibleColumns).toEqual(preferenceState.visibleColumns);
    expect(uiState.columnSettings).toEqual(preferenceState.columnSettings);
    expect(uiState.columnStateSource).toBe('preference');
    expect(uiState.columnsExplicitInQuery).toBe(false);
  });

  it('refreshData applies API data with one TaskStore state update', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Project 1' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                groupBy: 'project',
                selectedProjectIds: ['p1']
            }
        });
        let notifications = 0;
        const unsubscribe = useTaskStore.subscribe(() => {
            notifications += 1;
        });

        await useTaskStore.getState().refreshData();
        unsubscribe();

        expect(notifications).toBe(1);
        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['t1']);
    });

    it('applyApiData filters selectedProjectIds without mutating initialState', () => {
        const initialState = {
            groupBy: 'project' as const,
            selectedProjectIds: ['p1', 'missing']
        };

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Project 1' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState
        });

        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'missing']);
        expect(initialState.selectedProjectIds).toEqual(['p1', 'missing']);
    });

    it('applyApiData clears the active query id when API initialState omits queryId', () => {
        useTaskStore.setState({ activeQueryId: 12 });

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                selectedStatusIds: [1]
            }
        });

        expect(useTaskStore.getState().activeQueryId).toBeNull();
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null,
            selectedStatusIds: [1]
        });
    });

    it('applyApiData preserves the active query id when API omits initialState', () => {
        useTaskStore.setState({ activeQueryId: 12 });

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });

        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'project'
        });
    });

    it('setFilterOptions only updates filterOptions', () => {
        const { setFilterOptions, setTasks } = useTaskStore.getState();
        setTasks([buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })]);
        const layoutRows = useTaskStore.getState().layoutRows;
        const rowCount = useTaskStore.getState().rowCount;

        setFilterOptions({
            projects: [{ id: 'p2', name: 'Project 2' }],
            assignees: []
        });

        expect(useTaskStore.getState().filterOptions.projects).toEqual([{ id: 'p2', name: 'Project 2' }]);
        expect(useTaskStore.getState().layoutRows).toBe(layoutRows);
        expect(useTaskStore.getState().rowCount).toBe(rowCount);
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

    it('期日未設定のバージョンでも対象タスクがあればバージョン行を表示する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Undated Version',
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({
                id: 't1',
                projectId: 'p1',
                fixedVersionId: 'v1',
                startDate: undefined,
                dueDate: undefined
            })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow).toMatchObject({
            type: 'version',
            versionId: 'v1',
            name: 'Undated Version',
            projectId: 'p1',
            startDate: undefined,
            dueDate: undefined
        });
    });

    it('effectiveDate がないバージョン行の描画範囲を配下 root タスクの日付から補完する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Task Range Version',
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', startDate: MONDAY, dueDate: FRIDAY, displayOrder: 1 })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow).toMatchObject({
            type: 'version',
            versionId: 'v1',
            startDate: MONDAY,
            dueDate: FRIDAY
        });
    });

    it('担当者グループ内の同じ version ID は複合 row ID で衝突しない', () => {
        const { setTasks, setVersions, setGroupByAssignee } = useTaskStore.getState();

        useTaskStore.setState({
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Shared Version',
                effectiveDate: FRIDAY,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 10, assignedToName: 'A', displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 11, assignedToName: 'B', displayOrder: 1 })
        ]);
        setGroupByAssignee(true);

        const versionRows = useTaskStore.getState().layoutRows.filter((row) => row.type === 'version');
        expect(versionRows).toHaveLength(2);
        expect(new Set(versionRows.map((row) => row.id)).size).toBe(2);
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', 'v1']);
    });

    it('片方の担当者グループ内 version row を閉じても別グループの同じ version は閉じない', () => {
        const { setTasks, setVersions, setGroupByAssignee, toggleVersionExpansion } = useTaskStore.getState();

        useTaskStore.setState({
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Shared Version',
                effectiveDate: FRIDAY,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 10, assignedToName: 'A', displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 11, assignedToName: 'B', displayOrder: 1 })
        ]);
        setGroupByAssignee(true);

        const firstVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(firstVersionRow?.type).toBe('version');
        if (!firstVersionRow || firstVersionRow.type !== 'version') throw new Error('version row not found');

        toggleVersionExpansion(firstVersionRow.id);

        const state = useTaskStore.getState();
        expect(state.versionExpansion[firstVersionRow.id]).toBe(false);
        expect(state.tasks.map((task) => task.id)).toEqual(['b']);
    });

    it('親子で対象バージョンが異なる場合は親の version group 配下に子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v2', displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1']);
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('親が未設定で子に version がある場合は未設定グループ配下に親子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            i18n: {
                ...(window.RedmineCanvasGantt?.i18n ?? {}),
                label_none: '未設定'
            }
        };
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: undefined, startDate: MONDAY, dueDate: THURSDAY, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: FRIDAY, displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows).toHaveLength(1);
        expect(versionRows[0]).toMatchObject({
            type: 'version',
            versionId: '_none',
            name: '未設定',
            projectId: 'p1',
            startDate: MONDAY,
            dueDate: THURSDAY
        });
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('通常 version と未設定 root が同じ project にある場合は未設定 row を最後に表示する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Version 1', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'none-root', projectId: 'p1', fixedVersionId: undefined, displayOrder: 0 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 })
        ]);

        const versionRows = useTaskStore.getState().layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', '_none']);
    });

    it('親が version ありで子が未設定の場合は親の version group 配下に子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: undefined, displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1']);
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('未設定 version row を閉じても他 version row には影響しない', () => {
        const { setTasks, setVersions, toggleVersionExpansion } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Version 1', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'none-root', projectId: 'p1', fixedVersionId: undefined, displayOrder: 0 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 })
        ]);

        const noneVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === '_none');
        expect(noneVersionRow?.type).toBe('version');
        if (!noneVersionRow || noneVersionRow.type !== 'version') throw new Error('none version row not found');

        toggleVersionExpansion(noneVersionRow.id);

        const state = useTaskStore.getState();
        expect(state.versionExpansion[noneVersionRow.id]).toBe(false);
        expect(state.tasks.map((task) => task.id)).toEqual(['version-root']);
        expect(state.layoutRows.filter((row) => row.type === 'version').map((row) => row.versionId)).toEqual(['v1', '_none']);
    });

    it('version filter の context-only 親が未設定なら表示 bucket は未設定になる', () => {
        const { setTasks, setVersions, setSelectedVersionIds } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: undefined, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 2 })
        ]);
        setSelectedVersionIds(['v1']);

        const state = useTaskStore.getState();
        const parent = state.tasks.find((task) => task.id === 'parent');
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(parent?.isContextOnly).toBe(true);
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', '_none']);
        expect(versionRows[1]).toMatchObject({
            type: 'version',
            versionId: '_none'
        });
        expect(state.tasks.map((task) => task.id)).toEqual(['version-root', 'parent', 'child']);
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
        expect(visibleTasks.find(task => task.id === 'parent')?.isContextOnly).toBe(true);
        expect(visibleTasks.find(task => task.id === 'child')?.isContextOnly).toBe(false);
    });
});

describe('TaskStore hierarchy layout guides', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('keeps ancestor vertical guides through descendants when an ancestor has following siblings', () => {
        const { setTasks } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'root', subject: 'Root', displayOrder: 0 }),
            buildTask({ id: 'a2', subject: 'A2', parentId: 'root', displayOrder: 0 }),
            buildTask({ id: 'a2-child-1', subject: 'A2 child 1', parentId: 'a2', displayOrder: 0 }),
            buildTask({ id: 'a2-child-2', subject: 'A2 child 2', parentId: 'a2', displayOrder: 1 }),
            buildTask({ id: 'a', subject: 'A', parentId: 'root', displayOrder: 1 })
        ]);

        const tasks = useTaskStore.getState().tasks;
        expect(tasks.map(task => task.id)).toEqual(['root', 'a2', 'a2-child-1', 'a2-child-2', 'a']);
        expect(tasks.find(task => task.id === 'a2')?.treeLevelGuides).toEqual([false]);
        expect(tasks.find(task => task.id === 'a2-child-1')?.treeLevelGuides).toEqual([true, false]);
        expect(tasks.find(task => task.id === 'a2-child-2')?.treeLevelGuides).toEqual([true, false]);
        expect(tasks.find(task => task.id === 'a')?.treeLevelGuides).toEqual([false]);
    });
});

describe('TaskStore project filter with subproject toggle', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
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

    it('uses filter option metadata for selected project headers without visible tasks', () => {
        const { setTasks } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            groupByAssignee: false,
            showVersions: false,
            filterOptions: {
                projects: [{ id: 'p2', name: 'Empty Project' }],
                assignees: []
            },
            selectedProjectIds: ['p2']
        });

        setTasks([
            buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })
        ]);

        const headerRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'header');
        expect(headerRow).toMatchObject({
            type: 'header',
            projectId: 'p2',
            projectName: 'Empty Project'
        });
    });

    it('keeps API selected empty project headers named from filter options', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [
                buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })
            ],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p2', name: 'Empty Project' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                groupBy: 'project',
                selectedProjectIds: ['p2']
            }
        });

        await useTaskStore.getState().refreshData();

        const headerRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'header');
        expect(headerRow).toMatchObject({
            type: 'header',
            projectId: 'p2',
            projectName: 'Empty Project'
        });
    });
});

describe('TaskStore background refresh safety', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('setSelectedAssigneeIds catches failed background refreshes', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('network down'));

        useTaskStore.getState().setSelectedAssigneeIds([10]);
        await vi.waitFor(() => {
            expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledWith('Failed to refresh data', expect.any(Error));
        });

        consoleError.mockRestore();
    });
});

describe('TaskStore asynchronous state ownership', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
        vi.mocked(apiClient.updateTask).mockReset();
    });

    it('applies only the newest refresh when responses complete in reverse order', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        let refreshCount = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(() => {
            refreshCount += 1;
            return refreshCount === 1 ? first.promise : second.promise;
        });

        const firstRefresh = useTaskStore.getState().refreshData();
        const secondRefresh = useTaskStore.getState().refreshData();
        second.resolve(buildApiData([buildTask({ id: 'new' })]));
        await Promise.resolve();
        first.resolve(buildApiData([buildTask({ id: 'old' })]));

        await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
            expect.objectContaining({ status: 'superseded' }),
            expect.objectContaining({ status: 'applied' })
        ]);
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['new']);
    });

    it('does not surface a superseded request rejection after a newer refresh wins', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData)
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        const firstRefresh = useTaskStore.getState().refreshData();
        const secondRefresh = useTaskStore.getState().refreshData();
        second.resolve(buildApiData([buildTask({ id: 'new' })]));
        first.reject(new Error('request aborted after supersession'));

        await expect(firstRefresh).resolves.toEqual(expect.objectContaining({ status: 'superseded' }));
        await expect(secondRefresh).resolves.toEqual(expect.objectContaining({ status: 'applied' }));
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['new']);
    });

    it('applies only the newest saved query when query responses complete in reverse order', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData)
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        const firstQuery = useTaskStore.getState().applySavedQuery(1);
        const secondQuery = useTaskStore.getState().applySavedQuery(2);
        second.resolve(buildApiData([buildTask({ id: 'query-2' })]));
        first.resolve(buildApiData([buildTask({ id: 'query-1' })]));

        await Promise.all([firstQuery, secondQuery]);
        expect(useTaskStore.getState().activeQueryId).toBe(2);
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['query-2']);
    });

    it('keeps only the third filter refresh when three requests overlap', async () => {
        const requests = [deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>()];
        vi.mocked(apiClient.fetchData).mockImplementationOnce(() => requests[0].promise)
            .mockImplementationOnce(() => requests[1].promise)
            .mockImplementationOnce(() => requests[2].promise);

        const refreshes = [
            useTaskStore.getState().refreshData(),
            useTaskStore.getState().refreshData(),
            useTaskStore.getState().refreshData()
        ];
        requests[2].resolve(buildApiData([buildTask({ id: 'filter-3' })]));
        requests[1].resolve(buildApiData([buildTask({ id: 'filter-2' })]));
        requests[0].resolve(buildApiData([buildTask({ id: 'filter-1' })]));
        await Promise.all(refreshes);

        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['filter-3']);
    });

    it('keeps only the last result after three actual assignee filter changes', async () => {
        const requests = [deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>()];
        let requestIndex = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(() => requests[requestIndex++].promise);

        useTaskStore.getState().setSelectedAssigneeIds([1]);
        useTaskStore.getState().setSelectedAssigneeIds([2]);
        useTaskStore.getState().setSelectedAssigneeIds([3]);
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(3));

        requests[2].resolve(buildApiData([buildTask({ id: 'assignee-3' })]));
        requests[1].resolve(buildApiData([buildTask({ id: 'assignee-2' })]));
        requests[0].resolve(buildApiData([buildTask({ id: 'assignee-1' })]));
        await vi.waitFor(() => expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['assignee-3']));
    });

    it('can refresh successfully after the newest request fails', async () => {
        vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('temporary failure'));
        const failed = useTaskStore.getState().refreshData();
        await expect(failed).rejects.toThrow('temporary failure');

        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([buildTask({ id: 'recovered' })]));
        await useTaskStore.getState().refreshData();
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['recovered']);
    });

    it('keeps an edit made while a refresh is in flight dirty and local', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);

        const refresh = useTaskStore.getState().refreshData();
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        request.resolve(buildApiData([buildTask({ id: 'task-1', dueDate: 3 })]));
        await refresh;

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('does not re-add a dirty task when a refresh changes scope', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([buildTask({ id: 'task-1', projectId: '1', dueDate: 2 })]))
            .mockReturnValueOnce(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', projectId: '1', dueDate: 2 })]);
        await useTaskStore.getState().refreshData();
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        useTaskStore.getState().setCurrentProjectId('2');

        const refresh = useTaskStore.getState().refreshData();
        request.resolve(buildApiData([]));
        await refresh;

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.localTaskPatches['task-1']).toHaveLength(1);
    });

    it('does not recalculate critical path for a non-scheduling field edit', () => {
        resetDerivedRecalculationCounters();
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', assignedToId: null })]);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-1', { assignedToId: 7 });

        expect(derivedRecalculationCounters.criticalPath).toBe(0);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('recalculates scheduling and critical path once for a date edit', () => {
        resetDerivedRecalculationCounters();
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY })]);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-1', { dueDate: WEDNESDAY });

        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
    });

    it('canonicalizes direct date updates with the task project calendar', () => {
        configureBusinessCalendar({
            status: 'ok',
            revision: 'test',
            defaultCalendarId: 'p1',
            projectCalendarIds: { p1: 'p1' },
            calendars: {
                p1: {
                    id: 'p1',
                    name: 'P1',
                    nonWorkingWeekDays: [0, 6],
                    days: {
                        '2026-01-07': { name: 'Holiday', type: 'non_working' }
                    }
                }
            },
            warnings: []
        });

        try {
            useTaskStore.getState().setTasks([buildTask({
                id: 'task-1',
                projectId: 'p1',
                startDate: MONDAY,
                dueDate: TUESDAY
            })]);
            useTaskStore.getState().updateTask('task-1', { dueDate: WEDNESDAY });

            expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')).toMatchObject({
                startDate: MONDAY,
                dueDate: TUESDAY
            });
        } finally {
            configureBusinessCalendar(undefined);
        }
    });

    it('cleans local draft state when a not-found task becomes a tombstone', () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.taskTombstones['task-1']?.source).toBe('server');
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.localTaskPatches['task-1']).toBeUndefined();
    });

    it('does not keep a tombstoned task eligible for a later save', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.has('task-1')).toBe(false);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
        expect(useTaskStore.getState().localTaskPatches['task-1']).toBeUndefined();
    });

    it('clears a stale tombstone when conflict resolution adopts a remote task', async () => {
        const remoteTask = buildTask({ id: 'task-1', subject: 'remote', lockVersion: 4 });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'local' })]);
        useTaskStore.getState().markTaskTombstone('task-1', 'server');
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'not found', detectedAt: Date.now(), remoteEntity: remoteTask, remoteRevision: remoteTask.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.allTasks).toEqual([remoteTask]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('does not use an old server snapshot when conflict remote state is missing', async () => {
        const localTask = buildTask({ id: 'task-1', subject: 'local' });
        const oldSnapshot = buildTask({ id: 'task-1', subject: 'old remote', lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': oldSnapshot },
                revisions: { 'task-1': oldSnapshot.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'Conflict', detectedAt: Date.now() }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks[0]?.subject).toBe('local draft');
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.taskConflicts['task-1']).toBeDefined();
        expect(state.taskTombstones['task-1']).toBeUndefined();
    });

    it('cleans the settled bar operation when conflict resolution adopts the remote task', async () => {
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY });
        const remoteTask = buildTask({ id: 'task-1', dueDate: FRIDAY, lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'Conflict', detectedAt: Date.now(), remoteEntity: remoteTask, remoteRevision: remoteTask.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([remoteTask]);
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.barOperations).toEqual({});
    });

    it('settles only the resolved entity in a linked bar operation', async () => {
        const localTasks = [
            buildTask({ id: 'task-a', dueDate: TUESDAY }),
            buildTask({ id: 'task-b', dueDate: WEDNESDAY })
        ];
        const remoteTaskA = buildTask({ id: 'task-a', dueDate: FRIDAY, lockVersion: 2 });
        useTaskStore.getState().setTasks(localTasks);
        const operationId = useTaskStore.getState().beginBarOperation('task-a');
        useTaskStore.getState().updateTask('task-a', { dueDate: THURSDAY });
        useTaskStore.getState().updateTask('task-b', { dueDate: FRIDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-a': remoteTaskA, 'task-b': localTasks[1] },
                revisions: { 'task-a': remoteTaskA.lockVersion, 'task-b': localTasks[1].lockVersion },
                context: null
            },
            taskConflicts: {
                'task-a': { taskId: 'task-a', message: 'Conflict', detectedAt: Date.now(), remoteEntity: remoteTaskA, remoteRevision: remoteTaskA.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-a', 'remote');

        const state = useTaskStore.getState();
        const operation = state.barOperations[operationId];
        expect(operation).toBeDefined();
        expect(operation.entityGenerations['task-a']).toBeUndefined();
        expect(operation.entityGenerations['task-b']).toBeDefined();
        expect(state.localTaskPatches['task-b']).toHaveLength(1);
    });

    it('preserves later-generation patches when resolving an earlier remote conflict', async () => {
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY });
        const remoteTask = buildTask({ id: 'task-1', dueDate: FRIDAY, lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);

        const firstOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(firstOperationId);
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'];

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        const laterGeneration = useTaskStore.getState().editGenerations['task-1'];

        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': {
                    taskId: 'task-1',
                    message: 'Conflict',
                    detectedAt: Date.now(),
                    generation: conflictGeneration,
                    remoteEntity: remoteTask,
                    remoteRevision: remoteTask.lockVersion
                }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')).toMatchObject({
            dueDate: FRIDAY,
            subject: 'later local edit'
        });
        expect(state.localTaskPatches['task-1']).toEqual([
            expect.objectContaining({
                generation: laterGeneration,
                projection: { subject: 'later local edit' },
                mutationIntent: { subject: 'later local edit' }
            })
        ]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.barOperations[firstOperationId]).toBeUndefined();
        expect(state.barOperations[laterOperationId]).toBeDefined();
    });

    it('does not resolve a conflict by dismissing only its conflict record', async () => {
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY });
        useTaskStore.getState().setTasks([localTask]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');

        await useTaskStore.getState().resolveTaskConflict('task-1', 'dismiss');

        const state = useTaskStore.getState();
        expect(state.taskConflicts['task-1']).toBeDefined();
        expect(state.localTaskPatches['task-1']).toHaveLength(1);
        expect(state.barOperations[operationId]).toBeDefined();
    });

    it('cleans the bar operation after a successful local conflict retry', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 2 });
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, dueDate: THURSDAY, lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalled();
        expect(useTaskStore.getState().barOperations).toEqual({});
    });

    it('preserves the source task and local intent when Keep Local retry loses a reference', async () => {
        useUIStore.setState(useUIStore.getInitialState(), true);
        const localTask = buildTask({ id: 'task-1', parentId: undefined, lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask('task-1', { parentId: 'missing-parent' });
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'];
        useTaskStore.getState().registerTaskConflict(
            'task-1',
            'Conflict',
            conflictGeneration,
            { ...localTask, lockVersion: 2 },
            2
        );
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'not_found',
            error: 'Parent task no longer exists',
            failure: { kind: 'not_found', resourceRole: 'reference', resourceType: 'parent_task' }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')).toBeDefined();
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.serverTaskSnapshot.entitiesById['task-1']).toBeDefined();
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.taskConflicts['task-1']).toBeUndefined();
        expect(useUIStore.getState().notifications.some(notification => notification.message.includes('Parent task no longer exists'))).toBe(true);
    });

    it('retries inline conflict resolution with the local field payload and current lock version', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', statusId: 1, statusName: 'New', lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask('task-1', { statusId: 2, statusName: 'In Progress' });
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(apiClient.fetchData).toHaveBeenCalled();
        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            'task-1',
            expect.objectContaining({ status_id: 2, lock_version: 2 }),
            expect.any(String)
        );
        const state = useTaskStore.getState();
        expect(state.taskConflicts['task-1']).toBeUndefined();
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.allTasks.find(task => task.id === 'task-1')?.lockVersion).toBe(3);
    });

    it('retries only persistence intent and excludes preview projection fields', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask(
            localTask.id,
            { projectId: '2', trackerId: 7, statusId: 4 },
            { projectId: '2' }
        );
        useTaskStore.getState().registerTaskConflict(localTask.id, 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict(localTask.id, 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            localTask.id,
            { project_id: '2', lock_version: 2 },
            expect.any(String)
        );
    });

    it('retries the intended value when the conflict projection differs', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask(
            localTask.id,
            { subject: 'server projection' },
            { subject: 'explicit intended value' }
        );
        useTaskStore.getState().registerTaskConflict(localTask.id, 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict(localTask.id, 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            localTask.id,
            { subject: 'explicit intended value', lock_version: 2 },
            expect.any(String)
        );
    });

    it('settles the conflicted operation without removing a later operation after local retry', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);

        const conflictedOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(conflictedOperationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, dueDate: THURSDAY, subject: 'later local edit', lockVersion: 3 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        const state = useTaskStore.getState();
        expect(state.barOperations[conflictedOperationId]).toBeUndefined();
        expect(state.barOperations[laterOperationId]).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('settles every saved generation while preserving an edit created during local retry', async () => {
        const firstSaveRequest = deferred<{ status: 'ok'; lockVersion: number }>();
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstSaveRequest.promise);
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([localTask]);

        const operationIds = [1, 2, 3].map(() => {
            const operationId = useTaskStore.getState().beginBarOperation('task-1');
            useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
            useTaskStore.getState().endBarOperation(operationId);
            return operationId;
        });
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'] - 2;
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict', conflictGeneration);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, dueDate: THURSDAY, lockVersion: 2 }
        ]));

        const retry = useTaskStore.getState().resolveTaskConflict('task-1', 'local');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalled());

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        firstSaveRequest.resolve({ status: 'ok', lockVersion: 2 });
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));

        const intermediateState = useTaskStore.getState();
        expect(intermediateState.barOperations[laterOperationId]).toBeDefined();

        await retry;

        const state = useTaskStore.getState();
        operationIds.forEach((operationId) => expect(state.barOperations[operationId]).toBeUndefined());
        expect(state.barOperations[laterOperationId]).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('keeps unresolved conflict when no remote task is available', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'local' })]);
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toHaveLength(1);
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.taskConflicts['task-1']).toBeDefined();
    });

    it('preserves task ownership when remote state is unavailable', async () => {
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY });
        useTaskStore.getState().setTasks([localTask]);

        const firstOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(firstOperationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toHaveLength(1);
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.barOperations).toHaveProperty(firstOperationId);
    });

    it('keeps the active operation when remote state is unavailable', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: TUESDAY })]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        expect(useTaskStore.getState().activeBarOperationId).toBe(operationId);
        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.barOperations).toHaveProperty(operationId);
        expect(state.activeBarOperationId).toBe(operationId);
    });

    it('applies deleted task metadata through the shared task transition', () => {
        const task = buildTask({ id: 'task-1' });
        useTaskStore.getState().setTasks([task]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: TUESDAY });
        useTaskStore.getState().endBarOperation(operationId);

        useTaskStore.getState().applyTaskMutationMetadata('task-1', {
            completeness: 'partial',
            invalidatedEntityIds: ['task-1'],
            deletedEntityIds: ['task-1']
        });

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.taskTombstones['task-1']?.source).toBe('server');
        expect(state.barOperations).toEqual({});
    });

    it('merges explicit nullable clears without replacing view state', () => {
        const task = buildTask({ id: 'task-1', dueDate: TUESDAY, editable: true, rowIndex: 7, hasChildren: true });
        useTaskStore.getState().setTasks([task]);

        useTaskStore.getState().applyTaskMutationMetadata('task-1', {
            completeness: 'partial',
            entity: { id: 'task-1', dueDate: undefined }
        });

        const updated = useTaskStore.getState().allTasks[0];
        expect(updated).toHaveProperty('dueDate', undefined);
        expect(updated?.editable).toBe(true);
        expect(updated?.rowIndex).toBe(7);
        expect(updated?.hasChildren).toBe(true);
    });

    it('clears deleted task ownership while preserving linked task ownership', () => {
        useTaskStore.getState().setTasks([
            buildTask({ id: 'task-a', dueDate: MONDAY }),
            buildTask({ id: 'task-b', dueDate: TUESDAY })
        ]);
        const operationId = useTaskStore.getState().beginBarOperation('task-a');
        useTaskStore.getState().updateTask('task-a', { dueDate: WEDNESDAY });
        useTaskStore.getState().updateTask('task-b', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({ activeBarOperationId: operationId });

        useTaskStore.getState().removeTask('task-a');

        const state = useTaskStore.getState();
        expect(state.barOperations[operationId]?.entityGenerations['task-a']).toBeUndefined();
        expect(state.barOperations[operationId]?.entityGenerations['task-b']).toBeDefined();
        expect(state.activeBarOperationId).toBeNull();
    });

    it('clears bar operation ownership when a task tombstone is terminal', () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: MONDAY })]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: TUESDAY });
        useTaskStore.getState().endBarOperation(operationId);

        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        expect(useTaskStore.getState().barOperations[operationId]).toBeUndefined();
    });

    it('does not let a pre-delete refresh resurrect a locally removed task', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);

        const refresh = useTaskStore.getState().refreshData();
        useTaskStore.getState().removeTask('task-1');
        request.resolve(buildApiData([buildTask({ id: 'task-1' })]));
        await refresh;

        expect(useTaskStore.getState().allTasks).toEqual([]);
    });

    it('saves an edit added while the previous save is in flight', async () => {
        const firstSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            if (saveCount === 1) return firstSave.promise;
            return { status: 'ok', lockVersion: 3 };
        });
        let reloadCount = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(async () => {
            reloadCount += 1;
            return buildApiData([
                buildTask({ id: 'task-1', dueDate: reloadCount === 1 ? 5 : 8, lockVersion: reloadCount + 1 })
            ]);
        });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        firstSave.resolve({ status: 'ok', lockVersion: 2 });
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(2));
        await saving;

        const state = useTaskStore.getState();
        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5, 8]);
        expect(state.allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('keeps canonical manual-save fields while reapplying only a later generation', async () => {
        const firstSave = deferred<{
            status: 'ok';
            lockVersion: number;
            completeness: 'partial';
            entity: Partial<Task> & { id: string };
            revision: number;
        }>();
        const secondSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            return saveCount === 1 ? firstSave.promise : secondSave.promise;
        });
        useTaskStore.getState().setTasks([buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            subject: 'persisted',
            lockVersion: 1
        })]);
        useTaskStore.getState().updateTask('task-1', {
            projectId: '2',
            trackerId: 2,
            statusId: 2
        });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { subject: 'later intent' });
        firstSave.resolve({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: {
                id: 'task-1',
                projectId: '3',
                trackerId: 3,
                statusId: 3,
                subject: 'server normalized',
                lockVersion: 2
            },
            revision: 2
        });
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(2));

        const afterFirstSave = useTaskStore.getState();
        expect(afterFirstSave.allTasks.find(task => task.id === 'task-1')).toMatchObject({
            projectId: '3',
            trackerId: 3,
            statusId: 3,
            subject: 'later intent',
            lockVersion: 2
        });
        expect(afterFirstSave.serverTaskSnapshot.entitiesById['task-1']).toMatchObject({
            projectId: '3',
            trackerId: 3,
            statusId: 3,
            subject: 'server normalized',
            lockVersion: 2
        });
        expect(afterFirstSave.localTaskPatches['task-1']).toHaveLength(1);
        expect(afterFirstSave.localTaskPatches['task-1'][0].projection).toEqual({ subject: 'later intent' });
        expect(afterFirstSave.localTaskPatches['task-1'][0].mutationIntent).toEqual({ subject: 'later intent' });

        secondSave.resolve({ status: 'ok', lockVersion: 3 });
        await saving;
    });

    it('aggregates project, tracker, and status edits into one manual-save PATCH', async () => {
        const original = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { projectId: '2' });
        useTaskStore.getState().updateTask('task-1', { trackerId: 2 });
        useTaskStore.getState().updateTask('task-1', { statusId: 2 });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: 'task-1', projectId: '2', trackerId: 2, statusId: 2, lockVersion: 2 },
            revision: 2
        });

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures).toEqual(new Map());
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1', projectId: '2', trackerId: 2, statusId: 2 }),
            expect.any(String),
            { project_id: '2', tracker_id: 2, status_id: 2 }
        );
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
    });

    it('discards a pending project, tracker, and status edit sequence without mutation', async () => {
        const original = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { projectId: '2' });
        useTaskStore.getState().updateTask('task-1', { trackerId: 2 });
        useTaskStore.getState().updateTask('task-1', { statusId: 2 });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([original]));

        await useTaskStore.getState().discardChanges();

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')).toMatchObject({
            projectId: '1',
            trackerId: 1,
            statusId: 1
        });
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
    });

    it('keeps an edit made while a conflict refresh is in flight dirty for explicit resolution', async () => {
        const conflictRefresh = deferred<ReturnType<typeof buildApiData>>();
        let saveCount = 0;
        let reloadCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            return saveCount === 1
                ? { status: 'conflict', error: 'stale lock' }
                : { status: 'ok', lockVersion: 4 };
        });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => {
            reloadCount += 1;
            if (reloadCount === 1) return conflictRefresh.promise;
            return buildApiData([buildTask({ id: 'task-1', dueDate: 8, lockVersion: 4 })]);
        });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2, lockVersion: 1 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        conflictRefresh.resolve(buildApiData([buildTask({ id: 'task-1', dueDate: 6, lockVersion: 2 })]));
        await saving;

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5]);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(true);
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'stale lock'
        });
    });

    it('coalesces overlapping saveChanges calls for the same edit stream', async () => {
        const firstSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            if (saveCount === 1) return firstSave.promise;
            return { status: 'ok', lockVersion: 3 };
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-1', dueDate: 8, lockVersion: 3 })
        ]));
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const firstOperation = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        const secondOperation = useTaskStore.getState().saveChanges();

        firstSave.resolve({ status: 'ok', lockVersion: 2 });
        await Promise.all([firstOperation, secondOperation]);

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5, 8]);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('retries a legacy transient error and clears the task after success', async () => {
        let attempts = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            attempts += 1;
            return attempts === 1
                ? { status: 'error', error: 'temporary failure' }
                : { status: 'ok', lockVersion: 2 };
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-1', dueDate: 8, lockVersion: 2 })
        ]));
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });

        const firstFailures = await useTaskStore.getState().saveChanges();
        expect(firstFailures.size).toBe(0);
        expect(attempts).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);

        const secondFailures = await useTaskStore.getState().saveChanges();
        expect(secondFailures.size).toBe(0);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
        expect(attempts).toBe(2);
    });

    it.each(['validation_error', 'forbidden'] as const)('rolls a bar operation back on a terminal %s response', async (status) => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status,
            error: 'Dates violate a rule'
        });
        const original = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([original]));
        useTaskStore.getState().setTasks([original]);
        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('task-1', { startDate: WEDNESDAY, dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);

        await useTaskStore.getState().saveChanges();

        expect(useTaskStore.getState().allTasks[0]).toMatchObject(original);
        expect(useTaskStore.getState().modifiedTaskIds).not.toContain('task-1');
        expect(useTaskStore.getState().barOperations).toEqual({});
    });

    it('does not clear another task when one task fails to save', async () => {
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => (
            task.id === 'task-a'
                ? { status: 'error', error: 'task A failed' }
                : { status: 'ok', lockVersion: 2 }
        ));
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-a', dueDate: 8 }),
            buildTask({ id: 'task-b', dueDate: 9 })
        ]));
        useTaskStore.getState().setTasks([
            buildTask({ id: 'task-a', dueDate: 2 }),
            buildTask({ id: 'task-b', dueDate: 3 })
        ]);
        useTaskStore.getState().updateTask('task-a', { dueDate: 8 });
        useTaskStore.getState().updateTask('task-b', { dueDate: 9 });

        await useTaskStore.getState().saveChanges();
        expect(useTaskStore.getState().modifiedTaskIds.has('task-a')).toBe(true);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-b')).toBe(false);
    });

    it('continues an ordinary child task save after a bar task terminal failure', async () => {
        const barTask = buildTask({ id: 'bar-task', dueDate: 8 });
        const ordinaryTask = buildTask({ id: 'ordinary-task', parentId: 'bar-task', dueDate: 9 });
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => (
            task.id === 'bar-task'
                ? { status: 'validation_error', error: 'Dates violate a rule' }
                : { status: 'ok', lockVersion: 2 }
        ));
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([barTask, ordinaryTask]));
        useTaskStore.getState().setTasks([barTask, ordinaryTask]);

        const operationId = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: 10 });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('ordinary-task', { ratioDone: 11 });

        await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['bar-task', 'ordinary-task']);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-task')?.dueDate).toBe(9);
        expect(useTaskStore.getState().modifiedTaskIds.has('ordinary-task')).toBe(false);
        expect(useTaskStore.getState().localTaskPatches['ordinary-task']).toBeUndefined();
    });

    it('coalesces mixed scheduling and non-scheduling fields into one task save', async () => {
        const task = buildTask({ id: 'mixed-task', dueDate: 2 });
        useTaskStore.getState().setTasks([task]);
        useTaskStore.getState().updateTask('mixed-task', { dueDate: 8 });
        useTaskStore.getState().updateTask('mixed-task', { subject: 'Local subject' });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([task]));

        const failures = await useTaskStore.getState().saveChanges();
        const state = useTaskStore.getState();

        expect(failures).toEqual(new Map());
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'mixed-task' }),
            expect.any(String),
            expect.objectContaining({ due_date: '1970-01-01', subject: 'Local subject' })
        );
        expect(state.modifiedTaskIds.has('mixed-task')).toBe(false);
        expect(state.localTaskPatches['mixed-task']).toBeUndefined();
    });

    it('keeps a bar operation unresolved when conflict resync shows a different remote value', async () => {
        const original = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY, lockVersion: 1 });
        const remote = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: FRIDAY, lockVersion: 2 });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'Conflict' });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([remote]));
        useTaskStore.getState().setTasks([original]);

        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);

        await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().allTasks[0]).toMatchObject({ dueDate: THURSDAY });
        expect(useTaskStore.getState().barOperations[operationId]).toBeDefined();
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'Conflict'
        });
    });

    it('keeps a conflict terminal when both resync and follow-up refresh fail', async () => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'stale lock' });
        vi.mocked(apiClient.fetchData).mockRejectedValue(new Error('resync unavailable'));
        const original = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.get('task-1')).toBe('resync unavailable');
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'resync unavailable (remote unavailable)'
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('task-1');
    });

    it('keeps a conflict unresolved when resync response excludes the task from scope', async () => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'stale lock' });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([]));
        const original = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });

        const failures = await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1);
        expect(failures.get('task-1')).toBe('stale lock');
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'stale lock (remote unavailable)'
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('task-1');
    });
});

describe('TaskStore focusTask', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('opens ancestor, project, and version groups before selecting the task', () => {
        const { setTasks, setVersions, toggleProjectExpansion, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        setVersions([
            {
                id: 'v1',
                name: 'Version 1',
                effectiveDate: MONDAY,
                startDate: MONDAY,
                ratioDone: 0,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        toggleProjectExpansion('p1');
        toggleVersionExpansion('v1');
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.projectExpansion.p1).toBe(true);
        expect(state.versionExpansion.v1).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.selectedTaskId).toBe('child');
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('opens the rendered parent version row when focusing a child with a different version', () => {
        const { setTasks, setVersions, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v2', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        const parentVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === 'v1');
        expect(parentVersionRow?.type).toBe('version');
        if (!parentVersionRow || parentVersionRow.type !== 'version') throw new Error('parent version row not found');

        toggleVersionExpansion(parentVersionRow.id);
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.versionExpansion[parentVersionRow.id]).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('opens project, _none version row, and parent when focusing a child under an unversioned parent', () => {
        const { setTasks, setVersions, toggleProjectExpansion, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: undefined, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        const noneVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === '_none');
        expect(noneVersionRow?.type).toBe('version');
        if (!noneVersionRow || noneVersionRow.type !== 'version') throw new Error('none version row not found');

        toggleProjectExpansion('p1');
        toggleVersionExpansion(noneVersionRow.id);
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.projectExpansion.p1).toBe(true);
        expect(state.versionExpansion[noneVersionRow.id]).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.selectedTaskId).toBe('child');
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('scrolls vertically and horizontally to make the task visible', () => {
        const { setTasks, focusTask } = useTaskStore.getState();
        const tasks: Task[] = [];

        for (let index = 0; index < 30; index += 1) {
            tasks.push(buildTask({
                id: `task-${index}`,
                projectId: 'p1',
                projectName: 'Project 1',
                displayOrder: index,
                startDate: MONDAY + index * DAY,
                dueDate: MONDAY + index * DAY
            }));
        }

        useTaskStore.setState((state) => ({
            ...state,
            viewport: {
                ...state.viewport,
                width: 400,
                height: 160,
                rowHeight: 32,
                startDate: MONDAY,
                scrollX: 0,
                scrollY: 0
            },
            groupByProject: false,
            showVersions: false
        }));
        setTasks(tasks);

        const result = focusTask('task-24');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.selectedTaskId).toBe('task-24');
        expect(state.viewport.scrollY).toBeGreaterThan(0);
        expect(state.viewport.scrollX).toBeGreaterThan(0);
    });

    it('returns filtered_out without changing state when the task is hidden by filters', () => {
        const { setTasks, setFilterText, focusTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'visible', subject: 'Visible Task', projectId: 'p1' }),
            buildTask({ id: 'hidden', subject: 'Hidden Task', projectId: 'p1' })
        ]);
        setFilterText('Visible');

        const before = useTaskStore.getState();
        const result = focusTask('hidden');
        const after = useTaskStore.getState();

        expect(result).toEqual({ status: 'filtered_out' });
        expect(after.selectedTaskId).toBe(before.selectedTaskId);
        expect(after.viewport).toEqual(before.viewport);
    });

    it('returns missing when the task does not exist', () => {
        expect(useTaskStore.getState().focusTask('missing-task')).toEqual({ status: 'missing' });
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

    it('does not schedule related dates for context-only edits', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: TUESDAY, trackerId: 1 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY, trackerId: 1 })
        ]);
        setRelations([
            { id: 'r1', from: 'parent', to: 'child', type: 'precedes' }
        ]);

        updateTask('parent', { trackerId: 2 }, { trackerId: 2 });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'parent')).toMatchObject({
            trackerId: 2,
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(state.allTasks.find((task) => task.id === 'child')).toMatchObject({
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(state.localTaskPatches).toEqual({
            parent: [expect.objectContaining({
                projection: { trackerId: 2 },
                mutationIntent: { trackerId: 2 }
            })]
        });
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

    it('recalculates a parent dependency after a child extends the parent', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'successor', startDate: TUESDAY, dueDate: TUESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'parent', to: 'successor', type: 'precedes' }
        ]);

        updateTask('child', { dueDate: TUESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'parent')?.dueDate).toBe(TUESDAY);
        expect(state.allTasks.find((task) => task.id === 'successor')?.startDate).toBe(WEDNESDAY);
    });

    it('recalculates ancestors when adding a relation pushes a child', () => {
        const { setTasks, addRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'parent', parentId: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'source', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY })
        ]);

        addRelation({ id: 'r1', from: 'source', to: 'child', type: 'precedes' });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'child')?.startDate).toBe(WEDNESDAY);
        expect(state.allTasks.find((task) => task.id === 'parent')?.startDate).toBe(WEDNESDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.startDate).toBe(WEDNESDAY);
        expect(state.modifiedTaskIds.has('child')).toBe(true);
        expect(state.modifiedTaskIds.has('parent')).toBe(true);
        expect(state.modifiedTaskIds.has('grand')).toBe(true);
    });

    it('uses all updated branches when recalculating a shared ancestor', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'left-parent', parentId: 'grand', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'right-parent', parentId: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'left', parentId: 'left-parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'right', parentId: 'right-parent', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'source', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'source', to: 'left', type: 'precedes' },
            { id: 'r2', from: 'source', to: 'right', type: 'precedes', delay: 1 }
        ]);

        updateTask('source', { dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'left-parent')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'right-parent')?.startDate).toBe(FRIDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.dueDate).toBe(FRIDAY + DAY);
    });

    it('aborts an automatic move when a downstream task is not editable', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY, editable: true }),
            buildTask({ id: 'B', startDate: TUESDAY, dueDate: TUESDAY, editable: false })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        updateTask('A', { dueDate: TUESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'A')?.dueDate).toBe(MONDAY);
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(TUESDAY);
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

    it('keeps a Monday successor fixed when moving the predecessor due date from Saturday to Friday', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];
        const addNotification = vi.fn();

        try {
            useUIStore.setState({
                autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift,
                addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
            });
            const { setTasks, setRelations, updateTask } = useTaskStore.getState();
            setTasks([
                buildTask({ id: 'A', startDate: FRIDAY, dueDate: FRIDAY + DAY }),
                buildTask({ id: 'B', startDate: FRIDAY + DAY * 3, dueDate: FRIDAY + DAY * 3 })
            ]);
            setRelations([
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
            ]);

            updateTask('A', { startDate: THURSDAY, dueDate: FRIDAY });

            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'A')).toMatchObject({
                startDate: THURSDAY,
                dueDate: FRIDAY
            });
            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'B')).toMatchObject({
                startDate: FRIDAY + DAY * 3,
                dueDate: FRIDAY + DAY * 3
            });
            expect(addNotification).not.toHaveBeenCalled();
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
    });

    it('rejects linked shift when external dependency would be violated', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];
        const addNotification = vi.fn();

        try {
            useUIStore.setState({
                autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift,
                addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
            });
            const { setTasks, setRelations, updateTask } = useTaskStore.getState();
            setTasks([
                buildTask({ id: 'P', startDate: MONDAY, dueDate: FRIDAY }),
                buildTask({ id: 'A', startDate: FRIDAY, dueDate: FRIDAY }),
                buildTask({ id: 'B', startDate: FRIDAY + DAY * 3, dueDate: FRIDAY + DAY * 4 })
            ]);
            setRelations([
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
                { id: 'r2', from: 'P', to: 'B', type: 'precedes' }
            ]);

            updateTask('A', { startDate: THURSDAY, dueDate: THURSDAY });

            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'A')?.startDate).toBe(FRIDAY);
            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'B')?.startDate).toBe(FRIDAY + DAY * 3);
            expect(addNotification).toHaveBeenCalledTimes(1);
            expect(String(addNotification.mock.calls[0]?.[0])).toContain('external dependency');
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
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
            filterOptions: { projects: [], assignees: [] },
            customFields: [],
            statuses: [],
            project: { id: 'p1', name: 'P1' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });
    });

    it('coalesces non-scheduling task fields into one manual mutation', async () => {
        const task = buildTask({
            id: 'task-1',
            subject: 'Before',
            statusId: 1,
            ratioDone: 0,
            lockVersion: 3
        });
        useTaskStore.getState().setTasks([task]);
        useTaskStore.getState().updateTask('task-1', { subject: 'After' });
        useTaskStore.getState().updateTask('task-1', { statusId: 2, ratioDone: 50 });

        await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1' }),
            expect.stringMatching(/^mutation:/),
            expect.objectContaining({ subject: 'After', status_id: 2, done_ratio: 50 })
        );
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
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

    it('ignores a legacy displayOrder patch while saving the persistable fields', async () => {
        const task = buildTask({ id: 'task-1', dueDate: 2, displayOrder: 1 });
        const { setTasks } = useTaskStore.getState();
        setTasks([task]);
        useTaskStore.setState({
            allTasks: [{ ...task, dueDate: 8 }],
            localTaskPatches: {
                'task-1': [
                    {
                        entityId: 'task-1',
                        projection: { displayOrder: 5 },
                        mutationIntent: {},
                        generation: 1,
                        operationId: 'parent-move:task-1:1'
                    },
                    {
                        entityId: 'task-1',
                        projection: { dueDate: 8 },
                        mutationIntent: { dueDate: 8 },
                        generation: 2,
                        operationId: 'edit:task-1:2'
                    }
                ]
            },
            modifiedTaskIds: new Set(['task-1']),
            editGenerations: { 'task-1': 2 }
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });

        await useTaskStore.getState().saveChanges();

        const state = useTaskStore.getState();
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1' }),
            expect.any(String),
            { due_date: '1970-01-01' }
        );
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(useTaskStore.getState().taskConflicts['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('does not silently save a dirty task without a LocalPatch', async () => {
        const task = buildTask({ id: 'task-1', dueDate: 2 });
        const { setTasks } = useTaskStore.getState();
        setTasks([task]);
        useTaskStore.setState({ modifiedTaskIds: new Set(['task-1']) });

        const failures = await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(failures.get('task-1')).toContain('No saveable task changes');
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('keeps a dirty local patch when manual save receives a scope not_found', async () => {
        const task = buildTask({ id: 'task-1', subject: 'Before', lockVersion: 3 });
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([task]);
        updateTask('task-1', { subject: 'After' });
        vi.mocked(apiClient.updateTask).mockResolvedValueOnce({
            status: 'not_found',
            error: 'Task is outside the Canvas scope',
            failure: { kind: 'not_found', resourceRole: 'scope', resourceType: 'task' }
        });

        const failures = await saveChanges();

        const state = useTaskStore.getState();
        expect(failures.get('task-1')).toBe('Task is outside the Canvas scope');
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'task-1', subject: 'After' })]);
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.localTaskPatches['task-1']).toEqual([
            expect.objectContaining({
                entityId: 'task-1',
                projection: expect.objectContaining({ subject: 'After' }),
                mutationIntent: expect.objectContaining({ subject: 'After' })
            })
        ]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(addNotification).toHaveBeenCalledWith(
            expect.stringContaining('Task is outside the Canvas scope'),
            'error'
        );
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
            buildTask({ id: '18', startDate: MONDAY, dueDate: TUESDAY, lockVersion: 1 }),
            buildTask({ id: '19', startDate: TUESDAY, dueDate: WEDNESDAY, lockVersion: 1 })
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
            buildTask({ id: '18', startDate: TUESDAY, dueDate: TUESDAY, lockVersion: 2 }),
            buildTask({ id: '19', startDate: THURSDAY, dueDate: FRIDAY, lockVersion: 2 })
        ];
        vi.mocked(apiClient.fetchData)
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                filterOptions: { projects: [], assignees: [] },
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true, baselineEditable: true }
            })
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                filterOptions: { projects: [], assignees: [] },
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true, baselineEditable: true }
            });

        updateTask('18', { startDate: TUESDAY, dueDate: TUESDAY });
        updateTask('19', { startDate: THURSDAY, dueDate: FRIDAY });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges saves predecessor updates before downstream dependency updates', async () => {
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
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saves a three-task dependency chain before downstream validation', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: '1', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: '2', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: '3', startDate: FRIDAY, dueDate: FRIDAY })
        ]);
        setRelations([
            { id: '12', from: '1', to: '2', type: 'precedes', delay: 0 },
            { id: '23', from: '2', to: '3', type: 'precedes', delay: 0 }
        ]);

        updateTask('1', { dueDate: WEDNESDAY });
        updateTask('2', { dueDate: THURSDAY });
        updateTask('3', { startDate: FRIDAY, dueDate: FRIDAY });

        const persisted = new Set<string>();
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === '2' && !persisted.has('1')) {
                return { status: 'error', error: 'Task 1 must be saved first' };
            }
            if (task.id === '3' && !persisted.has('2')) {
                return { status: 'error', error: 'Task 2 must be saved first' };
            }
            persisted.add(task.id);
            return { status: 'ok', lockVersion: 2 };
        });

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['1', '2', '3']);
        expect(failures).toEqual(new Map());
        expect(addNotification).not.toHaveBeenCalled();
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
    });

    it('saveChanges prioritizes dependency order over parent depth', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: FRIDAY }),
            buildTask({ id: '18', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: '19', startDate: THURSDAY, dueDate: FRIDAY })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 0 }
        ]);
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });

        updateTask('18', { startDate: TUESDAY, dueDate: WEDNESDAY });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds.indexOf('18')).toBeLessThan(updatedIds.indexOf('19'));
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges does not require a downstream retry after predecessor is saved first', async () => {
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
            editGenerations: { '18': 1, '19': 1 },
            localTaskPatches: {
                '18': [{
                    entityId: '18',
                    projection: { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) },
                    mutationIntent: { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) },
                    generation: 1,
                    operationId: 'edit:18:1'
                }],
                '19': [{
                    entityId: '19',
                    projection: { startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15) },
                    mutationIntent: { startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15) },
                    generation: 1,
                    operationId: 'edit:19:1'
                }]
            },
            allTasks: [
                buildTask({ id: '18', startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12), lockVersion: 1 }),
                buildTask({ id: '19', startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15), lockVersion: 1 })
            ]
        });

        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            return { status: 'ok', lockVersion: 2 };
        });

        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges clears all local patches after a 1,000 task successful save burst', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        const tasks = Array.from({ length: 1000 }, (_, index) => (
            buildTask({
                id: `patch-leak-${index}`,
                startDate: MONDAY,
                dueDate: TUESDAY,
                lockVersion: 1
            })
        ));

        setTasks(tasks);
        tasks.forEach((task, index) => {
            updateTask(task.id, { dueDate: TUESDAY + DAY * ((index % 5) + 1) });
        });

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => ({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: task.id, dueDate: task.dueDate, lockVersion: 2 },
            revision: 2
        }));
        resetDerivedRecalculationCounters();
        const failures = await saveChanges();

        expect(failures).toEqual(new Map());
        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1000);
        expect(derivedRecalculationCounters.scheduling).toBe(2);
        expect(derivedRecalculationCounters.criticalPath).toBe(2);
        expect(derivedRecalculationCounters.layout).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
        expect(addNotification).not.toHaveBeenCalled();
    }, 30_000);

    it('deletes every task named by canonical mutation metadata without deleting the source task', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'source-task', subject: 'Before', lockVersion: 1 }),
            buildTask({ id: 'deleted-task', subject: 'Removed', lockVersion: 1 })
        ]);
        updateTask('source-task', { subject: 'Local source' });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: 'source-task', subject: 'Canonical source', lockVersion: 2 },
            revision: 2,
            deletedEntityIds: ['deleted-task']
        });
        resetDerivedRecalculationCounters();

        await saveChanges();

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'source-task', subject: 'Canonical source' })]);
        expect(state.taskTombstones['source-task']).toBeUndefined();
        expect(state.taskTombstones['deleted-task']).toMatchObject({
            entityId: 'deleted-task',
            source: 'server'
        });
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('batches target-missing tombstone settlement with other task saves', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'missing-task', subject: 'Gone', lockVersion: 1 }),
            buildTask({ id: 'surviving-task', subject: 'Before', lockVersion: 1 })
        ]);
        updateTask('missing-task', { subject: 'Gone locally' });
        updateTask('surviving-task', { subject: 'Survives' });
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => task.id === 'missing-task'
            ? {
                status: 'not_found',
                error: 'Task was deleted',
                failure: { kind: 'not_found', resourceRole: 'target', resourceType: 'task' }
            }
            : { status: 'ok', lockVersion: 2 });
        resetDerivedRecalculationCounters();

        const failures = await saveChanges();

        const state = useTaskStore.getState();
        expect(failures.get('missing-task')).toBe('Task was deleted');
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'surviving-task', subject: 'Survives' })]);
        expect(state.taskTombstones['missing-task']).toMatchObject({
            entityId: 'missing-task',
            source: 'server'
        });
        expect(state.modifiedTaskIds).toEqual(new Set());
        expect(state.localTaskPatches).toEqual({});
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('retains every local patch when a dependency cycle rejects an independent task in the same batch', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'C', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        updateTask('A', { dueDate: WEDNESDAY });
        updateTask('B', { dueDate: THURSDAY });
        updateTask('C', { dueDate: FRIDAY });
        setRelations([
            { id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 },
            { id: 'BA', from: 'B', to: 'A', type: 'precedes', delay: 0 }
        ]);

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask)).not.toHaveBeenCalled();
        expect(vi.mocked(apiClient.fetchData)).not.toHaveBeenCalled();
        expect(failures.get('A')).toContain('dependency cycle');
        expect(failures.get('B')).toContain('dependency cycle');
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set(['A', 'B', 'C']));
        expect(useTaskStore.getState().localTaskPatches.A).toHaveLength(1);
        expect(useTaskStore.getState().localTaskPatches.B).toHaveLength(1);
        expect(useTaskStore.getState().localTaskPatches.C).toHaveLength(1);
        expect(useTaskStore.getState().allTasks.map(task => [task.id, task.dueDate])).toEqual([
            ['A', WEDNESDAY],
            ['B', THURSDAY],
            ['C', FRIDAY]
        ]);
        expect(addNotification).toHaveBeenCalledTimes(1);
    });

    it('retries a transient error on a downstream relation task and cleans both saved tasks', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        updateTask('A', { dueDate: WEDNESDAY });
        updateTask('B', { dueDate: THURSDAY });
        setRelations([
            { id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 }
        ]);

        let downstreamAttempts = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'B') {
                downstreamAttempts += 1;
                if (downstreamAttempts === 1) return { status: 'error', error: 'temporary relation failure' };
            }
            return { status: 'ok', lockVersion: 2 };
        });

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['A', 'B', 'B']);
        expect(failures).toEqual(new Map());
        expect(addNotification).not.toHaveBeenCalled();
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
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
        expect(result.parentId).toBeUndefined();
        expect(result.siblingPosition).toBe('tail');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().modifiedTaskIds.has('child')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches.child).toEqual([
            expect.objectContaining({
                projection: { parentId: undefined },
                mutationIntent: { parentId: undefined }
            })
        ]);
        expect(vi.mocked(apiClient.updateTaskFields)).not.toHaveBeenCalled();
    });

    it.each([false, true])('rejects a same-parent drop without mutation when autoSave is %s', async (autoSave) => {
        useTaskStore.setState({ autoSave });
        useTaskStore.getState().setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1 })
        ]);
        const before = useTaskStore.getState();

        const result = await useTaskStore.getState().moveTaskAsChild('child', 'parent');

        const after = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(after.allTasks).toEqual(before.allTasks);
        expect(after.editGenerations).toEqual(before.editGenerations);
        expect(after.localTaskPatches).toEqual(before.localTaskPatches);
        expect(after.modifiedTaskIds).toEqual(before.modifiedTaskIds);
        expect(apiClient.updateTaskFields).not.toHaveBeenCalled();
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
        expect(result.parentId).toBeUndefined();
        expect(result.siblingPosition).toBe('tail');
        expect(vi.mocked(apiClient.updateTaskFields)).toHaveBeenCalledWith(
            'child',
            { parent_issue_id: null, lock_version: 2 },
            expect.stringMatching(/^mutation:/)
        );
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(3);
    });

    it('moveTaskAsChild sends parent_issue_id and returns the target parent when autoSave is ON', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            parentId: '11'
        });

        const result = await moveTaskAsChild('10', '11');

        expect(result).toEqual({
            status: 'ok',
            lockVersion: 3,
            parentId: '11',
            siblingPosition: 'tail'
        });
        expect(vi.mocked(apiClient.updateTaskFields)).toHaveBeenCalledWith(
            '10',
            { parent_issue_id: 11, lock_version: 2 },
            expect.stringMatching(/^mutation:/)
        );
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.lockVersion).toBe(3);
    });

    it('rolls back only the failed parent move generation when a later edit exists', async () => {
        const { setTasks, moveTaskAsChild, updateTask } = useTaskStore.getState();
        const firstMoveRequest = deferred<{ status: 'validation_error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstMoveRequest.promise);

        const firstMove = moveTaskAsChild('10', '11');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));
        updateTask('10', { subject: 'later edit' });
        firstMoveRequest.resolve({ status: 'validation_error', error: 'Parent validation failed' });
        await firstMove;

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === '10')).toMatchObject({
            parentId: undefined,
            subject: 'later edit'
        });
        expect(state.localTaskPatches['10']).toEqual([
            expect.objectContaining({ generation: 2, operationId: 'edit:10:2' })
        ]);
        expect(state.modifiedTaskIds.has('10')).toBe(true);
    });

    it('keeps the optimistic parent move when the API request is transient', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockRejectedValueOnce(new Error('network down'));

        const result = await moveTaskAsChild('10', '11');

        expect(result.status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.lockVersion).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds.has('10')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches['10']).toBeDefined();
    });

    it('keeps the optimistic parent move after both bounded transient attempts', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields)
            .mockRejectedValueOnce(new Error('network down'))
            .mockRejectedValueOnce(new Error('network still down'));

        const result = await moveTaskAsChild('10', '11');

        expect(result.status).toBe('error');
        expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(2);
        expect(useTaskStore.getState().allTasks.find((task) => task.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().modifiedTaskIds.has('10')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches['10']).toBeDefined();
    });

    it('ignores a terminal response after its operation ownership was already removed', async () => {
        const { setTasks, moveTaskAsChild, rollbackTaskOperation, updateTask } = useTaskStore.getState();
        const firstMoveRequest = deferred<{ status: 'validation_error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstMoveRequest.promise);

        const firstMove = moveTaskAsChild('10', '11');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));
        rollbackTaskOperation('10', 1, { parentId: undefined });
        updateTask('10', { subject: 'newer edit' });

        firstMoveRequest.resolve({ status: 'validation_error', error: 'late failure' });
        await firstMove;

        expect(useTaskStore.getState().allTasks.find((task) => task.id === '10')).toMatchObject({
            parentId: undefined,
            subject: 'newer edit'
        });
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

    it('moveTaskAsChild tombstones the task when API resolves not_found', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'not_found',
            error: 'Task no longer exists'
        });

        const result = await moveTaskAsChild('10', '11');

        const state = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(state.allTasks.some((task) => task.id === '10')).toBe(false);
        expect(state.taskTombstones['10']?.source).toBe('server');
        expect(state.modifiedTaskIds.has('10')).toBe(false);
        expect(state.localTaskPatches['10']).toBeUndefined();
    });

    it('moveTaskToRoot tombstones the task when API rejects with not_found', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockRejectedValueOnce(
            Object.assign(new Error('Task no longer exists'), { status: 'not_found' })
        );

        const result = await moveTaskToRoot('child');

        const state = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(state.allTasks.some((task) => task.id === 'child')).toBe(false);
        expect(state.taskTombstones.child?.source).toBe('server');
        expect(state.modifiedTaskIds.has('child')).toBe(false);
        expect(state.localTaskPatches.child).toBeUndefined();
    });

    it('does not let an earlier parent move clear a later optimistic move', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();
        const first = deferred<{ status: 'ok'; lockVersion: number; parentId: string }>();
        const second = deferred<{ status: 'error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent-1', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'parent-2', projectId: 'p1', displayOrder: 2 }),
            buildTask({ id: 'child', projectId: 'p1', displayOrder: 3, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const firstMove = moveTaskAsChild('child', 'parent-1');
        await Promise.resolve();
        const secondMove = moveTaskAsChild('child', 'parent-2');
        first.resolve({ status: 'ok', lockVersion: 3, parentId: 'parent-1' });
        await vi.waitFor(() => {
            const calls = vi.mocked(apiClient.updateTaskFields).mock.calls;
            expect(calls).toHaveLength(2);
            expect(calls[1]?.[1]).toMatchObject({ lock_version: 3 });
        });
        second.resolve({ status: 'error', error: 'rejected' });

        expect((await firstMove).status).toBe('ok');
        expect((await secondMove).status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBe('parent-2');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(3);
    });

    it('records the parent move generation when a delayed conflict arrives after a later edit', async () => {
        const request = deferred<{ status: 'conflict'; error: string }>();
        const { setTasks, moveTaskAsChild, updateTask } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValue(request.promise);

        const move = moveTaskAsChild('child', 'parent');
        await Promise.resolve();
        const parentMoveGeneration = useTaskStore.getState().editGenerations.child;
        updateTask('child', { subject: 'later local edit' });
        expect(useTaskStore.getState().editGenerations.child).toBeGreaterThan(parentMoveGeneration);

        request.resolve({ status: 'conflict', error: 'stale parent move' });
        expect((await move).status).toBe('conflict');

        const state = useTaskStore.getState();
        expect(state.taskConflicts.child?.generation).toBe(parentMoveGeneration);
        expect(state.modifiedTaskIds.has('child')).toBe(true);
        expect(state.localTaskPatches.child).toEqual(expect.arrayContaining([
            expect.objectContaining({ generation: parentMoveGeneration })
        ]));
    });
});
