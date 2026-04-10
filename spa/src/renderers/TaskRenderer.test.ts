import { describe, expect, it, vi } from 'vitest';
import { TaskRenderer } from './TaskRenderer';
import type { Task, Viewport } from '../types';

const ONE_DAY = 24 * 60 * 60 * 1000;

const viewport: Viewport = {
    startDate: 0,
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
    startDate: 0,
    dueDate: ONE_DAY,
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
    it('draws task titles when enabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], true, true, null, false);

        expect(ctx.fillText).toHaveBeenCalledWith('Task 1', expect.any(Number), expect.any(Number));
    });

    it('skips task title drawing when disabled', () => {
        const ctx = buildContext();
        const canvas = {
            width: 800,
            height: 600,
            getContext: vi.fn().mockReturnValue(ctx)
        } as unknown as HTMLCanvasElement;

        new TaskRenderer(canvas).render(viewport, [buildTask()], 1, 2, [], [], false, true, null, false);

        expect(ctx.fillText).not.toHaveBeenCalled();
        expect(ctx.fillRect).toHaveBeenCalled();
    });
});
