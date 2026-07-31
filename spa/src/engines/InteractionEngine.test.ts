import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionEngine } from './InteractionEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from './LayoutEngine';
import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { buildRelationRenderContext, buildRelationRoutePoints, getPolylineMidpoint } from '../renderers/relationGeometry';
import { diffCalendarDays, formatDateOnly, parseDateOnly } from '../utils/dateOnly';

vi.mock('../api/client', () => ({
    apiClient: {
        updateTask: vi.fn(),
        fetchData: vi.fn()
    }
}));

import { apiClient } from '../api/client';

const setViewport = (partial: Partial<ReturnType<typeof useTaskStore.getState>['viewport']>) => {
    useTaskStore.setState({
        allTasks: [],
        tasks: [],
        zoomLevel: 2,
        viewport: {
            startDate: 0,
            scrollX: 0,
            scrollY: 0,
            scale: 1,
            width: 800,
            height: 600,
            rowHeight: 32,
            ...partial
        }
    });
};

const createContainer = () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
        ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => ({})
        }) as unknown as DOMRect;
    document.body.appendChild(container);
    return container;
};

const baseTask = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    subject: 'Task 1',
    projectId: 'p1',
    projectName: 'Project',
    displayOrder: 1,
    startDate: 0,
    dueDate: 10,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const seedTasks = (tasks: Task[], overrides: Partial<ReturnType<typeof useTaskStore.getState>> = {}) => {
    useTaskStore.setState({
        allTasks: tasks,
        tasks,
        relations: [],
        layoutRows: [],
        rowCount: tasks.length,
        groupByProject: false,
        projectExpansion: {},
        taskExpansion: {},
        filterText: '',
        sortConfig: null,
        autoSave: false,
        modifiedTaskIds: new Set(),
        ...overrides
    });
};

beforeEach(() => {
    vi.mocked(apiClient.updateTask).mockReset();
    vi.mocked(apiClient.fetchData).mockReset();
    useUIStore.setState({ isSidebarResizing: false });
});

describe('InteractionEngine viewport panning', () => {
    it('ドラッグで左端(過去)へオーバースクロールしたら startDate をシフトする', () => {
        setViewport({ startDate: 1000, scrollX: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        container.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 100, bubbles: true })); // dx=+50

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(0);
        expect(viewport.startDate).toBe(950);

        engine.detach();
        container.remove();
    });

    it('ホイールで左(過去)へスクロールしたら startDate をシフトする', () => {
        setViewport({ startDate: 1000, scrollX: 10, scale: 2 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const e = new WheelEvent('wheel', { deltaX: -30, deltaY: 0, bubbles: true, cancelable: true }); // nextScrollX=-20
        const result = container.dispatchEvent(e);
        expect(result).toBe(false);
        expect(e.defaultPrevented).toBe(true);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(0);
        expect(viewport.startDate).toBe(990);

        engine.detach();
        container.remove();
    });

    it('ホイールスクロールはデフォルト動作を抑止する（スクロールバーと二重に動かさない）', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const e = new WheelEvent('wheel', { deltaX: 0, deltaY: 10, bubbles: true, cancelable: true });
        const result = container.dispatchEvent(e);
        expect(result).toBe(false);
        expect(e.defaultPrevented).toBe(true);

        engine.detach();
        container.remove();
    });

    it('左ペインのリサイズ中はホイールでスクロールしない', () => {
        setViewport({ startDate: 1000, scrollX: 10, scrollY: 20, scale: 2 });
        useUIStore.setState({ isSidebarResizing: true });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const e = new WheelEvent('wheel', { deltaX: 30, deltaY: 40, bubbles: true, cancelable: true });
        const result = container.dispatchEvent(e);
        expect(result).toBe(false);
        expect(e.defaultPrevented).toBe(true);

        const { viewport } = useTaskStore.getState();
        expect(viewport.startDate).toBe(1000);
        expect(viewport.scrollX).toBe(10);
        expect(viewport.scrollY).toBe(20);

        engine.detach();
        container.remove();
    });
});

