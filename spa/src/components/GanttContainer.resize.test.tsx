import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GanttContainer } from './GanttContainer';
import { useUIStore } from '../stores/UIStore';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTaskStore } from '../stores/TaskStore';
import { useWorkloadStore } from '../stores/WorkloadStore';
import { SIDEBAR_RESIZE_CURSOR } from '../constants';
import type { Relation, Task } from '../types';

const fetchDataMock = vi.fn().mockResolvedValue({
    tasks: [],
    relations: [],
    versions: [],
    statuses: []
});
const backgroundRenderMock = vi.fn();
const baselineRenderMock = vi.fn();
const taskRenderMock = vi.fn();
const overlayRenderMock = vi.fn();
const resizeCanvasForDprMock = vi.fn();
const resizeObserverCallbacks: ResizeObserverCallback[] = [];

// Mock engines and renderers
vi.mock('../engines/InteractionEngine', () => ({
    InteractionEngine: class {
        detach() { }
    },
}));

vi.mock('../renderers/BackgroundRenderer', () => ({
    BackgroundRenderer: class {
        render(...args: unknown[]) {
            backgroundRenderMock(...args);
        }
    }
}));

vi.mock('../renderers/BaselineRenderer', () => ({
    BaselineRenderer: class {
        render(...args: unknown[]) {
            baselineRenderMock(...args);
        }
    }
}));

vi.mock('../renderers/TaskRenderer', () => ({
    TaskRenderer: class {
        render(...args: unknown[]) {
            taskRenderMock(...args);
        }
    }
}));

vi.mock('../renderers/OverlayRenderer', () => ({
    OverlayRenderer: class {
        render(...args: unknown[]) {
            overlayRenderMock(...args);
        }
    }
}));

vi.mock('../utils/canvasDpr', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/canvasDpr')>();
    return {
        ...actual,
        resizeCanvasForDpr: (...args: unknown[]) => resizeCanvasForDprMock(...args),
    };
});

class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
        resizeObserverCallbacks.push(callback);
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}

window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

const notifyResizeObservers = (width: number, height: number) => {
    const entry = {
        contentRect: { width, height }
    } as ResizeObserverEntry;

    act(() => {
        resizeObserverCallbacks.forEach((callback) => {
            callback([entry], {} as ResizeObserver);
        });
    });
};

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    font: '',
    measureText: () => ({ width: 0 }),
    beginPath: () => { },
    moveTo: () => { },
    lineTo: () => { },
    stroke: () => { },
    fillRect: () => { },
    fillText: () => { },
    clearRect: () => { },
    setLineDash: () => { },
    translate: () => { },
    scale: () => { },
    save: () => { },
    restore: () => { },
});

vi.mock('./TimelineHeader', () => ({
    TimelineHeader: () => <div data-testid="timeline-header" />,
}));
vi.mock('./UiSidebar', () => ({
    UiSidebar: () => <div data-testid="ui-sidebar" />,
}));
vi.mock('./IssueIframeDialog', () => ({
    IssueIframeDialog: () => <div />,
}));
vi.mock('./GlobalTooltip', () => ({
    GlobalTooltip: () => <div />,
}));
vi.mock('./GanttToolbar', () => ({
    GanttToolbar: () => <div data-testid="gantt-toolbar" />,
}));
vi.mock('../api/client', () => ({
    apiClient: {
        fetchData: (...args: unknown[]) => fetchDataMock(...args)
    }
}));

