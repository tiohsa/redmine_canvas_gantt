import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../stores/TaskStore';
import { getMinFiniteStartDate } from '../../utils/taskRange';
import type { Viewport } from '../../types';
import { replaceIssueQueryParamsInUrl, resolveInitialSharedQueryState } from '../../utils/queryParams';
import { loadLastUsedSharedQueryState } from '../../utils/sharedQueryState';

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
            const initialSharedQueryState = resolveInitialSharedQueryState(
                window.location.search,
                loadLastUsedSharedQueryState()
            );

            if (initialSharedQueryState.source === 'storage') {
                replaceIssueQueryParamsInUrl(initialSharedQueryState.state);
            }

            apiClient.fetchData({
                rawSearch: initialSharedQueryState.source === 'url' ? window.location.search : undefined,
                query: initialSharedQueryState.state
            }).then(data => {
                useTaskStore.getState().applyApiData(data);
                void useTaskStore.getState().loadSavedQueries();

                if (!viewportFromStorage) {
                    const minStart = getMinFiniteStartDate(data.tasks);
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    oneYearAgo.setHours(0, 0, 0, 0);

                    const startDate = Math.min(minStart ?? oneYearAgo.getTime(), oneYearAgo.getTime());
                    const currentViewport = useTaskStore.getState().viewport;
                    const now = new Date().setHours(0, 0, 0, 0);
                    const scrollX = Math.max(0, (now - startDate) * currentViewport.scale - 100);

                    updateViewport({ startDate, scrollX });
                }
            }).catch(err => console.error('Failed to load Gantt data', err));
        });
    }, [updateViewport, viewportFromStorage]);
};
