import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UiSidebar } from './UiSidebar';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task } from '../types';
import { useEditMetaStore } from '../stores/EditMetaStore';
import { SIDEBAR_RESIZE_CURSOR, SIDEBAR_DRAG_EDGE_TOLERANCE } from '../constants';
import { resetCanvasGanttTestState } from '../test/testSetup';
import { buildColumnSettingsFromVisibleKeys } from '../components/sidebar/sidebarColumnSettings';
import { getColumnDefinitions } from '../components/sidebar/sidebarColumnCatalog';

describe('UiSidebar', () => {
    const initialUpdateViewport = useTaskStore.getState().updateViewport;

    const createMockDataTransfer = (): DataTransfer => {
        const values = new Map<string, string>();

        return {
            effectAllowed: 'all',
            dropEffect: 'move',
            setData: vi.fn((type: string, value: string) => {
                values.set(type, value);
            }),
            getData: vi.fn((type: string) => values.get(type) ?? '')
        } as unknown as DataTransfer;
    };

    const stubAnimationFrames = () => {
        const callbacks: FrameRequestCallback[] = [];
        const cancelAnimationFrame = vi.fn();

        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            callbacks.push(callback);
            return callbacks.length;
        }));
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

        return { callbacks, cancelAnimationFrame };
    };

    const createDragEvent = (
        type: 'dragStart' | 'dragOver' | 'dragEnd',
        element: Element,
        dataTransfer: DataTransfer,
        clientY?: number
    ) => {
        const event = createEvent[type](element, { dataTransfer });

        if (clientY !== undefined) {
            Object.defineProperty(event, 'clientY', {
                configurable: true,
                value: clientY
            });
        }

        return event;
    };

    const runNextAnimationFrame = async (callbacks: FrameRequestCallback[]) => {
        const callback = callbacks.shift();
        if (!callback) return;

        await act(async () => {
            callback(0);
        });
    };

    const expectNotificationSprite = (testId: string) => {
        const badge = screen.getByTestId(testId);
        const svg = badge.querySelector('svg');

        expect(svg).toBeInTheDocument();

        const useElement = svg?.querySelector('use');
        expect(useElement).toBeInTheDocument();
        expect(useElement?.getAttribute('href') ?? useElement?.getAttribute('xlink:href')).toMatch(/^#/);
    };

    beforeEach(() => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resetCanvasGanttTestState();
    });

    afterEach(() => {
        useTaskStore.setState({ updateViewport: initialUpdateViewport });
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('shows task id column', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id']);
        useUIStore.setState({ visibleColumns: ['id'], columnSettings });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '123',
            subject: 'Task 123',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        expect(screen.getByText('ID')).toBeInTheDocument();
        expect(screen.getByTestId('task-id-123')).toHaveTextContent('123');
    });

    it('shows a visible border between sidebar columns', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'subject']);
        useUIStore.setState({ visibleColumns: ['id', 'subject'], columnSettings });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '124',
            subject: 'Border visibility task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        expect(screen.getByTestId('sidebar-header-id')).toHaveStyle({ borderRight: '1px solid #e0e0e0' });

        const cellWrapper = screen.getByTestId('cell-124-id').parentElement;
        expect(cellWrapper).toBeTruthy();
        expect(cellWrapper).toHaveStyle({ borderRight: '1px solid #e0e0e0' });
        expect(screen.getByTestId('task-row-124')).toHaveStyle({ borderBottom: '1px solid #e0e0e0' });
        expect(screen.queryByTestId('sidebar-column-resize-handle-subject')).not.toBeInTheDocument();
    });

    it('hides hierarchy guide lines when the toggle is off', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']);
        useUIStore.setState({ visibleColumns: ['subject'], columnSettings, showHierarchyLines: true });

        const task: Task = {
            id: '126',
            subject: 'Hierarchy line task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: true,
            treeLevelGuides: [true, true],
            isLastChild: false
        };

        useTaskStore.setState({
            tasks: [task],
            layoutRows: [{ type: 'task', taskId: task.id, rowIndex: 0 }],
            rowCount: 1,
            selectedTaskId: null,
            taskExpansion: {},
            projectExpansion: {},
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            }
        });

        const { rerender } = render(<UiSidebar />);

        expect(screen.getAllByTestId('task-tree-guide-line')).not.toHaveLength(0);
        expect(screen.getAllByTestId('task-tree-current-guide')).not.toHaveLength(0);
        expect(screen.getAllByTestId('task-tree-branch-guide')).not.toHaveLength(0);

        useUIStore.setState({ showHierarchyLines: false });
        rerender(<UiSidebar />);

        expect(screen.queryAllByTestId('task-tree-guide-line')).toHaveLength(0);
        expect(screen.queryAllByTestId('task-tree-current-guide')).toHaveLength(0);
        expect(screen.queryAllByTestId('task-tree-branch-guide')).toHaveLength(0);
    });

    it('keeps task rows draggable while using pointer cursor', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'status']);
        useUIStore.setState({ visibleColumns: ['id', 'status'], columnSettings });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '125',
            subject: 'Draggable task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            statusName: 'New',
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const taskRow = screen.getByTestId('task-row-125');
        expect(taskRow).toHaveAttribute('draggable', 'true');
        expect(getComputedStyle(taskRow).cursor).toBe('pointer');
    });

    it('prevents drag start when mouse is near the right edge of the sidebar', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']);
        useUIStore.setState({ visibleColumns: ['subject'], columnSettings });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '127',
            subject: 'Edge drag test task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const taskRow = screen.getByTestId('task-row-127');

        // Mock getBoundingClientRect
        vi.spyOn(taskRow, 'getBoundingClientRect').mockReturnValue({
            right: 300,
            width: 300,
            left: 0,
            top: 0,
            bottom: 32,
            height: 32,
            x: 0,
            y: 0,
            toJSON: () => { }
        } as DOMRect);

        const dataTransfer = createMockDataTransfer();

        // Case 1: Near the edge (within SIDEBAR_DRAG_EDGE_TOLERANCE)
        const edgeEvent = createDragEvent('dragStart', taskRow, dataTransfer);
        Object.defineProperty(edgeEvent, 'clientX', { value: 300 - (SIDEBAR_DRAG_EDGE_TOLERANCE - 5) });

        const preventDefaultSpy = vi.spyOn(edgeEvent, 'preventDefault');

        fireEvent(taskRow, edgeEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(dataTransfer.setData).not.toHaveBeenCalled();

        // Case 2: Far from the edge
        const centerEvent = createDragEvent('dragStart', taskRow, dataTransfer);
        centerEvent.preventDefault = vi.fn();
        Object.defineProperty(centerEvent, 'clientX', { value: 300 - (SIDEBAR_DRAG_EDGE_TOLERANCE + 5) });

        fireEvent(taskRow, centerEvent);

        expect(centerEvent.preventDefault).not.toHaveBeenCalled();
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '127');
    });

    it('uses ew-resize and restores previous body styles during column resize', async () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'status', 'ratioDone']);
        useUIStore.setState({ visibleColumns: ['id', 'status', 'ratioDone'], columnSettings });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '126',
            subject: 'Resizable column task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            statusName: 'New',
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const resizeHandle = screen.getByTestId('sidebar-column-resize-handle-status');
        document.body.style.cursor = 'crosshair';
        document.body.style.userSelect = 'text';

        fireEvent.mouseDown(resizeHandle, { clientX: 320 });

        await waitFor(() => {
            expect(resizeHandle).toHaveStyle(`cursor: ${SIDEBAR_RESIZE_CURSOR}`);
            expect(document.body.style.cursor).toBe(SIDEBAR_RESIZE_CURSOR);
            expect(document.body.style.userSelect).toBe('none');
        });

        fireEvent.mouseUp(window);

        await waitFor(() => {
            expect(document.body.style.cursor).toBe('crosshair');
            expect(document.body.style.userSelect).toBe('text');
        });
    });

    it('double click on start date cell starts inline edit and saves', async () => {
        const taskId = '123';

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: { button_edit: 'Edit', field_subject: 'Subject', field_assigned_to: 'Assignee', field_status: 'Status', field_done_ratio: 'Done', field_due_date: 'Due', label_none: 'Unassigned' },
            settings: { inline_edit_start_date: '1' }
        };

        useUIStore.setState({ visibleColumns: ['id', 'startDate'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'startDate']) });
        useEditMetaStore.setState({ metaByTaskId: {}, loadingTaskId: null, error: null });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false,
            selectedTaskId: null,
            modifiedTaskIds: new Set()
        });

        const task: Task = {
            id: taskId,
            subject: 'Old',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-startDate`);
        fireEvent.doubleClick(cell);

        // Date input is likely not 'textbox' role
        // Use selector
        const input = await waitFor(() => {
            const el = document.querySelector('input[type="date"]');
            if (!el) throw new Error('Date input not found');
            return el;
        });

        fireEvent.change(input, { target: { value: '2025-01-02' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Date changes should update local state only (for batch save)
        await waitFor(() => {
            const t = useTaskStore.getState().allTasks[0];
            const expectedDate = new Date('2025-01-02').getTime();
            expect(t?.startDate).toBe(expectedDate);
        });

        // Verify task is marked for batch save
        expect(useTaskStore.getState().modifiedTaskIds.has(taskId)).toBe(true);
    });

    it('shows the version inline edit empty option using the version-specific unset label', async () => {
        const taskId = '124';

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: {
                button_edit: 'Edit',
                field_version: 'Target Version',
                label_none: '未設定',
                label_unassigned: '担当なし'
            }
        };

        useUIStore.setState({
            visibleColumns: ['id', 'version'],
            columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'version'])
        });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false,
            selectedTaskId: null,
            customFields: []
        });
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: {
                        id: taskId,
                        subject: 'Version task',
                        assignedToId: null,
                        statusId: 1,
                        doneRatio: 0,
                        dueDate: '2025-01-01',
                        startDate: '2025-01-01',
                        priorityId: 1,
                        categoryId: null,
                        estimatedHours: null,
                        projectId: 1,
                        trackerId: 1,
                        fixedVersionId: null,
                        lockVersion: 1
                    },
                    editable: {
                        subject: true,
                        assignedToId: true,
                        statusId: true,
                        doneRatio: true,
                        dueDate: true,
                        startDate: true,
                        priorityId: true,
                        categoryId: true,
                        estimatedHours: true,
                        projectId: true,
                        trackerId: true,
                        fixedVersionId: true,
                        customFieldValues: true
                    },
                    options: {
                        statuses: [],
                        assignees: [],
                        priorities: [],
                        categories: [],
                        projects: [],
                        trackers: [],
                        versions: [{ id: 7, name: 'Release 1' }],
                        customFields: []
                    },
                    customFieldValues: {}
                }
            },
            loadingTaskId: null,
            error: null
        });

        const task: Task = {
            id: taskId,
            subject: 'Version task',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };
        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-version`);
        fireEvent.doubleClick(cell);

        const select = await screen.findByRole('combobox');
        expect(screen.getByRole('option', { name: '未設定' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: '担当なし' })).not.toBeInTheDocument();
        expect(select).toBeInTheDocument();
    });

    it('shows tooltip on task subject hover', () => {
        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '124',
            subject: 'Long Task Subject For Tooltip Test',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const subjectLink = screen.getByText('Long Task Subject For Tooltip Test');
        expect(subjectLink).toHaveAttribute('data-tooltip', 'Long Task Subject For Tooltip Test');
    });

    it('opens issue dialog and link href with redmineBase prefix', async () => {
        window.RedmineCanvasGantt = {
            ...(window.RedmineCanvasGantt ?? {
                projectId: 1,
                apiBase: '',
                redmineBase: '',
                authToken: '',
                apiKey: '',
                nonWorkingWeekDays: [],
                i18n: {}
            }),
            redmineBase: '/redmine'
        };

        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '321',
            subject: 'Subdir Issue',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const subjectLink = screen.getByText('Subdir Issue');
        expect(subjectLink).toHaveAttribute('href', '/redmine/issues/321');

        fireEvent.click(subjectLink);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/issues/321');
        });
    });

    it('selects the row when clicking empty space in the subject column', async () => {
        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '322',
            subject: 'Selection target',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        fireEvent.click(screen.getByTestId('cell-322-subject'));

        await waitFor(() => {
            expect(useTaskStore.getState().selectedTaskId).toBe('322');
        });
        expect(useUIStore.getState().issueDialogUrl).toBeNull();
        expect(screen.getByTestId('task-row-322')).toHaveClass('is-selected');
    });

    it('renders notification column for unscheduled tasks when enabled in visibleColumns', () => {
        useUIStore.setState({ visibleColumns: ['notification', 'subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['notification', 'subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '901',
            subject: 'Unscheduled task',
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);
        useTaskStore.setState({
            schedulingStates: {
                '901': {
                    state: 'unscheduled',
                    message: 'This task has no dates and is excluded from auto scheduling.'
                }
            }
        });

        render(<UiSidebar />);

        expect(screen.getByTestId('sidebar-header-notification')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-header-notification')).toHaveStyle({ justifyContent: 'center' });
        expectNotificationSprite('task-notification-badge-unscheduled-901');
        expect(screen.getByTestId('cell-901-notification')).toHaveStyle({ justifyContent: 'center' });
        expect(screen.getByTestId('task-notification-badge-unscheduled-901')).toHaveStyle({
            width: '18px',
            height: '18px'
        });
        expect(screen.queryByTestId('task-scheduling-badge-901')).not.toBeInTheDocument();
    });

    it('hides notification column when it is not enabled in visibleColumns', () => {
        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '902',
            subject: 'Conflicted task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);
        useTaskStore.setState({
            schedulingStates: {
                '902': {
                    state: 'conflicted',
                    message: 'This task violates a scheduling dependency.'
                }
            }
        });

        render(<UiSidebar />);

        expect(screen.queryByTestId('sidebar-header-notification')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-notification-badge-conflicted-902')).not.toBeInTheDocument();
    });

    it('shows conflicted scheduling warnings in the dedicated notification column when enabled', () => {
        useUIStore.setState({ visibleColumns: ['notification', 'subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['notification', 'subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '903',
            subject: 'Conflicted task visible',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);
        useTaskStore.setState({
            schedulingStates: {
                '903': {
                    state: 'conflicted',
                    message: 'This task violates a scheduling dependency.'
                }
            }
        });

        render(<UiSidebar />);

        expectNotificationSprite('task-notification-badge-conflicted-903');
        expect(screen.getByTestId('task-notification-badge-conflicted-903')).toHaveAttribute(
            'data-tooltip',
            'This task violates a scheduling dependency.'
        );
    });

    it('shows critical path badge in the notification column when there is no scheduling warning', () => {
        useUIStore.setState({ visibleColumns: ['notification', 'subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['notification', 'subject']) });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false
        });

        const task: Task = {
            id: '904',
            subject: 'Critical path task',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);
        useTaskStore.setState({
            schedulingStates: {},
            criticalPathMetrics: {
                '904': {
                    taskId: '904',
                    durationDays: 1,
                    es: 0,
                    ef: 1,
                    ls: 0,
                    lf: 1,
                    totalSlackDays: 0,
                    critical: true
                }
            }
        });

        render(<UiSidebar />);

        expectNotificationSprite('task-notification-badge-critical-904');
        expect(screen.getByTestId('task-notification-badge-critical-904')).toHaveAttribute(
            'data-tooltip',
            'Critical path task. Total slack: 0 working day(s).'
        );
    });

    it('allows inline edit for custom field when setting is enabled', async () => {
        const taskId = '201';
        const customFieldId = 10;

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: { button_edit: 'Edit', label_yes: 'Yes', label_no: 'No', label_custom_field_plural: 'Custom fields' },
            settings: { inline_edit_custom_fields: '1' }
        };

        useUIStore.setState({ visibleColumns: ['id', `cf:${customFieldId}`], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', `cf:${customFieldId}`]) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false,
            selectedTaskId: null,
            customFields: [{
                id: customFieldId,
                name: 'Client Code',
                fieldFormat: 'string',
                isRequired: false
            }]
        });
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: { id: taskId, subject: 'CF task', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: '2025-01-01', startDate: '2025-01-01', priorityId: 1, categoryId: null, estimatedHours: null, projectId: 1, trackerId: 1, fixedVersionId: null, lockVersion: 1 },
                    editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, startDate: true, priorityId: true, categoryId: true, estimatedHours: true, projectId: true, trackerId: true, fixedVersionId: true, customFieldValues: true },
                    options: {
                        statuses: [{ id: 1, name: 'New' }],
                        assignees: [],
                        priorities: [],
                        categories: [],
                        projects: [],
                        trackers: [],
                        versions: [],
                        customFields: [{ id: customFieldId, name: 'Client Code', fieldFormat: 'string', isRequired: false }]
                    },
                    customFieldValues: { [String(customFieldId)]: 'A-001' }
                }
            },
            loadingTaskId: null,
            error: null
        });

        const task: Task = {
            id: taskId,
            subject: 'CF task',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false,
            customFieldValues: { [String(customFieldId)]: 'A-001' }
        };
        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-cf:${customFieldId}`);
        fireEvent.doubleClick(cell);

        await waitFor(() => {
            expect(document.querySelector('input[type="text"]')).toBeTruthy();
        });
    });

    it('prevents inline edit for custom field when setting is disabled', async () => {
        const taskId = '202';
        const customFieldId = 10;

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: { button_edit: 'Edit', label_yes: 'Yes', label_no: 'No', label_custom_field_plural: 'Custom fields' },
            settings: { inline_edit_custom_fields: '0' }
        };

        useUIStore.setState({ visibleColumns: ['id', `cf:${customFieldId}`], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', `cf:${customFieldId}`]) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false,
            selectedTaskId: null,
            customFields: [{
                id: customFieldId,
                name: 'Client Code',
                fieldFormat: 'string',
                isRequired: false
            }]
        });
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: { id: taskId, subject: 'CF task', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: '2025-01-01', startDate: '2025-01-01', priorityId: 1, categoryId: null, estimatedHours: null, projectId: 1, trackerId: 1, fixedVersionId: null, lockVersion: 1 },
                    editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, startDate: true, priorityId: true, categoryId: true, estimatedHours: true, projectId: true, trackerId: true, fixedVersionId: true, customFieldValues: true },
                    options: {
                        statuses: [{ id: 1, name: 'New' }],
                        assignees: [],
                        priorities: [],
                        categories: [],
                        projects: [],
                        trackers: [],
                        versions: [],
                        customFields: [{ id: customFieldId, name: 'Client Code', fieldFormat: 'string', isRequired: false }]
                    },
                    customFieldValues: { [String(customFieldId)]: 'A-001' }
                }
            },
            loadingTaskId: null,
            error: null
        });

        const task: Task = {
            id: taskId,
            subject: 'CF task',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false,
            customFieldValues: { [String(customFieldId)]: 'A-001' }
        };
        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-cf:${customFieldId}`);
        fireEvent.doubleClick(cell);

        await waitFor(() => {
            expect(document.querySelector('input[type="text"]')).toBeNull();
        });
    });

    it('sizes status inline edit control from row height', async () => {
        const taskId = '301';

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: {
                button_edit: 'Edit',
                field_status: 'Status',
                label_loading: 'Loading...'
            },
            settings: { inline_edit_status: '1' }
        };

        useUIStore.setState({ visibleColumns: ['id', 'status'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'status']), activeInlineEdit: null });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 20
            },
            groupByProject: false,
            selectedTaskId: null,
            customFields: []
        });
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: {
                        id: taskId,
                        subject: 'Compact row task',
                        assignedToId: null,
                        statusId: 1,
                        doneRatio: 0,
                        dueDate: '2025-01-01',
                        startDate: '2025-01-01',
                        priorityId: 1,
                        categoryId: null,
                        estimatedHours: null,
                        projectId: 1,
                        trackerId: 1,
                        fixedVersionId: null,
                        lockVersion: 1
                    },
                    editable: {
                        subject: true,
                        assignedToId: true,
                        statusId: true,
                        doneRatio: true,
                        dueDate: true,
                        startDate: true,
                        priorityId: true,
                        categoryId: true,
                        estimatedHours: true,
                        projectId: true,
                        trackerId: true,
                        fixedVersionId: true,
                        customFieldValues: true
                    },
                    options: {
                        statuses: [{ id: 1, name: 'New' }, { id: 2, name: 'Closed' }],
                        assignees: [],
                        priorities: [],
                        categories: [],
                        projects: [],
                        trackers: [],
                        versions: [],
                        customFields: []
                    },
                    customFieldValues: {}
                }
            },
            loadingTaskId: null,
            error: null
        });

        const task: Task = {
            id: taskId,
            subject: 'Compact row task',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };
        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-status`);
        fireEvent.doubleClick(cell);

        const select = await screen.findByRole('combobox');
        expect(select).toHaveStyle({ height: '20px', padding: '0 24px 0 8px' });
    });

    it('uses 0.5-step numeric input for estimated hours inline edit', async () => {
        const taskId = '302';

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: {
                button_edit: 'Edit',
                field_estimated_hours: 'Estimated Time'
            },
            settings: { inline_edit_estimated_hours: '1' }
        };

        useUIStore.setState({ visibleColumns: ['id', 'estimatedHours'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'estimatedHours']), activeInlineEdit: null });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 24
            },
            groupByProject: false,
            selectedTaskId: null,
            customFields: []
        });
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: {
                        id: taskId,
                        subject: 'Estimated hours task',
                        assignedToId: null,
                        statusId: 1,
                        doneRatio: 0,
                        dueDate: '2025-01-01',
                        startDate: '2025-01-01',
                        priorityId: 1,
                        categoryId: null,
                        estimatedHours: 1.5,
                        projectId: 1,
                        trackerId: 1,
                        fixedVersionId: null,
                        lockVersion: 1
                    },
                    editable: {
                        subject: true,
                        assignedToId: true,
                        statusId: true,
                        doneRatio: true,
                        dueDate: true,
                        startDate: true,
                        priorityId: true,
                        categoryId: true,
                        estimatedHours: true,
                        projectId: true,
                        trackerId: true,
                        fixedVersionId: true,
                        customFieldValues: true
                    },
                    options: {
                        statuses: [],
                        assignees: [],
                        priorities: [],
                        categories: [],
                        projects: [],
                        trackers: [],
                        versions: [],
                        customFields: []
                    },
                    customFieldValues: {}
                }
            },
            loadingTaskId: null,
            error: null
        });

        const task: Task = {
            id: taskId,
            subject: 'Estimated hours task',
            startDate: new Date('2025-01-01').getTime(),
            dueDate: new Date('2025-01-05').getTime(),
            ratioDone: 0,
            statusId: 1,
            estimatedHours: 1.5,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };
        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-estimatedHours`);
        fireEvent.doubleClick(cell);

        const input = await screen.findByRole('spinbutton');
        expect(input).toHaveAttribute('step', '0.5');
        expect(input).toHaveAttribute('min', '0');
        expect(screen.getByText('h')).toBeInTheDocument();
        expect(screen.queryByText('%')).not.toBeInTheDocument();
    });

    it('auto-scrolls from row dragover near the body edge and keeps the child highlight', async () => {
        const { callbacks } = stubAnimationFrames();
        const realUpdateViewport = useTaskStore.getState().updateViewport;
        const updateViewportSpy = vi.fn((updates: Parameters<typeof realUpdateViewport>[0]) => {
            realUpdateViewport(updates);
        });

        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 80,
                rowHeight: 32
            },
            groupByProject: false,
            updateViewport: updateViewportSpy
        });

        useTaskStore.getState().setTasks([
            {
                id: 'source',
                subject: 'Source',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            },
            {
                id: 'target',
                subject: 'Target',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 1,
                hasChildren: false
            }
        ]);

        render(<UiSidebar />);

        const body = screen.getByTestId('sidebar-body');
        Object.defineProperty(body, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
        });

        const sourceRow = screen.getByTestId('task-row-source');
        const targetRow = screen.getByTestId('task-row-target');
        const dataTransfer = createMockDataTransfer();

        await act(async () => {
            fireEvent(sourceRow, createDragEvent('dragStart', sourceRow, dataTransfer));
            fireEvent(targetRow, createDragEvent('dragOver', targetRow, dataTransfer, 198));
        });

        expect(targetRow).toHaveStyle({ backgroundColor: '#e6f4ea' });
        expect(updateViewportSpy).not.toHaveBeenCalled();

        await runNextAnimationFrame(callbacks);

        await waitFor(() => {
            expect(updateViewportSpy).toHaveBeenCalled();
            expect(useTaskStore.getState().viewport.scrollY).toBeGreaterThan(0);
        });
        expect(targetRow).toHaveStyle({ backgroundColor: '#e6f4ea' });
    });

    it('keeps the root drop highlight while auto-scrolling over the body background', async () => {
        const { callbacks } = stubAnimationFrames();
        const realUpdateViewport = useTaskStore.getState().updateViewport;
        const updateViewportSpy = vi.fn((updates: Parameters<typeof realUpdateViewport>[0]) => {
            realUpdateViewport(updates);
        });

        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 64,
                scale: 1,
                width: 800,
                height: 120,
                rowHeight: 32
            },
            groupByProject: false,
            updateViewport: updateViewportSpy
        });

        useTaskStore.getState().setTasks([
            {
                id: 'filler-1',
                subject: 'Filler 1',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            },
            {
                id: 'filler-2',
                subject: 'Filler 2',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 1,
                hasChildren: false
            },
            {
                id: 'child',
                subject: 'Child task',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                parentId: 'parent',
                rowIndex: 2,
                hasChildren: false
            }
        ]);

        render(<UiSidebar />);

        const body = screen.getByTestId('sidebar-body');
        Object.defineProperty(body, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
        });

        const sourceRow = screen.getByTestId('task-row-child');
        const dataTransfer = createMockDataTransfer();

        await act(async () => {
            fireEvent(sourceRow, createDragEvent('dragStart', sourceRow, dataTransfer));
            fireEvent(body, createDragEvent('dragOver', body, dataTransfer, 2));
        });

        expect(body).toHaveStyle({ backgroundColor: '#fff8e1' });

        await runNextAnimationFrame(callbacks);

        await waitFor(() => {
            expect(updateViewportSpy).toHaveBeenCalled();
            expect(useTaskStore.getState().viewport.scrollY).toBeLessThan(64);
        });
        expect(body).toHaveStyle({ backgroundColor: '#fff8e1' });
    });

    it('stops the scheduled auto-scroll when dragging ends', async () => {
        const { callbacks, cancelAnimationFrame } = stubAnimationFrames();

        useUIStore.setState({ visibleColumns: ['subject'], columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['subject']) });
        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 120,
                rowHeight: 32
            },
            groupByProject: false
        });

        useTaskStore.getState().setTasks([
            {
                id: 'source',
                subject: 'Source',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            },
            {
                id: 'target',
                subject: 'Target',
                startDate: 0,
                dueDate: 1,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 0,
                editable: true,
                rowIndex: 1,
                hasChildren: false
            }
        ]);

        render(<UiSidebar />);

        const body = screen.getByTestId('sidebar-body');
        Object.defineProperty(body, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
        });

        const sourceRow = screen.getByTestId('task-row-source');
        const targetRow = screen.getByTestId('task-row-target');
        const dataTransfer = createMockDataTransfer();

        await act(async () => {
            fireEvent(sourceRow, createDragEvent('dragStart', sourceRow, dataTransfer));
            fireEvent(targetRow, createDragEvent('dragOver', targetRow, dataTransfer, 198));
        });
        await runNextAnimationFrame(callbacks);

        await act(async () => {
            fireEvent(sourceRow, createDragEvent('dragEnd', sourceRow, dataTransfer));
        });

        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
