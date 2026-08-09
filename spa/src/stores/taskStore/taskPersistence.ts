import type { Relation, Task, PersistedTaskState } from '../../types';
import type { MoveTaskAsChildResult } from '../../types';
import {
    buildSchedulingEdges,
    detectSchedulingCycleTaskIds
} from '../../scheduling/constraintGraph';
import { i18n } from '../../utils/i18n';
import type { TaskLayoutSnapshot } from './types';
import type { MutationMetadata, MutationStatus } from '../../api/client';
import {
    classifyMutationError,
    classifyMutationResult,
    classifyMutationStatus
} from '../../api/mutationOutcome';
import type { MutationOutcomeKind } from '../../api/mutationOutcome';
import { responseContainsIntendedFields, responseMatchesIntendedFields, type TaskFields } from '../../services/taskMutationService';

export type UpdateTaskFieldsResult = MutationMetadata & {
    status: MutationStatus | 'error';
    error?: string;
    lockVersion?: number;
    parentId?: string;
};

export type SaveModifiedTasksResult = {
    failures: Map<string, string>;
    savedTaskIds: Set<string>;
    unsentTaskIds: Set<string>;
    abortedTaskIds: Set<string>;
    batchStatus: 'completed' | 'partial_failure' | 'preflight_failure';
};

export type MutationIntent = {
    taskId: string;
    generation: number;
    fields: TaskFields;
};

const hasPersistableIntentFields = (fields: TaskFields): boolean => Object.keys(fields).length > 0;

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
export const MAX_TASK_WRITE_CONCURRENCY = 8;
let activeMutationSlots = 0;
const mutationSlotWaiters: Array<() => void> = [];

export const taskResourceKey = (taskId: string): string => `task:${taskId}`;
export const relationResourceKey = (relationId: string): string => `relation:${relationId}`;
export const baselineProjectResourceKey = (projectId: string | number): string => `baseline:project:${projectId}`;

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

const acquireMutationSlot = async (): Promise<void> => {
    if (activeMutationSlots < MAX_TASK_WRITE_CONCURRENCY) {
        activeMutationSlots += 1;
        return;
    }
    await new Promise<void>(resolve => mutationSlotWaiters.push(resolve));
    activeMutationSlots += 1;
};

const releaseMutationSlot = () => {
    activeMutationSlots = Math.max(0, activeMutationSlots - 1);
    mutationSlotWaiters.shift()?.();
};

export type MutationOperationStatus = 'queued' | 'running' | 'succeeded' | 'conflict' | 'failed' | 'cancelled';

export type MutationOperationRecord = MutationOperationContext & {
    status: MutationOperationStatus;
    outcome?: MutationOutcomeKind;
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
    resourceKeys: string[];
    generation: number;
    startedAt: number;
};

export type MutationLifecycle<T> = {
    onResult?: (result: T, context: MutationOperationContext) => void | Promise<void>;
    onSuccess?: (result: T, context: MutationOperationContext) => void | Promise<void>;
    onError?: (error: unknown, context: MutationOperationContext) => void | Promise<void>;
};

const normalizeMutationEntityIds = (entityIds: string[]): string[] => {
    if (entityIds.length === 0) {
        throw new Error('Mutation operation requires at least one entity id');
    }
    if (!entityIds.every(entityId => typeof entityId === 'string' && entityId.trim() !== '')) {
        throw new Error('Mutation operation entity ids must be non-empty strings');
    }
    return [...new Set(entityIds)].sort();
};

