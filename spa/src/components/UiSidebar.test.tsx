import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent, waitFor } from '@testing-library/react';
import { UiSidebar } from './UiSidebar';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task } from '../types';
import { useEditMetaStore } from '../stores/EditMetaStore';

describe('UiSidebar', () => {
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
});
