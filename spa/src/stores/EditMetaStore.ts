import { create } from 'zustand';
import type { TaskEditMeta } from '../types/editMeta';
import { canApplyReadResponse, createReadContext, type ReadContext } from './taskStore/stateContract';
import { apiClient } from '../api/client';

let editMetaGeneration = 0;

interface EditMetaState {
    metaByTaskId: Record<string, TaskEditMeta>;
    loadingTaskId: string | null;
    error: string | null;
    activeReadContext: ReadContext | null;
    fetchEditMeta: (taskId: string, options?: { targetProjectId?: number; force?: boolean }) => Promise<TaskEditMeta>;
    setCustomFieldValue: (taskId: string, customFieldId: number, value: string | null) => void;
    clearError: () => void;
}

export const useEditMetaStore = create<EditMetaState>((set, get) => ({
    metaByTaskId: {},
    loadingTaskId: null,
    error: null,
    activeReadContext: null,

    fetchEditMeta: async (taskId: string, options) => {
        const cached = get().metaByTaskId[taskId];
        if (cached && !options?.force && options?.targetProjectId === undefined) return cached;

        const context = createReadContext({
            generation: ++editMetaGeneration,
            projectId: options?.targetProjectId?.toString() ?? null,
            query: { taskId, targetProjectId: options?.targetProjectId },
            scope: { taskId },
            purpose: 'edit_meta',
            mergePolicy: 'replace'
        });
        set({ loadingTaskId: taskId, error: null, activeReadContext: context });
        try {
            const meta = await apiClient.fetchEditMeta(taskId, options?.targetProjectId);
            if (!canApplyReadResponse(get().activeReadContext, context)) return meta;
            set((state) => ({
                metaByTaskId: { ...state.metaByTaskId, [taskId]: meta },
                loadingTaskId: null,
                error: null,
                activeReadContext: context
            }));
            return meta;
        } catch (err) {
            if (!canApplyReadResponse(get().activeReadContext, context)) throw err;
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
