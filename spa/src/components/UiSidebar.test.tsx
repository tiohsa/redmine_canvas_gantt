import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent, waitFor } from '@testing-library/react';
import { UiSidebar } from './UiSidebar';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task } from '../types';
import { useEditMetaStore } from '../stores/EditMetaStore';
import { SIDEBAR_RESIZE_CURSOR } from '../constants';

describe('UiSidebar', () => {
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
    });

    it('shows task id column', () => {
        useUIStore.setState({ visibleColumns: ['id'] });

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

    it('keeps task rows draggable while using pointer cursor', () => {
        useUIStore.setState({ visibleColumns: ['id', 'status'] });

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

    it('uses ew-resize and restores previous body styles during column resize', async () => {
        useUIStore.setState({ visibleColumns: ['id', 'status'] });

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

        useUIStore.setState({ visibleColumns: ['id', 'startDate'] });
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

    it('shows tooltip on task subject hover', () => {
        useUIStore.setState({ visibleColumns: ['subject'] });

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

        useUIStore.setState({ visibleColumns: ['subject'] });
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

    it('renders notification column for unscheduled tasks when enabled in visibleColumns', () => {
        useUIStore.setState({ visibleColumns: ['notification', 'subject'] });

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
        expectNotificationSprite('task-notification-badge-unscheduled-901');
        expect(screen.queryByTestId('task-scheduling-badge-901')).not.toBeInTheDocument();
    });

    it('hides notification column when it is not enabled in visibleColumns', () => {
        useUIStore.setState({ visibleColumns: ['subject'] });

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
        useUIStore.setState({ visibleColumns: ['notification', 'subject'] });

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
        useUIStore.setState({ visibleColumns: ['notification', 'subject'] });

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

        useUIStore.setState({ visibleColumns: ['id', `cf:${customFieldId}`] });
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

        useUIStore.setState({ visibleColumns: ['id', `cf:${customFieldId}`] });
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

        useUIStore.setState({ visibleColumns: ['id', 'status'], activeInlineEdit: null });
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
});
