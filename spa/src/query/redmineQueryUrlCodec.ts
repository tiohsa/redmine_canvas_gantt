import type { QueryContext } from './types';
import type { ResolvedQueryState } from '../utils/queryParams';
import { toBusinessQueryState } from './resolvedQueryStateCodec';
import { buildQueryParamsFromQueryContext } from './queryStateCodec';
import { toRedmineColumnName } from '../components/sidebar/sidebarColumnCatalog';
import { isDefaultSort, toRedmineSortField } from './querySortCodec';
import { isPersistedQueryId } from './queryIdCodec';
import { i18n } from '../utils/i18n';

const appendStandardFilter = (params: URLSearchParams, field: string, operator: string, values: string[] = []): void => {
    params.append('f[]', field);
    params.set(`op[${field}]`, operator);
    values.forEach((value) => params.append(`v[${field}][]`, value));
};

export const serializeRedmineIssueQueryParams = (
    state: Partial<ResolvedQueryState>,
    options: { queryContext?: QueryContext } = {}
): { params: URLSearchParams; notices: string[] } => {
    const params = new URLSearchParams();
    const businessState = toBusinessQueryState(state);
    const queryContextFilterState = options.queryContext
        ? {
            selectedStatusIds: options.queryContext.overrides.status?.mode === 'subset'
                ? options.queryContext.overrides.status.values
                : [],
            selectedAssigneeIds: options.queryContext.overrides.assignee?.mode === 'subset'
                ? options.queryContext.overrides.assignee.values
                : [],
            selectedVersionIds: options.queryContext.overrides.version?.mode === 'subset'
                ? options.queryContext.overrides.version.values
                : [],
            selectedTrackerIds: options.queryContext.overrides.tracker?.mode === 'subset'
                ? options.queryContext.overrides.tracker.values
                : []
        }
        : businessState;
    const notices: string[] = [];
    let hasStandardFilters = false;

    if (options.queryContext) {
        const contextParams = buildQueryParamsFromQueryContext(options.queryContext);
        contextParams.forEach((value, key) => {
            if (!['status_ids[]', 'assigned_to_ids[]', 'fixed_version_ids[]', 'tracker_ids[]'].includes(key)) params.append(key, value);
        });
    } else if (isPersistedQueryId(businessState.queryId)) {
        params.set('query_id', String(businessState.queryId));
    }

    if (queryContextFilterState.selectedStatusIds.length > 0) {
        appendStandardFilter(params, 'status_id', '=', queryContextFilterState.selectedStatusIds.map(String));
        hasStandardFilters = true;
    }

    if (queryContextFilterState.selectedAssigneeIds.length > 0) {
        const numericIds = queryContextFilterState.selectedAssigneeIds.filter((id): id is number => id !== null).map(String);
        const includesNone = queryContextFilterState.selectedAssigneeIds.includes(null);
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

    if (queryContextFilterState.selectedVersionIds.length > 0) {
        const numericVersionIds = queryContextFilterState.selectedVersionIds.filter((id) => id !== '_none');
        if (numericVersionIds.length !== queryContextFilterState.selectedVersionIds.length) {
            notices.push(i18n.t('notice_no_version_filter_omitted_in_redmine_url') || 'No-version filter was omitted because Redmine URL export only supports explicit version IDs.');
        }
        if (numericVersionIds.length > 0) {
            appendStandardFilter(params, 'fixed_version_id', '=', numericVersionIds);
            hasStandardFilters = true;
        }
    }

    if (queryContextFilterState.selectedTrackerIds.length > 0) {
        appendStandardFilter(params, 'tracker_id', '=', queryContextFilterState.selectedTrackerIds.map(String));
        hasStandardFilters = true;
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
        if (sortField && !isDefaultSort(businessState.sortConfig)) {
            params.set('sort', `${sortField}:${businessState.sortConfig.direction}`);
        }
    }

    state.visibleColumns?.forEach((key) => {
        const redmineColumn = toRedmineColumnName(key);
        if (redmineColumn) params.append('c[]', redmineColumn);
    });

    return { params, notices };
};
