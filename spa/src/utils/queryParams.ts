import type { BusinessQueryState } from '../types';
import { i18n } from './i18n';

export interface ResolvedQueryState {
    queryId?: number | null;
    selectedStatusIds?: number[];
    selectedAssigneeIds?: (number | null)[];
    selectedProjectIds?: string[];
    selectedVersionIds?: string[];
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
    selectedVersionIds: string[];
    sortConfig: BusinessQueryState['sortConfig'];
    groupByProject: boolean;
    groupByAssignee: boolean;
    showSubprojects: boolean;
    visibleColumns?: string[];
}

type ResolveInitialSharedQueryStateResult = {
    state: ResolvedQueryState;
    source: 'url' | 'storage' | 'default';
};

const SORT_FIELD_TO_REDMINE: Record<string, string> = {
    id: 'id',
    subject: 'subject',
    projectName: 'project',
    trackerName: 'tracker',
    statusId: 'status',
    priorityId: 'priority',
    assignedToName: 'assigned_to',
    authorName: 'author',
    startDate: 'start_date',
    dueDate: 'due_date',
    estimatedHours: 'estimated_hours',
    ratioDone: 'done_ratio',
    fixedVersionName: 'fixed_version',
    categoryName: 'category',
    createdOn: 'created_on',
    updatedOn: 'updated_on',
    spentHours: 'spent_hours'
};

const REDMINE_SORT_TO_FIELD = Object.fromEntries(
    Object.entries(SORT_FIELD_TO_REDMINE).map(([field, redmine]) => [redmine, field])
) as Record<string, string>;

const COLUMN_TO_REDMINE: Record<string, string> = {
    id: 'id',
    project: 'project',
    tracker: 'tracker',
    status: 'status',
    priority: 'priority',
    subject: 'subject',
    author: 'author',
    assignee: 'assigned_to',
    updatedOn: 'updated_on',
    category: 'category',
    version: 'fixed_version',
    startDate: 'start_date',
    dueDate: 'due_date',
    estimatedHours: 'estimated_hours',
    ratioDone: 'done_ratio',
    createdOn: 'created_on',
    spentHours: 'spent_hours'
};

const isPersistedQueryId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

const parseIntegerList = (params: URLSearchParams, keys: string[]): number[] | undefined => {
    const values = keys.flatMap((key) => params.getAll(key));
    if (values.length === 0) return undefined;

    return values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter((value) => /^-?\d+$/.test(value))
        .map(Number);
};

const parseIntegerTokens = (values: string[]): number[] =>
    values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter((value) => /^-?\d+$/.test(value))
        .map(Number);

const parseStringTokens = (values: string[]): string[] =>
    values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter(Boolean);

const parseStringList = (params: URLSearchParams, keys: string[]): string[] | undefined => {
    const values = keys.flatMap((key) => params.getAll(key));
    if (values.length === 0) return undefined;

    return values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter(Boolean);
};

const appendStandardFilter = (params: URLSearchParams, field: string, operator: string, values: string[] = []): void => {
    params.append('f[]', field);
    params.set(`op[${field}]`, operator);
    values.forEach((value) => params.append(`v[${field}][]`, value));
};

const readStandardFilterValues = (params: URLSearchParams, field: string): string[] =>
    params.getAll(`v[${field}][]`).concat(params.getAll(`v[${field}]`));