export const enqueueMutationOperation = async <T>(
    entityIds: string[],
    operation: (context?: MutationOperationContext) => Promise<T>,
    lifecycle?: MutationLifecycle<T>,
    resourceKeys: string[] = entityIds
): Promise<T> => {
    const keys = normalizeMutationEntityIds(entityIds);
    const normalizedResourceKeys = normalizeMutationEntityIds(resourceKeys);
    const context: MutationOperationContext = {
        operationId: `mutation:${++mutationSequence}`,
        entityIds: keys,
        resourceKeys: normalizedResourceKeys,
        generation: mutationSequence,
        startedAt: Date.now()
    };
    activeMutationOperations.set(context.operationId, { ...context, status: 'queued' });
    const previous = normalizedResourceKeys.map(key => taskWriteQueues.get(key) ?? Promise.resolve());
    const run = async () => {
        await acquireMutationSlot();
        activeMutationOperations.set(context.operationId, { ...context, status: 'running' });
        mutationLifecycleMetrics.started += 1;
        mutationLifecycleMetrics.active += 1;
        mutationLifecycleMetrics.maxActive = Math.max(
            mutationLifecycleMetrics.maxActive,
            mutationLifecycleMetrics.active
        );
        try {
            const result = await operation(context);
            const outcome = classifyMutationResult(result).kind;
            await lifecycle?.onResult?.(result, context);
            if (outcome === 'success') {
                await lifecycle?.onSuccess?.(result, context);
            }
            completeMutationOperation(context, mutationStatusForOutcome(outcome), outcome);
            if (outcome === 'success') {
                mutationLifecycleMetrics.completed += 1;
            } else {
                mutationLifecycleMetrics.failed += 1;
            }
            return result;
        } catch (error) {
            await lifecycle?.onError?.(error, context);
            const outcome = classifyMutationError(error).kind;
            completeMutationOperation(context, mutationStatusForOutcome(outcome), outcome);
            mutationLifecycleMetrics.failed += 1;
            throw error;
        } finally {
            mutationLifecycleMetrics.active = Math.max(0, mutationLifecycleMetrics.active - 1);
            releaseMutationSlot();
        }
    };
    const queued = Promise.all(previous).then(run, run);
    const marker = queued.then(() => undefined, () => undefined);
    normalizedResourceKeys.forEach(key => taskWriteQueues.set(key, marker));
    mutationLifecycleMetrics.maxPendingKeys = Math.max(
        mutationLifecycleMetrics.maxPendingKeys,
        taskWriteQueues.size
    );

    try {
        return await queued;
    } finally {
        normalizedResourceKeys.forEach(key => {
            if (taskWriteQueues.get(key) === marker) taskWriteQueues.delete(key);
        });
    }
};

const completeMutationOperation = (
    context: MutationOperationContext,
    status: Extract<MutationOperationStatus, 'succeeded' | 'conflict' | 'failed' | 'cancelled'>,
    outcome: MutationOutcomeKind
) => {
    const record = { ...context, status, outcome, completedAt: Date.now() };
    activeMutationOperations.delete(context.operationId);
    completedMutationOperations.set(context.operationId, record);
    while (completedMutationOperations.size > MAX_COMPLETED_MUTATIONS) {
        const oldest = completedMutationOperations.keys().next().value;
        if (!oldest) break;
        completedMutationOperations.delete(oldest);
    }
};

const mutationStatusForOutcome = (outcome: MutationOutcomeKind): 'succeeded' | 'conflict' | 'failed' => {
    if (outcome === 'success') return 'succeeded';
    if (outcome === 'conflict') return 'conflict';
    return 'failed';
};

