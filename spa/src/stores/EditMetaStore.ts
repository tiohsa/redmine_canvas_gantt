import { create } from 'zustand';
import type { TaskEditMeta } from '../types/editMeta';
import { canApplyReadResponse, createReadContext, type ReadContext } from './taskStore/stateContract';
import { buildTaskDraftIntent } from './taskStore/draftIntent';
import { apiClient } from '../api/client';
import { useTaskStore } from './TaskStore';

let editMetaGeneration = 0;

export interface FetchEditMetaOptions {
    targetProjectId?: number;
    targetTrackerId?: number;
    targetStatusId?: number;
    force?: boolean;
}

const editMetaInFlight = new Map<string, Promise<TaskEditMeta>>();

const positiveInteger = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const draftIntentFor = (taskId: string, options?: FetchEditMetaOptions): Record<string, unknown> | null => {
    const taskState = useTaskStore.getState();
    const patches = taskState.localTaskPatches[taskId] ?? [];
    const fromPatches = buildTaskDraftIntent(taskId, taskState.serverTaskSnapshot, patches);
    const intent: Record<string, unknown> = { ...(fromPatches ?? {}) };

    const projectId = positiveInteger(options?.targetProjectId);
    const trackerId = positiveInteger(options?.targetTrackerId);
    const statusId = positiveInteger(options?.targetStatusId);
    if (projectId !== undefined) intent.project_id = projectId;
    if (trackerId !== undefined) intent.tracker_id = trackerId;
    if (statusId !== undefined) intent.status_id = statusId;

    const intentFields = Object.keys(intent).filter(field => field !== 'lock_version');
    if (intentFields.length === 0) return null;
    if (!Object.prototype.hasOwnProperty.call(intent, 'lock_version')) {
        const revision = taskState.serverTaskSnapshot.revisions[taskId];
        if (revision !== undefined) intent.lock_version = revision;
    }
    return intent;
};

const stableIntentSignature = (intent: Record<string, unknown> | null): string => {
    if (!intent) return '{}';
    return JSON.stringify(Object.fromEntries(Object.entries(intent).sort(([left], [right]) => left.localeCompare(right))));
};

const contextKey = (taskId: string, intent: Record<string, unknown> | null): string => (
    `${taskId}:${stableIntentSignature(intent)}`
);

const cachedMetaMatchesPersistedTask = (taskId: string, meta: TaskEditMeta): boolean => {
    const context = meta.capabilityContext;
    if (!context) return meta.task.id === taskId;
    const taskState = useTaskStore.getState();
    const task = taskState.serverTaskSnapshot.entitiesById[taskId]
        ?? taskState.allTasks.find(candidate => candidate.id === taskId);
    if (!task) return context.taskId === taskId;
    return context.taskId === taskId &&
        (task.projectId === undefined || context.projectId === Number(task.projectId)) &&
        (task.trackerId === undefined || context.trackerId === task.trackerId) &&
        context.statusId === task.statusId;
};

interface EditMetaState {
    metaByTaskId: Record<string, TaskEditMeta>;
    contextKeyByTaskId: Record<string, string>;
    loadingByTaskId: Record<string, boolean>;
    latestReadContextByTaskId: Record<string, ReadContext>;
    errorByTaskId: Record<string, string>;
    error: string | null;
    fetchEditMeta: (taskId: string, options?: FetchEditMetaOptions) => Promise<TaskEditMeta>;
    setCustomFieldValue: (taskId: string, customFieldId: number, value: string | null) => void;
    clearError: (taskId?: string) => void;
}

export const useEditMetaStore = create<EditMetaState>((set, get) => ({
    metaByTaskId: {},
    contextKeyByTaskId: {},
    loadingByTaskId: {},
    latestReadContextByTaskId: {},
    errorByTaskId: {},
    error: null,

    fetchEditMeta: async (taskId: string, options) => {
        const draftIntent = draftIntentFor(taskId, options);
        const key = contextKey(taskId, draftIntent);
        const cached = get().metaByTaskId[taskId];
        const cachedKey = get().contextKeyByTaskId[taskId];
        if (cached && !options?.force && (
            cachedKey === key || (!draftIntent && cachedKey === undefined && cachedMetaMatchesPersistedTask(taskId, cached))
        )) return cached;

        const existing = editMetaInFlight.get(key);
        if (existing) return existing;

        const context = createReadContext({
            generation: ++editMetaGeneration,
            projectId: null,
            query: { taskId, draftIntent },
            scope: { taskId },
            purpose: 'edit_meta',
            mergePolicy: 'replace'
        });
        set((state) => ({
            latestReadContextByTaskId: { ...state.latestReadContextByTaskId, [taskId]: context },
            loadingByTaskId: { ...state.loadingByTaskId, [taskId]: true },
            error: null,
            errorByTaskId: Object.fromEntries(Object.entries(state.errorByTaskId).filter(([id]) => id !== taskId))
        }));

        const request = async (): Promise<TaskEditMeta> => {
            try {
                const meta = await apiClient.fetchEditMeta(
                    taskId,
                    undefined,
                    undefined,
                    undefined,
                    draftIntent ?? undefined
                );
                if (!canApplyReadResponse(get().latestReadContextByTaskId[taskId] ?? null, context)) return meta;
                set((state) => ({
                    metaByTaskId: { ...state.metaByTaskId, [taskId]: meta },
                    contextKeyByTaskId: { ...state.contextKeyByTaskId, [taskId]: key },
                    loadingByTaskId: Object.fromEntries(Object.entries(state.loadingByTaskId).filter(([id]) => id !== taskId))
                }));
                return meta;
            } catch (err) {
                if (!canApplyReadResponse(get().latestReadContextByTaskId[taskId] ?? null, context)) throw err;
                const message = err instanceof Error ? err.message : 'Failed to load edit meta';
                set((state) => ({
                    error: message,
                    errorByTaskId: { ...state.errorByTaskId, [taskId]: message },
                    loadingByTaskId: Object.fromEntries(Object.entries(state.loadingByTaskId).filter(([id]) => id !== taskId))
                }));
                throw err;
            }
        };

        const promise = request();
        editMetaInFlight.set(key, promise);
        try {
            return await promise;
        } finally {
            if (editMetaInFlight.get(key) === promise) editMetaInFlight.delete(key);
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

    clearError: (taskId) => set((state) => ({
        error: null,
        errorByTaskId: taskId
            ? Object.fromEntries(Object.entries(state.errorByTaskId).filter(([id]) => id !== taskId))
            : {}
    }))
}));
