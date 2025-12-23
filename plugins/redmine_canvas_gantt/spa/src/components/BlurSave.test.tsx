import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UiSidebar } from './UiSidebar';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { Task } from '../types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const queryClient = new QueryClient();

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('UiSidebar Blur-to-Save', () => {
    const taskId = '123';

    beforeEach(() => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: {
                button_edit: 'Edit',
                field_subject: 'Subject',
                field_assigned_to: 'Assignee',
                field_status: 'Status',
                field_done_ratio: 'Done',
                field_due_date: 'Due',
                label_unassigned: 'Unassigned'
            },
            settings: {
                inline_edit_subject: '1',
                inline_edit_status: '1',
                inline_edit_start_date: '1'
            }
        };

        useUIStore.setState({
            visibleColumns: ['id', 'subject', 'status', 'startDate'],
            activeInlineEdit: null
        });
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
            subject: 'Initial Subject',
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
                        task: { id: 123, subject: 'Initial Subject', status_id: 1, done_ratio: 0, lock_version: 1 },
                        editable: {
                            subject: true,
                            assigned_to_id: true,
                            status_id: true,
                            done_ratio: true,
                            due_date: true,
                            custom_field_values: false,
                            start_date: true,
                            priority_id: true,
                            category_id: true,
                            estimated_hours: true,
                            project_id: true,
                            tracker_id: true,
                            fixed_version_id: true
                        },
                        options: { statuses: [{ id: 1, name: 'New' }, { id: 2, name: 'In Progress' }], assignees: [], custom_fields: [] },
                        custom_field_values: {}
                    })
                } as unknown as Response;
            }
            if (url.endsWith(`/tasks/${taskId}.json`) && init?.method === 'PATCH') {
                return {
                    ok: true,
                    json: async () => ({ lock_version: 2 })
                } as unknown as Response;
            }
            return { ok: false } as unknown as Response;
        }) as unknown as typeof fetch);
    });

    it('saves Status on blur when changed', async () => {
        render(
            <Wrapper>
                <UiSidebar />
            </Wrapper>
        );

        const cell = await screen.findByTestId(`cell-${taskId}-status`);
        fireEvent.doubleClick(cell);

        const select = await screen.findByRole('combobox', {}, { timeout: 3000 });
        fireEvent.change(select, { target: { value: '2' } });
        fireEvent.blur(select);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/tasks/${taskId}.json`), expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"status_id":2')
            }));
        }, { timeout: 3000 });
    });

    it('reverts Status on blur when unchanged', async () => {
        render(
            <Wrapper>
                <UiSidebar />
            </Wrapper>
        );

        const cell = await screen.findByTestId(`cell-${taskId}-status`);
        fireEvent.doubleClick(cell);

        const select = await screen.findByRole('combobox', {}, { timeout: 3000 });
        fireEvent.blur(select);

        await waitFor(() => {
            expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        });

        const patchCalls = (fetch as any).mock.calls.filter((call: any) =>
            call[1]?.method === 'PATCH'
        );
        expect(patchCalls.length).toBe(0);
    });
});
