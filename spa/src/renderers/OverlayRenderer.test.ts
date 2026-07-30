import { describe, expect, it, vi } from 'vitest';
import { OverlayRenderer } from './OverlayRenderer';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import type { Relation, Task, Viewport } from '../types';
import { RelationType } from '../types/constraints';
import { addCalendarDays, fromLocalDate, parseDateOnly } from '../utils/dateOnly';

const ONE_DAY = 24 * 60 * 60 * 1000;

function createMockContext() {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        setLineDash: vi.fn(),
        strokeRect: vi.fn(),
        fill: vi.fn(),
        closePath: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 12 })),
        quadraticCurveTo: vi.fn(),
        font: '',
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineJoin: 'round' as CanvasLineJoin,
        lineCap: 'round' as CanvasLineCap,
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'alphabetic' as CanvasTextBaseline
    } as unknown as CanvasRenderingContext2D;
}

const viewport: Viewport = {
    startDate: 0,
    scrollX: 0,
    scrollY: 0,
    scale: 1 / ONE_DAY,
    width: 800,
    height: 600,
    rowHeight: 36
};

const buildTask = (id: string, startDate: number, dueDate: number, rowIndex: number): Task => ({
    id,
    subject: `Task ${id}`,
    projectId: 'p1',
    projectName: 'Project',
    displayOrder: rowIndex,
    startDate,
    dueDate,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex,
    hasChildren: false
});

describe('OverlayRenderer progress line', () => {
    it('passes through today line when due date is today', () => {
        const todayStart = fromLocalDate(new Date());
        const viewport = {
            startDate: addCalendarDays(todayStart, -2),
            scrollX: 0,
            scrollY: 0,
            scale: 1 / ONE_DAY,
            width: 800,
            height: 600,
            rowHeight: 36
        };

        const dueTodayTask = {
            id: 'task-1',
            subject: 'due today',
            startDate: addCalendarDays(todayStart, -3),
            dueDate: todayStart,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.setState({
            taskStatuses: [{ id: 1, name: 'Open', isClosed: false }],
            tasks: [dueTodayTask]
        });
        useUIStore.setState({ showProgressLine: true });

        const ctx = createMockContext();
        const canvas = {
            width: 1000,
            height: 600,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);

        (renderer as unknown as { drawProgressLine: (c: CanvasRenderingContext2D, v: typeof viewport, t: typeof dueTodayTask[], z: 0 | 1 | 2) => void })
            .drawProgressLine(ctx, viewport, [dueTodayTask], 2);

        const todayCellEnd = addCalendarDays(todayStart, 1);
        const xToday = (todayCellEnd - viewport.startDate) * viewport.scale - viewport.scrollX;
        expect(ctx.lineTo).toHaveBeenCalledWith(xToday, expect.any(Number));
    });

    it('calculates progress from projected task bounds', () => {
        const startDate = parseDateOnly('2026-01-01')!;
        const dueDate = parseDateOnly('2026-01-02')!;
        const utcViewport = {
            ...viewport,
            startDate: Date.UTC(2026, 0, 1)
        };
        const task = {
            ...buildTask('task-1', startDate, dueDate, 0),
            ratioDone: 50
        };
        useTaskStore.setState({
            taskStatuses: [{ id: 1, name: 'Open', isClosed: false }],
            tasks: [task]
        });
        useUIStore.setState({ showProgressLine: true });
        const ctx = createMockContext();
        const canvas = {
            width: 1000,
            height: 600,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);

        (renderer as unknown as { drawProgressLine: (c: CanvasRenderingContext2D, v: Viewport, t: Task[], z: 0 | 1 | 2) => void })
            .drawProgressLine(ctx, utcViewport, [task], 2);

        expect(ctx.lineTo).toHaveBeenCalledWith(1, expect.any(Number));
    });
});

describe('OverlayRenderer today line', () => {
    it('passes one CalendarDate to both progress and today-line rendering in a frame', () => {
        const ctx = createMockContext();
        const canvas = { width: 10, height: 600, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);
        const today = parseDateOnly('2026-01-10')!;
        const progressLine = vi.spyOn(renderer as unknown as { drawProgressLine: (...args: unknown[]) => void }, 'drawProgressLine');
        const todayLine = vi.spyOn(renderer as unknown as { drawTodayLine: (...args: unknown[]) => void }, 'drawTodayLine');

        renderer.render({ viewport, tasks: [], relations: [], rowCount: 0, zoomLevel: 2, selectedTaskId: null, selectedRelationId: null, draftRelation: null, today });

        expect(progressLine).toHaveBeenCalledWith(ctx, viewport, [], 2, today);
        expect(todayLine).toHaveBeenCalledWith(ctx, viewport, 10, 600, today);
    });

    it('draws at the right edge of the projected local calendar day', () => {
        const todayCellStart = fromLocalDate(new Date());
        const utcViewport = {
            ...viewport,
            startDate: addCalendarDays(todayCellStart, -1),
            width: 10
        };
        const ctx = createMockContext();
        const canvas = {
            width: 10,
            height: 600,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);

        (renderer as unknown as { drawTodayLine: (c: CanvasRenderingContext2D, v: Viewport, w: number, h: number) => void })
            .drawTodayLine(ctx, utcViewport, 10, 600);

        expect(ctx.moveTo).toHaveBeenCalledWith(2, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(2, 600);
    });
});

describe('OverlayRenderer dependencies', () => {
    it('does not draw an arrowhead for relates relations', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 1000,
            height: 600,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);
        const tasks = [
            buildTask('1', 0, ONE_DAY, 0),
            buildTask('2', ONE_DAY * 4, ONE_DAY * 5, 1)
        ];
        const relation: Relation = { id: 'r1', from: '2', to: '1', type: RelationType.Relates };

        (renderer as unknown as {
            drawDependencies: (
                c: CanvasRenderingContext2D,
                v: Viewport,
                t: Task[],
                r: Relation[],
                d: null,
                z: 0 | 1 | 2,
                s: string | null
            ) => void;
        }).drawDependencies(ctx, viewport, tasks, [relation], null, 2, null);

        expect(ctx.fill).not.toHaveBeenCalled();
    });

    it('draws an arrowhead for directed relations', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 1000,
            height: 600,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new OverlayRenderer(canvas);
        const tasks = [
            buildTask('1', 0, ONE_DAY, 0),
            buildTask('2', ONE_DAY * 4, ONE_DAY * 5, 1)
        ];
        const relation: Relation = { id: 'r1', from: '1', to: '2', type: RelationType.Precedes };

        (renderer as unknown as {
            drawDependencies: (
                c: CanvasRenderingContext2D,
                v: Viewport,
                t: Task[],
                r: Relation[],
                d: null,
                z: 0 | 1 | 2,
                s: string | null
            ) => void;
        }).drawDependencies(ctx, viewport, tasks, [relation], null, 2, null);

        expect(ctx.fill).toHaveBeenCalledTimes(1);
    });
});
