import type { ResolvedQueryState } from '../utils/queryParams';
import type {
    AssigneeFilterOverride,
    ProjectFilterOverride,
    QueryContext,
    QueryOverrides,
    SharedViewState,
    StatusFilterOverride,
    VersionFilterOverride
} from './types';

export type PersistedSharedViewState = Partial<SharedViewState>;

export interface SharedQueryProjectStateV3 {
    scopeState: {
        showSubprojects: boolean;
    };
    queryContext: QueryContext;
    sharedViewState: PersistedSharedViewState;
}

const DEFAULT_SORT_KEY = 'startDate';
const DEFAULT_SORT_DIRECTION = 'asc';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isPersistedQueryId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

const parseNumberArray = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) return null;
    const parsed = value.flatMap((entry) => {
        if (typeof entry === 'number' && Number.isFinite(entry)) return [entry];
        if (typeof entry === 'string' && /^-?\d+$/.test(entry)) return [Number(entry)];
        return [];
    });
    return parsed.length === value.length ? parsed : null;
};

const parseNumberOrNullArray = (value: unknown): (number | null)[] | null => {
    if (!Array.isArray(value)) return null;
    const parsed = value.flatMap((entry) => {
        if (entry === null || entry === 'none' || entry === '_none') return [null];
        if (typeof entry === 'number' && Number.isFinite(entry)) return [entry];
        if (typeof entry === 'string' && /^-?\d+$/.test(entry)) return [Number(entry)];
        return [];
    });
    return parsed.length === value.length ? parsed : null;
};

const parseStringArray = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
        ? [...value]
        : null;

const cloneOverride = <T extends QueryOverrides[keyof QueryOverrides]>(
    override: NonNullable<T>
): NonNullable<T> => {
    if (override.mode === 'subset') {
        return { ...override, values: [...override.values] } as NonNullable<T>;
    }

    return { ...override } as NonNullable<T>;
};

const normalizeProjectOverride = (override: unknown): ProjectFilterOverride | undefined => {
    const record = isRecord(override) ? override : null;
    if (!record) return undefined;
    if (record.mode === 'inherit') return { mode: 'inherit' };
    if (record.mode === 'all') return { mode: 'all' };
    if (record.mode === 'none') return { mode: 'none' };
    if (record.mode !== 'subset') return undefined;
    const values = parseStringArray(record.values);
    return values ? { mode: 'subset', values } : undefined;
};

const normalizeStatusOverride = (override: unknown): StatusFilterOverride | undefined => {
    const record = isRecord(override) ? override : null;
    if (!record) return undefined;
    if (record.mode === 'inherit') return { mode: 'inherit' };
    if (record.mode === 'all') return { mode: 'all' };
    if (record.mode !== 'subset') return undefined;
    const values = parseNumberArray(record.values);
    return values ? { mode: 'subset', values } : undefined;
};

const normalizeAssigneeOverride = (override: unknown): AssigneeFilterOverride | undefined => {
    const record = isRecord(override) ? override : null;
    if (!record) return undefined;
    if (record.mode === 'inherit') return { mode: 'inherit' };
    if (record.mode === 'all') return { mode: 'all' };
    if (record.mode !== 'subset') return undefined;
    const values = parseNumberOrNullArray(record.values);
    return values ? { mode: 'subset', values } : undefined;
};

const normalizeVersionOverride = (override: unknown): VersionFilterOverride | undefined => {
    const record = isRecord(override) ? override : null;
    if (!record) return undefined;
    if (record.mode === 'inherit') return { mode: 'inherit' };
    if (record.mode === 'all') return { mode: 'all' };
    if (record.mode !== 'subset') return undefined;
    const values = parseStringArray(record.values);
    return values ? { mode: 'subset', values } : undefined;
};

