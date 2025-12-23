import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskDetailPanel } from './TaskDetailPanel';
import { useTaskStore } from '../stores/TaskStore';
import { useEditMetaStore } from '../stores/EditMetaStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock dependencies
vi.mock('../queries/tasks', () => ({
    useUpdateTask: () => ({
        mutateAsync: vi.fn().mockImplementation(async (updates) => {
            // Mock successful mutation logic if needed for component interaction
            // But since we are testing Optimistic UI logic inside the component (which was removed),
            // or the component usage of mutation.
            // The logic now relies on the hook.
            // We should just verify the hook is called.

            // For the sake of the test asserting store updates:
            // The TaskDetailPanel now calls updateTaskMutation.mutateAsync().
            // The store update happens inside the HOOK's onMutate/onSuccess.
            // Since we mocked the hook, the store won't update unless we update it here or mock the hook implementation fully.

            // However, the test expects "useTaskStore.getState().allTasks[0]?.subject).toBe('New subject');"
            // This means the test is essentially integration testing the store update.
            // If we mock the hook, we must simulate what the hook does, OR
            // we should rewrite the test to verify `mutateAsync` was called.
            // Given the instruction "Optimistic UI + Server Normalization" is inside the hook,
            // the component just triggers it.

            // Let's mock the hook to update the store to simulate success.
             useTaskStore.getState().updateTask('10', updates);
             return Promise.resolve({ lockVersion: 2 });
        })
    })
}));

const queryClient = new QueryClient();

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('TaskDetailPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates subject and calls mutation', async () => {
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
                    task: { id: taskId, subject: 'Old', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: '2025-01-01', startDate: '2025-01-01', priorityId: 1, categoryId: null, estimatedHours: null, projectId: 1, trackerId: 1, fixedVersionId: null, lockVersion: 1 },
                    editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, startDate: true, priorityId: true, categoryId: true, estimatedHours: true, projectId: true, trackerId: true, fixedVersionId: true, customFieldValues: false },
                    options: { statuses: [{ id: 1, name: 'New' }], assignees: [], priorities: [], categories: [], projects: [], trackers: [], versions: [], customFields: [] },
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

        render(
            <Wrapper>
                <TaskDetailPanel />
            </Wrapper>
        );

        const subjectLabel = screen.getByText('Subject');
        fireEvent.click(subjectLabel.parentElement!);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New subject' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Since we mocked the hook to update the store, we can verify the store.
        await waitFor(() => {
            expect(useTaskStore.getState().allTasks[0]?.subject).toBe('New subject');
        });
    });
});
