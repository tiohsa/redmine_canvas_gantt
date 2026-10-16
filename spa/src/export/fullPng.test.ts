import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { parseDateOnly } from '../utils/dateOnly';
import { GANTT_HEADER_HEIGHT } from '../constants';
import { exportFullRangePng, getFullExportGeometry as getFullExportGeometryWithContext } from './fullPng';
import type { FullGanttExportSnapshot } from './types';

const rendererMocks = vi.hoisted(() => ({
    headerRender: vi.fn(),
    backgroundRender: vi.fn(),
    baselineRender: vi.fn(),
    taskRender: vi.fn(),
    overlayRender: vi.fn(),
    canvasToBlob: vi.fn(),
    downloadBlob: vi.fn()
}));

vi.mock('../renderers/TimelineHeaderRenderer', () => ({
    renderTimelineHeader: (...args: unknown[]) => rendererMocks.headerRender(...args)
}));
vi.mock('../renderers/BackgroundRenderer', () => ({
    BackgroundRenderer: class {
        readonly canvas: HTMLCanvasElement;
        constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
        render(...args: unknown[]) { rendererMocks.backgroundRender(this.canvas, ...args); }
    }
}));
vi.mock('../renderers/BaselineRenderer', () => ({
    BaselineRenderer: class {
        readonly canvas: HTMLCanvasElement;
        constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
        render(...args: unknown[]) { rendererMocks.baselineRender(this.canvas, ...args); }
    }
}));
vi.mock('../renderers/TaskRenderer', () => ({
    TaskRenderer: class {
        readonly canvas: HTMLCanvasElement;
        constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
        render(...args: unknown[]) { rendererMocks.taskRender(this.canvas, ...args); }
    }
}));
vi.mock('../renderers/OverlayRenderer', () => ({
    OverlayRenderer: class {
        readonly canvas: HTMLCanvasElement;
        constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
        render(...args: unknown[]) { rendererMocks.overlayRender(this.canvas, ...args); }
    }
}));
vi.mock('./download', () => ({
    buildExportFilename: () => 'full.png',
    canvasToBlob: (...args: unknown[]) => rendererMocks.canvasToBlob(...args),
    downloadBlob: (...args: unknown[]) => rendererMocks.downloadBlob(...args)
}));

beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(rendererMocks).forEach((mock) => mock.mockReset());
    rendererMocks.canvasToBlob.mockResolvedValue(new Blob(['png']));
    measuredTextOverrides.clear();
    measuredFonts.clear();
    measurementContext.measureText = vi.fn(measureText);
});

const date = (value: string) => parseDateOnly(value)!;

const measuredTextOverrides = new Map<string, Partial<TextMetrics>>();
const measuredFonts = new Map<string, string>();
const measureText = (text: string): TextMetrics => {
    measuredFonts.set(text, measurementContext.font);
    return {
        width: text.length * 8,
        actualBoundingBoxLeft: text.length * 8,
        actualBoundingBoxRight: 0,
        ...measuredTextOverrides.get(text)
    } as TextMetrics;
};

const measurementContext = {
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn(measureText)
} as unknown as CanvasRenderingContext2D;

const getFullExportGeometry = (snapshot: FullGanttExportSnapshot) => getFullExportGeometryWithContext(snapshot, measurementContext);

const installFontLoader = (load: FontFaceSet['load']) => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { load } as unknown as FontFaceSet
    });
    return () => {
        if (previousDescriptor) Object.defineProperty(document, 'fonts', previousDescriptor);
        else Reflect.deleteProperty(document, 'fonts');
    };
};

const makeTask = (id: string, startDate: number | undefined, dueDate: number | undefined, rowIndex = 0): Task => ({
    id,
    subject: `Task ${id}`,
    startDate,
    dueDate,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 1,
    editable: true,
    rowIndex,
    hasChildren: false
});

const makeSnapshot = (overrides: Partial<FullGanttExportSnapshot> = {}): FullGanttExportSnapshot => ({
    viewport: {
        startDate: date('2025-01-01'),
        scrollX: 120,
        scrollY: 36,
        scale: 0.000001,
        width: 500,
        height: 360,
        rowHeight: 36
    },
    zoomLevel: 2,
    tasks: [],
    relations: [],
    rowCount: 2,
    layoutRows: [],
    baselineSnapshot: null,
    showBaseline: false,
    showTaskTitles: false,
    showTaskBarDates: false,
    showPointsOrphans: true,
    showStartDateOnly: true,
    showDueDateOnly: true,
    showProgressLine: true,
    today: date('2025-01-12'),
    ...overrides
});

