import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionEngine } from './InteractionEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from './LayoutEngine';
import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { buildRelationRenderContext, buildRelationRoutePoints, getPolylineMidpoint } from '../renderers/relationGeometry';
import { diffCalendarDays, formatDateOnly, parseDateOnly } from '../utils/dateOnly';
import { configureBusinessCalendar } from '../utils/businessCalendar';

vi.mock('../api/client', () => ({
    apiClient: {
        updateTask: vi.fn(),
        scheduleMutation: vi.fn(),
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
    vi.mocked(apiClient.scheduleMutation).mockReset();
    vi.mocked(apiClient.fetchData).mockReset();
    useUIStore.setState({ isSidebarResizing: false, showStartDateOnly: true, showDueDateOnly: true });
});

describe('InteractionEngine point visibility', () => {
    const day = 24 * 60 * 60 * 1000;

    it.each([
        { name: 'start-only (undefined)', dates: { dueDate: undefined }, visible: [true, true, false, false] },
        { name: 'start-only (NaN)', dates: { dueDate: Number.NaN }, visible: [true, true, false, false] },
        { name: 'due-only (undefined)', dates: { startDate: undefined }, visible: [true, false, true, false] },
        { name: 'due-only (NaN)', dates: { startDate: Number.NaN }, visible: [true, false, true, false] },
        { name: 'normal task', dates: {}, visible: [true, true, true, true] }
    ])('respects live display settings for $name hit, expanded hover, and context interactions', ({ dates, visible }) => {
        setViewport({ scale: 10 / day });
        const task = baseTask({ startDate: day * 4, dueDate: day * 6, ...dates });
        seedTasks([task], { selectedTaskId: null, hoveredTaskId: null, contextMenu: null });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const bounds = LayoutEngine.getTaskBounds(task, useTaskStore.getState().viewport, 'hit', 2);
        const center = { clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2, bubbles: true };
        try {
            const settings = [[true, true], [true, false], [false, true], [false, false]];
            settings.forEach(([showStartDateOnly, showDueDateOnly], index) => {
                useUIStore.setState({ showStartDateOnly, showDueDateOnly });
                const expectedId = visible[index] ? task.id : null;
                // Begin with a stale hover/selection, as when toggling settings from the sidebar.
                seedTasks([task], { hoveredTaskId: task.id, selectedTaskId: task.id });
                window.dispatchEvent(new MouseEvent('mousemove', center));
                expect(useTaskStore.getState().hoveredTaskId).toBe(expectedId);
                expect(container.style.cursor).toBe(visible[index] ? 'move' : 'default');

                for (const clientX of [bounds.x - 10, bounds.x + bounds.width + 10]) {
                    useTaskStore.setState({ hoveredTaskId: null });
                    window.dispatchEvent(new MouseEvent('mousemove', { ...center, clientX }));
                    expect(useTaskStore.getState().hoveredTaskId).toBe(expectedId);
                }

                useTaskStore.setState({ contextMenu: { x: 0, y: 0, taskId: task.id } });
                container.dispatchEvent(new MouseEvent('contextmenu', { ...center, cancelable: true }));
                expect(useTaskStore.getState().contextMenu?.taskId ?? null).toBe(expectedId);

                container.dispatchEvent(new MouseEvent('mousedown', center));
                expect(useTaskStore.getState().selectedTaskId).toBe(expectedId);
                window.dispatchEvent(new MouseEvent('mouseup', center));
            });
        } finally {
            engine.detach();
            container.remove();
        }
    });

    it.each([
        { dates: { dueDate: undefined }, region: 'end' },
        { dates: { startDate: undefined }, region: 'start' }
    ])('does not resolve a hidden point through a stale $region resize handle', ({ dates, region }) => {
        setViewport({ scale: 10 / day });
        const task = baseTask({ startDate: day * 4, dueDate: day * 6, ...dates });
        seedTasks([task], { selectedTaskId: null });
        useUIStore.setState({ showStartDateOnly: false, showDueDateOnly: false });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.dataset.taskId = task.id;
        handle.dataset.region = region;
        container.appendChild(handle);
        try {
            handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 16, bubbles: true }));
            expect(useTaskStore.getState().selectedTaskId).toBeNull();
            window.dispatchEvent(new MouseEvent('mouseup'));
        } finally {
            engine.detach();
            container.remove();
        }
    });
});

