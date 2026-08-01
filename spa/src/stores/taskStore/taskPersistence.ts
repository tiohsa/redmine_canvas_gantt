import type { Relation, Task } from '../../types';
import type { MoveTaskAsChildResult } from '../../types';
import { i18n } from '../../utils/i18n';
import type { TaskLayoutSnapshot } from './types';
import type { MutationMetadata, MutationStatus } from '../../api/client';

export type UpdateTaskFieldsResult = MutationMetadata & {
    status: MutationStatus | 'error';
    error?: string;
    lockVersion?: number;
    parentId?: string;
};

type FetchDataResult = {
    tasks: Task[];
};

type FetchDataParams = {
    query?: {
        selectedStatusIds?: number[];
    };
};

const taskWriteQueues = new Map<string, Promise<void>>();
let mutationSequence = 0;
const activeMutationOperations = new Map<string, MutationOperationRecord>();
const completedMutationOperations = new Map<string, MutationOperationRecord>();
const MAX_COMPLETED_MUTATIONS = 128;

export const mutationLifecycleMetrics = {
    started: 0,
    completed: 0,
    failed: 0,
    active: 0,
    maxActive: 0,
    maxPendingKeys: 0
};

export const resetMutationLifecycleMetrics = () => {
    mutationLifecycleMetrics.started = 0;
    mutationLifecycleMetrics.completed = 0;
    mutationLifecycleMetrics.failed = 0;
    mutationLifecycleMetrics.active = 0;
    mutationLifecycleMetrics.maxActive = 0;
    mutationLifecycleMetrics.maxPendingKeys = 0;
};

export type MutationOperationStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type MutationOperationRecord = MutationOperationContext & {
    status: MutationOperationStatus;
    completedAt?: number;
};

export const getMutationOperationRecords = (): MutationOperationRecord[] => [
    ...activeMutationOperations.values(),
    ...completedMutationOperations.values()
];

export const getPendingMutationQueueSize = (): number => taskWriteQueues.size;

export type MutationOperationContext = {
    operationId: string;
    entityIds: string[];
    generation: number;
    startedAt: number;
};

export const enqueueMutationOperation = async <T>(
    entityIds: string[],
    operation: (context?: MutationOperationContext) => Promise<T>
): Promise<T> => {
    const keys = [...new Set(entityIds)].sort();
    const context: MutationOperationContext = {
        operationId: `mutation:${++mutationSequence}`,
        entityIds: keys,
        generation: mutationSequence,
        startedAt: Date.now()
    };
    activeMutationOperations.set(context.operationId, { ...context, status: 'queued' });
    const previous = keys.map(key => taskWriteQueues.get(key) ?? Promise.resolve());
    const run = async () => {
        activeMutationOperations.set(context.operationId, { ...context, status: 'running' });
        mutationLifecycleMetrics.started += 1;
        mutationLifecycleMetrics.active += 1;
        mutationLifecycleMetrics.maxActive = Math.max(
            mutationLifecycleMetrics.maxActive,
            mutationLifecycleMetrics.active
        );
        try {
            const result = await operation(context);
            completeMutationOperation(context, 'succeeded');
            mutationLifecycleMetrics.completed += 1;
            return result;
        } catch (error) {
            completeMutationOperation(context, 'failed');
            mutationLifecycleMetrics.failed += 1;
            throw error;
        } finally {
            mutationLifecycleMetrics.active = Math.max(0, mutationLifecycleMetrics.active - 1);
        }
    };
    const queued = Promise.all(previous).then(run, run);
    const marker = queued.then(() => undefined, () => undefined);
    keys.forEach(key => taskWriteQueues.set(key, marker));
    mutationLifecycleMetrics.maxPendingKeys = Math.max(
        mutationLifecycleMetrics.maxPendingKeys,
        taskWriteQueues.size
    );

    try {
        return await queued;
    } finally {
        keys.forEach(key => {
            if (taskWriteQueues.get(key) === marker) taskWriteQueues.delete(key);
        });
    }
};

const completeMutationOperation = (context: MutationOperationContext, status: 'succeeded' | 'failed') => {
    const record = { ...context, status, completedAt: Date.now() };
    activeMutationOperations.delete(context.operationId);
    completedMutationOperations.set(context.operationId, record);
    while (completedMutationOperations.size > MAX_COMPLETED_MUTATIONS) {
        const oldest = completedMutationOperations.keys().next().value;
        if (!oldest) break;
        completedMutationOperations.delete(oldest);
    }
};

export const enqueueTaskWrite = async <T>(taskId: string, operation: (context?: MutationOperationContext) => Promise<T>): Promise<T> => (
    enqueueMutationOperation([taskId], operation)
);