export const enqueueTaskWrite = async <T>(
    taskId: string,
    operation: (context?: MutationOperationContext) => Promise<T>,
    lifecycle?: MutationLifecycle<T>
): Promise<T> => (
    enqueueMutationOperation([taskId], operation, lifecycle, [taskResourceKey(taskId)])
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
    updateTask: (task: Task, operationId?: string, fields?: TaskFields) => Promise<UpdateTaskFieldsResult>,
    fetchData: (params: FetchDataParams) => Promise<FetchDataResult>,
    onTaskSaved?: (taskId: string, lockVersion?: number) => void,
    onTaskResult?: (taskId: string, result: UpdateTaskFieldsResult) => void,
    onConflict?: (taskId: string, message: string, remoteEntity?: PersistedTaskState, remoteRevision?: number) => void,
    shouldAbortRemaining?: (taskId: string) => boolean,
    mutationGenerations: Record<string, number> = {},
    mutationFields: Record<string, TaskFields> = {},
    preflightFailures: Map<string, string> = new Map()
): Promise<SaveModifiedTasksResult> => {
    const mutableTaskById = new Map(tasks.map(task => [task.id, { ...task }]));
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
    const modifiedTasks = tasks.filter(task => modifiedIdSet.has(task.id));
    const dependencyOrder = new Map(modifiedTasks.map(task => [task.id, 0]));
    const dependencyIndegree = new Map(modifiedTasks.map(task => [task.id, 0]));
    const dependencyOutgoing = new Map<string, string[]>();
    const dependencyPredecessors = new Map<string, Set<string>>();
    const dependencyEdges = buildSchedulingEdges(relations).filter(({ predecessorId, successorId }) => (
        dependencyOrder.has(predecessorId) && dependencyOrder.has(successorId)
    ));

    dependencyEdges.forEach(({ predecessorId, successorId }) => {
        const successors = dependencyOutgoing.get(predecessorId) ?? [];
        successors.push(successorId);
        dependencyOutgoing.set(predecessorId, successors);
        dependencyIndegree.set(successorId, (dependencyIndegree.get(successorId) ?? 0) + 1);
        const predecessors = dependencyPredecessors.get(successorId) ?? new Set<string>();
        predecessors.add(predecessorId);
        dependencyPredecessors.set(successorId, predecessors);
    });

    const rankIndegree = new Map(dependencyIndegree);
    const readyTaskIds = modifiedTasks
        .filter(task => rankIndegree.get(task.id) === 0)
        .map(task => task.id);
    for (let queueIndex = 0; queueIndex < readyTaskIds.length; queueIndex += 1) {
        const predecessorId = readyTaskIds[queueIndex];
        const predecessorOrder = dependencyOrder.get(predecessorId) ?? 0;
        (dependencyOutgoing.get(predecessorId) ?? []).forEach((successorId) => {
            dependencyOrder.set(
                successorId,
                Math.max(dependencyOrder.get(successorId) ?? 0, predecessorOrder + 1)
            );
            const nextIndegree = (rankIndegree.get(successorId) ?? 0) - 1;
            rankIndegree.set(successorId, nextIndegree);
            if (nextIndegree === 0) readyTaskIds.push(successorId);
        });
    }
    const cyclicTaskIds = detectSchedulingCycleTaskIds(dependencyEdges);

    const tasksToUpdate = tasks
        .filter(t => modifiedTaskIds.has(t.id))
        .sort((a, b) => {
            // Persist predecessors before their modified successors so that
            // server-side dependency validation observes the updated dates.
            const dependencyDelta = (dependencyOrder.get(a.id) ?? 0) - (dependencyOrder.get(b.id) ?? 0);
            if (dependencyDelta !== 0) return dependencyDelta;

            // Preserve the existing parent-before-child order when tasks are
            // not ordered by a dependency relationship.
            return calcDepth(a.id) - calcDepth(b.id);
        });

    const failures = new Map<string, string>();
    const savedTaskIds = new Set<string>();
    const unsentTaskIds = new Set(modifiedIdSet);
    const abortedTaskIds = new Set<string>();
    const cycleMessage = i18n.t('label_scheduling_state_cyclic') || 'This task participates in a dependency cycle.';
    const availableTaskIds = new Set(tasks.map(task => task.id));
    modifiedIdSet.forEach((taskId) => {
        if (!availableTaskIds.has(taskId)) {
            failures.set(taskId, i18n.t('label_task_not_found') || 'Task no longer exists');
        }
    });
    if (cyclicTaskIds.size > 0) {
        cyclicTaskIds.forEach((taskId) => failures.set(taskId, cycleMessage));
        return {
            failures,
            savedTaskIds,
            unsentTaskIds,
            abortedTaskIds,
            batchStatus: 'preflight_failure'
        };
    }

    const pendingTaskIds = new Set(tasksToUpdate.map(task => task.id));
    const settledTaskIds = new Set<string>();
    const blockedTaskIds = new Set<string>();
    const terminalFailureTaskIds = new Set<string>();
    const attemptCounts = new Map<string, number>();
    const conflictMessages = new Map<string, string>();
    const conflictCandidates = new Map<string, { intent: MutationIntent; message: string; entity?: PersistedTaskState; revision?: number }>();
    const failureMessage = i18n.t('label_failed_to_save') || 'Failed to save task';
    const unknownErrorMessage = i18n.t('label_unknown_error') || 'Unknown error';
    const conflictMessage = i18n.t('label_conflict') || 'Conflict';
    const missingIntentMessage = `${failureMessage}: explicit mutation intent is required.`;
    let hasProcessedTask = false;

    const abortOwnedPendingTasks = () => {
        if (!shouldAbortRemaining) return;
        [...pendingTaskIds].forEach((taskId) => {
            if (!shouldAbortRemaining(taskId)) return;
            pendingTaskIds.delete(taskId);
            abortedTaskIds.add(taskId);
            failures.set(taskId, failureMessage);
        });
    };

    const blockTasksWithFailedPredecessors = () => {
        let changed = true;
        while (changed) {
            changed = false;
            [...pendingTaskIds].forEach((taskId) => {
                const failedPredecessor = [...(dependencyPredecessors.get(taskId) ?? [])]
                    .find(predecessorId => (
                        terminalFailureTaskIds.has(predecessorId) ||
                        blockedTaskIds.has(predecessorId) ||
                        abortedTaskIds.has(predecessorId)
                    ));
                if (!failedPredecessor) return;

                pendingTaskIds.delete(taskId);
                blockedTaskIds.add(taskId);
                failures.set(taskId, `${failureMessage}: predecessor ${failedPredecessor} was not saved`);
                changed = true;
            });
        }
    };

    const effectivePreflightFailures = new Map(preflightFailures);
    modifiedIdSet.forEach((taskId) => {
        const hasExplicitIntent = Object.prototype.hasOwnProperty.call(mutationFields, taskId) && mutationFields[taskId] !== undefined;
        if (availableTaskIds.has(taskId) &&
            !hasExplicitIntent &&
            !effectivePreflightFailures.has(taskId)) {
            effectivePreflightFailures.set(taskId, missingIntentMessage);
        }
    });
    effectivePreflightFailures.forEach((message, taskId) => {
        if (!pendingTaskIds.has(taskId)) return;
        pendingTaskIds.delete(taskId);
        terminalFailureTaskIds.add(taskId);
        failures.set(taskId, message);
    });
    blockTasksWithFailedPredecessors();

    while (pendingTaskIds.size > 0) {
        if (hasProcessedTask) abortOwnedPendingTasks();
        blockTasksWithFailedPredecessors();
        if (pendingTaskIds.size === 0) break;

        const readyCandidates = tasksToUpdate
            .map(task => task.id)
            .filter(taskId => (
                pendingTaskIds.has(taskId) &&
                [...(dependencyPredecessors.get(taskId) ?? [])].every(predecessorId => settledTaskIds.has(predecessorId))
            ));

        if (readyCandidates.length === 0) {
            // This is a defensive terminal state. A real cycle is rejected by
            // preflight above; any remaining task here has an unresolved
            // dependency that cannot be safely sent.
            readyCandidates.push(...pendingTaskIds);
            readyCandidates.forEach((taskId) => {
                pendingTaskIds.delete(taskId);
                blockedTaskIds.add(taskId);
                failures.set(taskId, failureMessage);
            });
            break;
        }

        // Keep the existing parent-depth tie breaker as a scheduling stage:
        // roots are sent before their children even when no hard relation
        // exists. Hard predecessor settlement remains the actual successor
        // gate; this stage only preserves the established stable order.
        const firstReadyTaskId = readyCandidates[0];
        const firstReadyRank = dependencyOrder.get(firstReadyTaskId) ?? 0;
        const firstReadyDepth = calcDepth(firstReadyTaskId);
        const readyTaskIds = readyCandidates.filter((taskId) => (
            (dependencyOrder.get(taskId) ?? 0) === firstReadyRank &&
            calcDepth(taskId) === firstReadyDepth
        ));
        const batch = readyTaskIds.slice(0, MAX_TASK_WRITE_CONCURRENCY);
        batch.forEach(taskId => pendingTaskIds.delete(taskId));
        const conflictTaskIds: string[] = [];

        const results = await Promise.all(batch.map(async (taskId) => {
            const task = mutableTaskById.get(taskId);
            if (!task) return { taskId, task, result: undefined, error: undefined };
            try {
                const result = await enqueueTaskWrite(
                    taskId,
                    (context) => {
                        unsentTaskIds.delete(taskId);
                        const fields = mutationFields[taskId]!;
                        return updateTask(task, context?.operationId, fields);
                    },
                    {
                        onResult: (savedResult) => {
                            onTaskResult?.(taskId, savedResult);
                        },
                        onSuccess: (savedResult) => {
                            onTaskSaved?.(taskId, savedResult.lockVersion);
                        }
                    }
                );
                return { taskId, task, result, error: undefined };
            } catch (error) {
                return { taskId, task, result: undefined, error };
            }
        }));

        for (const { taskId, task, result, error } of results) {
            if (!task) continue;

            const attempt = attemptCounts.get(taskId) ?? 0;
            const nextAttempt = attempt + 1;
            attemptCounts.set(taskId, nextAttempt);

            if (error) {
                const outcome = classifyMutationError(error);
                const message = outcome.message || (
                    error instanceof Error
                        ? error.message
                        : (typeof error === 'string' ? error : String(error))
                );
                failures.set(taskId, message);
                if (outcome.kind === 'conflict') {
                    conflictTaskIds.push(taskId);
                    conflictMessages.set(taskId, message);
                } else if (outcome.kind === 'transient' && attempt < 1) {
                    pendingTaskIds.add(taskId);
                } else {
                    terminalFailureTaskIds.add(taskId);
                }
                continue;
            }
            if (!result) continue;

            const outcome = classifyMutationStatus(result.status);
            const message = result.error || unknownErrorMessage;
            const intent: MutationIntent = {
                taskId,
                generation: mutationGenerations[taskId] ?? 0,
                fields: mutationFields[taskId]!
            };
            if (!hasPersistableIntentFields(intent.fields)) {
                pendingTaskIds.delete(taskId);
                terminalFailureTaskIds.add(taskId);
                failures.set(taskId, i18n.t('label_no_bulk_supported_mutation_fields') || 'No saveable task changes are available.');
                continue;
            }
            if (outcome === 'success') {
                failures.delete(taskId);
                settledTaskIds.add(taskId);
                savedTaskIds.add(taskId);
                if (typeof result.lockVersion === 'number') {
                    mutableTaskById.set(taskId, { ...task, lockVersion: result.lockVersion });
                }
            } else if (outcome === 'conflict') {
                const candidate = {
                    intent,
                    message: result.error || conflictMessage,
                    entity: result.entity,
                    revision: result.revision ?? result.entity?.lockVersion
                };
                conflictCandidates.set(taskId, candidate);
                if (result.entity && responseContainsIntendedFields(intent.fields, result.entity)) {
                    if (!responseMatchesIntendedFields(intent.fields, result.entity)) {
                        failures.set(taskId, candidate.message);
                        terminalFailureTaskIds.add(taskId);
                        onConflict?.(taskId, candidate.message, result.entity, candidate.revision);
                        continue;
                    }
                    failures.delete(taskId);
                    settledTaskIds.add(taskId);
                    savedTaskIds.add(taskId);
                    unsentTaskIds.delete(taskId);
                    onTaskResult?.(taskId, {
                        status: 'ok',
                        entity: result.entity,
                        revision: candidate.revision,
                        lockVersion: candidate.revision
                    });
                    onTaskSaved?.(taskId, candidate.revision);
                } else {
                    failures.set(taskId, candidate.message);
                    conflictMessages.set(taskId, candidate.message);
                    conflictTaskIds.push(taskId);
                }
            } else if (outcome === 'transient' && attempt < 1) {
                // Both the current `transient_error` status and the legacy
                // `error` status share the same bounded retry policy.
                failures.set(taskId, message);
                pendingTaskIds.add(taskId);
            } else {
                // Validation, permission, not-found, and exhausted transient
                // responses are terminal and must gate their successors.
                failures.set(taskId, message);
                terminalFailureTaskIds.add(taskId);
            }
        }

        if (conflictTaskIds.length > 0) {
            let latest: FetchDataResult;
            try {
                latest = await fetchData({ query: { selectedStatusIds } });
            } catch (error) {
                const message = error instanceof Error ? error.message : unknownErrorMessage;
                [...new Set(conflictTaskIds)].forEach((taskId) => {
                    pendingTaskIds.delete(taskId);
                    terminalFailureTaskIds.add(taskId);
                    failures.set(taskId, message);
                    onConflict?.(taskId, `${message} (remote unavailable)`, undefined, undefined);
                });
                hasProcessedTask = true;
                continue;
            }

            const latestTaskById = new Map(latest.tasks.map(task => [task.id, task]));
            [...new Set(conflictTaskIds)].forEach((taskId) => {
                const localTask = mutableTaskById.get(taskId);
                const candidate = conflictCandidates.get(taskId);
                const candidateEntityIsComplete = Boolean(candidate?.entity && responseContainsIntendedFields(candidate.intent.fields, candidate.entity));
                const latestTask = candidateEntityIsComplete ? candidate?.entity : latestTaskById.get(taskId);
                const canonicalRemote = latestTask
                    ? { entity: latestTask, revision: candidateEntityIsComplete
                        ? (candidate?.revision ?? latestTask.lockVersion)
                        : latestTask.lockVersion }
                    : undefined;
                if (!localTask || !canonicalRemote || !candidate) {
                    pendingTaskIds.delete(taskId);
                    terminalFailureTaskIds.add(taskId);
                    const message = conflictMessages.get(taskId) || conflictMessage;
                    failures.set(taskId, message);
                    onConflict?.(taskId, `${message} (remote unavailable)`, undefined, undefined);
                    return;
                }

                if (responseMatchesIntendedFields(candidate.intent.fields, canonicalRemote.entity)) {
                    pendingTaskIds.delete(taskId);
                    failures.delete(taskId);
                    settledTaskIds.add(taskId);
                    savedTaskIds.add(taskId);
                    unsentTaskIds.delete(taskId);
                    onTaskResult?.(taskId, {
                        status: 'ok',
                        entity: canonicalRemote.entity,
                        revision: canonicalRemote.revision,
                        lockVersion: canonicalRemote.revision
                    });
                    onTaskSaved?.(taskId, canonicalRemote.revision);
                    return;
                }

                pendingTaskIds.delete(taskId);
                terminalFailureTaskIds.add(taskId);
                const message = conflictMessages.get(taskId) || conflictMessage;
                failures.set(taskId, message);
                onConflict?.(taskId, message, canonicalRemote.entity, canonicalRemote.revision);
            });
        }

        hasProcessedTask = true;
    }

    modifiedIdSet.forEach((taskId) => {
        if (savedTaskIds.has(taskId) || failures.has(taskId) || unsentTaskIds.has(taskId)) return;
        failures.set(taskId, failureMessage);
    });

    return {
        failures,
        savedTaskIds,
        unsentTaskIds,
        abortedTaskIds,
        batchStatus: failures.size > 0 ? 'partial_failure' : 'completed'
    };
};