describe('InteractionEngine start-date creation and removal', () => {
    const day = 24 * 60 * 60 * 1000;
    const dueDate = parseDateOnly('2026-09-24')!;
    const startDate = parseDateOnly('2026-09-17')!;

    const startDrag = (task: Task, overrides: Parameters<typeof seedTasks>[1] = {}, body = false) => {
        setViewport({ startDate: Date.UTC(2026, 8, 1), scrollX: 20, scale: 10 / day });
        seedTasks([task], overrides);
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.dataset.region = 'start';
        handle.dataset.taskId = task.id;
        const grip = document.createElement('span');
        handle.appendChild(grip);
        container.appendChild(handle);
        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        const clientY = bounds.y + bounds.height / 2;
        const clientX = body ? bounds.x + bounds.width / 2 : bounds.x - 3;
        (body ? container : grip).dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true }));
        return {
            viewport,
            moveTo(candidate: string) {
                const date = parseDateOnly(candidate)!;
                const x = body
                    ? clientX + diffCalendarDays(task.dueDate!, date) * 10
                    : Number.isFinite(task.startDate)
                        ? clientX + diffCalendarDays(task.startDate!, date) * 10
                        : LayoutEngine.calendarDateToX(date, viewport) - viewport.scrollX;
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY, bubbles: true }));
            },
            finish() { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); },
            dispose() { engine.detach(); container.remove(); }
        };
    };

    it.each([undefined, Number.NaN])('creates, clears, and recreates startDate from an outside DOM handle (startDate=%s)', (missingStart) => {
        const task = baseTask({ id: 'due-only-start', startDate: missingStart, dueDate });
        const drag = startDrag(task);
        try {
            for (const candidate of ['2026-09-25', '2026-09-24', '2026-09-17', '2026-09-25', '2026-09-20']) {
                drag.moveTo(candidate);
                const current = useTaskStore.getState().tasks[0];
                expect(formatDateOnly(current.startDate)).toBe(candidate === '2026-09-25' ? null : candidate);
                expect(current.dueDate).toBe(dueDate);
                expect(useTaskStore.getState().viewport).toEqual(drag.viewport);
            }
            drag.finish();
        } finally { drag.dispose(); }
    });

    it('moves only dueDate when dragging the diamond body', () => {
        const drag = startDrag(baseTask({ id: 'due-only-body', startDate: undefined, dueDate }), {}, true);
        try {
            drag.moveTo('2026-09-26');
            expect(useTaskStore.getState().tasks[0].startDate).toBeUndefined();
            expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe('2026-09-26');
            expect(useTaskStore.getState().viewport).toEqual(drag.viewport);
            drag.finish();
        } finally { drag.dispose(); }
    });

    it.each([
        { autoSave: false, restore: false }, { autoSave: true, restore: false },
        { autoSave: false, restore: true }, { autoSave: true, restore: true }
    ])('persists startDate clear/recreation and preserves relations ($autoSave autoSave, $restore restore)', async ({ autoSave, restore }) => {
        const task = baseTask({ id: `clear-start-${autoSave}-${restore}`, startDate, dueDate });
        const predecessor = baseTask({ id: `${task.id}-predecessor`, rowIndex: 1, startDate: parseDateOnly('2026-09-01')!, dueDate: parseDateOnly('2026-09-02')! });
        const relations: Relation[] = [{ id: `${task.id}-relation`, from: predecessor.id, to: task.id, type: 'precedes' }];
        let persistedTask = task;
        vi.mocked(apiClient.scheduleMutation).mockImplementation(async changes => {
            expect(changes).toHaveLength(1);
            expect(changes[0].mutationFields).toEqual({ start_date: restore ? '2026-09-20' : null });
            persistedTask = { ...(changes[0].task as Task), lockVersion: 1 };
            return { status: 'ok', operationId: 'test', entities: [], revisions: { [task.id]: 1 } };
        });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => ({
            tasks: [persistedTask, predecessor], relations, versions: [],
            filterOptions: { projects: [], assignees: [] }, customFields: [], statuses: [],
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        }));
        const drag = startDrag(task, { autoSave, relations, tasks: [task, predecessor], allTasks: [task, predecessor], rowCount: 2 });
        try {
            drag.moveTo('2026-09-24');
            expect(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.startDate).toBe(dueDate);
            drag.moveTo('2026-09-25');
            expect(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.startDate).toBeUndefined();
            expect(useTaskStore.getState().allTasks.find(t => t.id === predecessor.id)).toEqual(predecessor);
            expect(useTaskStore.getState().relations).toEqual(relations);
            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([task.id]));
            expect(apiClient.scheduleMutation).not.toHaveBeenCalled();
            if (restore) {
                drag.moveTo('2026-09-20');
                expect(formatDateOnly(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.startDate)).toBe('2026-09-20');
            }
            drag.finish();
            if (!autoSave) {
                expect(apiClient.scheduleMutation).not.toHaveBeenCalled();
                await useTaskStore.getState().saveChanges();
            }
            await vi.waitFor(() => expect(useTaskStore.getState().modifiedTaskIds.has(task.id)).toBe(false));
            expect(apiClient.scheduleMutation).toHaveBeenCalledTimes(1);
            expect(apiClient.updateTask).not.toHaveBeenCalled();
            expect(persistedTask.startDate).toBe(restore ? parseDateOnly('2026-09-20')! : undefined);
            expect(persistedTask.dueDate).toBe(dueDate);
            expect(useTaskStore.getState().relations).toEqual(relations);
        } finally { drag.dispose(); }
    });

    it.each([false, true])('rolls back a rejected startDate change using BarOperation (clear=%s)', async (clear) => {
        const task = baseTask({ id: `rejected-start-${clear}`, startDate: clear ? startDate : undefined, dueDate });
        vi.mocked(apiClient.scheduleMutation).mockResolvedValue({
            status: 'validation_error', operationId: 'test', entities: [], revisions: {}, errors: ['Invalid task dates']
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task], relations: [], versions: [], filterOptions: { projects: [], assignees: [] },
            statuses: [], customFields: [], project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });
        const drag = startDrag(task, { autoSave: true });
        try {
            drag.moveTo(clear ? '2026-09-25' : '2026-09-17');
            expect(useTaskStore.getState().tasks[0].startDate).toBe(clear ? undefined : startDate);
            drag.finish();
            await vi.waitFor(() => expect(apiClient.scheduleMutation).toHaveBeenCalledTimes(1));
            await vi.waitFor(() => expect(useTaskStore.getState().allTasks[0].startDate).toBe(task.startDate));
            expect(useTaskStore.getState().allTasks[0].dueDate).toBe(dueDate);
            expect(useTaskStore.getState().modifiedTaskIds.has(task.id)).toBe(false);
        } finally { drag.dispose(); }
    });

    it.each([
        { originalStart: undefined, due: '2026-09-24', candidate: '2026-09-19', expected: '2026-09-21' },
        { originalStart: startDate, due: '2026-09-20', candidate: '2026-09-19', expected: '2026-09-17' },
        { originalStart: undefined, due: '2026-09-20', candidate: '2026-09-19', expected: null }
    ])('normalizes startDate forward without clearing or crossing dueDate ($expected)', ({ originalStart, due, candidate, expected }) => {
        configureBusinessCalendar({
            status: 'ok', revision: 'test', defaultCalendarId: 'p1', projectCalendarIds: { p1: 'p1' },
            calendars: { p1: { id: 'p1', name: 'P1', nonWorkingWeekDays: [0, 6], days: {} } }, warnings: []
        });
        const task = baseTask({ id: 'working-start', startDate: originalStart, dueDate: parseDateOnly(due)! });
        const drag = startDrag(task);
        try {
            drag.moveTo(candidate);
            expect(formatDateOnly(useTaskStore.getState().tasks[0].startDate)).toBe(expected);
            expect(useTaskStore.getState().tasks[0].dueDate).toBe(task.dueDate);
            drag.finish();
        } finally {
            configureBusinessCalendar(undefined);
            drag.dispose();
        }
    });
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
        vi.mocked(apiClient.scheduleMutation).mockImplementation(async (changes) => {
            const change = changes.find(candidate => candidate.taskId === task1.id);
            if (change) persistedTask = { ...(change.task as Task), lockVersion: 1 };
            return { status: 'ok', operationId: 'test', entities: [], revisions: { [task1.id]: 1 } };
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

        await vi.waitFor(() => expect(apiClient.scheduleMutation).toHaveBeenCalled());
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

    it('normalizes a dragged task onto working dates and preserves business duration', () => {
        const day = 24 * 60 * 60 * 1000;
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
                    days: {}
                }
            },
            warnings: []
        });

        try {
            setViewport({
                startDate: parseDateOnly('2027-01-01')!,
                scrollX: 0,
                scrollY: 0,
                scale: 10 / day
            });
            const container = createContainer();
            const engine = new InteractionEngine(container);
            const task = baseTask({
                id: 'working-task',
                projectId: 'p1',
                rowIndex: 0,
                startDate: parseDateOnly('2027-01-01')!,
                dueDate: parseDateOnly('2027-01-04')!
            });
            seedTasks([task]);

            const { viewport, zoomLevel } = useTaskStore.getState();
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
            container.dispatchEvent(new MouseEvent('mousedown', {
                clientX: bounds.x + bounds.width / 2,
                clientY: bounds.y + bounds.height / 2,
                bubbles: true
            }));
            window.dispatchEvent(new MouseEvent('mousemove', {
                clientX: bounds.x + bounds.width / 2 + 10,
                clientY: bounds.y + bounds.height / 2,
                bubbles: true
            }));

            const movedTask = useTaskStore.getState().allTasks[0];
            expect(formatDateOnly(movedTask.startDate)).toBe('2027-01-04');
            expect(formatDateOnly(movedTask.dueDate)).toBe('2027-01-05');

            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            engine.detach();
            container.remove();
        } finally {
            configureBusinessCalendar(undefined);
        }
    });

    it('restores the original bar position after an auto-save validation failure', async () => {
        const task = baseTask({ id: 'rejected-task', startDate: 0, dueDate: 10 });
        seedTasks([task], { autoSave: true });
        vi.mocked(apiClient.scheduleMutation).mockResolvedValue({
            status: 'validation_error',
            operationId: 'test',
            entities: [],
            revisions: {},
            errors: ['Invalid task dates']
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });

        const container = createContainer();
        const engine = new InteractionEngine(container);
        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousedown', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: bounds.x + bounds.width / 2 + 20,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await vi.waitFor(() => expect(apiClient.scheduleMutation).toHaveBeenCalled());
        expect(useTaskStore.getState().allTasks[0]).toMatchObject(task);
        expect(useTaskStore.getState().modifiedTaskIds).not.toContain(task.id);

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
        handle.setAttribute('data-task-id', task.id);
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
        handle.setAttribute('data-task-id', task.id);
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

    it('creates a due date from the outside half of a start-date-only end handle without panning', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        const dueDate = parseDateOnly('2026-07-11')!;
        setViewport({ startDate, scrollX: 20, scrollY: 0, scale: 1 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'create-due-task', rowIndex: 0, startDate, dueDate: Number.NaN });
        seedTasks([task]);

        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'end');
        handle.setAttribute('data-task-id', task.id);
        const grip = document.createElement('span');
        handle.appendChild(grip);
        container.appendChild(handle);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        grip.dispatchEvent(new MouseEvent('mousedown', {
            clientX: bounds.x + bounds.width + 3,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: LayoutEngine.calendarDateToX(dueDate, viewport) - viewport.scrollX,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(useTaskStore.getState().tasks[0].startDate).toBe(startDate);
        expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe('2026-07-11');
        expect(useTaskStore.getState().viewport).toEqual(viewport);

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });

    it('does not create a due date before a start-date-only task start', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-11')!;
        setViewport({ startDate: parseDateOnly('2026-07-01')!, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'invalid-create-due-task', rowIndex: 0, startDate, dueDate: Number.NaN });
        seedTasks([task]);

        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'end');
        handle.setAttribute('data-task-id', task.id);
        container.appendChild(handle);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + bounds.width, clientY: bounds.y + bounds.height / 2, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: LayoutEngine.calendarDateToX(parseDateOnly('2026-07-10')!, viewport),
            clientY: bounds.y + bounds.height / 2,
            bubbles: true
        }));

        expect(useTaskStore.getState().tasks[0].startDate).toBe(startDate);
        expect(Number.isFinite(useTaskStore.getState().tasks[0].dueDate)).toBe(false);

        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        engine.detach();
        container.remove();
    });

    it.each([
        { autoSave: false, restore: false },
        { autoSave: true, restore: false },
        { autoSave: false, restore: true },
        { autoSave: true, restore: true }
    ])('clears and optionally restores a related task due date in one drag ($autoSave autoSave, $restore restore)', async ({ autoSave, restore }) => {
        const day = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        const dueDate = parseDateOnly('2026-07-11')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 10 / day });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: `clear-due-${autoSave}-${restore}`, startDate, dueDate });
        const successor = baseTask({ id: `${task.id}-successor`, rowIndex: 1, startDate: parseDateOnly('2026-07-20')!, dueDate: parseDateOnly('2026-07-21')! });
        const relations: Relation[] = [{ id: `${task.id}-relation`, from: task.id, to: successor.id, type: 'precedes' }];
        seedTasks([task, successor], { autoSave, relations });

        let persistedTask = task;
        vi.mocked(apiClient.scheduleMutation).mockImplementation(async changes => {
            const change = changes.find(candidate => candidate.taskId === task.id)!;
            expect(change.mutationFields).toEqual({ due_date: restore ? '2026-07-05' : null });
            persistedTask = { ...(change.task as Task), lockVersion: 1 };
            return { status: 'ok', operationId: 'test', entities: [], revisions: { [task.id]: 1 } };
        });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => ({
            tasks: [persistedTask, successor], relations, versions: [],
            filterOptions: { projects: [], assignees: [] }, customFields: [], statuses: [],
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        }));

        try {
            const { viewport, zoomLevel } = useTaskStore.getState();
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
            const pointerX = bounds.x + bounds.width;
            const pointerY = bounds.y + bounds.height / 2;
            container.dispatchEvent(new MouseEvent('mousedown', { clientX: pointerX, clientY: pointerY, bubbles: true }));
            const moveTo = (candidate: string) => window.dispatchEvent(new MouseEvent('mousemove', {
                clientX: pointerX + diffCalendarDays(dueDate, parseDateOnly(candidate)!) * 10,
                clientY: pointerY, bubbles: true
            }));

            moveTo('2026-07-01');
            expect(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.dueDate).toBe(startDate);
            moveTo('2026-06-30');
            expect(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.dueDate).toBeUndefined();
            expect(useTaskStore.getState().allTasks.find(t => t.id === successor.id)).toEqual(successor);
            expect(useTaskStore.getState().relations).toEqual(relations);
            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([task.id]));
            expect(apiClient.scheduleMutation).not.toHaveBeenCalled();

            if (restore) {
                moveTo('2026-07-05');
                expect(formatDateOnly(useTaskStore.getState().allTasks.find(t => t.id === task.id)?.dueDate)).toBe('2026-07-05');
            }
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            if (!autoSave) {
                expect(apiClient.scheduleMutation).not.toHaveBeenCalled();
                await useTaskStore.getState().saveChanges();
            }
            await vi.waitFor(() => expect(useTaskStore.getState().modifiedTaskIds.has(task.id)).toBe(false));
            expect(apiClient.scheduleMutation).toHaveBeenCalledTimes(1);
            expect(persistedTask.startDate).toBe(startDate);
            expect(persistedTask.dueDate).toBe(restore ? parseDateOnly('2026-07-05')! : undefined);
            expect(useTaskStore.getState().relations).toEqual(relations);
        } finally {
            engine.detach();
            container.remove();
        }
    });

    it('can clear and recreate a newly created due date within the same drag', () => {
        const day = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 10 / day });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'recreate-new-due', startDate, dueDate: undefined });
        seedTasks([task]);
        const handle = document.createElement('div');
        handle.className = 'task-resize-handle';
        handle.setAttribute('data-region', 'end');
        handle.setAttribute('data-task-id', task.id);
        container.appendChild(handle);

        try {
            const { viewport, zoomLevel } = useTaskStore.getState();
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
            const clientY = bounds.y + bounds.height / 2;
            handle.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + bounds.width + 3, clientY, bubbles: true }));
            for (const candidate of ['2026-07-05', '2026-06-30', '2026-07-03']) {
                window.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: LayoutEngine.calendarDateToX(parseDateOnly(candidate)!, viewport), clientY, bubbles: true
                }));
                expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe(candidate === '2026-06-30' ? null : candidate);
                expect(useTaskStore.getState().tasks[0].startDate).toBe(startDate);
            }
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        } finally {
            engine.detach();
            container.remove();
        }
    });

    it('does not clear a due date when only working-day normalization crosses the start date', () => {
        const day = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2027-01-02')!; // Saturday
        const dueDate = parseDateOnly('2027-01-04')!; // Monday
        configureBusinessCalendar({
            status: 'ok', revision: 'test', defaultCalendarId: 'p1', projectCalendarIds: { p1: 'p1' },
            calendars: { p1: { id: 'p1', name: 'P1', nonWorkingWeekDays: [0, 6], days: {} } }, warnings: []
        });
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 10 / day });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'calendar-clear-due', startDate, dueDate });
        seedTasks([task]);
        try {
            const { viewport, zoomLevel } = useTaskStore.getState();
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
            const clientX = bounds.x + bounds.width;
            const clientY = bounds.y + bounds.height / 2;
            container.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true }));
            window.dispatchEvent(new MouseEvent('mousemove', { clientX: clientX - 10, clientY, bubbles: true }));
            expect(useTaskStore.getState().tasks[0].dueDate).toBe(dueDate);
            window.dispatchEvent(new MouseEvent('mousemove', { clientX: clientX - 30, clientY, bubbles: true }));
            expect(useTaskStore.getState().tasks[0].dueDate).toBeUndefined();
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        } finally {
            configureBusinessCalendar(undefined);
            engine.detach();
            container.remove();
        }
    });

    it('normalizes a newly created due date backward to a working day', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2027-01-01')!;
        configureBusinessCalendar({
            status: 'ok',
            revision: 'test',
            defaultCalendarId: 'p1',
            projectCalendarIds: { p1: 'p1' },
            calendars: { p1: { id: 'p1', name: 'P1', nonWorkingWeekDays: [0, 6], days: {} } },
            warnings: []
        });

        try {
            setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS });
            const container = createContainer();
            const engine = new InteractionEngine(container);
            const task = baseTask({ id: 'working-create-due-task', projectId: 'p1', rowIndex: 0, startDate, dueDate: Number.NaN });
            seedTasks([task]);

            const handle = document.createElement('div');
            handle.className = 'task-resize-handle';
            handle.setAttribute('data-region', 'end');
            handle.setAttribute('data-task-id', task.id);
            container.appendChild(handle);

            const { viewport, zoomLevel } = useTaskStore.getState();
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
            handle.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + bounds.width, clientY: bounds.y + bounds.height / 2, bubbles: true }));
            window.dispatchEvent(new MouseEvent('mousemove', {
                clientX: LayoutEngine.calendarDateToX(parseDateOnly('2027-01-02')!, viewport),
                clientY: bounds.y + bounds.height / 2,
                bubbles: true
            }));

            expect(formatDateOnly(useTaskStore.getState().tasks[0].dueDate)).toBe('2027-01-01');

            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            engine.detach();
            container.remove();
        } finally {
            configureBusinessCalendar(undefined);
        }
    });

    it('moves only the start date when dragging a start-date-only task body', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startDate = parseDateOnly('2026-07-01')!;
        setViewport({ startDate, scrollX: 0, scrollY: 0, scale: 1 / DAY_MS });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'move-start-only-task', rowIndex: 0, startDate, dueDate: Number.NaN });
        seedTasks([task]);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        const pointerX = bounds.x + bounds.width / 2;
        const pointerY = bounds.y + bounds.height / 2;
        container.dispatchEvent(new MouseEvent('mousedown', { clientX: pointerX, clientY: pointerY, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: pointerX + 2, clientY: pointerY, bubbles: true }));

        expect(formatDateOnly(useTaskStore.getState().tasks[0].startDate)).toBe('2026-07-03');
        expect(Number.isFinite(useTaskStore.getState().tasks[0].dueDate)).toBe(false);

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
    it.each([
        { name: 'start-only', dates: { dueDate: undefined }, settings: { showStartDateOnly: false, showDueDateOnly: true } },
        { name: 'due-only', dates: { startDate: undefined }, settings: { showStartDateOnly: true, showDueDateOnly: false } }
    ])('does not select a relation connected to a hidden $name task', ({ dates, settings }) => {
        const DAY_MS = 24 * 60 * 60 * 1000;
        useUIStore.setState(settings);
        setViewport({ scale: 1 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0, startDate: 0, dueDate: DAY_MS, ...dates });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: RelationType.Precedes };

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

        expect(useTaskStore.getState().selectedRelationId).toBeNull();

        engine.detach();
        container.remove();
    });

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
        handle.setAttribute('data-task-id', task1.id);
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

