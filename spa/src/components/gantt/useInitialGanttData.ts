import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../stores/TaskStore';
import { getMinFiniteStartDate } from '../../utils/taskRange';
import type { CustomFieldMeta } from '../../types/editMeta';
import type { Relation, Task, Version, Viewport } from '../../types';

type Params = {
    viewportFromStorage: boolean;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setCustomFields: (fields: CustomFieldMeta[]) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
};

export const useInitialGanttData = ({
    viewportFromStorage,
    setTasks,
    setRelations,
    setVersions,
    setCustomFields,
    updateViewport
}: Params): void => {
    const hasFetched = useRef(false);

    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;

        import('../../api/client').then(({ apiClient }) => {
            const savedStatusIds = useTaskStore.getState().selectedStatusIds;
            apiClient.fetchData({ statusIds: savedStatusIds }).then(data => {
                setTasks(data.tasks);
                setRelations(data.relations);
                setVersions(data.versions);
                setCustomFields(data.customFields ?? []);
                useTaskStore.getState().setTaskStatuses(data.statuses ?? []);

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
    }, [setCustomFields, setRelations, setTasks, setVersions, updateViewport, viewportFromStorage]);
};
