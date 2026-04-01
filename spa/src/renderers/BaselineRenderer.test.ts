import { describe, expect, it, vi } from 'vitest';
import { BaselineRenderer } from './BaselineRenderer';
import type { Task, Viewport } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const viewport: Viewport = {
    startDate: 0,
    scrollX: 0,
    scrollY: 0,
    scale: 1 / DAY_MS,
    width: 800,
    height: 600,
    rowHeight: 32
};

const buildTask = (id: string, rowIndex: number): Task => ({
    id,
    subject: `Task ${id}`,
    projectId: '1',
    projectName: 'Demo',
    displayOrder: rowIndex,
    startDate: 0,
    dueDate: DAY_MS,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex,
    hasChildren: false
});

const buildContext = () => ({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1
});

describe('BaselineRenderer', () => {
    it('draws a ghost bar when baseline has both start and due dates', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new BaselineRenderer(canvas).render({
            viewport,
            tasks: [buildTask('1', 0)],
            rowCount: 1,
            zoomLevel: 2,
            showBaseline: true,
            snapshot: {
                snapshotId: 'baseline-1',
                projectId: '1',
                capturedAt: '2026-04-01T00:00:00.000Z',
                capturedById: 1,
                capturedByName: 'Alice',
                scope: 'filtered',
                tasksByIssueId: {
                    '1': {
                        issueId: '1',
                        baselineStartDate: 0,
                        baselineDueDate: DAY_MS
                    }
                }
            }
        });

        expect(ctx.clearRect).toHaveBeenCalled();
        expect(ctx.fillRect).toHaveBeenCalledTimes(1);
        expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    });

    it('draws marker shapes for sparse baseline dates and skips empty states', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new BaselineRenderer(canvas).render({
            viewport,
            tasks: [buildTask('1', 0), buildTask('2', 1), buildTask('3', 2)],
            rowCount: 3,
            zoomLevel: 2,
            showBaseline: true,
            snapshot: {
                snapshotId: 'baseline-1',
                projectId: '1',
                capturedAt: '2026-04-01T00:00:00.000Z',
                capturedById: 1,
                capturedByName: 'Alice',
                scope: 'project',
                tasksByIssueId: {
                    '1': {
                        issueId: '1',
                        baselineStartDate: 0,
                        baselineDueDate: null
                    },
                    '2': {
                        issueId: '2',
                        baselineStartDate: null,
                        baselineDueDate: DAY_MS
                    },
                    '3': {
                        issueId: '3',
                        baselineStartDate: null,
                        baselineDueDate: null
                    }
                }
            }
        });

        expect(ctx.beginPath).toHaveBeenCalledTimes(2);
        expect(ctx.moveTo).toHaveBeenCalledTimes(2);
        expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it('skips drawing when baseline display is off', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new BaselineRenderer(canvas).render({
            viewport,
            tasks: [buildTask('1', 0)],
            rowCount: 1,
            zoomLevel: 2,
            showBaseline: false,
            snapshot: {
                snapshotId: 'baseline-1',
                projectId: '1',
                capturedAt: '2026-04-01T00:00:00.000Z',
                capturedById: 1,
                capturedByName: 'Alice',
                scope: 'filtered',
                tasksByIssueId: {
                    '1': {
                        issueId: '1',
                        baselineStartDate: 0,
                        baselineDueDate: DAY_MS
                    }
                }
            }
        });

        expect(ctx.clearRect).toHaveBeenCalledTimes(1);
        expect(ctx.fillRect).not.toHaveBeenCalled();
        expect(ctx.beginPath).not.toHaveBeenCalled();
    });
});