export const normalizeQueryContext = (value: unknown): QueryContext => {
    const record = isRecord(value) ? value : {};
    const rawQueryId = record.baseQueryId ?? record.query_id;
    const queryId = typeof rawQueryId === 'number'
        ? rawQueryId
        : (typeof rawQueryId === 'string' && /^-?\d+$/.test(rawQueryId) ? Number(rawQueryId) : null);
    const overridesRecord = isRecord(record.overrides)
        ? record.overrides
        : (isRecord(record.explicit_overrides) ? record.explicit_overrides : {});
    const project = normalizeProjectOverride(overridesRecord.project);
    const status = normalizeStatusOverride(overridesRecord.status);
    const assignee = normalizeAssigneeOverride(overridesRecord.assignee);
    const version = normalizeVersionOverride(overridesRecord.version);

    return {
        baseQueryId: isPersistedQueryId(queryId) ? queryId : null,
        overrides: {
            ...(project && project.mode !== 'inherit' ? { project } : {}),
            ...(status && status.mode !== 'inherit' ? { status } : {}),
            ...(assignee && assignee.mode !== 'inherit' ? { assignee } : {}),
            ...(version && version.mode !== 'inherit' ? { version } : {})
        }
    };
};

export const normalizeSharedViewState = (value: unknown): PersistedSharedViewState => {
    const record = isRecord(value) ? value : {};
    const sortRecord = isRecord(record.sortConfig) ? record.sortConfig : null;
    const groupBy = record.groupBy === 'project' || record.groupBy === 'assignee' || record.groupBy === null
        ? record.groupBy
        : undefined;
    const sortConfig = sortRecord && typeof sortRecord.key === 'string'
        ? { key: sortRecord.key, direction: sortRecord.direction === 'desc' ? 'desc' as const : 'asc' as const }
        : undefined;
    const visibleColumns = parseStringArray(record.visibleColumns);

    return {
        ...(groupBy !== undefined ? { groupBy } : {}),
        ...(sortConfig ? { sortConfig } : {}),
        ...(visibleColumns ? { visibleColumns } : {})
    };
};

export const queryContextFromResolvedQueryState = (state?: Partial<ResolvedQueryState>): QueryContext => {
    const overrides: QueryOverrides = {};

    if (Array.isArray(state?.selectedStatusIds)) {
        overrides.status = state.selectedStatusIds.length > 0
            ? { mode: 'subset', values: [...state.selectedStatusIds] }
            : { mode: 'all' };
    }
    if (Array.isArray(state?.selectedAssigneeIds)) {
        overrides.assignee = state.selectedAssigneeIds.length > 0
            ? { mode: 'subset', values: [...state.selectedAssigneeIds] }
            : { mode: 'all' };
    }
    if (Array.isArray(state?.selectedProjectIds)) {
        overrides.project = state.selectedProjectIds.length > 0
            ? { mode: 'subset', values: [...state.selectedProjectIds] }
            : { mode: 'none' };
    }
    if (Array.isArray(state?.selectedVersionIds)) {
        overrides.version = state.selectedVersionIds.length > 0
            ? { mode: 'subset', values: [...state.selectedVersionIds] }
            : { mode: 'all' };
    }

    return {
        baseQueryId: state?.queryId && isPersistedQueryId(state.queryId) ? state.queryId : null,
        overrides
    };
};

export const sharedViewStateFromResolvedQueryState = (
    state?: Partial<ResolvedQueryState>
): PersistedSharedViewState => {
    const hasPersistedQueryId = isPersistedQueryId(state?.queryId);
    const groupBy = state?.groupBy === 'assignee' || state?.groupBy === null || (state?.groupBy === 'project' && hasPersistedQueryId)
        ? state.groupBy
        : undefined;

    return {
        ...(groupBy !== undefined ? { groupBy } : {}),
        ...(state?.sortConfig?.key && !(state.sortConfig.key === DEFAULT_SORT_KEY && state.sortConfig.direction === DEFAULT_SORT_DIRECTION)
            ? { sortConfig: { ...state.sortConfig } }
            : {}),
        ...(state?.visibleColumns ? { visibleColumns: [...state.visibleColumns] } : {})
    };
};

const applyOverrideToResolved = <T>(
    override: { mode: 'inherit' | 'all' } | { mode: 'none' } | { mode: 'subset'; values: T[] } | undefined
): T[] | undefined => {
    if (!override || override.mode === 'inherit') return undefined;
    if (override.mode === 'subset') return [...override.values];
    return [];
};

