import type { BusinessQueryState } from '../types';
import type { QueryContext } from '../query/types';
import { parseCanvasQueryState, serializeCanvasQueryParams } from '../query/canvasQueryUrlCodec';
import { parseRedmineQueryState } from '../query/redmineQueryUrlParser';
import { isDefaultSort } from '../query/querySortCodec';
import { isPersistedQueryId } from '../query/queryIdCodec';
import { toCanvasColumnKey } from '../components/sidebar/sidebarColumnCatalog';

export interface ResolvedQueryState {
    queryId?: number | null;
    // Canvas scope, not Redmine IssueQuery state. Kept here for transport compatibility.
    canvasProjectIds?: string[];
    selectedStatusIds?: number[];
    selectedAssigneeIds?: (number | null)[];
    selectedProjectIds?: string[];
    selectedVersionIds?: string[];
    memberProjectsOnly?: boolean;
    sortConfig?: BusinessQueryState['sortConfig'];
    groupBy?: 'project' | 'assignee' | null;
    showSubprojects?: boolean;
    visibleColumns?: string[];
}

export interface QueryUrlStateSource {
    activeQueryId: number | null;
    selectedStatusIds: number[];
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    projectSelectionExplicit?: boolean;
    selectedVersionIds: string[];
    memberProjectsOnly: boolean;
    sortConfig: BusinessQueryState['sortConfig'];
    groupByProject: boolean;
    groupByAssignee: boolean;
    showSubprojects: boolean;
    visibleColumns?: string[];
    columnsExplicitInQuery?: boolean;
}

type ResolveInitialSharedQueryStateResult = {
    state: ResolvedQueryState;
    source: 'url' | 'storage' | 'default';
};

const normalizeVisibleColumns = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const columns = value.flatMap((entry) => {
        const key = toCanvasColumnKey(String(entry));
        return key ? [key] : [];
    });
    const uniqueColumns = Array.from(new Set(columns));
    return uniqueColumns.length > 0 ? uniqueColumns : undefined;
};

const CONTROLLED_KEYS = [
    'query_id',
    'set_filter',
    'f[]',
    'f',
    'status_ids[]',
    'status_ids',
    'status_id[]',
    'status_id',
    'assigned_to_ids[]',
    'assigned_to_ids',
    'assigned_to_id[]',
    'assigned_to_id',
    'project_ids[]',
    'project_ids',
    'canvas_project_ids[]',
    'canvas_project_ids',
    'fixed_version_ids[]',
    'fixed_version_ids',
    'fixed_version_id[]',
    'fixed_version_id',
    'member_projects_only',
    'group_by',
    'sort',
    'show_subprojects',
    'c[]',
    'c'
] as const;

const isControlledDynamicKey = (key: string): boolean =>
    /^op\[[^\]]+\]$/.test(key) || /^v\[[^\]]+\](?:\[\])?$/.test(key);

const hasValueForAnyParam = (params: URLSearchParams, keys: string[]): boolean =>
    keys.some((key) => params.getAll(key).length > 0);


