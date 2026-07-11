import type { SortConfig } from './types';
import type { QueryContext } from '../../query/types';
import { resolvedStateToSharedViewState } from '../../query/queryStateCodec';
import { replaceIssueQueryParamsInUrl, toResolvedQueryStateFromStore } from '../../utils/queryParams';
import { saveLastUsedSharedQueryProjectState } from '../../utils/sharedQueryState';
import { useUIStore } from '../UIStore';

export type SharedQuerySyncState = {
    activeQueryId: number | null;
    queryContext: QueryContext;
    selectedStatusIds: number[];
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    projectSelectionExplicit: boolean;
    selectedVersionIds: string[];
    memberProjectsOnly: boolean;
    sortConfig: SortConfig;
    groupByProject: boolean;
    groupByAssignee: boolean;
    showSubprojects: boolean;
    visibleColumns?: string[];
    columnsExplicitInQuery?: boolean;
};

export const syncSharedQueryState = (state: SharedQuerySyncState) => {
    const uiState = useUIStore.getState();
    const effectiveState: SharedQuerySyncState = state.columnsExplicitInQuery === undefined
        ? {
            ...state,
            visibleColumns: uiState.columnsExplicitInQuery ? uiState.visibleColumns : undefined,
            columnsExplicitInQuery: uiState.columnsExplicitInQuery
        }
        : state;
    const resolvedState = toResolvedQueryStateFromStore(effectiveState);
    replaceIssueQueryParamsInUrl(resolvedState, effectiveState.queryContext);
    saveLastUsedSharedQueryProjectState({
        scopeState: {
            showSubprojects: state.showSubprojects,
            ...(state.projectSelectionExplicit ? { canvasProjectIds: [...state.selectedProjectIds] } : {})
        },
        queryContext: {
            ...state.queryContext,
            baseQueryId: effectiveState.activeQueryId
        },
        sharedViewState: resolvedStateToSharedViewState(resolvedState)
    });
};