export const createTaskLayoutSnapshot = (state: TaskLayoutSnapshot): TaskLayoutSnapshot => ({
    allTasks: state.allTasks.map((task) => ({ ...task })),
    tasks: state.tasks.map((task) => ({ ...task })),
    layoutRows: state.layoutRows.map((row) => ({ ...row })),
    rowCount: state.rowCount
});

export const buildMoveTaskResult = (
    status: MoveTaskAsChildResult['status'],
    options: {
        error?: string;
        lockVersion?: number;
        parentId?: string;
    } = {}
): MoveTaskAsChildResult => ({
    status,
    error: options.error,
    lockVersion: options.lockVersion,
    parentId: options.parentId,
    siblingPosition: status === 'ok' ? 'tail' : undefined
});

export const restoreTaskSnapshot = (
    setState: (snapshot: TaskLayoutSnapshot) => void,
    snapshot: TaskLayoutSnapshot
) => {
    setState(snapshot);
};

export const saveModifiedTasks = async (
    tasks: Task[],
    relations: Relation[],
    modifiedTaskIds: Set<string>,
    selectedStatusIds: number[],
    updateTask: (task: Task, operationId?: string) => Promise<UpdateTaskFieldsResult>,
    fetchData: (params: FetchDataParams) => Promise<FetchDataResult>,
    onTaskSaved?: (taskId: string, lockVersion?: number) => void,
    onTaskResult?: (taskId: string, result: UpdateTaskFieldsResult) => void,
    onConflict?: (taskId: string, message: string) => void
) => {
    const mutableTaskById = new Map(tasks.map(task => [task.id, { ...task }]));
    const hasSamePersistedFields = (local: Task, remote: Task): boolean => {
        const sameStartDate = local.startDate === remote.startDate;
        const sameDueDate = local.dueDate === remote.dueDate;
        const sameParentId = (local.parentId ?? null) === (remote.parentId ?? null);
        return sameStartDate && sameDueDate && sameParentId;
    };
    const depthCache = new Map<string, number>();
    const calcDepth = (taskId: string): number => {
        if (depthCache.has(taskId)) return depthCache.get(taskId)!;
        let depth = 0;
        let current = mutableTaskById.get(taskId);
        const seen = new Set<string>([taskId]);
        while (current?.parentId) {
            if (seen.has(current.parentId)) break;
            seen.add(current.parentId);
            depth += 1;
            current = mutableTaskById.get(current.parentId);
        }
        depthCache.set(taskId, depth);
        return depth;
    };
    const modifiedIdSet = new Set(Array.from(modifiedTaskIds));
    const dependencyOrderCache = new Map<string, number>();
    const incomingHardDependencies = new Map<string, string[]>();

    relations.forEach((relation) => {
        if (relation.type !== 'precedes' && relation.type !== 'follows') return;

        const predecessorId = relation.type === 'follows' ? relation.to : relation.from;
        const successorId = relation.type === 'follows' ? relation.from : relation.to;
        if (!modifiedIdSet.has(predecessorId) || !modifiedIdSet.has(successorId)) return;

        const predecessors = incomingHardDependencies.get(successorId) ?? [];
        predecessors.push(predecessorId);
        incomingHardDependencies.set(successorId, predecessors);
    });
    const calcDependencyOrder = (taskId: string, visiting: Set<string> = new Set()): number => {
        if (dependencyOrderCache.has(taskId)) return dependencyOrderCache.get(taskId)!;
        if (visiting.has(taskId)) return 0;

        visiting.add(taskId);
        const predecessors = incomingHardDependencies.get(taskId) ?? [];
        const order = predecessors.length === 0
            ? 0
            : 1 + Math.max(...predecessors.map((predecessorId) => calcDependencyOrder(predecessorId, visiting)));
        visiting.delete(taskId);
        dependencyOrderCache.set(taskId, order);
        return order;
    };

    const tasksToUpdate = tasks
        .filter(t => modifiedTaskIds.has(t.id))
        .sort((a, b) => {
            const depthDelta = calcDepth(a.id) - calcDepth(b.id);
            if (depthDelta !== 0) return depthDelta;

            const dependencyDelta = calcDependencyOrder(b.id) - calcDependencyOrder(a.id);
            if (dependencyDelta !== 0) return dependencyDelta;

            return 0;
        });
    const taskRank = new Map(tasksToUpdate.map((task) => [
        task.id,
        `${calcDepth(task.id)}:${calcDependencyOrder(task.id)}`
    ]));

    const failures = new Map<string, string>();
    const availableTaskIds = new Set(tasks.map(task => task.id));
    modifiedIdSet.forEach((taskId) => {
        if (!availableTaskIds.has(taskId)) {
            failures.set(taskId, i18n.t('label_task_not_found') || 'Task no longer exists');
        }
    });
    let pending = tasksToUpdate.map(task => task.id);
    const maxPasses = Math.max(1, pending.length * 2);
    const attemptCounts = new Map<string, number>();

    for (let pass = 0; pass < maxPasses && pending.length > 0; pass += 1) {
        let progress = false;
        const nextPending: string[] = [];
        const conflictTaskIds: string[] = [];
        const conflictMessages = new Map<string, string>();

        let remaining = [...pending];
        while (remaining.length > 0) {
            const firstTaskId = remaining[0];
            const rank = taskRank.get(firstTaskId);
            const batch = remaining.filter((taskId) => taskRank.get(taskId) === rank);
            const batchIds = new Set(batch);
            remaining = remaining.filter((taskId) => !batchIds.has(taskId));
            const results = await Promise.all(batch.map(async (taskId) => {
                const task = mutableTaskById.get(taskId);
                if (!task) return { taskId, task, result: undefined, error: undefined };
                try {
                    const result = await enqueueTaskWrite(taskId, (context) => updateTask(task, context?.operationId));
                    return { taskId, task, result, error: undefined };
                } catch (error) {
                    return {
                        taskId,
                        task,
                        result: undefined,
                        error: error instanceof Error ? error.message : (i18n.t('label_unknown_error') || 'Unknown error')
                    };
                }
            }));

            for (const { taskId, task, result, error } of results) {
                if (!task) continue;
                const attempt = attemptCounts.get(taskId) ?? 0;
                if (error) {
                    attemptCounts.set(taskId, attempt + 1);
                    failures.set(taskId, error);
                    if (attempt < 1) nextPending.push(taskId);
                    continue;
                }
                if (!result) continue;
                attemptCounts.set(taskId, attempt + 1);
                onTaskResult?.(taskId, result);

                if (result.status === 'ok') {
                    progress = true;
                    failures.delete(taskId);
                    if (typeof result.lockVersion === 'number') {
                        mutableTaskById.set(taskId, { ...task, lockVersion: result.lockVersion });
                    }
                    onTaskSaved?.(taskId, result.lockVersion);
                    continue;
                }

                if (result.status === 'conflict') {
                    conflictTaskIds.push(taskId);
                    conflictMessages.set(taskId, result.error || (i18n.t('label_conflict') || 'Conflict'));
                    nextPending.push(taskId);
                } else if (result.status === 'error' && (attemptCounts.get(taskId) ?? 0) < 2) {
                    // Legacy adapters report transport/server failures as
                    // `error`; retain their bounded transient retry behavior.
                    failures.set(taskId, result.error || (i18n.t('label_unknown_error') || 'Unknown error'));
                    nextPending.push(taskId);
                } else {
                    // Validation, permission, not-found, and other terminal
                    // responses must not be resent as if they were conflicts.
                    failures.set(taskId, result.error || (i18n.t('label_unknown_error') || 'Unknown error'));
                }
            }
        }

        if (conflictTaskIds.length > 0) {
            let latest: FetchDataResult;
            try {
                latest = await fetchData({ query: { selectedStatusIds } });
            } catch (error) {
                const message = error instanceof Error ? error.message : (i18n.t('label_unknown_error') || 'Unknown error');
                conflictTaskIds.forEach((taskId) => {
                    failures.set(taskId, message);
                    onConflict?.(taskId, message);
                });
                pending = nextPending;
                break;
            }
            const latestTaskById = new Map(latest.tasks.map(task => [task.id, task]));
            const refreshedPending: string[] = [];

            for (const taskId of nextPending) {
                const localTask = mutableTaskById.get(taskId);
                const latestTask = latestTaskById.get(taskId);
                if (!localTask || !latestTask) {
                    refreshedPending.push(taskId);
                    continue;
                }

                if (hasSamePersistedFields(localTask, latestTask)) {
                    failures.delete(taskId);
                    progress = true;
                    onTaskSaved?.(taskId, latestTask.lockVersion);
                    continue;
                }

                if (conflictTaskIds.includes(taskId)) {
                    if ((attemptCounts.get(taskId) ?? 0) >= 2) {
                        const message = conflictMessages.get(taskId) || (i18n.t('label_conflict') || 'Conflict');
                        failures.set(taskId, message);
                        onConflict?.(taskId, message);
                        continue;
                    }
                    onTaskSaved?.(taskId, latestTask.lockVersion);
                    mutableTaskById.set(taskId, { ...localTask, lockVersion: latestTask.lockVersion });
                    // Refreshing the remote lock version makes this task
                    // eligible for a bounded retry even when it is the only
                    // task in the batch. Do not let progress from an
                    // unrelated task be required to preserve the edit.
                    progress = true;
                    refreshedPending.push(taskId);
                    continue;
                }
                refreshedPending.push(taskId);
            }

            pending = refreshedPending;
        } else {
            pending = nextPending;
        }

        if (!progress) break;
    }

    return failures;
};
