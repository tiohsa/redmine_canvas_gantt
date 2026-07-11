import type {
    AssigneeFilterOverride,
    QueryContext,
    QueryOverrides,
    StatusFilterOverride,
    VersionFilterOverride
} from './types';

type OverrideKey = keyof QueryOverrides;

export const createDefaultQueryContext = (): QueryContext => ({
    baseQueryId: null,
    overrides: {}
});

export const selectSavedQuery = (queryId: number): QueryContext => ({
    baseQueryId: queryId,
    overrides: {}
});

export const clearSavedQueryToStandalone = (effectiveOverrides: QueryOverrides): QueryContext => ({
    baseQueryId: null,
    overrides: cloneOverrides(effectiveOverrides)
});

export const setStatusOverride = (
    queryContext: QueryContext,
    override: StatusFilterOverride
): QueryContext => setOverride(queryContext, 'status', override);

export const setAssigneeOverride = (
    queryContext: QueryContext,
    override: AssigneeFilterOverride
): QueryContext => setOverride(queryContext, 'assignee', override);

export const setVersionOverride = (
    queryContext: QueryContext,
    override: VersionFilterOverride
): QueryContext => setOverride(queryContext, 'version', override);

export const isQueryModified = (queryContext: QueryContext): boolean =>
    Object.keys(queryContext.overrides).length > 0;

const setOverride = <K extends OverrideKey>(
    queryContext: QueryContext,
    key: K,
    override: NonNullable<QueryOverrides[K]>
): QueryContext => {
    const overrides = cloneOverrides(queryContext.overrides);

    if (override.mode === 'inherit') {
        delete overrides[key];
    } else {
        overrides[key] = cloneOverride(override) as QueryOverrides[K];
    }

    return {
        baseQueryId: queryContext.baseQueryId,
        overrides
    };
};

const cloneOverrides = (overrides: QueryOverrides): QueryOverrides => ({
    ...(overrides.status ? { status: cloneOverride(overrides.status) } : {}),
    ...(overrides.assignee ? { assignee: cloneOverride(overrides.assignee) } : {}),
    ...(overrides.version ? { version: cloneOverride(overrides.version) } : {})
});

const cloneOverride = <TOverride extends QueryOverrides[OverrideKey]>(
    override: NonNullable<TOverride>
): NonNullable<TOverride> => {
    if (override.mode === 'subset') {
        return { ...override, values: [...override.values] } as NonNullable<TOverride>;
    }

    return { ...override } as NonNullable<TOverride>;
};