describe('full PNG export geometry', () => {
    it('uses only laid-out tasks and aggregate rows, with inclusive due dates and CSS-pixel padding', () => {
        const snapshot = makeSnapshot({
            tasks: [
                makeTask('visible', date('2025-01-10'), date('2025-01-12'), 0),
                makeTask('filtered-or-collapsed', date('2040-01-01'), date('2040-01-02'), 5)
            ],
            layoutRows: [
                { type: 'header', projectId: 'p', rowIndex: 0, startDate: date('2025-01-08'), dueDate: date('2025-01-09') }
            ],
            rowCount: 1
        });

        const geometry = getFullExportGeometry(snapshot);
        const expectedStart = LayoutEngine.calendarDateToTimeline(date('2025-01-08')) - 32 / snapshot.viewport.scale;
        expect(geometry.viewport.startDate).toBe(expectedStart);
        expect(geometry.viewport.scrollX).toBe(0);
        expect(geometry.viewport.scrollY).toBe(0);
        expect(geometry.viewport.rowHeight).toBe(36);
        expect(geometry.width).toBe(Math.ceil((5 * 24 * 60 * 60 * 1000) * snapshot.viewport.scale + 64));
        expect(geometry.chartHeight).toBe(36);
    });

    it('ignores incomplete summary rows so lone dates cannot expand or reject the export', () => {
        const snapshot = makeSnapshot({
            tasks: [makeTask('visible', date('2025-01-10'), date('2025-01-11'), 0)],
            layoutRows: [
                { type: 'header', projectId: 'p', rowIndex: 1, startDate: date('2050-01-01') },
                { type: 'version', id: 'v', versionId: 'v', name: 'Version', projectId: 'p', rowIndex: 2, dueDate: date('2050-01-02') }
            ],
            rowCount: 3
        });

        const geometry = getFullExportGeometry(snapshot);
        expect(geometry.viewport.startDate).toBe(LayoutEngine.calendarDateToTimeline(date('2025-01-10')) - 32 / snapshot.viewport.scale);
        expect(geometry.width).toBe(Math.ceil(2 * 24 * 60 * 60 * 1000 * snapshot.viewport.scale + 64));
    });

    it('uses the visible period when date-only tasks are hidden or no drawable dates remain', () => {
        const snapshot = makeSnapshot({
            tasks: [makeTask('orphan', date('2025-01-10'), undefined)],
            showStartDateOnly: false
        });
        const geometry = getFullExportGeometry(snapshot);
        const visibleStart = snapshot.viewport.startDate + snapshot.viewport.scrollX / snapshot.viewport.scale;
        expect(geometry.viewport.startDate).toBe(visibleStart - 32 / snapshot.viewport.scale);
        expect(geometry.width).toBe(snapshot.viewport.width + 64);
    });

    it('includes enabled start-only and due-only dates on DST transition dates as full calendar days', () => {
        const cases = [
            { task: makeTask('start-only', date('2026-03-08'), undefined), setting: 'showStartDateOnly' as const, day: '2026-03-08' },
            { task: makeTask('due-only', undefined, date('2026-11-01')), setting: 'showDueDateOnly' as const, day: '2026-11-01' }
        ];
        cases.forEach(({ task, setting, day }) => {
            const geometry = getFullExportGeometry(makeSnapshot({ tasks: [task], [setting]: true }));
            expect(geometry.viewport.startDate).toBe(LayoutEngine.calendarDateToTimeline(date(day)) - 32 / 0.000001);
            expect(geometry.width).toBe(Math.ceil(24 * 60 * 60 * 1000 * 0.000001 + 64));
        });
    });

    it('includes enabled baseline dates only for displayed tasks', () => {
        const snapshot = makeSnapshot({
            tasks: [makeTask('shown', undefined, undefined, 0), makeTask('outside', undefined, undefined, 4)],
            rowCount: 1,
            showBaseline: true,
            baselineSnapshot: {
                snapshotId: 'baseline',
                projectId: 'p',
                capturedAt: '2025-01-01T00:00:00Z',
                scope: 'project',
                tasksByIssueId: {
                    shown: { issueId: 'shown', baselineStartDate: date('2025-01-10'), baselineDueDate: date('2025-01-11') },
                    outside: { issueId: 'outside', baselineStartDate: date('2030-01-01'), baselineDueDate: null }
                }
            }
        });
        const geometry = getFullExportGeometry(snapshot);
        expect(geometry.viewport.startDate).toBe(LayoutEngine.calendarDateToTimeline(date('2025-01-10')) - 32 / snapshot.viewport.scale);
        expect(geometry.width).toBe(Math.ceil((2 * 24 * 60 * 60 * 1000) * snapshot.viewport.scale + 64));
    });

    it('ignores baseline dates when the baseline display setting is off', () => {
        const snapshot = makeSnapshot({
            tasks: [makeTask('shown', undefined, undefined)],
            showBaseline: false,
            baselineSnapshot: {
                snapshotId: 'baseline',
                projectId: 'p',
                capturedAt: '2025-01-01T00:00:00Z',
                scope: 'project',
                tasksByIssueId: {
                    shown: { issueId: 'shown', baselineStartDate: date('2000-01-01'), baselineDueDate: date('2000-01-02') }
                }
            }
        });
        const geometry = getFullExportGeometry(snapshot);
        const visibleStart = snapshot.viewport.startDate + snapshot.viewport.scrollX / snapshot.viewport.scale;
        expect(geometry.viewport.startDate).toBe(visibleStart - 32 / snapshot.viewport.scale);
        expect(geometry.width).toBe(snapshot.viewport.width + 64);
    });

    it('measures every co-located Japanese and English title with the renderer font', () => {
        const japanese = '日本語の長いタスクタイトルを最後まで表示する';
        const english = 'A long English task title on the same date';
        measuredTextOverrides.set(japanese, { width: 300, actualBoundingBoxLeft: 286, actualBoundingBoxRight: 14 });
        measuredTextOverrides.set(english, { width: 420, actualBoundingBoxLeft: 401, actualBoundingBoxRight: 19 });
        const tasks = [
            { ...makeTask('jp', date('2025-01-10'), date('2025-01-10'), 0), subject: japanese },
            { ...makeTask('en', date('2025-01-10'), date('2025-01-10'), 1), subject: english }
        ];
        const barsOnly = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: false, rowCount: 2 }));
        const withTitles = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: true, rowCount: 2 }));

        expect(measurementContext.measureText).toHaveBeenCalledWith(japanese);
        expect(measurementContext.measureText).toHaveBeenCalledWith(english);
        expect(measuredFonts.get(japanese)).toBeTruthy();
        expect(measuredFonts.get(english)).toBe(measuredFonts.get(japanese));
        expect(withTitles.viewport.startDate).toBeLessThan(barsOnly.viewport.startDate);
        expect(withTitles.width).toBeGreaterThan(barsOnly.width);
    });

    it('includes task-bar date labels only when enabled', () => {
        measuredTextOverrides.set('1/10', { width: 240, actualBoundingBoxLeft: 220, actualBoundingBoxRight: 20 });
        measuredTextOverrides.set('1/11', { width: 260, actualBoundingBoxLeft: 12, actualBoundingBoxRight: 248 });
        const tasks = [makeTask('dates', date('2025-01-10'), date('2025-01-11'))];
        const withoutDates = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: false, showTaskBarDates: false }));
        const withDates = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: false, showTaskBarDates: true }));

        expect(measurementContext.measureText).toHaveBeenCalledWith('1/10');
        expect(measurementContext.measureText).toHaveBeenCalledWith('1/11');
        expect(withDates.viewport.startDate).toBeLessThan(withoutDates.viewport.startDate);
        expect(withDates.width).toBeGreaterThan(withoutDates.width);
    });

    it('falls back to TextMetrics.width when actual bounding boxes are unavailable', () => {
        const title = 'Fallback metric title';
        measuredTextOverrides.set(title, {
            width: 360,
            actualBoundingBoxLeft: undefined,
            actualBoundingBoxRight: undefined
        });
        const tasks = [{ ...makeTask('fallback', date('2025-01-10'), date('2025-01-10')), subject: title }];
        const barsOnly = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: false }));
        const withTitle = getFullExportGeometry(makeSnapshot({ tasks, showTaskTitles: true }));

        expect(withTitle.viewport.startDate).toBeLessThan(barsOnly.viewport.startDate);
        expect(withTitle.width).toBeGreaterThan(barsOnly.width);
    });

    it('measures one-sided point labels and version row titles', () => {
        const startTitle = 'Start-only title';
        const dueTitle = 'Due-only title';
        const versionTitle = 'A very long version row title';
        const tasks = [
            { ...makeTask('start-only', date('2025-01-10'), undefined, 0), subject: startTitle },
            { ...makeTask('due-only', undefined, date('2025-01-10'), 1), subject: dueTitle }
        ];
        const snapshot = makeSnapshot({
            tasks,
            rowCount: 3,
            showTaskTitles: true,
            showTaskBarDates: true,
            layoutRows: [{
                type: 'version', id: 'v', versionId: 'v', name: versionTitle,
                projectId: 'p', rowIndex: 2, startDate: date('2025-01-10'), dueDate: date('2025-01-11')
            }]
        });
        const geometry = getFullExportGeometry(snapshot);

        [startTitle, dueTitle, versionTitle, '1/10'].forEach((label) => {
            expect(measurementContext.measureText).toHaveBeenCalledWith(label);
        });
        expect(geometry.viewport.startDate).toBeLessThan(
            LayoutEngine.calendarDateToTimeline(date('2025-01-10')) - 32 / snapshot.viewport.scale
        );
    });

    it('skips disabled labels and out-of-layout task and version titles', () => {
        const hiddenTaskTitle = 'Hidden task title that must not be measured';
        const hiddenVersionTitle = 'Hidden version title that must not be measured';
        const visibleTitle = 'Visible task title';
        const snapshot = makeSnapshot({
            tasks: [
                { ...makeTask('visible', date('2025-01-10'), date('2025-01-11'), 0), subject: visibleTitle },
                { ...makeTask('outside', date('2025-01-10'), date('2025-01-11'), 4), subject: hiddenTaskTitle }
            ],
            rowCount: 1,
            showTaskTitles: true,
            showTaskBarDates: false,
            layoutRows: [{
                type: 'version', id: 'v', versionId: 'v', name: hiddenVersionTitle,
                projectId: 'p', rowIndex: 3, startDate: date('2025-01-10'), dueDate: date('2025-01-11')
            }]
        });

        getFullExportGeometry(snapshot);
        expect(measurementContext.measureText).toHaveBeenCalledTimes(1);
        expect(measurementContext.measureText).toHaveBeenCalledWith(visibleTitle);
        expect(measurementContext.measureText).not.toHaveBeenCalledWith(hiddenTaskTitle);
        expect(measurementContext.measureText).not.toHaveBeenCalledWith(hiddenVersionTitle);
        expect(measuredFonts.has(hiddenTaskTitle)).toBe(false);
        expect(measuredFonts.has(hiddenVersionTitle)).toBe(false);

        vi.mocked(measurementContext.measureText).mockClear();
        getFullExportGeometry({ ...snapshot, showTaskTitles: false });
        expect(measurementContext.measureText).not.toHaveBeenCalled();
    });

    it('rejects a chart whose labels alone exceed the canvas side cap', () => {
        const title = 'A label wider than the PNG canvas limit';
        measuredTextOverrides.set(title, {
            width: 8_300,
            actualBoundingBoxLeft: 8_300,
            actualBoundingBoxRight: 0
        });
        const snapshot = makeSnapshot({
            tasks: [{ ...makeTask('wide-label', date('2025-01-10'), date('2025-01-10')), subject: title }],
            rowCount: 1,
            showTaskTitles: true,
            viewport: { ...makeSnapshot().viewport, scale: 0.000001, width: 0 }
        });

        expect(() => getFullExportGeometry({ ...snapshot, showTaskTitles: false })).not.toThrow();
        expect(() => getFullExportGeometry(snapshot)).toThrow();
    });

    it('accepts exact side and pixel-area limits and rejects each limit plus one', () => {
        const viewport = makeSnapshot().viewport;
        expect(getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 8128 } })).width).toBe(8192);
        expect(() => getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 8129 } }))).toThrow();

        const exactHeightRowHeight = 8192 - GANTT_HEADER_HEIGHT;
        expect(getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 0, rowHeight: exactHeightRowHeight }, rowCount: 1 })).totalHeight).toBe(8192);
        expect(() => getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 0, rowHeight: exactHeightRowHeight + 1 }, rowCount: 1 }))).toThrow();

        const exactAreaRowHeight = 4096 - GANTT_HEADER_HEIGHT;
        expect(getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 4032, rowHeight: exactAreaRowHeight }, rowCount: 1 })))
            .toMatchObject({ width: 4096, totalHeight: 4096 });
        expect(() => getFullExportGeometry(makeSnapshot({ viewport: { ...viewport, width: 4033, rowHeight: exactAreaRowHeight }, rowCount: 1 }))).toThrow();
    });

    it('applies side and total-area limits before creating canvases, independent of DPR', () => {
        const snapshot = makeSnapshot({
            tasks: [makeTask('long', date('2025-01-01'), date('2025-04-01'))]
        });
        const originalDpr = window.devicePixelRatio;
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
        expect(getFullExportGeometry(snapshot).width).toBe(Math.ceil((91 * 24 * 60 * 60 * 1000) * snapshot.viewport.scale + 64));
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDpr });

        expect(() => getFullExportGeometry(makeSnapshot({ viewport: { ...snapshot.viewport, width: 8193 }, tasks: [] })))
            .toThrow();
        expect(() => getFullExportGeometry(makeSnapshot({ viewport: { ...snapshot.viewport, width: 5000, rowHeight: 4000 }, rowCount: 1 })))
            .toThrow();
    });
});