describe('InteractionEngine task updates', () => {
    it.each([
        ['move', '2026-03-08', '2026-03-09'],
        ['start resize', '2026-11-01', '2026-11-02'],
        ['due resize', '2026-07-27', '2026-07-28']
    ])('keeps calendar dates local across %s snapping', (_operation, input, expected) => {
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const timestamp = parseDateOnly(input);
        expect(timestamp).not.toBeNull();

        const snapped = (engine as unknown as { snapToDate(value: number): number })
            .snapToDate(timestamp! + 24 * 60 * 60 * 1000);

        expect(formatDateOnly(snapped)).toBe(expected);
        engine.detach();
        container.remove();
    });

    it('依存関係があるタスク更新後にデータを再取得する', async () => {
        const day = 24 * 60 * 60 * 1000;
        setViewport({
            startDate: parseDateOnly('2025-12-01')!,
            scrollX: 0,
            scrollY: 0,
            scale: 10 / day
        });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({
            id: '1',
            rowIndex: 0,
            startDate: parseDateOnly('2026-01-01')!,
            dueDate: parseDateOnly('2026-01-10')!
        });
        const task2 = baseTask({
            id: '2',
            rowIndex: 1,
            startDate: parseDateOnly('2026-01-20')!,
            dueDate: parseDateOnly('2026-01-30')!
        });
        const relations: Relation[] = [{ id: 'r1', from: '1', to: '2', type: 'precedes' }];

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations,
            layoutRows: [],
            rowCount: 2,
            groupByProject: false,
            projectExpansion: {},
            taskExpansion: {},
            filterText: '',
            sortConfig: null,
            autoSave: true,
            modifiedTaskIds: new Set()
        });

        let persistedTask: Task | undefined;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === task1.id) persistedTask = { ...task, lockVersion: 1 };
            return { status: 'ok', lockVersion: 1 };
        });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => ({
            tasks: [persistedTask ?? task1, task2],
            relations,
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            customFields: [],
            statuses: [],
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        }));

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task1, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + 1, clientY: bounds.y + 1, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: bounds.x + 11, clientY: bounds.y + 1, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalled());
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalled());
        expect(persistedTask).toBeDefined();
        const reloadedTask = useTaskStore.getState().allTasks.find((task) => task.id === task1.id);
        expect(reloadedTask).toMatchObject({
            startDate: persistedTask?.startDate,
            dueDate: persistedTask?.dueDate,
            lockVersion: 1
        });
        expect(useTaskStore.getState().modifiedTaskIds.has(task1.id)).toBe(false);

        engine.detach();
        container.remove();
    });

    it.each([
        {
            label: 'America/Los_Angeles DST start',
            originalStart: '2026-03-07',
            originalDue: '2026-03-09',
            moveDays: 4,
            expectedStart: '2026-03-11',
            expectedDue: '2026-03-13'
        },
        {
            label: 'America/Los_Angeles DST end',
            originalStart: '2026-10-31',
            originalDue: '2026-11-02',
            moveDays: 4,
            expectedStart: '2026-11-04',
            expectedDue: '2026-11-06'
        }
    ])('preserves calendar duration and bar width across $label', ({
        originalStart,
        originalDue,
        moveDays,
        expectedStart,
        expectedDue
    }) => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({
            startDate: parseDateOnly('2026-03-01')!,
            scrollX: 0,
            scrollY: 0,
            scale: 10 / DAY_MS
        });
        useTaskStore.setState({ zoomLevel: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task = baseTask({
            id: 'week-task',
            rowIndex: 0,
            startDate: parseDateOnly(originalStart)!,
            dueDate: parseDateOnly(originalDue)!
        });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const beforeBounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
        const startX = beforeBounds.x + beforeBounds.width / 2;
        const startY = beforeBounds.y + beforeBounds.height / 2;

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: startX,
            clientY: startY,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: startX + moveDays * 10,
            clientY: startY,
            bubbles: true
        }));

        const movedTask = useTaskStore.getState().tasks[0];
        const afterBounds = LayoutEngine.getTaskBounds(movedTask, viewport, 'bar', zoomLevel);

        expect(formatDateOnly(movedTask.startDate)).toBe(expectedStart);
        expect(formatDateOnly(movedTask.dueDate)).toBe(expectedDue);
        expect(diffCalendarDays(movedTask.startDate!, movedTask.dueDate!)).toBe(
            diffCalendarDays(task.startDate!, task.dueDate!)
        );
        expect(afterBounds.width).toBe(beforeBounds.width);

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });
});

