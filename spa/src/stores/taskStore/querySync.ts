import type { SortConfig } from './types';
import type { QueryContext } from '../../query/types';
import { resolvedStateToSharedViewState } from '../../query/queryStateCodec';
import { replaceIssueQueryParamsInUrl, toResolvedQueryStateFromStore } from '../../utils/queryParams';
import { saveLastUsedSharedQueryProjectState } from '../../utils/sharedQueryState';
import { useUIStore } from '../UIStore';
import type { ConfirmedProjectScope } from '../../api/projectScopeContext';

export type SharedQuerySyncState = {
    activeQueryId: number | null;
    queryContext: QueryContext;
    selectedStatusIds: number[];
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    projectSelectionExplicit: boolean;
    inactiveExternalProjectIds?: string[];
    selectedVersionIds: string[];
    selectedTrackerIds: number[];
    memberProjectsOnly: boolean;
    sortConfig: SortConfig;
    groupByProject: boolean;
    groupByAssignee: boolean;
    showSubprojects: boolean;
    visibleColumns?: string[];
    columnsExplicitInQuery?: boolean;
    confirmedProjectScope?: ConfirmedProjectScope | null;
};

export const syncSharedQueryState = (state: SharedQuerySyncState) => {
    const uiState = useUIStore.getState();
    const stateWithConfirmedSelection: SharedQuerySyncState = state.confirmedProjectScope
        ? {
            ...state,
            selectedProjectIds: state.confirmedProjectScope.selectedProjectIds,
            projectSelectionExplicit: state.confirmedProjectScope.selectionExplicit
        }
        : state;
    const effectiveState: SharedQuerySyncState = state.columnsExplicitInQuery === undefined
        ? {
            ...stateWithConfirmedSelection,
            visibleColumns: uiState.columnsExplicitInQuery ? uiState.visibleColumns : undefined,
            columnsExplicitInQuery: uiState.columnsExplicitInQuery
        }
        : stateWithConfirmedSelection;
    const resolvedState = toResolvedQueryStateFromStore(effectiveState);
    replaceIssueQueryParamsInUrl(resolvedState, effectiveState.queryContext);
    saveLastUsedSharedQueryProjectState({
        scopeState: {
            showSubprojects: effectiveState.showSubprojects,
            ...(effectiveState.projectSelectionExplicit ? { canvasProjectIds: [...effectiveState.selectedProjectIds] } : {}),
            ...(effectiveState.inactiveExternalProjectIds?.length
                ? { inactiveExternalProjectIds: [...effectiveState.inactiveExternalProjectIds] }
                : {})
        },
        queryContext: {
            ...state.queryContext,
            baseQueryId: effectiveState.activeQueryId
        },
        sharedViewState: resolvedStateToSharedViewState(resolvedState)
    });
};
