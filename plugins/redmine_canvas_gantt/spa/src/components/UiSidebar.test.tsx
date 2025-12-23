import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent, waitFor } from '@testing-library/react';
import { UiSidebar } from './UiSidebar';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task } from '../types';
import { useEditMetaStore } from '../stores/EditMetaStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const queryClient = new QueryClient();

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

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

        render(<Wrapper><UiSidebar /></Wrapper>);

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
            selectedTaskId: null
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

        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('edit_meta.json')) {
                return {
                    ok: true,
                    json: async () => ({
                        task: {
                            id: 123,
                            subject: 'Old',
                            assigned_to_id: null,
                            status_id: 1,
                            done_ratio: 0,
                            start_date: '2025-01-01',
                            due_date: '2025-01-05',
                            lock_version: 1
                        },
                        editable: { subject: true, assigned_to_id: true, status_id: true, done_ratio: true, due_date: true, start_date: true, custom_field_values: false },
                        options: { statuses: [{ id: 1, name: 'New' }], assignees: [], custom_fields: [] },
                        custom_field_values: {}
                    })
                } as unknown as Response;
            }
            if (url.endsWith(`/tasks/${taskId}.json`) && init?.method === 'PATCH') {
                // Mock successful response from mutation query invalidation?
                // The mutation calls invalidate, which calls useTasks -> fetch.
                // But here we are just testing the mutation triggers PATCH.
                return {
                    ok: true,
                    json: async () => ({ lock_version: 2 })
                } as unknown as Response;
            }
            return {
                ok: false,
                statusText: 'Not Found',
                json: async () => ({ error: 'Not Found' })
            } as unknown as Response;
        }) as unknown as typeof fetch);

        render(<Wrapper><UiSidebar /></Wrapper>);

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

        await waitFor(() => {
            // Verify patch was called
             expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/tasks/${taskId}.json`), expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"start_date":"2025-01-02"')
            }));
        });
    });
});