export const normalizeResolvedQueryState = (state?: Partial<ResolvedQueryState>): ResolvedQueryState | undefined => {
    if (!state) return undefined;

    const normalized: ResolvedQueryState = {};

    const hasPersistedQueryId = isPersistedQueryId(state.queryId ?? undefined);

    if (hasPersistedQueryId) normalized.queryId = state.queryId;
    if (Array.isArray(state.selectedStatusIds) && (state.selectedStatusIds.length > 0 || hasPersistedQueryId)) {
        normalized.selectedStatusIds = [...state.selectedStatusIds];
    }
    if (state.selectedAssigneeIds?.length) normalized.selectedAssigneeIds = [...state.selectedAssigneeIds];
    if (Array.isArray(state.canvasProjectIds)) normalized.canvasProjectIds = [...state.canvasProjectIds];
    if (state.selectedVersionIds?.length) normalized.selectedVersionIds = [...state.selectedVersionIds];
    if (state.sortConfig?.key && !isDefaultSort(state.sortConfig)) {
        normalized.sortConfig = { ...state.sortConfig };
    }
    if (state.groupBy === 'project' && hasPersistedQueryId) normalized.groupBy = 'project';
    if (state.groupBy === 'assignee') normalized.groupBy = 'assignee';
    if (state.groupBy === null) normalized.groupBy = null;
    if (state.showSubprojects === false) normalized.showSubprojects = false;
    if (state.visibleColumns?.length) normalized.visibleColumns = [...state.visibleColumns];

    return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const hasSharedQueryStateInUrl = (search: string = window.location.search): boolean => {
    const params = new URLSearchParams(search);
    const queryIdRaw = params.get('query_id');
    const parsedQueryId = queryIdRaw && /^-?\d+$/.test(queryIdRaw) ? Number(queryIdRaw) : undefined;

    if (isPersistedQueryId(parsedQueryId)) return true;
    if (params.has('group_by') || params.has('sort') || params.has('show_subprojects')) return true;
    if (hasValueForAnyParam(params, ['status_ids[]', 'status_ids', 'status_id[]', 'status_id'])) return true;
    if (hasValueForAnyParam(params, ['assigned_to_ids[]', 'assigned_to_ids', 'assigned_to_id[]', 'assigned_to_id'])) return true;
    if (hasValueForAnyParam(params, ['canvas_project_ids[]', 'canvas_project_ids', 'project_ids[]', 'project_ids'])) return true;
    if (hasValueForAnyParam(params, ['fixed_version_ids[]', 'fixed_version_ids', 'fixed_version_id[]', 'fixed_version_id'])) return true;
    if (hasValueForAnyParam(params, ['c[]', 'c'])) return true;

    const standardFields = params.getAll('f[]').concat(params.getAll('f'));
    return params.get('set_filter') === '1' && standardFields.length > 0;
};

export const toResolvedQueryStateFromStore = (state: QueryUrlStateSource): ResolvedQueryState => ({
    queryId: state.activeQueryId ?? undefined,
    selectedStatusIds: state.selectedStatusIds,
    selectedAssigneeIds: state.selectedAssigneeIds,
    ...(state.projectSelectionExplicit === true ? { canvasProjectIds: state.selectedProjectIds } : {}),
    selectedVersionIds: state.selectedVersionIds,
    memberProjectsOnly: state.memberProjectsOnly,
    sortConfig: state.sortConfig ?? undefined,
    groupBy: state.groupByProject ? 'project' : (state.groupByAssignee ? 'assignee' : null),
    showSubprojects: state.showSubprojects,
    ...(state.columnsExplicitInQuery !== false ? { visibleColumns: state.visibleColumns } : {})
});

export const readIssueQueryParamsFromUrl = (search: string = window.location.search): ResolvedQueryState => {
    const params = new URLSearchParams(search);
    const standardState = parseRedmineQueryState(params);
    const canvasState = parseCanvasQueryState(params);
    const groupBy = params.get('group_by');
    const queryIdRaw = params.get('query_id');
    const parsedQueryId = queryIdRaw && /^-?\d+$/.test(queryIdRaw) ? Number(queryIdRaw) : undefined;

    return {
        queryId: isPersistedQueryId(parsedQueryId) ? parsedQueryId : undefined,
        selectedStatusIds: standardState.selectedStatusIds ?? canvasState.selectedStatusIds,
        selectedAssigneeIds: standardState.selectedAssigneeIds ?? canvasState.selectedAssigneeIds,
        canvasProjectIds: standardState.canvasProjectIds ?? canvasState.canvasProjectIds,
        selectedVersionIds: standardState.selectedVersionIds ?? canvasState.selectedVersionIds,
        memberProjectsOnly: undefined,
        sortConfig: canvasState.sortConfig,
        groupBy: groupBy === 'assigned_to' || groupBy === 'assignee' ? 'assignee' : (groupBy === 'project' ? 'project' : null),
        showSubprojects: canvasState.showSubprojects,
        visibleColumns: canvasState.visibleColumns
    };
};

export const resolveInitialSharedQueryState = (
    search: string,
    storedState?: Partial<ResolvedQueryState>
): ResolveInitialSharedQueryStateResult => {
    const urlState = readIssueQueryParamsFromUrl(search);

    if (hasSharedQueryStateInUrl(search)) {
        return { state: urlState, source: 'url' };
    }

    const normalizedStoredState = normalizeResolvedQueryState(storedState);
    if (normalizedStoredState) {
        return { state: normalizedStoredState, source: 'storage' };
    }

    return { state: {}, source: 'default' };
};

type BuildIssueQueryParamsOptions = {
    includeMemberProjectsOnly?: boolean;
    queryContext?: QueryContext;
};

export const buildIssueQueryParams = (
    state: Partial<ResolvedQueryState>,
    options: BuildIssueQueryParamsOptions = {}
): URLSearchParams => {
    return serializeCanvasQueryParams(state, {
        includeMemberProjectsOnly: options.includeMemberProjectsOnly,
        queryContext: options.queryContext
    });
};


export const mergeControlledQueryParams = (
    currentSearch: string,
    nextParams: URLSearchParams
): URLSearchParams => {
    const params = new URLSearchParams(currentSearch);
    Array.from(params.keys()).forEach((key) => {
        if (CONTROLLED_KEYS.includes(key as typeof CONTROLLED_KEYS[number]) || isControlledDynamicKey(key)) {
            params.delete(key);
        }
    });
    nextParams.forEach((value, key) => params.append(key, value));
    return params;
};

export const replaceBrowserUrl = (url: string): void => {
    window.history.replaceState(window.history.state, '', url);
};

export const replaceIssueQueryParamsInUrl = (state: ResolvedQueryState, queryContext?: QueryContext): void => {
    const nextParams = buildIssueQueryParams(state, { includeMemberProjectsOnly: false, queryContext });
    const mergedParams = mergeControlledQueryParams(window.location.search, nextParams);
    const nextSearch = mergedParams.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    replaceBrowserUrl(nextUrl);
};

export const parseResolvedQueryState = (value: unknown): ResolvedQueryState | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const queryId = Number(record.query_id);
    const groupBy = record.group_by === 'project' || record.group_by === 'assignee'
        ? record.group_by
        : (record.group_by_assignee === true
            ? 'assignee'
            : (record.group_by_project === true ? 'project' : null));
    const sortRecord = record.sort_config && typeof record.sort_config === 'object'
        ? record.sort_config as Record<string, unknown>
        : null;

    return {
        queryId: isPersistedQueryId(queryId) ? queryId : undefined,
        selectedStatusIds: Array.isArray(record.selected_status_ids)
            ? record.selected_status_ids.map((entry) => Number(entry)).filter(Number.isFinite)
            : undefined,
        selectedAssigneeIds: Array.isArray(record.selected_assignee_ids)
            ? Array.from(new Set(record.selected_assignee_ids.flatMap((entry) => {
                if (entry === null || entry === 'none' || entry === '_none') return [null];
                const parsed = Number(entry);
                return Number.isFinite(parsed) ? [parsed] : [];
            })))
            : undefined,
        canvasProjectIds: Array.isArray(record.selected_project_ids)
            ? record.selected_project_ids.map((entry) => String(entry))
            : undefined,
        selectedVersionIds: Array.isArray(record.selected_version_ids)
            ? Array.from(new Set(record.selected_version_ids.flatMap((entry) => {
                const normalized = String(entry);
                if (normalized === 'none' || normalized === '_none') return ['_none'];
                return normalized.match(/^-?\d+$/) ? [normalized] : [];
            })))
            : undefined,
        memberProjectsOnly: typeof record.member_projects_only === 'boolean' ? record.member_projects_only : undefined,
        sortConfig: sortRecord && sortRecord.key
            ? { key: String(sortRecord.key), direction: sortRecord.direction === 'desc' ? 'desc' : 'asc' }
            : undefined,
        groupBy,
        showSubprojects: typeof record.show_subprojects === 'boolean' ? record.show_subprojects : undefined,
        visibleColumns: normalizeVisibleColumns(record.visible_columns)
    };
};
