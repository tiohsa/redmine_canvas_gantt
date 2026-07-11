import type { SortConfig } from './types';
import type { QueryContext } from '../../query/types';
import { sharedViewStateFromResolvedQueryState } from '../../query/queryStateCodec';
import { replaceIssueQueryParamsInUrl, toResolvedQueryStateFromStore } from '../../utils/queryParams';
import { saveLastUsedSharedQueryProjectState } from '../../utils/sharedQueryState';

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
};

export const syncSharedQueryState = (state: SharedQuerySyncState) => {
    const resolvedState = toResolvedQueryStateFromStore(state);
    replaceIssueQueryParamsInUrl(resolvedState, state.queryContext);
    saveLastUsedSharedQueryProjectState({
        scopeState: {
            showSubprojects: state.showSubprojects,
            ...(state.projectSelectionExplicit ? { canvasProjectIds: [...state.selectedProjectIds] } : {})
        },
        queryContext: {
            ...state.queryContext,
            baseQueryId: state.activeQueryId
        },
        sharedViewState: sharedViewStateFromResolvedQueryState(resolvedState)
    });
};
