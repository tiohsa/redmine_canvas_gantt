import type { SortConfig } from './types';
import { replaceIssueQueryParamsInUrl, toResolvedQueryStateFromStore } from '../../utils/queryParams';
import { saveLastUsedSharedQueryState } from '../../utils/sharedQueryState';

export type SharedQuerySyncState = {
    activeQueryId: number | null;
    selectedStatusIds: number[];
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    selectedVersionIds: string[];
    memberProjectsOnly: boolean;
    sortConfig: SortConfig;
    groupByProject: boolean;
    groupByAssignee: boolean;
    showSubprojects: boolean;
};

export const syncSharedQueryState = (state: SharedQuerySyncState) => {
    const resolvedState = toResolvedQueryStateFromStore(state);
    replaceIssueQueryParamsInUrl(resolvedState);
    saveLastUsedSharedQueryState(resolvedState);
};
