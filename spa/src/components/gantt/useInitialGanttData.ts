import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { getMinFiniteStartDate } from '../../utils/taskRange';
import type { Viewport } from '../../types';
import { replaceIssueQueryParamsInUrl, resolveInitialSharedQueryState } from '../../utils/queryParams';
import { loadLastUsedSharedQueryProjectState } from '../../utils/sharedQueryState';
import { resolvedQueryStateFromProjectState } from '../../query/queryStateCodec';
import { fromLocalDate, toCalendarDate, toTimelineDate, todayCalendarDate } from '../../utils/dateOnly';

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

        const loadInitialData = async () => {
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

            if (
                initialSharedQueryState.state.visibleColumns?.length &&
                (initialSharedQueryState.source === 'url' || (initialSharedQueryState.state.queryId !== null && initialSharedQueryState.state.queryId !== undefined))
            ) {
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

            const hasExplicitInitialState = initialSharedQueryState.source !== 'default';
            const initialState = hasExplicitInitialState
                ? initialSharedQueryState.state
                : undefined;

            await useTaskStore.getState().loadInitialData({
                rawSearch: apiRawSearch,
                query: initialApiQuery,
                queryContext: initialQueryContext,
                initialState
            });
            void useTaskStore.getState().loadSavedQueries();

            if (!viewportFromStorage) {
                const minStart = getMinFiniteStartDate(useTaskStore.getState().allTasks);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const oneYearAgoTimelineDate = toTimelineDate(fromLocalDate(oneYearAgo));

                const startDate = Math.min(
                    minStart === null ? oneYearAgoTimelineDate : toTimelineDate(toCalendarDate(minStart)),
                    oneYearAgoTimelineDate
                );
                const currentViewport = useTaskStore.getState().viewport;
                const now = toTimelineDate(todayCalendarDate());
                const scrollX = Math.max(0, (now - startDate) * currentViewport.scale - 100);

                updateViewport({ startDate, scrollX });
            }
        };

        void loadInitialData().catch(err => console.error('Failed to load Gantt data', err));
    }, [updateViewport, viewportFromStorage]);
};
