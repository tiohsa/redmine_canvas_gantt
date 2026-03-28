import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkloadCanvasPanel } from './WorkloadCanvasPanel';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import type { WorkloadData } from '../../services/WorkloadLogicService';

const ONE_DAY = 24 * 60 * 60 * 1000;

const mockContext = {
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

const buildWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 8,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp: ONE_DAY,
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

beforeEach(() => {
    vi.clearAllMocks();

    class ResizeObserverMock {
        private callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
        }

        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();

        trigger = () => {
            this.callback([], this as unknown as ResizeObserver);
        };
    }
    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'workload-canvas-viewport') return 640;
        return 680;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'workload-canvas-viewport') return 220;
        return 260;
    });

    useTaskStore.setState({
        ...useTaskStore.getInitialState(),
        viewport: {
            ...useTaskStore.getInitialState().viewport,
            startDate: 1000,
            scrollX: 50,
            scrollY: 60,
            scale: 2,
            height: 200,
            rowHeight: 40
        },
        rowCount: 20
    }, true);

    useWorkloadStore.setState({
        ...useWorkloadStore.getInitialState(),
        workloadData: buildWorkloadData(),
        capacityThreshold: 8
    }, true);
});

describe('WorkloadCanvasPanel', () => {
    it('sizes the canvas to the viewport area below the header', () => {
        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        const canvas = viewportElement.querySelector('canvas') as HTMLCanvasElement | null;

        expect(canvas).not.toBeNull();
        expect(canvas?.width).toBe(640);
        expect(canvas?.height).toBe(220);
    });

    it('pans the shared viewport when dragging the histogram area', () => {
        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');

        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 100, clientY: 120 });
        fireEvent.mouseMove(window, { clientX: 120, clientY: 150 });
        fireEvent.mouseUp(window);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(30);
        expect(viewport.scrollY).toBe(60);
    });

    it('keeps the default cursor before and after dragging the histogram area', () => {
        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        const canvas = viewportElement.querySelector('canvas');

        expect(canvas).not.toBeNull();
        expect(viewportElement).toHaveStyle({ cursor: 'default' });
        expect(canvas).toHaveStyle({ cursor: 'default' });
        expect(document.body.style.cursor).toBe('');

        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 100, clientY: 120 });
        expect(viewportElement).toHaveStyle({ cursor: 'default' });
        expect(canvas).toHaveStyle({ cursor: 'default' });
        expect(document.body.style.cursor).toBe('');

        fireEvent.mouseUp(window);
        expect(viewportElement).toHaveStyle({ cursor: 'default' });
        expect(canvas).toHaveStyle({ cursor: 'default' });
        expect(document.body.style.cursor).toBe('');
    });

    it('does not start panning from the header area', () => {
        render(<WorkloadCanvasPanel />);

        fireEvent.mouseDown(screen.getByText('HISTOGRAM (DAILY WORKLOAD)'), {
            button: 0,
            clientX: 100,
            clientY: 20
        });
        fireEvent.mouseMove(window, { clientX: 130, clientY: 60 });
        fireEvent.mouseUp(window);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(50);
        expect(viewport.scrollY).toBe(60);
    });

    it('reports vertical scroll position changes for workload sync', () => {
        const handleScroll = vi.fn();
        render(<WorkloadCanvasPanel onScroll={handleScroll} />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.scroll(viewportElement, { target: { scrollTop: 48 } });

        expect(handleScroll).toHaveBeenCalledWith(48);
    });
});