export const resolvedQueryStateFromProjectState = (
    projectState: SharedQueryProjectStateV3
): ResolvedQueryState => {
    const context = normalizeQueryContext(projectState.queryContext);
    const viewState = normalizeSharedViewState(projectState.sharedViewState);
    const state: ResolvedQueryState = {};

    if (context.baseQueryId) state.queryId = context.baseQueryId;

    const selectedStatusIds = applyOverrideToResolved(context.overrides.status);
    const selectedAssigneeIds = applyOverrideToResolved(context.overrides.assignee);
    const selectedProjectIds = applyOverrideToResolved(context.overrides.project);
    const selectedVersionIds = applyOverrideToResolved(context.overrides.version);

    if (selectedStatusIds !== undefined) state.selectedStatusIds = selectedStatusIds;
    if (selectedAssigneeIds !== undefined) state.selectedAssigneeIds = selectedAssigneeIds;
    if (selectedProjectIds !== undefined) state.selectedProjectIds = selectedProjectIds;
    if (selectedVersionIds !== undefined) state.selectedVersionIds = selectedVersionIds;
    if (viewState.sortConfig) state.sortConfig = viewState.sortConfig;
    if (viewState.groupBy !== undefined) state.groupBy = viewState.groupBy;
    if (viewState.visibleColumns) state.visibleColumns = viewState.visibleColumns;

    if (projectState.scopeState?.showSubprojects === false) {
        state.showSubprojects = false;
    }

    return state;
};

const normalizeForSharedProjectState = (state: Partial<ResolvedQueryState>): Partial<ResolvedQueryState> => {
    const normalized: Partial<ResolvedQueryState> = {};
    const hasPersistedQueryId = isPersistedQueryId(state.queryId);

    if (hasPersistedQueryId) normalized.queryId = state.queryId;
    if (Array.isArray(state.selectedStatusIds) && (state.selectedStatusIds.length > 0 || hasPersistedQueryId)) {
        normalized.selectedStatusIds = [...state.selectedStatusIds];
    }
    if (state.selectedAssigneeIds?.length) normalized.selectedAssigneeIds = [...state.selectedAssigneeIds];
    if (Array.isArray(state.selectedProjectIds)) normalized.selectedProjectIds = [...state.selectedProjectIds];
    if (state.selectedVersionIds?.length) normalized.selectedVersionIds = [...state.selectedVersionIds];
    if (state.groupBy === 'project' && hasPersistedQueryId) normalized.groupBy = 'project';
    if (state.groupBy === 'assignee') normalized.groupBy = 'assignee';
    if (state.groupBy === null) normalized.groupBy = null;
    if (state.sortConfig?.key && !(state.sortConfig.key === DEFAULT_SORT_KEY && state.sortConfig.direction === DEFAULT_SORT_DIRECTION)) {
        normalized.sortConfig = { ...state.sortConfig };
    }
    if (state.showSubprojects === false) normalized.showSubprojects = false;
    if (state.visibleColumns?.length) normalized.visibleColumns = [...state.visibleColumns];

    return normalized;
};

export const projectStateFromResolvedQueryState = (
    state: Partial<ResolvedQueryState>
): SharedQueryProjectStateV3 | undefined => {
    const normalized = normalizeForSharedProjectState(state);
    const queryContext = queryContextFromResolvedQueryState(normalized);
    const sharedViewState = sharedViewStateFromResolvedQueryState(normalized);
    const hasQueryState = queryContext.baseQueryId !== null || Object.keys(queryContext.overrides).length > 0;
    const hasViewState = Object.keys(sharedViewState).length > 0;
    const showSubprojects = state.showSubprojects ?? true;

    if (!hasQueryState && !hasViewState && showSubprojects === true) return undefined;

    return {
        scopeState: {
            showSubprojects
        },
        queryContext,
        sharedViewState
    };
};

