import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkloadCanvasPanel } from './WorkloadCanvasPanel';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import type { WorkloadData } from '../../services/WorkloadLogicService';
import type { Task } from '../../types';
import { useUIStore } from '../../stores/UIStore';

const ONE_DAY = 24 * 60 * 60 * 1000;

const mockContext = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0
} as unknown as CanvasRenderingContext2D;

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: 0,
    dueDate: 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const buildWorkloadData = (contributingTasks: Task[] = []): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 8,
            peakLoad: 8,
            dailyWorkloads: new Map([
                ['2026-01-01', {
                    dateStr: '2026-01-01',
                    timestamp: ONE_DAY * 3,
                    totalLoad: 8,
                    isOverload: false,
                    contributingTasks: contributingTasks.map((task) => ({
                        task,
                        dailyLoad: 1
                    }))
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 0,
    overloadedDayCount: 0
});

const buildFocusedOverloadWorkloadData = (): WorkloadData => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 9,
            peakLoad: 9,
            dailyWorkloads: new Map([
                ['2026-01-06', {
                    dateStr: '2026-01-06',
                    timestamp: ONE_DAY * 5,
                    totalLoad: 9,
                    isOverload: true,
                    contributingTasks: []
                }]
            ])
        }],
        [2, {
            assigneeId: 2,
            assigneeName: 'Bob',
            totalLoad: 10,
            peakLoad: 10,
            dailyWorkloads: new Map([
                ['2026-01-12', {
                    dateStr: '2026-01-12',
                    timestamp: ONE_DAY * 40,
                    totalLoad: 10,
                    isOverload: true,
                    contributingTasks: []
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 2,
    overloadedDayCount: 2
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
            startDate: 0,
            scrollX: 50,
            scrollY: 60,
            scale: 20 / ONE_DAY,
            height: 200,
            rowHeight: 40
        },
        rowCount: 20
    }, true);
    useUIStore.setState(useUIStore.getInitialState(), true);

    useWorkloadStore.setState({
        ...useWorkloadStore.getInitialState(),
        workloadData: buildWorkloadData(),
        capacityThreshold: 8
    }, true);
});

describe('WorkloadCanvasPanel', () => {
    const getViewportAndCanvas = () => {
        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        const canvas = viewportElement.querySelector('canvas') as HTMLCanvasElement | null;

        expect(canvas).not.toBeNull();

        return { viewportElement, canvas: canvas as HTMLCanvasElement };
    };

    it('sizes the canvas to the viewport area below the header', () => {
        render(<WorkloadCanvasPanel />);

        const { canvas } = getViewportAndCanvas();

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

    it('keeps panning across multiple mouse moves during a single drag', () => {
        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');

        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 100, clientY: 120 });
        fireEvent.mouseMove(window, { clientX: 120, clientY: 150 });
        fireEvent.mouseMove(window, { clientX: 140, clientY: 160 });
        fireEvent.mouseUp(window);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(10);
        expect(viewport.scrollY).toBe(60);
    });

    it('starts horizontal panning immediately when dragging empty histogram space', () => {
        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');

        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 100, clientY: 120 });
        fireEvent.mouseMove(window, { clientX: 101, clientY: 120 });
        fireEvent.mouseUp(window);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(49);
        expect(viewport.scrollY).toBe(60);
    });

    it('preserves histogram bar clicks when there is no pointer movement', () => {
        const tasks = [
            buildTask({ id: 'task-1', subject: 'Task 1', projectId: 'p1', startDate: ONE_DAY * 3, dueDate: ONE_DAY * 3, estimatedHours: 4 })
        ];
        useTaskStore.getState().setTasks(tasks);
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData(tasks)
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 15, clientY: 70 });
        fireEvent.mouseUp(window, { clientX: 15, clientY: 70 });

        const { viewport, selectedTaskId } = useTaskStore.getState();
        expect(viewport.startDate).toBe(0);
        expect(selectedTaskId).toBe('task-1');
    });

    it('starts panning immediately when dragging from a histogram bar', () => {
        const tasks = [
            buildTask({ id: 'task-1', subject: 'Task 1', projectId: 'p1', startDate: ONE_DAY * 3, dueDate: ONE_DAY * 3, estimatedHours: 4 })
        ];
        useTaskStore.getState().setTasks(tasks);
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData(tasks)
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 15, clientY: 70 });
        fireEvent.mouseMove(window, { clientX: 17, clientY: 71 });
        fireEvent.mouseUp(window, { clientX: 17, clientY: 71 });

        const { viewport, selectedTaskId } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(48);
        expect(selectedTaskId).toBeNull();
    });

    it('keeps the default cursor before and after dragging the histogram area', () => {
        render(<WorkloadCanvasPanel />);

        const { viewportElement, canvas } = getViewportAndCanvas();

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

    it('shows a pointer cursor when hovering a histogram bar', () => {
        render(<WorkloadCanvasPanel />);

        const { viewportElement, canvas } = getViewportAndCanvas();

        fireEvent.mouseMove(viewportElement, { clientX: 15, clientY: 70 });

        expect(viewportElement).toHaveStyle({ cursor: 'pointer' });
        expect(canvas).toHaveStyle({ cursor: 'pointer' });
        expect(document.body.style.cursor).toBe('');
    });

    it('keeps the default cursor when hovering off a histogram bar', () => {
        render(<WorkloadCanvasPanel />);

        const { viewportElement, canvas } = getViewportAndCanvas();

        fireEvent.mouseMove(viewportElement, { clientX: 100, clientY: 70 });

        expect(viewportElement).toHaveStyle({ cursor: 'default' });
        expect(canvas).toHaveStyle({ cursor: 'default' });
        expect(document.body.style.cursor).toBe('');
    });

    it('resets the cursor to default on mouse leave', () => {
        render(<WorkloadCanvasPanel />);

        const { viewportElement, canvas } = getViewportAndCanvas();

        fireEvent.mouseMove(viewportElement, { clientX: 15, clientY: 70 });
        expect(viewportElement).toHaveStyle({ cursor: 'pointer' });
        expect(canvas).toHaveStyle({ cursor: 'pointer' });

        fireEvent.mouseLeave(viewportElement);

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

    it('focuses the matching task when a histogram bar is clicked', () => {
        const tasks = [
            buildTask({ id: 'task-1', subject: 'Task 1', projectId: 'p1', startDate: ONE_DAY, dueDate: ONE_DAY, estimatedHours: 4 }),
            buildTask({ id: 'task-2', subject: 'Task 2', projectId: 'p1', startDate: ONE_DAY * 2, dueDate: ONE_DAY * 2, estimatedHours: 2 })
        ];
        useTaskStore.getState().setTasks(tasks);
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData(tasks)
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 15, clientY: 70 });
        fireEvent.mouseUp(window, { clientX: 15, clientY: 70 });

        expect(useTaskStore.getState().selectedTaskId).toBe('task-1');
    });

    it('cycles through matching tasks on repeated clicks of the same bar', () => {
        const tasks = [
            buildTask({ id: 'task-1', subject: 'Task 1', projectId: 'p1', startDate: ONE_DAY, dueDate: ONE_DAY, estimatedHours: 8 }),
            buildTask({ id: 'task-2', subject: 'Task 2', projectId: 'p1', startDate: ONE_DAY * 2, dueDate: ONE_DAY * 2, estimatedHours: 4 })
        ];
        useTaskStore.getState().setTasks(tasks);
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData(tasks)
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 15, clientY: 70 });
        fireEvent.mouseUp(window, { clientX: 15, clientY: 70 });
        expect(useTaskStore.getState().selectedTaskId).toBe('task-1');

        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 65, clientY: 70 });
        fireEvent.mouseUp(window, { clientX: 65, clientY: 70 });
        expect(useTaskStore.getState().selectedTaskId).toBe('task-2');
    });

    it('shows a warning when the clicked task is hidden by filters', () => {
        const tasks = [
            buildTask({ id: 'hidden-task', subject: 'Hidden Task', projectId: 'p1', startDate: ONE_DAY, dueDate: ONE_DAY, estimatedHours: 8 })
        ];
        useTaskStore.getState().setTasks(tasks);
        useTaskStore.getState().setFilterText('Visible');
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData(tasks)
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        fireEvent.mouseDown(viewportElement, { button: 0, clientX: 15, clientY: 70 });
        fireEvent.mouseUp(window, { clientX: 15, clientY: 70 });

        expect(useTaskStore.getState().selectedTaskId).toBeNull();
        expect(useUIStore.getState().notifications.at(-1)?.message).toBe('Selected task is hidden by the current filters.');
    });

    it('scrolls the workload pane to the focused overload assignee row', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildFocusedOverloadWorkloadData(),
            focusedHistogramBar: { assigneeId: 2, dateStr: '2026-01-12' }
        });

        render(<WorkloadCanvasPanel />);

        const viewportElement = screen.getByTestId('workload-canvas-viewport');
        expect(viewportElement.scrollTop).toBe(80);
    });

    it('adjusts the shared viewport horizontally to reveal the focused overload bar', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildFocusedOverloadWorkloadData(),
            focusedHistogramBar: { assigneeId: 2, dateStr: '2026-01-12' }
        });

        render(<WorkloadCanvasPanel />);

        expect(useTaskStore.getState().viewport.scrollX).toBeGreaterThan(50);
    });
});
