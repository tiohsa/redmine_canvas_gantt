import type { BusinessQueryState } from '../types';
import type { ResolvedQueryState } from '../utils/queryParams';

export const toBusinessQueryState = (state: Partial<ResolvedQueryState> = {}): BusinessQueryState => ({
    queryId: state.queryId ?? null,
    selectedStatusIds: state.selectedStatusIds ?? [],
    selectedAssigneeIds: state.selectedAssigneeIds ?? [],
    selectedProjectIds: state.canvasProjectIds ?? state.selectedProjectIds ?? [],
    selectedVersionIds: state.selectedVersionIds ?? [],
    selectedTrackerIds: state.selectedTrackerIds ?? [],
    memberProjectsOnly: state.memberProjectsOnly ?? false,
    sortConfig: state.sortConfig ?? null,
    groupByProject: state.groupBy === 'project',
    groupByAssignee: state.groupBy === 'assignee',
    showSubprojects: state.showSubprojects ?? true
});