export const cloneProjectState = (state: SharedQueryProjectStateV3): SharedQueryProjectStateV3 => ({
    scopeState: {
        showSubprojects: state.scopeState.showSubprojects
    },
    queryContext: {
        baseQueryId: state.queryContext.baseQueryId,
        overrides: {
            ...(state.queryContext.overrides.project ? { project: cloneOverride(state.queryContext.overrides.project) } : {}),
            ...(state.queryContext.overrides.status ? { status: cloneOverride(state.queryContext.overrides.status) } : {}),
            ...(state.queryContext.overrides.assignee ? { assignee: cloneOverride(state.queryContext.overrides.assignee) } : {}),
            ...(state.queryContext.overrides.version ? { version: cloneOverride(state.queryContext.overrides.version) } : {})
        }
    },
    sharedViewState: {
        ...(state.sharedViewState.groupBy !== undefined ? { groupBy: state.sharedViewState.groupBy } : {}),
        ...(state.sharedViewState.sortConfig ? { sortConfig: { ...state.sharedViewState.sortConfig } } : {}),
        ...(state.sharedViewState.visibleColumns ? { visibleColumns: [...state.sharedViewState.visibleColumns] } : {})
    }
});

// URL parsing helper functions
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

const parseAssigneeList = (params: URLSearchParams): (number | null)[] | undefined => {
    const values = parseStringList(params, ['assigned_to_ids[]', 'assigned_to_ids', 'assigned_to_id[]', 'assigned_to_id']);
    if (!values) return undefined;
    return values.flatMap((value) => {
        if (value === '_none' || value === 'none' || value === '!' || value === '!*') return [null];
        return /^-?\d+$/.test(value) ? [Number(value)] : [];
    });
};

const parseVersionList = (params: URLSearchParams): string[] | undefined => {
    const values = parseStringList(params, ['fixed_version_ids[]', 'fixed_version_ids', 'fixed_version_id[]', 'fixed_version_id']);
    if (!values) return undefined;
    return values.flatMap((value) => {
        if (value === '_none' || value === 'none' || value === '!' || value === '!*') return ['_none'];
        return /^-?\d+$/.test(value) ? [value] : [];
    });
};

const parseRedmineFilters = (params: URLSearchParams): Record<string, { operator: string; values: string[] }> => {
    const filters: Record<string, { operator: string; values: string[] }> = {};
    const fields = params.getAll('f[]').concat(params.getAll('f'));
    fields.forEach((field) => {
        const operator = params.get(`op[${field}]`) ?? '';
        const values = params.getAll(`v[${field}][]`).concat(params.getAll(`v[${field}]`));
        filters[field] = { operator, values };
    });
    return filters;
};

