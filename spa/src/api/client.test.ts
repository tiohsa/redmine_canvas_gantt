import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { addCalendarDays, diffCalendarDays, formatDateOnly, parseDateOnly } from '../utils/dateOnly';
import { LayoutEngine } from '../engines/LayoutEngine';
import { TaskLogicService } from '../services/TaskLogicService';

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

    it('preserves the server request ID in an error response', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ error: 'Unknown error (request ID: request-123)' })
        }) as unknown as typeof fetch);

        await expect(apiClient.fetchData()).rejects.toThrow('Unknown error (request ID: request-123)');
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
                        priority_id: 7,
                        priority_name: '緊急',
                        priority_position: 4,
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
                sort_config: { key: 'startDate', direction: 'desc' },
                visible_columns: ['subject', 'assigned_to']
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
        expect(data.tasks[0]?.priorityPosition).toBe(4);
        expect(data.initialState).toEqual({
            queryId: 7,
            selectedStatusIds: [1],
            memberProjectsOnly: undefined,
            groupBy: 'project',
            sortConfig: { key: 'startDate', direction: 'desc' },
            visibleColumns: ['subject', 'assignee']
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
                baselineStartDate: parseDateOnly('2026-04-10'),
                baselineDueDate: parseDateOnly('2026-04-15')
                }
            }
        });
    });
});

describe('CalendarDate persistence invariant', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('preserves DateOnly through load, timeline projection, move, scheduling, save, and reload', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key'
        };
        const payloadFor = (startDate: string, dueDate: string) => ({
            tasks: [{
                id: 10,
                subject: 'DST task',
                project_id: 1,
                start_date: startDate,
                due_date: dueDate,
                ratio_done: 0,
                status_id: 1,
                lock_version: 0,
                editable: true
            }],
            relations: [],
            versions: [],
            filter_options: { projects: [{ id: 1, name: 'P' }], assignees: [] },
            statuses: [],
            project: { id: 1, name: 'P' },
            permissions: { editable: true, viewable: true, baseline_editable: true }
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => payloadFor('2026-03-07', '2026-03-09')
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'ok',
                    completeness: 'partial',
                    invalidated_entity_ids: [10],
                    deleted_entity_ids: [99],
                    lock_version: 1,
                    task_id: 10
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => payloadFor('2026-03-11', '2026-03-13')
            });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const loaded = await apiClient.fetchData();
        const original = loaded.tasks[0];
        const viewport = {
            startDate: parseDateOnly('2026-03-01')!,
            scrollX: 0,
            scrollY: 0,
            scale: 1 / (24 * 60 * 60 * 1000),
            width: 800,
            height: 600,
            rowHeight: 32
        };
        expect(LayoutEngine.getTaskBounds(original, viewport).width).toBe(3);

        const durationDays = diffCalendarDays(original.startDate!, original.dueDate!);
        const movedStart = addCalendarDays(original.startDate!, 4);
        const movedDue = addCalendarDays(movedStart, durationDays);
        const movedTask = { ...original, startDate: movedStart, dueDate: movedDue };
        expect(TaskLogicService.checkDependencies(
            [movedTask],
            [],
            movedTask.id,
            movedStart,
            movedDue
        )).toEqual({ updates: new Map() });

        await expect(apiClient.updateTask(movedTask)).resolves.toMatchObject({
            status: 'ok',
            completeness: 'partial',
            invalidatedEntityIds: ['10'],
            deletedEntityIds: ['99']
        });
        const saveRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(JSON.parse(String(saveRequest.body)).task).toMatchObject({
            start_date: '2026-03-11',
            due_date: '2026-03-13'
        });

        const reloaded = await apiClient.fetchData();
        expect(formatDateOnly(reloaded.tasks[0].startDate)).toBe('2026-03-11');
        expect(formatDateOnly(reloaded.tasks[0].dueDate)).toBe('2026-03-13');
        expect(diffCalendarDays(reloaded.tasks[0].startDate!, reloaded.tasks[0].dueDate!)).toBe(durationDays);
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
        expect(fetchMock).toHaveBeenCalledWith('/canvas_gantt/relations.json?canvas_project_id=1', expect.objectContaining({
            method: 'POST'
        }));
        expect(rel).toEqual({ status: 'ok', id: '1', from: '10', to: '11', type: 'precedes', delay: undefined });
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
        expect(fetchMock).toHaveBeenCalledWith('/canvas_gantt/relations.json?canvas_project_id=1', expect.objectContaining({
            method: 'POST'
        }));
        expect(rel).toEqual({ status: 'ok', id: '2', from: '10', to: '11', type: 'precedes', delay: 0 });
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
        expect(rel).toEqual({ status: 'ok', id: '4', from: '10', to: '11', type: 'precedes', delay: undefined });
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

        expect(fetchMock).toHaveBeenCalledWith('/canvas_gantt/relations/3.json?canvas_project_id=1', expect.objectContaining({
            method: 'PATCH'
        }));
        expect(rel).toEqual({ status: 'ok', id: '3', from: '10', to: '11', type: 'blocks', delay: undefined });
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

    it('preserves the typed mutation status for baseline failures', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: async () => ({ error: 'Baseline permission denied' })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        await expect(apiClient.saveBaseline({ scope: 'project' }))
            .rejects.toMatchObject({
                name: 'ApiMutationError',
                status: 'forbidden',
                httpStatus: 403,
                message: 'Baseline permission denied'
            });
    });
});

describe('apiClient.deleteTask', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it('deletes through the session-authenticated Canvas Gantt endpoint', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };

        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const result = await apiClient.deleteTask('42');

        expect(fetchMock).toHaveBeenCalledWith('/canvas_gantt/tasks/42.json?canvas_project_id=1', expect.objectContaining({
            method: 'DELETE',
            credentials: 'same-origin',
            headers: expect.any(Headers)
        }));
        const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
        expect(new Headers(requestInit.headers).get('X-CSRF-Token')).toBe('token');
        expect(result).toEqual({ status: 'ok' });
    });
});

describe('mutation error classification', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.RedmineCanvasGantt;
    });

    it.each([
        [403, 'forbidden'],
        [404, 'not_found'],
        [422, 'validation_error'],
        [500, 'transient_error']
    ] as const)('classifies HTTP %s as %s', async (httpStatus, expectedStatus) => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: httpStatus,
            statusText: 'Request failed',
            json: async () => ({ error: 'operation failed' })
        }) as unknown as typeof fetch);

        await expect(apiClient.updateTaskFields('42', { subject: 'draft' })).resolves.toMatchObject({
            status: expectedStatus,
            error: 'operation failed'
        });
    });

    it('sends the optional operation id outside the legacy task payload', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ lock_version: 4, task_id: 42 })
        });
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        await apiClient.updateTaskFields('42', { subject: 'draft' }, 'mutation:42');

        const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(String(request.body))).toEqual({
            task: { subject: 'draft' },
            client_operation_id: 'mutation:42'
        });
    });
});