describe('exportFullRangePng rendering lifecycle', () => {
    it('renders each layer once in order and releases both canvases after blob creation', async () => {
        const events: string[] = [];
        const contexts = Array.from({ length: 2 }, () => ({
            clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillStyle: ''
        }));
        const canvases = contexts.map((context) => ({
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement));
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return canvases.shift()!;
        });
        rendererMocks.headerRender.mockImplementation(() => events.push('header'));
        rendererMocks.backgroundRender.mockImplementation(() => events.push('background'));
        rendererMocks.baselineRender.mockImplementation(() => events.push('baseline'));
        rendererMocks.taskRender.mockImplementation(() => events.push('tasks'));
        rendererMocks.overlayRender.mockImplementation(() => events.push('overlay'));
        rendererMocks.canvasToBlob.mockImplementation(async (canvas: HTMLCanvasElement) => {
            events.push(`blob:${canvas.width}x${canvas.height}`);
            return new Blob(['png']);
        });
        rendererMocks.downloadBlob.mockImplementation(() => events.push('download'));

        const snapshot = makeSnapshot({ rowCount: 1, pendingRelationIds: new Set(['r-1']) });
        await exportFullRangePng(snapshot);

        expect(events).toEqual([
            'header', 'background', 'baseline', 'tasks', 'overlay',
            `blob:564x${GANTT_HEADER_HEIGHT + 36}`, 'download'
        ]);
        expect(createElement).toHaveBeenCalledTimes(2);
        expect(rendererMocks.backgroundRender).toHaveBeenCalledTimes(1);
        expect(rendererMocks.baselineRender).toHaveBeenCalledTimes(1);
        expect(rendererMocks.taskRender).toHaveBeenCalledTimes(1);
        expect(rendererMocks.overlayRender).toHaveBeenCalledTimes(1);
        const overlayState = rendererMocks.overlayRender.mock.calls[0][1] as Record<string, unknown>;
        expect(overlayState).toMatchObject({
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null,
            pendingRelationIds: snapshot.pendingRelationIds,
            showProgressLine: snapshot.showProgressLine,
            today: snapshot.today
        });
        const exportedCanvases = createElement.mock.results.map(({ value }) => value as HTMLCanvasElement);
        expect(exportedCanvases.map(({ width, height }) => [width, height])).toEqual([[0, 0], [0, 0]]);
    });

    it('releases temporary canvases when a renderer fails', async () => {
        const context = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillStyle: '' };
        const canvases = [0, 1].map(() => ({
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement));
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return canvases.shift()!;
        });
        rendererMocks.taskRender.mockImplementation(() => { throw new Error('renderer failed'); });

        await expect(exportFullRangePng(makeSnapshot())).rejects.toThrow('renderer failed');
        const exportedCanvases = createElement.mock.results.map(({ value }) => value as HTMLCanvasElement);
        expect(exportedCanvases.map(({ width, height }) => [width, height])).toEqual([[0, 0], [0, 0]]);
        expect(rendererMocks.canvasToBlob).not.toHaveBeenCalled();
        expect(rendererMocks.downloadBlob).not.toHaveBeenCalled();
    });

    it('rejects oversized output before allocating either canvas', async () => {
        const context = { save: vi.fn(), restore: vi.fn(), measureText: vi.fn() };
        const measurementCanvas = {
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement;
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return measurementCanvas;
        });
        await expect(exportFullRangePng(makeSnapshot({ viewport: { ...makeSnapshot().viewport, width: 8193 } }))).rejects.toThrow();
        expect(createElement).toHaveBeenCalledTimes(1);
        expect([measurementCanvas.width, measurementCanvas.height]).toEqual([0, 0]);
    });

    it('releases canvases and skips download when toBlob rejects', async () => {
        const context = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillStyle: '' };
        const canvases = [0, 1].map(() => ({
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement));
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return canvases.shift()!;
        });
        rendererMocks.canvasToBlob.mockRejectedValue(new Error('encoding failed'));

        await expect(exportFullRangePng(makeSnapshot())).rejects.toThrow('encoding failed');
        expect(createElement.mock.results.map(({ value }) => [value.width, value.height])).toEqual([[0, 0], [0, 0]]);
        expect(rendererMocks.downloadBlob).not.toHaveBeenCalled();
    });

    it('releases allocated canvases and skips download when a 2D context is unavailable', async () => {
        const canvases = [0, 1].map(() => ({
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => null)
        } as unknown as HTMLCanvasElement));
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return canvases.shift()!;
        });

        await expect(exportFullRangePng(makeSnapshot())).rejects.toThrow();
        expect(createElement.mock.results.map(({ value }) => [value.width, value.height])).toEqual([[0, 0]]);
        expect(rendererMocks.downloadBlob).not.toHaveBeenCalled();
    });

    it('waits for Japanese label fonts before sizing the export canvas or encoding a blob', async () => {
        const japanese = '日本語のタイトルを含む全範囲エクスポート';
        const task = { ...makeTask('japanese', date('2025-01-10'), date('2025-01-11')), subject: japanese };
        let resolveFonts!: (fonts: FontFace[]) => void;
        const load = vi.fn((font: string, glyphs?: string) => {
            void font;
            void glyphs;
            return new Promise<FontFace[]>((resolve) => { resolveFonts = resolve; });
        });
        const restoreFonts = installFontLoader(load as unknown as FontFaceSet['load']);
        const scratchContext = {
            save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), measureText: vi.fn((text: string) => ({
                width: text.length * 10,
                actualBoundingBoxLeft: text.length * 10,
                actualBoundingBoxRight: 0
            }))
        };
        const finalContext = {
            fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillStyle: ''
        };
        const canvases = [scratchContext, finalContext].map((context) => ({
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement));
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return canvases.shift()!;
        });

        try {
            const pendingExport = exportFullRangePng(makeSnapshot({ tasks: [task], rowCount: 1, showTaskTitles: true }));
            await Promise.resolve();
            expect(load).toHaveBeenCalledTimes(1);
            const loadedGlyphs = load.mock.calls[0][1] ?? '';
            expect(Array.from(new Set(Array.from(japanese))).every((glyph) => loadedGlyphs.includes(glyph))).toBe(true);
            expect(createElement).toHaveBeenCalledTimes(1);
            expect(createElement.mock.results[0].value).toMatchObject({ width: 1, height: 1 });
            expect(rendererMocks.canvasToBlob).not.toHaveBeenCalled();
            expect(rendererMocks.downloadBlob).not.toHaveBeenCalled();

            resolveFonts([]);
            await pendingExport;
            expect(createElement).toHaveBeenCalledTimes(2);
            expect(rendererMocks.canvasToBlob).toHaveBeenCalledTimes(1);
            expect(rendererMocks.downloadBlob).toHaveBeenCalledTimes(1);
            expect(createElement.mock.results.map(({ value }) => [value.width, value.height])).toEqual([[0, 0], [0, 0]]);
        } finally {
            restoreFonts();
        }
    });

    it('releases the 1×1 measurement canvas and skips final allocation when font loading rejects', async () => {
        const load = vi.fn().mockRejectedValue(new Error('font load failed'));
        const restoreFonts = installFontLoader(load as unknown as FontFaceSet['load']);
        const context = { save: vi.fn(), restore: vi.fn(), measureText: vi.fn() };
        const measurementCanvas = {
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: vi.fn(() => context)
        } as unknown as HTMLCanvasElement;
        const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName !== 'canvas') throw new Error(`Unexpected element: ${tagName}`);
            return measurementCanvas;
        });

        try {
            await expect(exportFullRangePng(makeSnapshot({
                tasks: [{ ...makeTask('japanese', date('2025-01-10'), date('2025-01-11')), subject: '日本語' }],
                showTaskTitles: true
            }))).rejects.toThrow('font load failed');
            expect(load).toHaveBeenCalledTimes(1);
            expect(createElement).toHaveBeenCalledTimes(1);
            expect([measurementCanvas.width, measurementCanvas.height]).toEqual([0, 0]);
            expect(rendererMocks.canvasToBlob).not.toHaveBeenCalled();
            expect(rendererMocks.downloadBlob).not.toHaveBeenCalled();
        } finally {
            restoreFonts();
        }
    });
});

