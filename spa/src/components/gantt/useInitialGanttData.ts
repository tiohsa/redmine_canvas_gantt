import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { useBaselineStore } from '../../stores/BaselineStore';
import { getMinFiniteStartDate } from '../../utils/taskRange';
import type { CustomFieldMeta } from '../../types/editMeta';
import type { FilterOptions, Relation, Task, Version, Viewport } from '../../types';
import { replaceIssueQueryParamsInUrl, resolveInitialSharedQueryState, toResolvedQueryStateFromStore } from '../../utils/queryParams';
import { loadLastUsedSharedQueryState } from '../../utils/sharedQueryState';

type Params = {
    viewportFromStorage: boolean;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setFilterOptions: (filterOptions: FilterOptions) => void;
    setCustomFields: (fields: CustomFieldMeta[]) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
};

export const useInitialGanttData = ({
    viewportFromStorage,
    setTasks,
    setRelations,
    setVersions,
    setFilterOptions,
    setCustomFields,
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
                useTaskStore.getState().applyResolvedQueryState(
                    data.initialState ?? toResolvedQueryStateFromStore(useTaskStore.getState())
                );
                setFilterOptions(data.filterOptions);
                setTasks(data.tasks);
                setRelations(data.relations);
                setVersions(data.versions);
                setCustomFields(data.customFields ?? []);
                useTaskStore.getState().setTaskStatuses(data.statuses ?? []);
                useTaskStore.getState().setPermissions(data.permissions ?? { editable: false, viewable: false, baselineEditable: false });
                useBaselineStore.getState().setSnapshot(data.baseline ?? null, data.warnings ?? []);
                void useTaskStore.getState().loadSavedQueries();
                (data.warnings ?? []).forEach((warning) => useUIStore.getState().addNotification(warning, 'warning'));

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
    }, [setCustomFields, setFilterOptions, setRelations, setTasks, setVersions, updateViewport, viewportFromStorage]);
};