const parseStandardQueryState = (params: URLSearchParams): Partial<ResolvedQueryState> => {
    if (params.get('set_filter') !== '1') return {};

    const fields = params.getAll('f[]').concat(params.getAll('f'));
    if (fields.length === 0) return {};

    const standardState: Partial<ResolvedQueryState> = {};

    fields.forEach((field) => {
        const operator = params.get(`op[${field}]`) ?? '';
        const values = readStandardFilterValues(params, field);

        switch (field) {
            case 'status_id':
                if (operator === '=') {
                    standardState.selectedStatusIds = parseIntegerTokens(values);
                } else if (operator === '*') {
                    standardState.selectedStatusIds = [];
                }
                break;
            case 'assigned_to_id':
                if (operator === '=') {
                    standardState.selectedAssigneeIds = parseStringTokens(values).flatMap((value) => {
                        if (value === 'none' || value === '_none') return [null];
                        return /^-?\d+$/.test(value) ? [Number(value)] : [];
                    });
                } else if (operator === '*') {
                    standardState.selectedAssigneeIds = [];
                } else if (operator === '!*') {
                    standardState.selectedAssigneeIds = [null];
                }
                break;
            case 'project_id':
                if (operator === '=') {
                    standardState.selectedProjectIds = parseStringTokens(values);
                } else if (operator === '*') {
                    standardState.selectedProjectIds = [];
                }
                break;
            case 'fixed_version_id':
                if (operator === '=') {
                    standardState.selectedVersionIds = parseStringTokens(values).flatMap((value) => {
                        if (value === 'none' || value === '_none') return ['_none'];
                        return /^-?\d+$/.test(value) ? [value] : [];
                    });
                } else if (operator === '*') {
                    standardState.selectedVersionIds = [];
                }
                break;
            case 'subproject_id':
                if (operator === '!*') standardState.showSubprojects = false;
                if (operator === '*') standardState.showSubprojects = true;
                break;
            default:
                break;
        }
    });

    return standardState;
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
    const values = parseStringList(params, ['project_ids[]', 'project_ids']);
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
    'fixed_version_ids[]',
    'fixed_version_ids',
    'fixed_version_id[]',
    'fixed_version_id',
    'group_by',
    'sort',
    'show_subprojects'
] as const;

const isControlledDynamicKey = (key: string): boolean =>
    /^op\[[^\]]+\]$/.test(key) || /^v\[[^\]]+\](?:\[\])?$/.test(key);

const parseSortConfig = (rawSort: string | null): BusinessQueryState['sortConfig'] | undefined => {
    const [rawField, rawDirection] = (rawSort || '').split(':', 2);
    if (!rawField) return undefined;

    const direction = rawDirection === 'desc' ? 'desc' : 'asc';
    const key = REDMINE_SORT_TO_FIELD[rawField] ?? rawField;

    return { key, direction };
};

const toRedmineSortField = (key: string): string | null => SORT_FIELD_TO_REDMINE[key] ?? null;
const DEFAULT_SORT_KEY = 'startDate';
const DEFAULT_SORT_DIRECTION = 'asc';
const hasValueForAnyParam = (params: URLSearchParams, keys: string[]): boolean =>
    keys.some((key) => params.getAll(key).length > 0);

export const toBusinessQueryState = (state: Partial<ResolvedQueryState> = {}): BusinessQueryState => ({
    queryId: state.queryId ?? null,
    selectedStatusIds: state.selectedStatusIds ?? [],
    selectedAssigneeIds: state.selectedAssigneeIds ?? [],
    selectedProjectIds: state.selectedProjectIds ?? [],
    selectedVersionIds: state.selectedVersionIds ?? [],
    sortConfig: state.sortConfig ?? null,
    groupByProject: state.groupBy === 'project',
    groupByAssignee: state.groupBy === 'assignee',
    showSubprojects: state.showSubprojects ?? true
});

export const normalizeResolvedQueryState = (state?: Partial<ResolvedQueryState>): ResolvedQueryState | undefined => {
    if (!state) return undefined;

    const normalized: ResolvedQueryState = {};

    if (isPersistedQueryId(state.queryId ?? undefined)) normalized.queryId = state.queryId;
    if (state.selectedStatusIds?.length) normalized.selectedStatusIds = [...state.selectedStatusIds];
    if (state.selectedAssigneeIds?.length) normalized.selectedAssigneeIds = [...state.selectedAssigneeIds];
    if (state.selectedProjectIds?.length) normalized.selectedProjectIds = [...state.selectedProjectIds];
    if (state.selectedVersionIds?.length) normalized.selectedVersionIds = [...state.selectedVersionIds];
    if (state.sortConfig?.key && !(state.sortConfig.key === DEFAULT_SORT_KEY && state.sortConfig.direction === DEFAULT_SORT_DIRECTION)) {
        normalized.sortConfig = { ...state.sortConfig };
    }
    if (state.groupBy === 'assignee') normalized.groupBy = 'assignee';
    if (state.showSubprojects === false) normalized.showSubprojects = false;

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
    if (hasValueForAnyParam(params, ['project_ids[]', 'project_ids'])) return true;
    if (hasValueForAnyParam(params, ['fixed_version_ids[]', 'fixed_version_ids', 'fixed_version_id[]', 'fixed_version_id'])) return true;

    const standardFields = params.getAll('f[]').concat(params.getAll('f'));
    return params.get('set_filter') === '1' && standardFields.length > 0;
};

