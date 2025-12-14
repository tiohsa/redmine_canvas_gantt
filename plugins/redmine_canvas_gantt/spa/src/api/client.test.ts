import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient.fetchData', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as any).RedmineCanvasGantt;
    });

    it('normalizes relations (from/to/id) to string', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            authToken: 'token',
            apiKey: 'key'
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                tasks: [
                    {
                        id: 10,
                        subject: 'A',
                        project_id: 1,
                        project_name: 'P',
                        display_order: 0,
                        start_date: '2025-01-01',
                        due_date: '2025-01-02',
                        ratio_done: 0,
                        status_id: 1,
                        assigned_to_id: null,
                        assigned_to_name: null,
                        parent_id: null,
                        lock_version: 0,
                        editable: true
                    },
                    {
                        id: 11,
                        subject: 'B',
                        project_id: 1,
                        project_name: 'P',
                        display_order: 1,
                        start_date: '2025-01-01',
                        due_date: '2025-01-02',
                        ratio_done: 0,
                        status_id: 1,
                        assigned_to_id: null,
                        assigned_to_name: null,
                        parent_id: 10,
                        lock_version: 0,
                        editable: true
                    }
                ],
                relations: [{ id: 99, from: 10, to: 11, type: 'precedes' }],
                project: { id: 1, name: 'P' },
                permissions: { editable: true, viewable: true }
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const data = await apiClient.fetchData();

        expect(data.relations).toEqual([{ id: '99', from: '10', to: '11', type: 'precedes', delay: undefined }]);
    });
});
