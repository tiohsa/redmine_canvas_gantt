import { describe, expect, it, vi } from 'vitest';
import { TaskRenderer } from './TaskRenderer';
import type { Task, Viewport } from '../types';
import { addCalendarDays, parseDateOnly, todayCalendarDate } from '../utils/dateOnly';

const ONE_DAY = 24 * 60 * 60 * 1000;
const TEST_TIMELINE_START_DATE = Date.UTC(2026, 0, 1);
const TEST_START_DATE = parseDateOnly('2026-01-01')!;
const TEST_DUE_DATE = parseDateOnly('2026-01-02')!;

const viewport: Viewport = {
    startDate: TEST_TIMELINE_START_DATE,
    scrollX: 0,
    scrollY: 0,
    scale: 1 / ONE_DAY,
    width: 800,
    height: 600,
    rowHeight: 32
};

const buildTask = (): Task => ({
    id: '1',
    subject: 'Task 1',
    projectId: 'p1',
    projectName: 'Project',
    displayOrder: 0,
    startDate: TEST_START_DATE,
    dueDate: TEST_DUE_DATE,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

const buildContext = () => ({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    fillText: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline
}) as unknown as CanvasRenderingContext2D;

describe('TaskRenderer', () => {
    it('aligns project and version summaries to calendar cell boundaries', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new TaskRenderer(canvas);
        const projectSummary = vi.spyOn(
            renderer as unknown as { drawProjectSummaryBar: (...args: unknown[]) => void },
            'drawProjectSummaryBar'
        );
        const versionSummary = vi.spyOn(
            renderer as unknown as { drawVersionSummaryBar: (...args: unknown[]) => void },
            'drawVersionSummaryBar'
        );
        const localStart = parseDateOnly('2026-01-01')!;
        const localDue = parseDateOnly('2026-01-02')!;

        renderer.render(viewport, [], 2, 2, [], [
            { type: 'header', projectId: 'p1', rowIndex: 0, startDate: localStart, dueDate: localDue },
            { type: 'version', id: 'v1', versionId: 'v1', name: 'Version', projectId: 'p1', rowIndex: 1, startDate: localStart, dueDate: localDue }
        ]);

        expect(projectSummary).toHaveBeenCalledWith(ctx, 0, 2, 0, viewport.rowHeight);
        expect(versionSummary).toHaveBeenCalledWith(ctx, 0, 2, viewport.rowHeight, viewport.rowHeight, 0);
    });

    it('centers one-sided task markers in the UTC timeline cell', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new TaskRenderer(canvas);
        const drawPoint = vi.spyOn(
            renderer as unknown as { drawTaskAsPoint: (...args: unknown[]) => void },
            'drawTaskAsPoint'
        ).mockImplementation(() => undefined);
        const localDate = parseDateOnly('2026-01-01')!;

        renderer.render(viewport, [{ ...buildTask(), startDate: localDate, dueDate: undefined }], 1, 2, []);

        expect(drawPoint).toHaveBeenCalledWith(ctx, expect.any(Object), 0.5, 0, viewport.rowHeight, 'triangle_right', expect.any(Number));
    });

    it('uses the supplied local CalendarDate for a multi-day delay hatch boundary', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10, 0, 1));
        const ctx = buildContext();
        const canvas = { width: 800, height: 600, getContext: vi.fn().mockReturnValue(ctx) } as unknown as HTMLCanvasElement;
        const renderer = new TaskRenderer(canvas);
        const drawHatchedRect = vi.spyOn(
            renderer as unknown as { drawHatchedRect: (...args: unknown[]) => void },
            'drawHatchedRect'
        ).mockImplementation(() => undefined);
        const today = todayCalendarDate();
        const task = { ...buildTask(), startDate: parseDateOnly('2026-01-08')!, dueDate: parseDateOnly('2026-01-12')! };

        renderer.render(viewport, [task], 1, 2, [], [], false, false, true, null, false, true, true, today);

        // Jan 8 through Jan 10 is the completed portion of the five-cell bar.
        expect(drawHatchedRect).toHaveBeenCalledWith(ctx, 7, expect.any(Number), 3, expect.any(Number));
        vi.useRealTimers();
    });

    it.each([
        ['start-only', { dueDate: undefined }, -1, true],
        ['start-only', { dueDate: undefined }, 0, false],
        ['start-only', { dueDate: undefined }, 1, false],
        ['due-only', { startDate: undefined }, -1, true],
        ['due-only', { startDate: undefined }, 0, false],
        ['due-only', { startDate: undefined }, 1, false]
    ])('%s unfinished task is delayed only when its date precedes local today', (_label, patch, offset, expectedDelayed) => {
        const ctx = buildContext();
        const canvas = { width: 800, height: 600, getContext: vi.fn().mockReturnValue(ctx) } as unknown as HTMLCanvasElement;
        const renderer = new TaskRenderer(canvas);
        class TestPath2D {
            moveTo() {}
            lineTo() {}
            closePath() {}
        }
        vi.stubGlobal('Path2D', TestPath2D);
        const drawHatchedPath = vi.spyOn(
            renderer as unknown as { drawHatchedPath: (...args: unknown[]) => void },
            'drawHatchedPath'
        ).mockImplementation(() => undefined);
        const today = parseDateOnly('2026-01-10')!;
        const taskDate = addCalendarDays(today, offset);
        const task = { ...buildTask(), startDate: taskDate, dueDate: taskDate, ...patch };

        renderer.render(viewport, [task], 1, 2, [], [], false, false, true, null, false, true, true, today);

        expect(drawHatchedPath).toHaveBeenCalledTimes(expectedDelayed ? 1 : 0);
        vi.unstubAllGlobals();
    });

    it('draws task titles when enabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], true, false, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('Task 1', expect.any(Number), expect.any(Number));
    });

    it('skips task title drawing when disabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], false, false, true, null, false);

        expect(ctx.fillText).not.toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
    });

    it('draws start and due dates outside task bars when enabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], true, true, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('1/1', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).toHaveBeenCalledWith('1/2', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).toHaveBeenCalledWith('Task 1', expect.any(Number), expect.any(Number));
    });

    it('formats local DateOnly labels without shifting them to the previous UTC date', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const task = {
            ...buildTask(),
            startDate: parseDateOnly('2026-08-10')!,
            dueDate: parseDateOnly('2026-08-13')!,
            ratioDone: 100
        };

        new TaskRenderer(canvas).render(viewport, [task], 1, 2, [], [], false, true, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('8/10', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).toHaveBeenCalledWith('8/13', expect.any(Number), expect.any(Number));
    });

    it('does not draw task bar dates when disabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], false, false, true, null, false);

        expect(ctx.fillText).not.toHaveBeenCalledWith('1/1', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).not.toHaveBeenCalledWith('1/2', expect.any(Number), expect.any(Number));
    });

    it('draws only the start date beside a start-only task point', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const task = { ...buildTask(), dueDate: undefined, ratioDone: 100 };

        new TaskRenderer(canvas).render(viewport, [task], 1, 2, [], [], true, true, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('1/1', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).not.toHaveBeenCalledWith('1/2', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).toHaveBeenCalledWith('Task 1', expect.any(Number), expect.any(Number));
    });

    it('draws only the due date beside a due-only task point', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const task = { ...buildTask(), startDate: undefined, ratioDone: 100 };

        new TaskRenderer(canvas).render(viewport, [task], 1, 2, [], [], false, true, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('1/2', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).not.toHaveBeenCalledWith('1/1', expect.any(Number), expect.any(Number));
    });

    it('does not draw one-sided task dates when date display is disabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;
        const tasks = [
            { ...buildTask(), dueDate: undefined, ratioDone: 100 },
            { ...buildTask(), id: '2', startDate: undefined, ratioDone: 100 }
        ];

        new TaskRenderer(canvas).render(viewport, tasks, 2, 2, [], [], false, false, true, null, false);

        expect(ctx.fillText).not.toHaveBeenCalledWith('1/1', expect.any(Number), expect.any(Number));
        expect(ctx.fillText).not.toHaveBeenCalledWith('1/2', expect.any(Number), expect.any(Number));
    });

    it('toggles start-only and due-only task points independently', () => {
        const startContext = buildContext();
        const startCanvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(startContext)
        } as unknown as HTMLCanvasElement;
        const startOnlyTask = { ...buildTask(), dueDate: undefined };

        new TaskRenderer(startCanvas).render(viewport, [startOnlyTask], 1, 2, [], [], false, false, true, null, false, false, true);

        expect(startContext.fill).not.toHaveBeenCalled();

        const dueContext = buildContext();
        const dueCanvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(dueContext)
        } as unknown as HTMLCanvasElement;
        const dueOnlyTask = { ...buildTask(), startDate: undefined };

        new TaskRenderer(dueCanvas).render(viewport, [dueOnlyTask], 1, 2, [], [], false, false, true, null, false, true, false);

        expect(dueContext.fill).not.toHaveBeenCalled();
    });
});
