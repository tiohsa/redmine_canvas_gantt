import { create } from 'zustand';
import type { TaskEditMeta } from '../types/editMeta';
import { canApplyReadResponse, createReadContext, type ReadContext } from './taskStore/stateContract';
import { apiClient } from '../api/client';
import { useTaskStore } from './TaskStore';

let editMetaGeneration = 0;

export interface FetchEditMetaOptions {
    targetProjectId?: number;
    targetTrackerId?: number;
    targetStatusId?: number;
    force?: boolean;
}

type RequestedContext = {
    taskId: string;
    projectId?: number;
    trackerId?: number;
    statusId?: number;
};

type WireContext = RequestedContext & {
    targetProjectId?: number;
    targetTrackerId?: number;
    targetStatusId?: number;
};

type EffectiveContext = {
    projectId?: number;
    trackerId?: number;
    statusId?: number;
};

const editMetaInFlight = new Map<string, Promise<TaskEditMeta>>();

const positiveInteger = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const taskContext = (taskId: string): { projectId?: number; trackerId?: number; statusId?: number } => {
    const task = useTaskStore.getState().allTasks.find((candidate) => candidate.id === taskId);
    return {
        projectId: positiveInteger(task?.projectId),
        trackerId: positiveInteger(task?.trackerId),
        statusId: positiveInteger(task?.statusId)
    };
};

const resolveRequestContext = (taskId: string, options?: FetchEditMetaOptions, remembered?: EffectiveContext): { requested: RequestedContext; wire: WireContext } => {
    const current = taskContext(taskId);
    const effective = {
        projectId: current.projectId ?? remembered?.projectId,
        trackerId: current.trackerId ?? remembered?.trackerId,
        statusId: current.statusId ?? remembered?.statusId
    };
    const targetProjectId = positiveInteger(options?.targetProjectId);
    const targetTrackerId = positiveInteger(options?.targetTrackerId);
    const targetStatusId = positiveInteger(options?.targetStatusId);
    const hasExplicitTarget = targetProjectId !== undefined || targetTrackerId !== undefined || targetStatusId !== undefined;

    // Always send the currently effective local Task values to the server when
    // available.  This is what makes Auto-save OFF a real draft preview rather
    // than a read of the persisted Issue.  Requested fields remain separate so
    // a project-only preview may be normalized to that project's tracker/status.
    const wire: WireContext = {
        taskId,
        targetProjectId: targetProjectId ?? effective.projectId,
        targetTrackerId: targetTrackerId ?? effective.trackerId,
        targetStatusId: targetStatusId ?? effective.statusId
    };

    const requested: RequestedContext = {
        taskId,
        projectId: targetProjectId ?? effective.projectId,
        trackerId: targetTrackerId ?? (hasExplicitTarget ? undefined : effective.trackerId),
        statusId: targetStatusId ?? (hasExplicitTarget ? undefined : effective.statusId)
    };

    return { requested, wire };
};

const capabilityContextFor = (meta: TaskEditMeta) => meta.capabilityContext ?? {
    taskId: meta.task.id,
    projectId: meta.task.projectId,
    trackerId: meta.task.trackerId,
    statusId: meta.task.statusId
};

const matchesRequestedContext = (meta: TaskEditMeta, requested: RequestedContext): boolean => {
    const context = capabilityContextFor(meta);
    return context.taskId === requested.taskId &&
        (requested.projectId === undefined || context.projectId === requested.projectId) &&
        (requested.trackerId === undefined || context.trackerId === requested.trackerId) &&
        (requested.statusId === undefined || context.statusId === requested.statusId);
};

const contextKey = (context: WireContext): string => [
    context.taskId,
    context.targetProjectId ?? '*',
    context.targetTrackerId ?? '*',
    context.targetStatusId ?? '*'
].join(':');

interface EditMetaState {
    metaByTaskId: Record<string, TaskEditMeta>;
    defaultContextByTaskId: Record<string, EffectiveContext>;
    loadingTaskId: string | null;
    error: string | null;
    activeReadContext: ReadContext | null;
    fetchEditMeta: (taskId: string, options?: FetchEditMetaOptions) => Promise<TaskEditMeta>;
    setCustomFieldValue: (taskId: string, customFieldId: number, value: string | null) => void;
    clearError: () => void;
}

export const useEditMetaStore = create<EditMetaState>((set, get) => ({
    metaByTaskId: {},
    defaultContextByTaskId: {},
    loadingTaskId: null,
    error: null,
    activeReadContext: null,

    fetchEditMeta: async (taskId: string, options) => {
        const { requested, wire } = resolveRequestContext(taskId, options, get().defaultContextByTaskId[taskId]);
        const cached = get().metaByTaskId[taskId];
        if (cached && !options?.force && matchesRequestedContext(cached, requested)) return cached;

        const key = contextKey(wire);
        const existing = editMetaInFlight.get(key);
        if (existing) return existing;

        const context = createReadContext({
            generation: ++editMetaGeneration,
            projectId: wire.targetProjectId?.toString() ?? null,
            query: {
                taskId,
                targetProjectId: wire.targetProjectId,
                targetTrackerId: wire.targetTrackerId,
                targetStatusId: wire.targetStatusId
            },
            scope: { taskId },
            purpose: 'edit_meta',
            mergePolicy: 'replace'
        });
        set({ loadingTaskId: taskId, error: null, activeReadContext: context });

        const request = async (): Promise<TaskEditMeta> => {
            try {
                let meta: TaskEditMeta;
                if (wire.targetStatusId !== undefined) {
                    meta = await apiClient.fetchEditMeta(taskId, wire.targetProjectId, wire.targetTrackerId, wire.targetStatusId);
                } else if (wire.targetTrackerId !== undefined) {
                    meta = await apiClient.fetchEditMeta(taskId, wire.targetProjectId, wire.targetTrackerId);
                } else if (wire.targetProjectId !== undefined) {
                    meta = await apiClient.fetchEditMeta(taskId, wire.targetProjectId);
                } else {
                    meta = await apiClient.fetchEditMeta(taskId);
                }
                if (!canApplyReadResponse(get().activeReadContext, context)) return meta;
                set((state) => ({
                    // Keep one current capability snapshot per task.  A
                    // destination preview must not become the source cache.
                    metaByTaskId: { ...state.metaByTaskId, [taskId]: meta },
                    defaultContextByTaskId: options && (options.targetProjectId !== undefined || options.targetTrackerId !== undefined || options.targetStatusId !== undefined)
                        ? state.defaultContextByTaskId
                        : { ...state.defaultContextByTaskId, [taskId]: capabilityContextFor(meta) },
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

    clearError: () => set({ error: null })
}));