export const toResolvedQueryStateFromStore = (state: QueryUrlStateSource): ResolvedQueryState => ({
    queryId: state.activeQueryId ?? undefined,
    selectedStatusIds: state.selectedStatusIds,
    selectedAssigneeIds: state.selectedAssigneeIds,
    selectedProjectIds: state.selectedProjectIds,
    selectedVersionIds: state.selectedVersionIds,
    sortConfig: state.sortConfig ?? undefined,
    groupBy: state.groupByProject ? 'project' : (state.groupByAssignee ? 'assignee' : null),
    showSubprojects: state.showSubprojects,
    visibleColumns: state.visibleColumns
});

export const readIssueQueryParamsFromUrl = (search: string = window.location.search): ResolvedQueryState => {
    const params = new URLSearchParams(search);
    const standardState = parseStandardQueryState(params);
    const groupBy = params.get('group_by');
    const queryIdRaw = params.get('query_id');
    const parsedQueryId = queryIdRaw && /^-?\d+$/.test(queryIdRaw) ? Number(queryIdRaw) : undefined;

    return {
        queryId: isPersistedQueryId(parsedQueryId) ? parsedQueryId : undefined,
        selectedStatusIds: standardState.selectedStatusIds ?? parseIntegerList(params, ['status_ids[]', 'status_ids', 'status_id[]', 'status_id']),
        selectedAssigneeIds: standardState.selectedAssigneeIds ?? parseAssigneeList(params),
        selectedProjectIds: standardState.selectedProjectIds ?? parseProjectList(params),
        selectedVersionIds: standardState.selectedVersionIds ?? parseVersionList(params),
        sortConfig: parseSortConfig(params.get('sort')),
        groupBy: groupBy === 'assigned_to' || groupBy === 'assignee' ? 'assignee' : (groupBy === 'project' ? 'project' : null),
        showSubprojects: params.get('show_subprojects') === null ? standardState.showSubprojects : params.get('show_subprojects') !== '0'
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

    return { state: urlState, source: 'default' };
};

export const buildIssueQueryParams = (state: Partial<ResolvedQueryState>): URLSearchParams => {
    const params = new URLSearchParams();
    const businessState = toBusinessQueryState(state);

    if (isPersistedQueryId(businessState.queryId)) params.set('query_id', String(businessState.queryId));
    businessState.selectedStatusIds.forEach((id) => params.append('status_ids[]', String(id)));
    businessState.selectedAssigneeIds.forEach((id) => params.append('assigned_to_ids[]', id === null ? 'none' : String(id)));
    if (state.selectedProjectIds !== undefined && businessState.selectedProjectIds.length === 0) {
        params.append('project_ids[]', 'none');
    } else {
        businessState.selectedProjectIds.forEach((id) => params.append('project_ids[]', id));
    }
    businessState.selectedVersionIds.forEach((id) => params.append('fixed_version_ids[]', id === '_none' ? 'none' : id));
    if (state.groupBy === 'project') params.set('group_by', 'project');
    if (state.groupBy === 'assignee') params.set('group_by', 'assigned_to');
    if (businessState.sortConfig?.key) params.set('sort', `${businessState.sortConfig.key}:${businessState.sortConfig.direction}`);
    if (state.showSubprojects === false) params.set('show_subprojects', '0');

    return params;
};

export const buildRedmineIssueQueryParams = (
    state: Partial<ResolvedQueryState>
): { params: URLSearchParams; notices: string[] } => {
    const params = new URLSearchParams();
    const businessState = toBusinessQueryState(state);
    const notices: string[] = [];
    let hasStandardFilters = false;

    if (isPersistedQueryId(businessState.queryId)) params.set('query_id', String(businessState.queryId));

    if (businessState.selectedStatusIds.length > 0) {
        appendStandardFilter(params, 'status_id', '=', businessState.selectedStatusIds.map(String));
        hasStandardFilters = true;
    }

    if (businessState.selectedAssigneeIds.length > 0) {
        const numericIds = businessState.selectedAssigneeIds.filter((id): id is number => id !== null).map(String);
        const includesNone = businessState.selectedAssigneeIds.includes(null);

        if (includesNone && numericIds.length > 0) {
            notices.push(i18n.t('notice_unassigned_filter_omitted_in_redmine_url') || 'Unassigned assignee filter was omitted because Redmine URL export cannot combine it with specific assignees.');
        }

        if (numericIds.length > 0) {
            appendStandardFilter(params, 'assigned_to_id', '=', numericIds);
            hasStandardFilters = true;
        } else if (includesNone) {
            appendStandardFilter(params, 'assigned_to_id', '!*');
            hasStandardFilters = true;
        }
    }

    if (businessState.selectedProjectIds.length > 0) {
        appendStandardFilter(params, 'project_id', '=', businessState.selectedProjectIds);
        hasStandardFilters = true;
    }

    if (businessState.selectedVersionIds.length > 0) {
        const numericVersionIds = businessState.selectedVersionIds.filter((id) => id !== '_none');

        if (numericVersionIds.length !== businessState.selectedVersionIds.length) {
            notices.push(i18n.t('notice_no_version_filter_omitted_in_redmine_url') || 'No-version filter was omitted because Redmine URL export only supports explicit version IDs.');
        }

        if (numericVersionIds.length > 0) {
            appendStandardFilter(params, 'fixed_version_id', '=', numericVersionIds);
            hasStandardFilters = true;
        }
    }

    if (state.showSubprojects === false) {
        appendStandardFilter(params, 'subproject_id', '!*');
        hasStandardFilters = true;
    }

    if (hasStandardFilters) params.set('set_filter', '1');
    if (state.groupBy === 'project' && hasStandardFilters) params.set('group_by', 'project');
    if (state.groupBy === 'assignee') params.set('group_by', 'assigned_to');

    if (businessState.sortConfig?.key) {
        const sortField = toRedmineSortField(businessState.sortConfig.key);
        const isDefaultSort = businessState.sortConfig.key === DEFAULT_SORT_KEY && businessState.sortConfig.direction === DEFAULT_SORT_DIRECTION;
        if (sortField && !isDefaultSort) params.set('sort', `${sortField}:${businessState.sortConfig.direction}`);
    }

    if (state.visibleColumns && state.visibleColumns.length > 0) {
        state.visibleColumns.forEach((key) => {
            const redmineCol = COLUMN_TO_REDMINE[key];
            if (redmineCol) {
                params.append('c[]', redmineCol);
            }
        });
    }

    return { params, notices };
};

export const replaceIssueQueryParamsInUrl = (state: ResolvedQueryState): void => {
    const params = new URLSearchParams(window.location.search);
    Array.from(params.keys()).forEach((key) => {
        if (CONTROLLED_KEYS.includes(key as typeof CONTROLLED_KEYS[number]) || isControlledDynamicKey(key)) {
            params.delete(key);
        }
    });
    const nextParams = buildIssueQueryParams(state);
    nextParams.forEach((value, key) => params.append(key, value));
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
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
        selectedProjectIds: Array.isArray(record.selected_project_ids)
            ? record.selected_project_ids.map((entry) => String(entry))
            : undefined,
        selectedVersionIds: Array.isArray(record.selected_version_ids)
            ? Array.from(new Set(record.selected_version_ids.flatMap((entry) => {
                const normalized = String(entry);
                if (normalized === 'none' || normalized === '_none') return ['_none'];
                return normalized.match(/^-?\d+$/) ? [normalized] : [];
            })))
            : undefined,
        sortConfig: sortRecord && sortRecord.key
            ? { key: String(sortRecord.key), direction: sortRecord.direction === 'desc' ? 'desc' : 'asc' }
            : undefined,
        groupBy,
        showSubprojects: typeof record.show_subprojects === 'boolean' ? record.show_subprojects : undefined
    };
};
