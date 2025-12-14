import { create } from 'zustand';
import type { TaskEditMeta } from '../types/editMeta';

interface EditMetaState {
    metaByTaskId: Record<string, TaskEditMeta>;
    loadingTaskId: string | null;
    error: string | null;
    fetchEditMeta: (taskId: string) => Promise<TaskEditMeta>;
    setCustomFieldValue: (taskId: string, customFieldId: number, value: string | null) => void;
    clearError: () => void;
}

export const useEditMetaStore = create<EditMetaState>((set, get) => ({
    metaByTaskId: {},
    loadingTaskId: null,
    error: null,

    fetchEditMeta: async (taskId: string) => {
        const cached = get().metaByTaskId[taskId];
        if (cached) return cached;

        set({ loadingTaskId: taskId, error: null });
        try {
            const { apiClient } = await import('../api/client');
            const meta = await apiClient.fetchEditMeta(taskId);
            set((state) => ({
                metaByTaskId: { ...state.metaByTaskId, [taskId]: meta },
                loadingTaskId: null,
                error: null
            }));
            return meta;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load edit meta';
            set({ loadingTaskId: null, error: message });
            throw err;
        }
    },

    setCustomFieldValue: (taskId: string, customFieldId: number, value: string | null) => set((state) => {
        const current = state.metaByTaskId[taskId];
        if (!current) return state;

        return {
            metaByTaskId: {
                ...state.metaByTaskId,
                [taskId]: {
                    ...current,
                    customFieldValues: { ...current.customFieldValues, [String(customFieldId)]: value }
                }
            }
        };
    }),

    clearError: () => set({ error: null })
}));
