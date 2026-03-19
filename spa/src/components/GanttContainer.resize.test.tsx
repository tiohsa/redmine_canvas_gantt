import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GanttContainer } from './GanttContainer';
import { useUIStore } from '../stores/UIStore';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTaskStore } from '../stores/TaskStore';
import { SIDEBAR_RESIZE_CURSOR } from '../constants';
import type { Relation, Task } from '../types';

const fetchDataMock = vi.fn().mockResolvedValue({
    tasks: [],
    relations: [],
    versions: [],
    statuses: []
});
const backgroundRenderMock = vi.fn();
const taskRenderMock = vi.fn();
const overlayRenderMock = vi.fn();

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

// Mock ResizeObserver
window.ResizeObserver = vi.fn().mockImplementation(function () {
    return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
    };
});

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    font: '',
    measureText: () => ({ width: 0 }),
    beginPath: () => { },
    moveTo: () => { },
    lineTo: () => { },
    stroke: () => { },
    fillText: () => { },
    clearRect: () => { },
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
        fetchDataMock.mockClear();
        vi.clearAllMocks();
        backgroundRenderMock.mockClear();
        taskRenderMock.mockClear();
        overlayRenderMock.mockClear();
    });

    it('should use ew-resize and restore previous body styles during sidebar resize', () => {
        render(<GanttContainer />);

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
