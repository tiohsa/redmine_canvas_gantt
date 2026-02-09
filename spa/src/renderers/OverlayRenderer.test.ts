import { describe, expect, it, vi } from 'vitest';
import { OverlayRenderer } from './OverlayRenderer';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';

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

describe('OverlayRenderer progress line', () => {
    it('passes through today line when due date is today', () => {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const viewport = {
            startDate: todayStart - ONE_DAY * 2,
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
            startDate: todayStart - ONE_DAY * 3,
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

        const xToday = (todayStart + ONE_DAY - viewport.startDate) * viewport.scale - viewport.scrollX;
        expect(ctx.lineTo).toHaveBeenCalledWith(xToday, expect.any(Number));
    });
});
