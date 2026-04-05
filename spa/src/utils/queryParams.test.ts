import { describe, expect, it } from 'vitest';
import {
    buildIssueQueryParams,
    buildRedmineIssueQueryParams,
    hasSharedQueryStateInUrl,
    normalizeResolvedQueryState,
    parseResolvedQueryState,
    readIssueQueryParamsFromUrl,
    replaceIssueQueryParamsInUrl,
    resolveInitialSharedQueryState,
    toBusinessQueryState,
    toResolvedQueryStateFromStore
} from './queryParams';

describe('parseResolvedQueryState', () => {
    it('accepts backend boolean grouping payload', () => {
        const parsed = parseResolvedQueryState({
            query_id: 42,
            selected_status_ids: [1, 2],
            selected_assignee_ids: [7, null],
            selected_project_ids: ['1'],
            sort_config: { key: 'subject', direction: 'desc' },
            group_by_assignee: true,
            show_subprojects: false
        });

        expect(parsed).toEqual({
            queryId: 42,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7, null],
            selectedProjectIds: ['1'],
            sortConfig: { key: 'subject', direction: 'desc' },
            groupBy: 'assignee',
            showSubprojects: false
        });
    });

    it('drops non-persisted query ids from backend payload', () => {
        const parsed = parseResolvedQueryState({
            query_id: 0,
            selected_status_ids: [1]
        });

        expect(parsed).toEqual({
            selectedStatusIds: [1],
            groupBy: null
        });
    });

    it('normalizes none sentinels from backend payloads', () => {
        const parsed = parseResolvedQueryState({
            selected_assignee_ids: ['none', 7],
            selected_version_ids: ['none', '_none']
        });

        expect(parsed).toEqual({
            queryId: undefined,
            selectedStatusIds: undefined,
            selectedAssigneeIds: [null, 7],
            selectedProjectIds: undefined,
            selectedVersionIds: ['_none'],
            sortConfig: undefined,
            groupBy: null,
            showSubprojects: undefined
        });
    });
});

describe('readIssueQueryParamsFromUrl', () => {
    it('ignores query_id=0 in the browser URL', () => {
        expect(readIssueQueryParamsFromUrl('?query_id=0&status_ids[]=1')).toEqual({
            queryId: undefined,
            selectedStatusIds: [1],
            selectedAssigneeIds: undefined,
            selectedProjectIds: undefined,
            selectedVersionIds: undefined,
            sortConfig: undefined,
            groupBy: null,
            showSubprojects: undefined
        });
    });

    it('reads supported Redmine standard issue query params when set_filter=1', () => {
        expect(
            readIssueQueryParamsFromUrl(
                '?query_id=7&set_filter=1&f[]=status_id&op[status_id]==&v[status_id][]=1&v[status_id][]=2' +
                '&f[]=assigned_to_id&op[assigned_to_id]==&v[assigned_to_id][]=7&v[assigned_to_id][]=none' +
                '&f[]=project_id&op[project_id]==&v[project_id][]=3' +
                '&f[]=fixed_version_id&op[fixed_version_id]==&v[fixed_version_id][]=4' +
                '&f[]=subproject_id&op[subproject_id]=!*&group_by=assigned_to&sort=start_date:desc'
            )
        ).toEqual({
            queryId: 7,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7, null],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'startDate', direction: 'desc' },
            groupBy: 'assignee',
            showSubprojects: false
        });
    });

    it('prefers Redmine standard filters over Canvas-specific params when both exist', () => {
        expect(readIssueQueryParamsFromUrl('?set_filter=1&f[]=status_id&op[status_id]==&v[status_id][]=3&status_ids[]=1&status_ids[]=2')).toEqual({
            queryId: undefined,
            selectedStatusIds: [3],
            selectedAssigneeIds: undefined,
            selectedProjectIds: undefined,
            selectedVersionIds: undefined,
            sortConfig: undefined,
            groupBy: null,
            showSubprojects: undefined
        });
    });
});

describe('normalizeResolvedQueryState', () => {
    it('drops default-equivalent values', () => {
        expect(normalizeResolvedQueryState({
            queryId: null,
            selectedStatusIds: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            sortConfig: { key: 'startDate', direction: 'asc' },
            groupBy: 'project',
            showSubprojects: true
        })).toBeUndefined();
    });

    it('keeps meaningful shared state values', () => {
        expect(normalizeResolvedQueryState({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee',
            showSubprojects: false
        })).toEqual({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee',
            showSubprojects: false
        });
    });
});

