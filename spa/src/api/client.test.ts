import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient.fetchQueries', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('normalizes saved query payloads', async () => {
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
                queries: [
                    { id: 12, name: 'Open issues', is_public: true, project_id: 5 },
                    { id: 18, name: 'My team backlog', is_public: false, project_id: null },
                    { id: 'skip-me', name: 1 }
                ]
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const queries = await apiClient.fetchQueries();

        expect(queries).toEqual([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 5 },
            { id: 18, name: 'My team backlog', isPublic: false, projectId: null }
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/projects/1/canvas_gantt/queries.json',
            expect.anything()
        );
    });
});

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
                filter_options: {
                    projects: [
                        { id: 1, name: 'P' },
                        { id: 2, name: 'Child' }
                    ],
                    assignees: [
                        { id: 7, name: 'Alice', project_ids: [1] },
                        { id: null, name: null, project_ids: [2] }
                    ]
                },
                project: { id: 1, name: 'P' },
                permissions: { editable: true, viewable: true, baseline_editable: true },
                initial_state: {
                    query_id: 7,
                    selected_status_ids: [1],
                    group_by: 'project',
                    sort_config: { key: 'startDate', direction: 'desc' }
                },
                warnings: ['Invalid query_id ignored']
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const data = await apiClient.fetchData({
            query: {
                queryId: 7,
                selectedStatusIds: [1]
            }
        });

        expect(data.relations).toEqual([{ id: '99', from: '10', to: '11', type: 'precedes', delay: undefined }]);
        expect(data.initialState).toEqual({
            queryId: 7,
            selectedStatusIds: [1],
            groupBy: 'project',
            sortConfig: { key: 'startDate', direction: 'desc' }
        });
        expect(data.filterOptions).toEqual({
            projects: [
                { id: '1', name: 'P' },
                { id: '2', name: 'Child' }
            ],
            assignees: [
                { id: 7, name: 'Alice', projectIds: ['1'] },
                { id: null, name: null, projectIds: ['2'] }
            ]
        });
        expect(data.warnings).toEqual(['Invalid query_id ignored']);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/projects/1/canvas_gantt/data.json?query_id=7&status_ids%5B%5D=1',
            expect.anything()
        );
    });

    it('parses baseline snapshot payloads', async () => {
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
                tasks: [],
                relations: [],
                versions: [],
                filter_options: {
                    projects: [{ id: 1, name: 'P' }],
                    assignees: []
                },
                statuses: [],
                project: { id: 1, name: 'P' },
                permissions: { editable: true, viewable: true, baseline_editable: true },
                baseline: {
                    snapshot_id: 'baseline-1',
                    project_id: 1,
                    captured_at: '2026-04-01T00:00:00.000Z',
                    captured_by_id: 9,
                    captured_by_name: 'Alice',
                    scope: 'project',
                    tasks_by_issue_id: {
                        '10': {
                            issue_id: 10,
                            baseline_start_date: '2026-04-10',
                            baseline_due_date: '2026-04-15'
                        }
                    }
                }
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const data = await apiClient.fetchData();

        expect(data.baseline).toEqual({
            snapshotId: 'baseline-1',
            projectId: '1',
            capturedAt: '2026-04-01T00:00:00.000Z',
            capturedById: 9,
            capturedByName: 'Alice',
            scope: 'project',
            tasksByIssueId: {
                '10': {
                    issueId: '10',
                    baselineStartDate: new Date('2026-04-10').getTime(),
                    baselineDueDate: new Date('2026-04-15').getTime()
                }
            }
        });
    });
});

describe('apiClient.fetchQueries', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('fetches and parses saved queries', async () => {
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
                queries: [
                    { id: 12, name: 'Open issues', is_public: true, project_id: 1 },
                    { id: 13, name: 'Shared', is_public: false, project_id: null }
                ]
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        await expect(apiClient.fetchQueries()).resolves.toEqual([
            { id: 12, name: 'Open issues', isPublic: true, projectId: 1 },
            { id: 13, name: 'Shared', isPublic: false, projectId: null }
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/projects/1/canvas_gantt/queries.json',
            expect.anything()
        );
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

describe('apiClient.saveBaseline', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('posts to the baseline endpoint and parses the response', async () => {
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
                status: 'ok',
                baseline: {
                    snapshot_id: 'baseline-2',
                    project_id: 1,
                    captured_at: '2026-04-02T00:00:00.000Z',
                    captured_by_id: 7,
                    captured_by_name: 'Bob',
                    scope: 'project',
                    tasks_by_issue_id: {}
                },
                warnings: ['baseline warning']
            })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const result = await apiClient.saveBaseline({
            query: {
                queryId: 7,
                selectedStatusIds: [1]
            },
            scope: 'project'
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/projects/1/canvas_gantt/baseline.json',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ scope: 'project' })
            })
        );
        expect(result).toEqual({
            status: 'ok',
            baseline: {
                snapshotId: 'baseline-2',
                projectId: '1',
                capturedAt: '2026-04-02T00:00:00.000Z',
                capturedById: 7,
                capturedByName: 'Bob',
                scope: 'project',
                tasksByIssueId: {}
            },
            warnings: ['baseline warning']
        });
    });
});
