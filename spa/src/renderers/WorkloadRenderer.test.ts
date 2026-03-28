import { describe, expect, it, vi } from 'vitest';
import { WorkloadRenderer } from './WorkloadRenderer';
import type { Viewport } from '../types';
import type { WorkloadData } from '../services/WorkloadLogicService';

const ONE_DAY = 24 * 60 * 60 * 1000;

function createMockContext() {
    return {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        setLineDash: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0
    } as unknown as CanvasRenderingContext2D;
}

const buildViewport = (overrides: Partial<Viewport> = {}): Viewport => ({
    startDate: 0,
    scrollX: 0,
    scrollY: 0,
    scale: 1 / ONE_DAY,
    width: 800,
    height: 240,
    rowHeight: 36,
    ...overrides
});

const buildWorkloadData = (timestamp: number): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 8,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: []
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 0,
    overloadedDayCount: 0
});

const buildTwoAssigneeWorkloadData = (timestamp: number): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 8,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: []
                }]
            ])
        }],
        [2, {
            assigneeId: 2,
            assigneeName: 'Bob',
            totalLoad: 8,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: []
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 0,
    overloadedDayCount: 0
});

describe('WorkloadRenderer', () => {
    it('draws visible bars using the same horizontal scroll direction as the gantt viewport', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 800,
            height: 240,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);

        const viewport = buildViewport({ scrollX: 100 });
        const timestampAtVisibleStart = 100 * ONE_DAY;

        renderer.render({
            viewport,
            zoomLevel: 2,
            workloadData: null,
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        const baselineFillRectCount = vi.mocked(ctx.fillRect).mock.calls.length;

        renderer.render({
            viewport,
            zoomLevel: 2,
            workloadData: buildWorkloadData(timestampAtVisibleStart),
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(baselineFillRectCount);
    });

    it('does not push the first assignee row out of view when the gantt viewport is vertically scrolled', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 800,
            height: 240,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);
        const viewport = buildViewport({ scrollY: 1000 });

        renderer.render({
            viewport,
            zoomLevel: 2,
            workloadData: null,
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        const baselineFillRectCount = vi.mocked(ctx.fillRect).mock.calls.length;

        renderer.render({
            viewport,
            zoomLevel: 2,
            workloadData: buildWorkloadData(0),
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(baselineFillRectCount);
    });

    it('still draws bars when scrollX is larger than the canvas width', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 340,
            height: 240,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);
        const viewport = buildViewport({
            startDate: Date.parse('2025-03-15T15:00:00.000Z'),
            scrollX: 3550,
            scale: 10 / ONE_DAY,
            width: 340,
            height: 240
        });

        renderer.render({
            viewport,
            zoomLevel: 1,
            workloadData: null,
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        const baselineFillRectCount = vi.mocked(ctx.fillRect).mock.calls.length;

        renderer.render({
            viewport,
            zoomLevel: 1,
            workloadData: buildWorkloadData(Date.parse('2026-03-14T00:00:00.000Z')),
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(baselineFillRectCount);
    });

    it('renders later assignee rows when vertically scrolled within the workload pane', () => {
        const ctx = createMockContext();
        const canvas = {
            width: 800,
            height: 72,
            getContext: vi.fn(() => ctx)
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);
        const viewport = buildViewport({ rowHeight: 36 });

        renderer.render({
            viewport,
            zoomLevel: 2,
            workloadData: buildTwoAssigneeWorkloadData(0),
            capacityThreshold: 8,
            verticalScroll: 72,
            hoveredAssigneeId: null,
            hoveredDateStr: null
        });

        const barDraws = vi.mocked(ctx.fillRect).mock.calls.filter(([, y, , height]) => Number(y) >= 0 && Number(height) > 0);
        expect(barDraws.length).toBeGreaterThan(1);
    });

    it('hit tests the visible workload bar for the correct assignee and date', () => {
        const canvas = {
            width: 800,
            height: 240,
            getContext: vi.fn(() => createMockContext())
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);

        const hit = renderer.hitTestDailyBar({
            viewport: buildViewport({ scale: 10 / ONE_DAY }),
            zoomLevel: 2,
            workloadData: buildWorkloadData(0),
            capacityThreshold: 8,
            verticalScroll: 0,
            hoveredAssigneeId: null,
            hoveredDateStr: null,
            pointerX: 6,
            pointerY: 54
        });

        expect(hit).toEqual({ assigneeId: 1, dateStr: '2026-01-01' });
    });

    it('hit tests the lower assignee row after vertical scrolling', () => {
        const canvas = {
            width: 800,
            height: 72,
            getContext: vi.fn(() => createMockContext())
        } as unknown as HTMLCanvasElement;
        const renderer = new WorkloadRenderer(canvas);

        const hit = renderer.hitTestDailyBar({
            viewport: buildViewport({ scale: 10 / ONE_DAY, rowHeight: 36 }),
            zoomLevel: 2,
            workloadData: buildTwoAssigneeWorkloadData(0),
            capacityThreshold: 8,
            verticalScroll: 72,
            hoveredAssigneeId: null,
            hoveredDateStr: null,
            pointerX: 6,
            pointerY: 54
        });

        expect(hit).toEqual({ assigneeId: 2, dateStr: '2026-01-01' });
    });
});
