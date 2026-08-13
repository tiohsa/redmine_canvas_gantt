import type { QueryContext } from './types';
import type { ResolvedQueryState } from '../utils/queryParams';
import { toCanvasColumnKey, toRedmineColumnName } from '../components/sidebar/sidebarColumnCatalog';
import { buildQueryParamsFromQueryContext } from './queryStateCodec';
import { isDefaultSort, parseSortConfig } from './querySortCodec';

import { isPersistedQueryId } from './queryIdCodec';

const appendStandardFilter = (params: URLSearchParams, field: string, operator: string): void => {
    params.append('f[]', field);
    params.set(`op[${field}]`, operator);
};

const parseIntegerList = (params: URLSearchParams, keys: string[]): number[] | undefined => {
    const values = keys.flatMap((key) => params.getAll(key));
    if (values.length === 0) return undefined;

    return values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter((value) => /^-?\d+$/.test(value))
        .map(Number);
};

const parseStringList = (params: URLSearchParams, keys: string[]): string[] | undefined => {
    const values = keys.flatMap((key) => params.getAll(key));
    if (values.length === 0) return undefined;

    return values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter(Boolean);
};

const parseColumns = (params: URLSearchParams): string[] | undefined => {
    const values = parseStringList(params, ['c[]', 'c']);
    if (!values) return undefined;

    const columns = values.flatMap((value) => {
        const key = toCanvasColumnKey(value);
        return key ? [key] : [];
    });
    const uniqueColumns = Array.from(new Set(columns));
    return uniqueColumns.length > 0 ? uniqueColumns : undefined;
};

const parseAssigneeList = (params: URLSearchParams): (number | null)[] | undefined => {
    const values = parseStringList(params, ['assigned_to_ids[]', 'assigned_to_ids', 'assigned_to_id[]', 'assigned_to_id']);
    if (!values) return undefined;

    return values.flatMap((value) => {
        if (value === '_none' || value === 'none' || value === '!' || value === '!*') return [null];
        return /^-?\d+$/.test(value) ? [Number(value)] : [];
    });
};

const parseProjectList = (params: URLSearchParams): string[] | undefined => {
    const values = parseStringList(params, ['canvas_project_ids[]', 'canvas_project_ids', 'project_ids[]', 'project_ids']);
    if (!values) return undefined;
    if (values.every((value) => value === 'none' || value === '_none')) return [];
    return values.filter((value) => value !== 'none' && value !== '_none');
};

const parseVersionList = (params: URLSearchParams): string[] | undefined => {
    const values = parseStringList(params, ['fixed_version_ids[]', 'fixed_version_ids', 'fixed_version_id[]', 'fixed_version_id']);
    if (!values) return undefined;

    return values.flatMap((value) => {
        if (value === '_none' || value === 'none' || value === '!' || value === '!*') return ['_none'];
        return /^-?\d+$/.test(value) ? [value] : [];
    });
};

const parseTrackerList = (params: URLSearchParams): number[] | undefined => (
    parseIntegerList(params, ['tracker_ids[]', 'tracker_ids', 'tracker_id[]', 'tracker_id'])
);

export const parseCanvasQueryState = (params: URLSearchParams): Partial<ResolvedQueryState> => {
    const groupBy = params.get('group_by');
    return {
        selectedStatusIds: parseIntegerList(params, ['status_ids[]', 'status_ids', 'status_id[]', 'status_id']),
        selectedAssigneeIds: parseAssigneeList(params),
        canvasProjectIds: parseProjectList(params),
        selectedVersionIds: parseVersionList(params),
        selectedTrackerIds: parseTrackerList(params),
        memberProjectsOnly: undefined,
        sortConfig: parseSortConfig(params.get('sort')),
        groupBy: groupBy === 'assigned_to' || groupBy === 'assignee' ? 'assignee' : (groupBy === 'project' ? 'project' : null),
        showSubprojects: params.get('show_subprojects') === null ? undefined : params.get('show_subprojects') !== '0',
        visibleColumns: parseColumns(params)
    };
};

export type CanvasQuerySerializationOptions = {
    includeMemberProjectsOnly?: boolean;
    queryContext?: QueryContext;
};

export const serializeCanvasQueryParams = (
    state: Partial<ResolvedQueryState>,
    options: CanvasQuerySerializationOptions = {}
): URLSearchParams => {
    const params = new URLSearchParams();
    const hasPersistedQueryId = isPersistedQueryId(state.queryId);
    const hasExplicitStatusSelection = Array.isArray(state.selectedStatusIds);
    const hasExplicitTrackerSelection = Array.isArray(state.selectedTrackerIds);
    const selectedProjectIds = state.canvasProjectIds ?? state.selectedProjectIds ?? [];

    if (options.queryContext) {
        buildQueryParamsFromQueryContext(options.queryContext).forEach((value, key) => params.append(key, value));
    } else {
        if (hasPersistedQueryId) params.set('query_id', String(state.queryId));
        if (state.selectedStatusIds && state.selectedStatusIds.length > 0) {
            state.selectedStatusIds.forEach((id) => params.append('status_ids[]', String(id)));
        } else if (hasPersistedQueryId && hasExplicitStatusSelection) {
            params.set('set_filter', '1');
            appendStandardFilter(params, 'status_id', '*');
        }
        if (state.selectedTrackerIds && state.selectedTrackerIds.length > 0) {
            state.selectedTrackerIds.forEach((id) => params.append('tracker_ids[]', String(id)));
        } else if (hasPersistedQueryId && hasExplicitTrackerSelection) {
            params.set('set_filter', '1');
            appendStandardFilter(params, 'tracker_id', '*');
        }
        state.selectedAssigneeIds?.forEach((id) => params.append('assigned_to_ids[]', id === null ? 'none' : String(id)));
        state.selectedVersionIds?.forEach((id) => params.append('fixed_version_ids[]', id === '_none' ? 'none' : id));
    }
    if (state.canvasProjectIds !== undefined && selectedProjectIds.length === 0) {
        params.append('canvas_project_ids[]', 'none');
    } else {
        selectedProjectIds.forEach((id) => params.append('canvas_project_ids[]', id));
    }
    if (options.includeMemberProjectsOnly !== false && state.memberProjectsOnly === true) params.set('member_projects_only', '1');
    if (state.groupBy === 'project') params.set('group_by', 'project');
    if (state.groupBy === 'assignee') params.set('group_by', 'assigned_to');
    if (state.groupBy === null) params.set('group_by', 'none');
    if (state.sortConfig?.key) params.set('sort', `${state.sortConfig.key}:${state.sortConfig.direction}`);
    if (state.showSubprojects === false) params.set('show_subprojects', '0');
    state.visibleColumns?.forEach((key) => {
        const redmineColumn = toRedmineColumnName(key);
        if (redmineColumn) params.append('c[]', redmineColumn);
    });

    return params;
};

export const serializeCanvasViewParams = (state: Partial<ResolvedQueryState>): URLSearchParams => {
    const params = new URLSearchParams();
    if (state.sortConfig?.key && !isDefaultSort(state.sortConfig)) {
        params.set('sort', `${state.sortConfig.key}:${state.sortConfig.direction}`);
    }
    state.visibleColumns?.forEach((key) => {
        const redmineColumn = toRedmineColumnName(key);
        if (redmineColumn) params.append('c[]', redmineColumn);
    });
    return params;
};