describe('GanttContainer Resize', () => {
    it('shares one CalendarDate with the task and overlay renderers for each canvas frame', async () => {
        render(<GanttContainer />);

        await waitFor(() => {
            const taskArgs = taskRenderMock.mock.calls.at(-1) ?? [];
            const overlayArgs = overlayRenderMock.mock.calls.at(-1) ?? [];
            const taskToday = taskArgs.at(-1);
            const overlayToday = (overlayArgs[0] as { today?: number } | undefined)?.today;

            expect(taskToday).toEqual(overlayToday);
            expect(Number.isFinite(taskToday as number)).toBe(true);
        });
    });

    it('does not redraw canvases when only the sidebar font size changes', async () => {
        render(<GanttContainer />);

        await waitFor(() => {
            expect(taskRenderMock).toHaveBeenCalled();
        });
        backgroundRenderMock.mockClear();
        baselineRenderMock.mockClear();
        taskRenderMock.mockClear();
        overlayRenderMock.mockClear();

        act(() => {
            useUIStore.getState().setSidebarFontSize(15);
        });

        expect(backgroundRenderMock).not.toHaveBeenCalled();
        expect(baselineRenderMock).not.toHaveBeenCalled();
        expect(taskRenderMock).not.toHaveBeenCalled();
        expect(overlayRenderMock).not.toHaveBeenCalled();
    });

    it('redraws each canvas once when the row height changes', async () => {
        render(<GanttContainer />);

        await waitFor(() => {
            expect(taskRenderMock).toHaveBeenCalled();
        });
        backgroundRenderMock.mockClear();
        baselineRenderMock.mockClear();
        taskRenderMock.mockClear();
        overlayRenderMock.mockClear();

        act(() => {
            useTaskStore.getState().setRowHeight(44);
        });

        expect(backgroundRenderMock).toHaveBeenCalledTimes(1);
        expect(baselineRenderMock).toHaveBeenCalledTimes(1);
        expect(taskRenderMock).toHaveBeenCalledTimes(1);
        expect(overlayRenderMock).toHaveBeenCalledTimes(1);
    });

    beforeEach(() => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        useUIStore.setState({
            sidebarWidth: 300,
            leftPaneVisible: true,
            rightPaneVisible: true,
        });
        useTaskStore.setState({
            viewport: {
                startDate: Date.now(),
                scrollX: 0,
                scrollY: 0,
                scale: 0.001,
                width: 1000,
                height: 600,
                rowHeight: 40
            },
            tasks: [],
            relations: [],
            layoutRows: [],
            rowCount: 0
        });
        useWorkloadStore.setState({
            ...useWorkloadStore.getInitialState(),
            workloadPaneVisible: false,
            workloadData: null
        }, true);
        fetchDataMock.mockClear();
        resizeObserverCallbacks.length = 0;
        vi.clearAllMocks();
        backgroundRenderMock.mockClear();
        baselineRenderMock.mockClear();
        taskRenderMock.mockClear();
        overlayRenderMock.mockClear();
    });

    it('does not notify TaskStore subscribers for repeated identical ResizeObserver sizes', () => {
        const originalUpdateViewport = useTaskStore.getState().updateViewport;
        const updateViewportSpy = vi.fn((updates: Parameters<typeof originalUpdateViewport>[0]) => {
            originalUpdateViewport(updates);
        });
        useTaskStore.setState({ updateViewport: updateViewportSpy });

        const { container } = render(<GanttContainer />);
        const scrollPane = container.querySelector('.rcg-gantt-scroll-pane') as HTMLDivElement;
        Object.defineProperties(scrollPane, {
            clientWidth: { configurable: true, value: 1000 },
            clientHeight: { configurable: true, value: 600 }
        });
        const viewport = useTaskStore.getState().viewport;
        const listener = vi.fn();
        const unsubscribe = useTaskStore.subscribe(listener);

        for (let index = 0; index < 10; index += 1) {
            notifyResizeObservers(1000, 600);
        }

        expect(updateViewportSpy).toHaveBeenCalledTimes(10);
        expect(resizeCanvasForDprMock).toHaveBeenCalledTimes(40);
        expect(listener).not.toHaveBeenCalled();
        expect(useTaskStore.getState().viewport).toBe(viewport);

        unsubscribe();
    });

    it('converges after a row height change when ResizeObserver reports the same size', async () => {
        const { container } = render(<GanttContainer />);
        const scrollPane = container.querySelector('.rcg-gantt-scroll-pane') as HTMLDivElement;
        Object.defineProperties(scrollPane, {
            clientWidth: { configurable: true, value: 1000 },
            clientHeight: { configurable: true, value: 600 }
        });
        await waitFor(() => {
            expect(taskRenderMock).toHaveBeenCalled();
        });
        backgroundRenderMock.mockClear();
        baselineRenderMock.mockClear();
        taskRenderMock.mockClear();
        overlayRenderMock.mockClear();

        const listener = vi.fn();
        const unsubscribe = useTaskStore.subscribe(listener);

        act(() => {
            useTaskStore.getState().setRowHeight(44);
        });
        notifyResizeObservers(1000, 600);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(backgroundRenderMock).toHaveBeenCalledTimes(1);
        expect(baselineRenderMock).toHaveBeenCalledTimes(1);
        expect(taskRenderMock).toHaveBeenCalledTimes(1);
        expect(overlayRenderMock).toHaveBeenCalledTimes(1);

        unsubscribe();
    });

    it('should use ew-resize and restore previous body styles during sidebar resize', async () => {
        render(<GanttContainer />);
        await waitFor(() => {
            expect(baselineRenderMock).toHaveBeenCalled();
        });

        const resizeHandle = screen.getByTestId('sidebar-resize-handle');
        document.body.style.cursor = 'crosshair';
        document.body.style.userSelect = 'text';

        fireEvent.mouseDown(resizeHandle);

        expect(resizeHandle).toHaveStyle(`cursor: ${SIDEBAR_RESIZE_CURSOR}`);
        expect(document.body.style.cursor).toBe(SIDEBAR_RESIZE_CURSOR);
        expect(document.body.style.userSelect).toBe('none');

        fireEvent.mouseUp(document);

        expect(document.body.style.cursor).toBe('crosshair');
        expect(document.body.style.userSelect).toBe('text');
    });

    it('should calculate sidebar width relative to container position', () => {
        const setSidebarWidthSpy = vi.fn();
        useUIStore.setState({ setSidebarWidth: setSidebarWidthSpy });

        render(<GanttContainer />);

        const resizeHandle = screen.getByTestId('sidebar-resize-handle');
        const ganttContainerDiv = resizeHandle.parentElement as HTMLElement;

        const mockRect = {
            left: 100,
            top: 0,
            width: 1000,
            height: 500,
            bottom: 500,
            right: 1100,
            x: 100,
            y: 0,
            toJSON: () => { },
        };
        vi.spyOn(ganttContainerDiv, 'getBoundingClientRect').mockReturnValue(mockRect);

        fireEvent.mouseDown(resizeHandle);

        fireEvent.mouseMove(document, { clientX: 500 });

        fireEvent.mouseUp(document);

        expect(setSidebarWidthSpy).toHaveBeenCalledWith(400);
    });

    it('should cap sidebar width based on right pane minimum width', () => {
        const setSidebarWidthSpy = vi.fn();
        useUIStore.setState({ setSidebarWidth: setSidebarWidthSpy });

        render(<GanttContainer />);

        const resizeHandle = screen.getByTestId('sidebar-resize-handle');
        const ganttContainerDiv = resizeHandle.parentElement as HTMLElement;

        vi.spyOn(ganttContainerDiv, 'getBoundingClientRect').mockReturnValue({
            left: 100,
            top: 0,
            width: 1000,
            height: 500,
            bottom: 500,
            right: 1100,
            x: 100,
            y: 0,
            toJSON: () => { },
        });

        fireEvent.mouseDown(resizeHandle);
        fireEvent.mouseMove(document, { clientX: 1200 });
        fireEvent.mouseUp(document);

        expect(setSidebarWidthSpy).toHaveBeenCalledWith(674);
    });

    it('should clamp sidebar width on window resize', () => {
        const setSidebarWidthSpy = vi.fn();
        useUIStore.setState({
            setSidebarWidth: setSidebarWidthSpy,
            sidebarWidth: 600,
            leftPaneVisible: true,
            rightPaneVisible: true,
        });

        render(<GanttContainer />);

        const resizeHandle = screen.getByTestId('sidebar-resize-handle');
        const ganttContainerDiv = resizeHandle.parentElement as HTMLElement;

        vi.spyOn(ganttContainerDiv, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 800,
            height: 500,
            bottom: 500,
            right: 800,
            x: 0,
            y: 0,
            toJSON: () => { },
        });

        fireEvent(window, new Event('resize'));

        expect(setSidebarWidthSpy).toHaveBeenCalledWith(474);
    });

    it('should hide right pane and resize handle when left pane is maximized', () => {
        useUIStore.setState({
            leftPaneVisible: true,
            rightPaneVisible: false,
        });

        render(<GanttContainer />);

        expect(screen.getByTestId('left-pane')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-resize-handle')).not.toBeInTheDocument();
        expect(screen.getByTestId('right-pane')).toHaveStyle('display: none');
    });

    it('should hide left pane and resize handle when right pane is maximized', () => {
        useUIStore.setState({
            leftPaneVisible: false,
            rightPaneVisible: true,
        });

        render(<GanttContainer />);

        expect(screen.queryByTestId('left-pane')).not.toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-resize-handle')).not.toBeInTheDocument();
        expect(screen.getByTestId('right-pane')).toHaveStyle('display: flex');
    });

    it('updates the workload split ratio when dragging the horizontal split handle', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadPaneVisible: true,
            workloadData: {
                assignees: new Map(),
                overloadedAssigneeCount: 0,
                overloadedDayCount: 0
            }
        });

        render(<GanttContainer />);

        const layout = screen.getByTestId('workload-split-layout-left');
        const handle = screen.getByTestId('workload-split-handle-left');
        const initialRows = layout.style.gridTemplateRows;

        vi.spyOn(layout, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 300,
            height: 600,
            bottom: 600,
            right: 300,
            x: 0,
            y: 0,
            toJSON: () => { },
        });

        fireEvent.mouseDown(handle, { clientY: 360 });
        fireEvent.mouseMove(window, { clientY: 240 });
        fireEvent.mouseUp(window);

        expect(layout.style.gridTemplateRows).not.toBe(initialRows);
        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });

    it('keeps s-resize active with a drag overlay during workload split resize', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadPaneVisible: true,
            workloadData: {
                assignees: new Map(),
                overloadedAssigneeCount: 0,
                overloadedDayCount: 0
            }
        });

        render(<GanttContainer />);

        const layout = screen.getByTestId('workload-split-layout-left');
        const handle = screen.getByTestId('workload-split-handle-left');

        expect(handle).toHaveStyle({ cursor: 's-resize' });
        expect(screen.queryByTestId('workload-resize-overlay')).not.toBeInTheDocument();

        vi.spyOn(layout, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 300,
            height: 600,
            bottom: 600,
            right: 300,
            x: 0,
            y: 0,
            toJSON: () => { },
        });

        fireEvent.mouseDown(handle, { clientY: 360 });
        expect(document.body.style.cursor).toBe('s-resize');
        expect(screen.getByTestId('workload-resize-overlay')).toHaveStyle({
            cursor: 's-resize',
            position: 'fixed'
        });

        fireEvent.mouseUp(window);
        expect(document.body.style.cursor).toBe('');
        expect(screen.queryByTestId('workload-resize-overlay')).not.toBeInTheDocument();
    });

    it('keeps the gantt viewport DOM stable when toggling the workload pane', () => {
        const { container } = render(<GanttContainer />);

        const initialScrollPane = container.querySelector('.rcg-gantt-scroll-pane');
        const initialViewport = container.querySelector('.rcg-gantt-viewport');
        const initialCanvases = container.querySelectorAll('.rcg-gantt-viewport canvas');

        expect(initialScrollPane).not.toBeNull();
        expect(initialViewport).not.toBeNull();
        expect(initialCanvases).toHaveLength(4);

        act(() => {
            useWorkloadStore.setState({
                ...useWorkloadStore.getState(),
                workloadPaneVisible: true,
                workloadData: {
                    assignees: new Map(),
                    overloadedAssigneeCount: 0,
                    overloadedDayCount: 0
                }
            });
        });

        const nextScrollPane = container.querySelector('.rcg-gantt-scroll-pane');
        const nextViewport = container.querySelector('.rcg-gantt-viewport');
        const nextCanvases = container.querySelectorAll('.rcg-gantt-viewport canvas');

        expect(nextScrollPane).toBe(initialScrollPane);
        expect(nextViewport).toBe(initialViewport);
        expect(nextCanvases).toHaveLength(4);
        expect(screen.getByTestId('workload-split-layout-right')).toBeInTheDocument();
    });

    it('renders task and overlay canvases from the same updated task snapshot', async () => {
        const taskA: Task = {
            id: 'A',
            subject: 'Task A',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };
        const taskB: Task = {
            id: 'B',
            subject: 'Task B',
            startDate: 2,
            dueDate: 3,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 1,
            hasChildren: false
        };
        const relation: Relation = { id: 'r1', from: 'A', to: 'B', type: 'precedes' };

        fetchDataMock.mockResolvedValueOnce({
            tasks: [taskA, taskB],
            relations: [relation],
            versions: [],
            statuses: []
        });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 1000,
                height: 600,
                rowHeight: 40
            },
            tasks: [taskA, taskB],
            allTasks: [taskA, taskB],
            relations: [relation],
            layoutRows: [],
            rowCount: 2,
            zoomLevel: 2
        });

        render(<GanttContainer />);

        await waitFor(() => {
            const latestTaskRenderArgs = taskRenderMock.mock.calls.at(-1) ?? [];
            const taskRenderTasks = latestTaskRenderArgs[1] as Task[] | undefined;
            expect(taskRenderTasks?.find((task) => task.id === 'B')?.startDate).toBe(2);
        });

        const updatedTaskB: Task = { ...taskB, startDate: 4, dueDate: 5 };
        await act(async () => {
            useTaskStore.setState((state) => ({
                tasks: [state.tasks[0], updatedTaskB],
                allTasks: [state.allTasks[0], updatedTaskB]
            }));
        });

        await waitFor(() => {
            const latestTaskRenderArgs = taskRenderMock.mock.calls.at(-1) ?? [];
            const latestOverlayRenderArgs = overlayRenderMock.mock.calls.at(-1) ?? [];
            const taskRenderTasks = latestTaskRenderArgs[1] as Task[] | undefined;
            const overlayRenderState = latestOverlayRenderArgs[0] as { tasks?: Task[] } | undefined;
            const overlayRenderTasks = overlayRenderState?.tasks;

            expect(taskRenderTasks?.find((task) => task.id === 'B')?.startDate).toBe(4);
            expect(overlayRenderTasks?.find((task) => task.id === 'B')?.startDate).toBe(4);
        });
    });
});