describe('InteractionEngine context menu hit testing', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('uses the task under the pointer instead of the hovered task', () => {
        setViewport({ scale: 10 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const firstTask = baseTask({ id: 'first', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        const secondTask = baseTask({ id: 'second', rowIndex: 1, startDate: DAY_MS * 4, dueDate: DAY_MS * 5 });
        seedTasks([firstTask, secondTask], { hoveredTaskId: firstTask.id, contextMenu: null });

        const bounds = LayoutEngine.getTaskBounds(secondTask, useTaskStore.getState().viewport, 'bar', 2);
        container.dispatchEvent(new MouseEvent('contextmenu', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
            bubbles: true,
            cancelable: true
        }));

        expect(useTaskStore.getState().contextMenu?.taskId).toBe(secondTask.id);

        engine.detach();
        container.remove();
    });

    it('opens from the center and edge of the actual task bar', () => {
        setViewport({ scale: 10 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'bar-task', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        seedTasks([task], { contextMenu: null });
        const bounds = LayoutEngine.getTaskBounds(task, useTaskStore.getState().viewport, 'bar', 2);

        for (const x of [bounds.x + bounds.width / 2, bounds.x + bounds.width - 1]) {
            container.dispatchEvent(new MouseEvent('contextmenu', {
                clientX: x,
                clientY: bounds.y + bounds.height / 2,
                bubbles: true,
                cancelable: true
            }));
            expect(useTaskStore.getState().contextMenu?.taskId).toBe(task.id);
            useTaskStore.getState().setContextMenu(null);
        }

        engine.detach();
        container.remove();
    });

    it('does not open a task menu outside the actual bar', () => {
        setViewport({ scale: 10 / DAY_MS, rowHeight: 36 });
        const container = createContainer();
        const engine = new InteractionEngine(container);
        const task = baseTask({ id: 'bar-task', rowIndex: 0, startDate: 0, dueDate: DAY_MS });
        seedTasks([task], { hoveredTaskId: task.id, contextMenu: null });
        const bounds = LayoutEngine.getTaskBounds(task, useTaskStore.getState().viewport, 'bar', 2);

        container.dispatchEvent(new MouseEvent('contextmenu', {
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y - 1,
            bubbles: true,
            cancelable: true
        }));

        expect(useTaskStore.getState().contextMenu).toBeNull();

        engine.detach();
        container.remove();
    });
});
