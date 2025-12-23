import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Task, Relation, Version, TaskStatus } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';

interface TaskData {
    tasks: Task[];
    relations: Relation[];
    versions: Version[];
    statuses: TaskStatus[];
}

export const useTasks = () => {
    return useQuery<TaskData>({
        queryKey: ['tasks'],
        queryFn: async () => {
            const { selectedStatusIds } = useTaskStore.getState();
            const data = await apiClient.fetchData({ statusIds: selectedStatusIds });
            return {
                tasks: data.tasks,
                relations: data.relations,
                versions: data.versions,
                statuses: data.statuses,
            };
        },
    });
};

export const useUpdateTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (task: Task) => {
            // Include lock_version implicitly if present in task
            const result = await apiClient.updateTask(task);
            if (result.status === 'conflict') {
                throw new Error(result.error || 'Conflict detected');
            }
            if (result.status === 'error') {
                throw new Error(result.error || 'Update failed');
            }
            return result; // Expected to return { status: 'ok', lockVersion: ... }
        },
        onMutate: async (updatedTask) => {
            await queryClient.cancelQueries({ queryKey: ['tasks'] });

            const prevData = queryClient.getQueryData<TaskData>(['tasks']);

            if (prevData) {
                // Optimistic Update
                const newTasks = prevData.tasks.map((t) =>
                    t.id === updatedTask.id ? { ...t, ...updatedTask } : t
                );

                queryClient.setQueryData<TaskData>(['tasks'], {
                    ...prevData,
                    tasks: newTasks,
                });
            }

            return { prevData };
        },
        onError: (err, _updatedTask, ctx) => {
            console.error('Mutation error:', err);
            if (ctx?.prevData) {
                queryClient.setQueryData(['tasks'], ctx.prevData);
            }
            useUIStore.getState().addNotification(
                (err instanceof Error ? err.message : 'Update failed'),
                'error'
            );
        },
        onSuccess: (_data, updatedTask) => {
            // With Redmine API, the update response might only contain lockVersion or status,
            // not the full task object.
            // The instructions say: "Server response must be reflected".
            // If the server doesn't return the full object, we might need to refetch or confirm the local change is valid.
            // However, typical Redmine update (PUT) is 200/204.
            // If the instruction implies "Server normalization", we should probably REFETCH or trust the optimistic update + lockVersion from response.
            // Given "Optimistic UI + Server Normalization" usually means "Use server response data".
            // Since Redmine update endpoint often doesn't return the full object (just status),
            // "Server normalization" in this context (without full return) effectively means "Refetch" OR "Update lock version".

            // However, let's look at the instruction: "onSuccess: (serverData) => queryClient.setQueryData(queryKey, serverData);"
            // This implies the mutationFn SHOULD return the full data or we refetch.
            // But apiClient.updateTask currently returns { status, lockVersion }.
            // So we can't fully overwrite with "serverData" unless we refetch.
            // "onSettled: invalidateQueries" will trigger a refetch.

            // To strictly follow "Server response ... as truth", if the response is partial,
            // we update what we have (lockVersion) and rely on invalidation for the rest.

            // Wait, "Server response must be reflected".
            // If I just invalidate, it will fetch.

            if (_data.lockVersion !== undefined) {
                 queryClient.setQueryData<TaskData>(['tasks'], (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        tasks: old.tasks.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask, lockVersion: _data.lockVersion } : t)
                    };
                });
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
    });
};
