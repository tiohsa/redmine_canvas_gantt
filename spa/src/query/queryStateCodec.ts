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

export interface SharedQueryProjectStateV2 {
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
    const showSubprojects = typeof record.showSubprojects === 'boolean' ? record.showSubprojects : undefined;
    const visibleColumns = parseStringArray(record.visibleColumns);

    return {
        ...(groupBy !== undefined ? { groupBy } : {}),
        ...(sortConfig ? { sortConfig } : {}),
        ...(showSubprojects !== undefined ? { showSubprojects } : {}),
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
        ...(state?.showSubprojects === false ? { showSubprojects: false } : {}),
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
    projectState: SharedQueryProjectStateV2
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
    if (viewState.showSubprojects !== undefined) state.showSubprojects = viewState.showSubprojects;
    if (viewState.visibleColumns) state.visibleColumns = viewState.visibleColumns;

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
): SharedQueryProjectStateV2 | undefined => {
    const normalized = normalizeForSharedProjectState(state);
    const queryContext = queryContextFromResolvedQueryState(normalized);
    const sharedViewState = sharedViewStateFromResolvedQueryState(normalized);
    const hasQueryState = queryContext.baseQueryId !== null || Object.keys(queryContext.overrides).length > 0;
    const hasViewState = Object.keys(sharedViewState).length > 0;

    if (!hasQueryState && !hasViewState) return undefined;

    return {
        queryContext,
        sharedViewState
    };
};

export const cloneProjectState = (state: SharedQueryProjectStateV2): SharedQueryProjectStateV2 => ({
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
        ...(state.sharedViewState.showSubprojects === false ? { showSubprojects: false } : {}),
        ...(state.sharedViewState.visibleColumns ? { visibleColumns: [...state.sharedViewState.visibleColumns] } : {})
    }
});
