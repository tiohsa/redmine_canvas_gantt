import { describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient.fetchEditMeta', () => {
    it('parses edit meta response', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key'
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                task: {
                    id: 10,
                    subject: 'S',
                    assigned_to_id: 2,
                    status_id: 1,
                    done_ratio: 10,
                    due_date: '2025-01-02',
                    lock_version: 3,
                    start_date: '2025-01-01',
                    priority_id: 1,
                    project_id: 1,
                    tracker_id: 1,
                    category_id: null,
                    fixed_version_id: null,
                    estimated_hours: 5.5
                },
                editable: {
                    subject: true,
                    assigned_to_id: true,
                    status_id: true,
                    done_ratio: true,
                    due_date: true,
                    start_date: true,
                    priority_id: true,
                    category_id: true,
                    estimated_hours: true,
                    project_id: true,
                    tracker_id: true,
                    fixed_version_id: true,
                    custom_field_values: false
                },
                options: {
                    statuses: [{ id: 1, name: 'New' }],
                    assignees: [{ id: 2, name: 'Alice' }],
                    custom_fields: [{ id: 5, name: 'CF', field_format: 'string', is_required: false }]
                },
                custom_field_values: { '5': 'X' }
            })
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const meta = await apiClient.fetchEditMeta('10');
        expect(meta.task).toEqual({
            id: '10',
            subject: 'S',
            assignedToId: 2,
            statusId: 1,
            doneRatio: 10,
            dueDate: '2025-01-02',
            startDate: '2025-01-01',
            lockVersion: 3,
            priorityId: 1,
            projectId: 1,
            trackerId: 1,
            categoryId: null,
            fixedVersionId: null,
            estimatedHours: 5.5
        });
        expect(meta.options.statuses).toEqual([{ id: 1, name: 'New' }]);
        expect(meta.options.assignees).toEqual([{ id: 2, name: 'Alice' }]);
        expect(meta.options.customFields[0]?.fieldFormat).toBe('string');
    });
});

