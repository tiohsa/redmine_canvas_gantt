import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { getMinFiniteStartDate } from '../../utils/taskRange';
import type { Viewport } from '../../types';
import { replaceIssueQueryParamsInUrl, resolveInitialSharedQueryState } from '../../utils/queryParams';
import { loadLastUsedSharedQueryProjectState } from '../../utils/sharedQueryState';
import { resolvedQueryStateFromProjectState, resolvedStateToQueryContext } from '../../query/queryStateCodec';
import { fromLocalDate } from '../../utils/dateOnly';

type Params = {
    viewportFromStorage: boolean;
    updateViewport: (updates: Partial<Viewport>) => void;
};

export const useInitialGanttData = ({
    viewportFromStorage,
    updateViewport
}: Params): void => {
    const hasFetched = useRef(false);

    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;

        import('../../api/client').then(({ apiClient }) => {
            const storedProjectState = loadLastUsedSharedQueryProjectState();
            const initialSharedQueryState = resolveInitialSharedQueryState(
                window.location.search,
                storedProjectState ? resolvedQueryStateFromProjectState(storedProjectState) : undefined
            );
            const initialQueryContext = initialSharedQueryState.source === 'storage'
                ? storedProjectState?.queryContext
                : undefined;

            if (initialSharedQueryState.source === 'storage') {
                replaceIssueQueryParamsInUrl(initialSharedQueryState.state, initialQueryContext);
            }

            if (initialSharedQueryState.state.visibleColumns?.length) {
                useUIStore.getState().applyQueryVisibleColumns(initialSharedQueryState.state.visibleColumns);
            }

            useTaskStore.getState().restoreActiveQueryId(initialSharedQueryState.state.queryId ?? null);
            useTaskStore.getState().restoreCanvasScope(initialSharedQueryState.state);
            const groupByWasExplicit = initialSharedQueryState.source === 'storage'
                ? initialSharedQueryState.state.groupBy !== undefined
                : initialSharedQueryState.source === 'url' && new URLSearchParams(window.location.search).has('group_by');
            if (groupByWasExplicit) {
                useTaskStore.getState().restoreExplicitGroupByOverride(initialSharedQueryState.state.groupBy);
            }

            const memberProjectsOnly = useTaskStore.getState().memberProjectsOnly;
            const initialApiQuery = memberProjectsOnly
                ? { ...initialSharedQueryState.state, memberProjectsOnly: true }
                : initialSharedQueryState.state;
            const initialRawSearch = initialSharedQueryState.source === 'url'
                ? window.location.search
                : undefined;
            const apiRawSearch = initialRawSearch && memberProjectsOnly
                ? (() => {
                    const params = new URLSearchParams(initialRawSearch);
                    params.set('member_projects_only', '1');
                    return `?${params.toString()}`;
                })()
                : initialRawSearch;

            apiClient.fetchData({
                rawSearch: apiRawSearch,
                query: initialApiQuery,
                queryContext: initialQueryContext
            }).then(data => {
                const hasExplicitInitialState = initialSharedQueryState.source !== 'default';
                const initialState = hasExplicitInitialState
                    ? { ...data.initialState, ...initialSharedQueryState.state }
                    : data.initialState;
                const queryContext = hasExplicitInitialState
                    ? (initialQueryContext ?? resolvedStateToQueryContext(initialSharedQueryState.state))
                    : data.queryContext;

                useTaskStore.getState().applyApiData({
                    ...data,
                    initialState,
                    queryContext
                });
                void useTaskStore.getState().loadSavedQueries();

                if (!viewportFromStorage) {
                    const minStart = getMinFiniteStartDate(data.tasks);
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    oneYearAgo.setHours(0, 0, 0, 0);
                    const oneYearAgoCalendarDate = fromLocalDate(oneYearAgo);

                    const startDate = Math.min(minStart ?? oneYearAgoCalendarDate, oneYearAgoCalendarDate);
                    const currentViewport = useTaskStore.getState().viewport;
                    const now = fromLocalDate(new Date());
                    const scrollX = Math.max(0, (now - startDate) * currentViewport.scale - 100);

                    updateViewport({ startDate, scrollX });
                }
            }).catch(err => console.error('Failed to load Gantt data', err));
        });
    }, [updateViewport, viewportFromStorage]);
};
