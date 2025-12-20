import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskDetailPanel } from './TaskDetailPanel';
import { useTaskStore } from '../stores/TaskStore';
import { useEditMetaStore } from '../stores/EditMetaStore';

describe('TaskDetailPanel', () => {
    it('updates subject and persists via API', async () => {
        const taskId = '10';
        useTaskStore.setState({
            allTasks: [{
                id: taskId,
                subject: 'Old',
                startDate: 0,
                dueDate: 0,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 1,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            }],
            tasks: [{
                id: taskId,
                subject: 'Old',
                startDate: 0,
                dueDate: 0,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 1,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            }],
            selectedTaskId: taskId
        });

        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: { id: taskId, subject: 'Old', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: '2025-01-01', lockVersion: 1 },
                    editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, customFieldValues: false },
                    options: { statuses: [{ id: 1, name: 'New' }], assignees: [], customFields: [] },
                    customFieldValues: {}
                }
            },
            loadingTaskId: null,
            error: null
        });

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 't',
            apiKey: 'k',
            settings: { inline_edit_subject: '1' },
            i18n: { button_edit: 'Edit', field_subject: 'Subject', field_assigned_to: 'Assignee', field_status: 'Status', field_done_ratio: 'Done', field_due_date: 'Due' }
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ lock_version: 2 })
        }) as unknown as typeof fetch);

        render(<TaskDetailPanel />);

        const subjectLabel = screen.getByText('Subject');
        fireEvent.click(subjectLabel.parentElement!);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New subject' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(useTaskStore.getState().allTasks[0]?.subject).toBe('New subject');
            expect(useTaskStore.getState().allTasks[0]?.lockVersion).toBe(2);
        });
    });

    it('rolls back subject on API error', async () => {
        const taskId = '11';
        useTaskStore.setState({
            allTasks: [{
                id: taskId,
                subject: 'Old',
                startDate: 0,
                dueDate: 0,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 1,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            }],
            tasks: [{
                id: taskId,
                subject: 'Old',
                startDate: 0,
                dueDate: 0,
                ratioDone: 0,
                statusId: 1,
                lockVersion: 1,
                editable: true,
                rowIndex: 0,
                hasChildren: false
            }],
            selectedTaskId: taskId
        });

        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: {
                    task: { id: taskId, subject: 'Old', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: '2025-01-01', lockVersion: 1 },
                    editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, customFieldValues: false },
                    options: { statuses: [{ id: 1, name: 'New' }], assignees: [], customFields: [] },
                    customFieldValues: {}
                }
            },
            loadingTaskId: null,
            error: null
        });

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 't',
            apiKey: 'k',
            settings: { inline_edit_subject: '1' },
            i18n: { button_edit: 'Edit', field_subject: 'Subject', field_assigned_to: 'Assignee', field_status: 'Status', field_done_ratio: 'Done', field_due_date: 'Due' }
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            statusText: 'Unprocessable Entity',
            json: async () => ({ errors: ['Subject cannot be blank'] })
        }) as unknown as typeof fetch);

        render(<TaskDetailPanel />);

        const subjectLabel = screen.getByText('Subject');
        fireEvent.click(subjectLabel.parentElement!);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New subject' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Old');
        });
    });
});