describe('hasSharedQueryStateInUrl', () => {
    it('returns false for a bare Canvas Gantt URL', () => {
        expect(hasSharedQueryStateInUrl('')).toBe(false);
    });

    it('treats explicit standard filter params as shared URL input even when they clear filters', () => {
        expect(hasSharedQueryStateInUrl('?set_filter=1&f[]=status_id&op[status_id]=*')).toBe(true);
    });

    it('returns true for a persisted query id', () => {
        expect(hasSharedQueryStateInUrl('?query_id=7')).toBe(true);
    });
});

describe('resolveInitialSharedQueryState', () => {
    it('uses stored state for a bare Canvas Gantt URL', () => {
        expect(resolveInitialSharedQueryState('', {
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee'
        })).toEqual({
            state: {
                queryId: 12,
                selectedStatusIds: [1],
                groupBy: 'assignee'
            },
            source: 'storage'
        });
    });

    it('prefers explicit URL state over stored state', () => {
        expect(resolveInitialSharedQueryState('?query_id=9', {
            queryId: 12,
            selectedStatusIds: [1]
        })).toEqual({
            state: {
                queryId: 9,
                selectedStatusIds: undefined,
                selectedAssigneeIds: undefined,
                selectedProjectIds: undefined,
                selectedVersionIds: undefined,
                sortConfig: undefined,
                groupBy: null,
                showSubprojects: undefined
            },
            source: 'url'
        });
    });
});

describe('toResolvedQueryStateFromStore', () => {
    it('normalizes store state into query payload shape', () => {
        expect(toResolvedQueryStateFromStore({
            activeQueryId: 9,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7, null],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'subject', direction: 'asc' },
            groupByProject: false,
            groupByAssignee: true,
            showSubprojects: false
        })).toEqual({
            queryId: 9,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7, null],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'subject', direction: 'asc' },
            groupBy: 'assignee',
            showSubprojects: false
        });
    });
});

describe('toBusinessQueryState', () => {
    it('fills defaults when resolved query state is partial', () => {
        expect(toBusinessQueryState({
            queryId: 11,
            selectedStatusIds: [1],
            groupBy: 'project'
        })).toEqual({
            queryId: 11,
            selectedStatusIds: [1],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
            selectedVersionIds: [],
            sortConfig: null,
            groupByProject: true,
            groupByAssignee: false,
            showSubprojects: true
        });
    });
});

