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
                    project_id: 1,
                    tracker_id: 2
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
            lockVersion: 3,
            startDate: null,
            priorityId: 0,
            categoryId: null,
            estimatedHours: null,
            projectId: 1,
            trackerId: 2,
            fixedVersionId: null
        });
        expect(meta.options.statuses).toEqual([{ id: 1, name: 'New' }]);
        expect(meta.options.assignees).toEqual([{ id: 2, name: 'Alice' }]);
        expect(meta.options.customFields[0]?.fieldFormat).toBe('string');
    });

    it('parses priority position metadata from edit options', async () => {
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
                    assigned_to_id: null,
                    status_id: 1,
                    done_ratio: 10,
                    due_date: null,
                    lock_version: 3,
                    priority_id: 7,
                    project_id: 1,
                    tracker_id: 2
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
                    assignees: [],
                    priorities: [{ id: 7, name: '緊急', position: 4 }],
                    categories: [],
                    projects: [{ id: 1, name: 'Demo' }],
                    trackers: [{ id: 2, name: 'Bug' }],
                    versions: [],
                    custom_fields: []
                },
                custom_field_values: {}
            })
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const meta = await apiClient.fetchEditMeta('10');
        expect(meta.options.priorities).toEqual([{ id: 7, name: '緊急', position: 4 }]);
    });

    it.each([
        [{ status_id: null }, 'status_id'],
        [{ status_id: '' }, 'status_id'],
        [{ status_id: 0 }, 'status_id'],
        [{ project_id: '' }, 'project_id'],
        [{ done_ratio: 101 }, 'done_ratio'],
        [{ done_ratio: -1 }, 'done_ratio'],
        [{ done_ratio: null }, 'done_ratio'],
        [{ done_ratio: '' }, 'done_ratio'],
        [{ done_ratio: 1.5 }, 'done_ratio'],
        [{ project_id: null }, 'project_id'],
        [{ project_id: 0 }, 'project_id'],
        [{ tracker_id: null }, 'tracker_id'],
        [{ tracker_id: '' }, 'tracker_id'],
        [{ tracker_id: 0 }, 'tracker_id'],
        [{ lock_version: null }, 'lock_version'],
        [{ lock_version: '' }, 'lock_version'],
        [{ lock_version: -1 }, 'lock_version'],
        [{ lock_version: 1.5 }, 'lock_version']
    ])('throws when required field is invalid: %s', async (overrides, fieldName) => {
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
                    assigned_to_id: null,
                    status_id: 1,
                    done_ratio: 10,
                    due_date: null,
                    lock_version: 3,
                    project_id: 1,
                    tracker_id: 2,
                    ...overrides
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
                    assignees: [],
                    priorities: [],
                    categories: [],
                    projects: [{ id: 1, name: 'Demo' }],
                    trackers: [{ id: 2, name: 'Bug' }],
                    versions: [],
                    custom_fields: []
                },
                custom_field_values: {}
            })
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
        await expect(apiClient.fetchEditMeta('10')).rejects.toThrow(`Invalid response: ${fieldName}`);
    });

    it('accepts boundary done_ratio and lock_version values', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key'
        };

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    task: { id: 10, subject: 'S', assigned_to_id: null, status_id: 1, done_ratio: 0, due_date: null, lock_version: 0, project_id: 1, tracker_id: 2 },
                    editable: { subject: true, assigned_to_id: true, status_id: true, done_ratio: true, due_date: true, start_date: true, priority_id: true, category_id: true, estimated_hours: true, project_id: true, tracker_id: true, fixed_version_id: true, custom_field_values: false },
                    options: { statuses: [{ id: 1, name: 'New' }], assignees: [], priorities: [], categories: [], projects: [{ id: 1, name: 'Demo' }], trackers: [{ id: 2, name: 'Bug' }], versions: [], custom_fields: [] },
                    custom_field_values: {}
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    task: { id: 10, subject: 'S', assigned_to_id: null, status_id: 1, done_ratio: 100, due_date: null, lock_version: 3, project_id: 1, tracker_id: 2 },
                    editable: { subject: true, assigned_to_id: true, status_id: true, done_ratio: true, due_date: true, start_date: true, priority_id: true, category_id: true, estimated_hours: true, project_id: true, tracker_id: true, fixed_version_id: true, custom_field_values: false },
                    options: { statuses: [{ id: 1, name: 'New' }], assignees: [], priorities: [], categories: [], projects: [{ id: 1, name: 'Demo' }], trackers: [{ id: 2, name: 'Bug' }], versions: [], custom_fields: [] },
                    custom_field_values: {}
                })
            });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        await expect(apiClient.fetchEditMeta('10')).resolves.toMatchObject({ task: { doneRatio: 0, lockVersion: 0 } });
        await expect(apiClient.fetchEditMeta('10')).resolves.toMatchObject({ task: { doneRatio: 100, lockVersion: 3 } });
    });
});
