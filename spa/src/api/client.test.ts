import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient.fetchData', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('normalizes relations (from/to/id) to string', async () => {
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

describe('apiClient.createRelation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('parses relation id when API returns {relation: {...}}', async () => {
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
                relation: { id: 1, issue_id: 10, issue_to_id: 11, relation_type: 'precedes', delay: null }
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const rel = await apiClient.createRelation('10', '11', 'precedes');
        expect(fetchMock).toHaveBeenCalledWith('/projects/1/canvas_gantt/relations.json', expect.objectContaining({
            method: 'POST'
        }));
        expect(rel).toEqual({ id: '1', from: '10', to: '11', type: 'precedes', delay: undefined });
    });

    it('parses relation id when API returns plain object', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key'
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 2, issue_id: 10, issue_to_id: 11, relation_type: 'precedes', delay: 0 })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const rel = await apiClient.createRelation('10', '11', 'precedes');
        expect(fetchMock).toHaveBeenCalledWith('/projects/1/canvas_gantt/relations.json', expect.objectContaining({
            method: 'POST'
        }));
        expect(rel).toEqual({ id: '2', from: '10', to: '11', type: 'precedes', delay: 0 });
    });

    it('prefers issue_from_id over issue_id when both are present', async () => {
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
                relation: {
                    id: 4,
                    issue_id: 99,
                    issue_from_id: 10,
                    issue_to_id: 11,
                    relation_type: 'precedes',
                    delay: null
                }
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const rel = await apiClient.createRelation('10', '11', 'precedes');
        expect(rel).toEqual({ id: '4', from: '10', to: '11', type: 'precedes', delay: undefined });
    });
});

describe('apiClient.updateRelation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('sends PATCH payload and parses updated relation', async () => {
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
                relation: { id: 3, issue_from_id: 10, issue_to_id: 11, relation_type: 'blocks', delay: null }
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const rel = await apiClient.updateRelation('3', 'blocks');

        expect(fetchMock).toHaveBeenCalledWith('/projects/1/canvas_gantt/relations/3.json', expect.objectContaining({
            method: 'PATCH'
        }));
        expect(rel).toEqual({ id: '3', from: '10', to: '11', type: 'blocks', delay: undefined });
    });
});