describe('InteractionEngine cursor behavior', () => {
    it('uses move cursor on editable task body hover', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'move-task', rowIndex: 0, startDate: 0, dueDate: 10 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('move');

        engine.detach();
        container.remove();
    });

    it('uses ew-resize cursor on task resize handle hover', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'resize-task', rowIndex: 0, startDate: 0, dueDate: 10 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + 1,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('ew-resize');

        engine.detach();
        container.remove();
    });

    it('uses ew-resize cursor slightly outside the left edge of a task bar', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'resize-left-outside-task', rowIndex: 0, startDate: 0, dueDate: 10 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x - 4,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('ew-resize');

        engine.detach();
        container.remove();
    });

    it('uses ew-resize cursor slightly outside the right edge of a task bar', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'resize-right-outside-task', rowIndex: 0, startDate: 0, dueDate: 10 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width + 4,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('ew-resize');

        engine.detach();
        container.remove();
    });

    it('uses pointer cursor on parent task hover', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'parent-task', rowIndex: 0, startDate: 0, dueDate: 10, hasChildren: true });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('pointer');

        engine.detach();
        container.remove();
    });

    it('keeps default cursor for non-editable tasks even near the resize edge', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'readonly-task', rowIndex: 0, startDate: 0, dueDate: 10, editable: false });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x - 4,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('default');

        engine.detach();
        container.remove();
    });

    it('keeps a move region for short task bars', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 4 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'short-task', rowIndex: 0, startDate: 0, dueDate: 0 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);

        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('move');

        container.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x - 4,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('ew-resize');

        engine.detach();
        container.remove();
    });

    it('starts resizing from the visible start handle', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        const dueDate = parseDateOnly('2026-07-11')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'handle-start-task', rowIndex: 0, startDate, dueDate });
        seedTasks([task]);

        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'start');
        container.appendChild(handle);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        handle.dispatchEvent(new MouseEvent('mousedown', {
            clientX: bounds.x,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(formatDateOnly(useTaskStore.getState().tasks[0].startDate)).toBe('2026-07-03');
        expect(useTaskStore.getState().tasks[0].dueDate).toBe(dueDate);

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });

    it('starts resizing from the visible end handle', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        const dueDate = parseDateOnly('2026-07-11')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'handle-end-task', rowIndex: 0, startDate, dueDate });
        seedTasks([task]);

        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'end');
        container.appendChild(handle);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        handle.dispatchEvent(new MouseEvent('mousedown', {
            clientX: bounds.x + bounds.width,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width + 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(useTaskStore.getState().tasks[0].startDate).toBe(startDate);
        expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe('2026-07-13');

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });

    it('keeps move cursor while dragging outside the task body', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'drag-task', rowIndex: 0, startDate: 0, dueDate: 10 });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
        const startX = bounds.x + bounds.width / 2;
        const startY = bounds.y + bounds.height / 2;

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: startX,
            clientY: startY,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width + 120,
            clientY: startY,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('move');

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });
});