export const parseQueryContextFromUrl = (search: string = window.location.search): QueryContext => {
    const params = new URLSearchParams(search);
    const queryIdRaw = params.get('query_id');
    const baseQueryId = queryIdRaw && /^-?\d+$/.test(queryIdRaw) ? Number(queryIdRaw) : null;

    const overrides: QueryOverrides = {};
    const hasSetFilter = params.get('set_filter') === '1';
    const filters = parseRedmineFilters(params);

    // 1. Status Filter
    const statusValues = parseIntegerList(params, ['status_ids[]', 'status_ids', 'status_id[]', 'status_id']);
    if (statusValues !== undefined) {
        overrides.status = statusValues.length > 0
            ? { mode: 'subset', values: statusValues }
            : { mode: 'all' };
    } else if (hasSetFilter && filters.status_id) {
        const { operator, values } = filters.status_id;
        if (operator === '=') {
            overrides.status = { mode: 'subset', values: parseIntegerTokens(values) };
        } else if (operator === '*') {
            overrides.status = { mode: 'all' };
        }
    }

    // 2. Assignee Filter
    const assigneeValues = parseAssigneeList(params);
    if (assigneeValues !== undefined) {
        overrides.assignee = assigneeValues.length > 0
            ? { mode: 'subset', values: assigneeValues }
            : { mode: 'all' };
    } else if (hasSetFilter && filters.assigned_to_id) {
        const { operator, values } = filters.assigned_to_id;
        if (operator === '=') {
            const parsed = parseStringTokens(values).flatMap((value) => {
                if (value === 'none' || value === '_none') return [null];
                return /^-?\d+$/.test(value) ? [Number(value)] : [];
            });
            overrides.assignee = { mode: 'subset', values: parsed };
        } else if (operator === '*') {
            overrides.assignee = { mode: 'all' };
        } else if (operator === '!*') {
            overrides.assignee = { mode: 'subset', values: [null] };
        }
    }

    // 3. Project Filter
    const projectIds = params.getAll('project_ids[]');
    const projectIdsNoBrackets = params.getAll('project_ids');
    const projectIdsCombined = [...projectIds, ...projectIdsNoBrackets];
    
    if (projectIdsCombined.length > 0) {
        const cleanValues = projectIdsCombined.flatMap(v => v.split(/[|,]/)).map(v => v.trim()).filter(Boolean);
        if (cleanValues.every(v => v === 'none' || v === '_none')) {
            overrides.project = { mode: 'none' };
        } else {
            overrides.project = { mode: 'subset', values: cleanValues.filter(v => v !== 'none' && v !== '_none') };
        }
    } else if (hasSetFilter && filters.project_id) {
        const { operator, values } = filters.project_id;
        if (operator === '=') {
            overrides.project = { mode: 'subset', values: parseStringTokens(values) };
        } else if (operator === '*') {
            overrides.project = { mode: 'all' };
        }
    }

    // 4. Version Filter
    const versionValues = parseVersionList(params);
    if (versionValues !== undefined) {
        overrides.version = versionValues.length > 0
            ? { mode: 'subset', values: versionValues }
            : { mode: 'all' };
    } else if (hasSetFilter && filters.fixed_version_id) {
        const { operator, values } = filters.fixed_version_id;
        if (operator === '=') {
            const parsed = parseStringTokens(values).flatMap((value) => {
                if (value === 'none' || value === '_none') return ['_none'];
                return /^-?\d+$/.test(value) ? [value] : [];
            });
            overrides.version = { mode: 'subset', values: parsed };
        } else if (operator === '*') {
            overrides.version = { mode: 'all' };
        }
    }

    return {
        baseQueryId,
        overrides
    };
};

export const buildQueryParamsFromQueryContext = (context: QueryContext): URLSearchParams => {
    const params = new URLSearchParams();
    if (context.baseQueryId) {
        params.set('query_id', String(context.baseQueryId));
    }

    const { project, status, assignee, version } = context.overrides;

    // 1. Project
    if (project) {
        if (project.mode === 'none') {
            params.append('project_ids[]', 'none');
        } else if (project.mode === 'subset') {
            project.values.forEach(id => params.append('project_ids[]', id));
        } else if (project.mode === 'all') {
            if (context.baseQueryId) {
                params.set('set_filter', '1');
                params.append('f[]', 'project_id');
                params.set('op[project_id]', '*');
            }
        }
    }

    // 2. Status
    if (status) {
        if (status.mode === 'subset') {
            status.values.forEach(id => params.append('status_ids[]', String(id)));
        } else if (status.mode === 'all') {
            if (context.baseQueryId) {
                params.set('set_filter', '1');
                params.append('f[]', 'status_id');
                params.set('op[status_id]', '*');
            }
        }
    }

    // 3. Assignee
    if (assignee) {
        if (assignee.mode === 'subset') {
            assignee.values.forEach(id => params.append('assigned_to_ids[]', id === null ? 'none' : String(id)));
        } else if (assignee.mode === 'all') {
            if (context.baseQueryId) {
                params.set('set_filter', '1');
                params.append('f[]', 'assigned_to_id');
                params.set('op[assigned_to_id]', '*');
            }
        }
    }

    // 4. Version
    if (version) {
        if (version.mode === 'subset') {
            version.values.forEach(id => params.append('fixed_version_ids[]', id === '_none' ? 'none' : id));
        } else if (version.mode === 'all') {
            if (context.baseQueryId) {
                params.set('set_filter', '1');
                params.append('f[]', 'fixed_version_id');
                params.set('op[fixed_version_id]', '*');
            }
        }
    }

    return params;
};

export const serializeQueryContext = (context: QueryContext): unknown => {
    return {
        baseQueryId: context.baseQueryId,
        overrides: context.overrides
    };
};

export const deserializeQueryContext = (value: unknown): QueryContext => {
    return normalizeQueryContext(value);
};