describe('replaceIssueQueryParamsInUrl', () => {
    it('rewrites only known shared query params', () => {
        window.history.replaceState({}, '', '/projects/demo/canvas_gantt?query_id=9&foo=bar');

        replaceIssueQueryParamsInUrl({
            queryId: 42,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'subject', direction: 'asc' },
            groupBy: 'project',
            showSubprojects: false
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.get('foo')).toBe('bar');
        expect(url.searchParams.get('query_id')).toBe('42');
        expect(url.searchParams.getAll('status_ids[]')).toEqual(['1', '2']);
        expect(url.searchParams.getAll('assigned_to_ids[]')).toEqual(['7']);
        expect(url.searchParams.getAll('project_ids[]')).toEqual(['3']);
        expect(url.searchParams.getAll('fixed_version_ids[]')).toEqual(['4']);
        expect(url.searchParams.get('group_by')).toBe('project');
        expect(url.searchParams.get('sort')).toBe('subject:asc');
        expect(url.searchParams.get('show_subprojects')).toBe('0');
    });

    it('removes query_id when it is not a persisted query id', () => {
        window.history.replaceState({}, '', '/projects/demo/canvas_gantt?query_id=0&foo=bar');

        replaceIssueQueryParamsInUrl({
            queryId: 0,
            selectedStatusIds: []
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.get('foo')).toBe('bar');
        expect(url.searchParams.get('query_id')).toBeNull();
    });

    it('removes Redmine standard filter params before writing Canvas query params', () => {
        window.history.replaceState(
            {},
            '',
            '/projects/demo/canvas_gantt?set_filter=1&f%5B%5D=status_id&op%5Bstatus_id%5D=%3D&v%5Bstatus_id%5D%5B%5D=1&foo=bar'
        );

        replaceIssueQueryParamsInUrl({
            selectedStatusIds: [2]
        });

        const url = new URL(window.location.href);
        expect(url.searchParams.get('foo')).toBe('bar');
        expect(url.searchParams.get('set_filter')).toBeNull();
        expect(url.searchParams.getAll('f[]')).toEqual([]);
        expect(url.searchParams.get('op[status_id]')).toBeNull();
        expect(url.searchParams.getAll('v[status_id][]')).toEqual([]);
        expect(url.searchParams.getAll('status_ids[]')).toEqual(['2']);
    });
});

describe('query parameter round-trips for special selections', () => {
    it('preserves unassigned assignee and no-version selections through URL round-trips', () => {
        const params = buildIssueQueryParams({
            selectedAssigneeIds: [null],
            selectedVersionIds: ['_none']
        });

        expect(readIssueQueryParamsFromUrl(`?${params.toString()}`)).toEqual({
            queryId: undefined,
            selectedStatusIds: undefined,
            selectedAssigneeIds: [null],
            selectedProjectIds: undefined,
            selectedVersionIds: ['_none'],
            sortConfig: undefined,
            groupBy: null,
            showSubprojects: undefined
        });
    });

    it('preserves an explicitly empty project selection through URL round-trips', () => {
        const params = buildIssueQueryParams({
            selectedProjectIds: []
        });

        expect(params.toString()).toContain('project_ids%5B%5D=none');

        expect(readIssueQueryParamsFromUrl(`?${params.toString()}`)).toEqual({
            queryId: undefined,
            selectedStatusIds: undefined,
            selectedAssigneeIds: undefined,
            selectedProjectIds: [],
            selectedVersionIds: undefined,
            sortConfig: undefined,
            groupBy: null,
            showSubprojects: undefined
        });
    });
});

describe('buildRedmineIssueQueryParams', () => {
    it('builds Redmine standard issue query params from shared state', () => {
        const { params, notices } = buildRedmineIssueQueryParams({
            queryId: 12,
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7, null],
            selectedProjectIds: ['3'],
            selectedVersionIds: ['4'],
            sortConfig: { key: 'startDate', direction: 'asc' },
            groupBy: 'assignee',
            showSubprojects: false
        });

        expect(notices).toEqual(['Unassigned assignee filter was omitted because Redmine URL export cannot combine it with specific assignees.']);
        expect(params.get('query_id')).toBe('12');
        expect(params.get('set_filter')).toBe('1');
        expect(params.getAll('f[]')).toEqual(['status_id', 'assigned_to_id', 'project_id', 'fixed_version_id', 'subproject_id']);
        expect(params.get('op[status_id]')).toBe('=');
        expect(params.getAll('v[status_id][]')).toEqual(['1', '2']);
        expect(params.getAll('v[assigned_to_id][]')).toEqual(['7']);
        expect(params.getAll('v[project_id][]')).toEqual(['3']);
        expect(params.getAll('v[fixed_version_id][]')).toEqual(['4']);
        expect(params.get('op[subproject_id]')).toBe('!*');
        expect(params.get('group_by')).toBe('assigned_to');
        expect(params.get('sort')).toBeNull();
    });

    it('exports unassigned-only assignee filter using the Redmine none operator', () => {
        const { params, notices } = buildRedmineIssueQueryParams({
            selectedAssigneeIds: [null]
        });

        expect(notices).toEqual([]);
        expect(params.get('set_filter')).toBe('1');
        expect(params.getAll('f[]')).toEqual(['assigned_to_id']);
        expect(params.get('op[assigned_to_id]')).toBe('!*');
        expect(params.getAll('v[assigned_to_id][]')).toEqual([]);
    });

    it('appends visible columns as c[] parameters from shared state', () => {
        const { params } = buildRedmineIssueQueryParams({
            visibleColumns: ['status', 'subject', 'startDate', 'notification']
        });

        const columns = params.getAll('c[]');
        expect(columns).toContain('status');
        expect(columns).toContain('subject');
        expect(columns).toContain('start_date');
        expect(columns).not.toContain('notification');
    });

    it('appends sort configuration as sort parameter from shared state', () => {
        const { params } = buildRedmineIssueQueryParams({
            sortConfig: { key: 'dueDate', direction: 'desc' }
        });

        expect(params.get('sort')).toBe('due_date:desc');
    });
});