describe('InteractionEngine relation selection', () => {
    it('selects a visible relation when clicking near its route', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null
        });

        const { viewport, zoomLevel, tasks } = useTaskStore.getState();
        const context = buildRelationRenderContext(tasks, viewport, zoomLevel);
        const points = buildRelationRoutePoints(relation, context, viewport);
        expect(points).toBeTruthy();
        const midpoint = getPolylineMidpoint(points!);

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: midpoint.x - viewport.scrollX,
            clientY: midpoint.y - viewport.scrollY,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedRelationId).toBe('r1');

        engine.detach();
        container.remove();
    });

    it('switches relation selection when clicking a different relation', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const task3 = baseTask({ id: '3', rowIndex: 2, startDate: DAY_MS * 8, dueDate: DAY_MS * 9 });
        const relation1: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };
        const relation2: Relation = { id: 'r2', from: '2', to: '3', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2, task3],
            tasks: [task1, task2, task3],
            relations: [relation1, relation2],
            layoutRows: [],
            rowCount: 3,
            selectedTaskId: null,
            selectedRelationId: 'r1',
            draftRelation: null
        });

        const { viewport, zoomLevel, tasks } = useTaskStore.getState();
        const context = buildRelationRenderContext(tasks, viewport, zoomLevel);
        const points = buildRelationRoutePoints(relation2, context, viewport);
        expect(points).toBeTruthy();
        const midpoint = getPolylineMidpoint(points!);

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: midpoint.x - viewport.scrollX,
            clientY: midpoint.y - viewport.scrollY,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedRelationId).toBe('r2');

        engine.detach();
        container.remove();
    });

    it('selects relates relations using the normalized rendered route', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '2', to: '1', type: RelationType.Relates };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null
        });

        const { viewport, zoomLevel, tasks } = useTaskStore.getState();
        const context = buildRelationRenderContext(tasks, viewport, zoomLevel);
        const points = buildRelationRoutePoints(relation, context, viewport);
        expect(points).toBeTruthy();
        const midpoint = getPolylineMidpoint(points!);

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: midpoint.x - viewport.scrollX,
            clientY: midpoint.y - viewport.scrollY,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedRelationId).toBe('r1');

        engine.detach();
        container.remove();
    });

    it('clears relation selection when clicking empty space', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: 'r1',
            draftRelation: null
        });

        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: 780,
            clientY: 580,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedRelationId).toBeNull();
        expect(useTaskStore.getState().selectedTaskId).toBeNull();

        engine.detach();
        container.remove();
    });

    it('selects a task and clears relation selection when clicking a task', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: 'r1',
            draftRelation: null
        });

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task1, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedTaskId).toBe('1');
        expect(useTaskStore.getState().selectedRelationId).toBeNull();

        engine.detach();
        container.remove();
    });

    it('prefers resize over relation selection when clicking the visible end handle area', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate, dueDate: parseDateOnly('2026-07-02')! });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: parseDateOnly('2026-07-05')!, dueDate: parseDateOnly('2026-07-06')! });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null
        });

        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'end');
        container.appendChild(handle);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task1, viewport, 'hit', zoomLevel);
        const handleX = bounds.x + bounds.width + 4;
        const handleY = bounds.y + bounds.height / 2;

        handle.dispatchEvent(new MouseEvent('mousedown', {
            clientX: handleX,
            clientY: handleY,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: handleX + DAY_MS * viewport.scale,
            clientY: handleY,
            bubbles: true
        }));

        expect(useTaskStore.getState().selectedTaskId).toBe('1');
        expect(useTaskStore.getState().selectedRelationId).toBeNull();
        expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe('2026-07-03');

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });

    it('shows resize cursor instead of relation pointer in the end handle overlap area', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes' };

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null
        });

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task1, viewport, 'hit', zoomLevel);
        const overlapX = bounds.x + bounds.width + 4;
        const overlapY = bounds.y + bounds.height / 2;

        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: overlapX,
            clientY: overlapY,
            bubbles: true
        }));

        expect(container.style.cursor).toBe('ew-resize');

        engine.detach();
        container.remove();
    });
});
