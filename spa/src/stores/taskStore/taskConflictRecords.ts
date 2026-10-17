import type { PersistedTaskState } from '../../types';
import type { MutationRemoteAvailability } from '../../api/mutationOutcome';
import type { ScheduleConflictReview } from './scheduleConflictResolution';

export type UnresolvedTaskMutation = {
    generation: number;
    message: string;
    detectedAt: number;
    remoteAvailability: MutationRemoteAvailability;
    remoteEntity?: PersistedTaskState;
    remoteRevision?: number;
    outcome: 'conflict' | 'unknown';
};

export type TaskConflictProjection = {
    taskId: string;
    message: string;
    detectedAt: number;
    generation?: number;
    remoteEntity?: PersistedTaskState;
    remoteRevision?: number;
    remoteAvailability?: MutationRemoteAvailability;
    scheduleOperation?: Record<string, number>;
    scheduleReview?: ScheduleConflictReview;
    scheduleChoice?: 'local' | 'remote';
    unresolvedMutations?: Record<string, UnresolvedTaskMutation>;
};

export const projectTaskConflict = <T extends TaskConflictProjection>(taskId: string, conflict: T): T | undefined => {
    const outcomes = Object.values(conflict.unresolvedMutations ?? {});
    if (outcomes.length === 0) {
        if (conflict.scheduleOperation || conflict.scheduleReview || conflict.scheduleChoice) {
            const scheduleConflict = { ...conflict };
            delete scheduleConflict.unresolvedMutations;
            return scheduleConflict as T;
        }
        return undefined;
    }
    const latest = outcomes.reduce((selected, outcome) => outcome.generation > selected.generation ? outcome : selected);
    return {
        ...conflict,
        taskId,
        generation: latest.generation,
        message: latest.message,
        detectedAt: latest.detectedAt,
        remoteEntity: latest.remoteEntity,
        remoteRevision: latest.remoteRevision,
        remoteAvailability: latest.remoteAvailability
    };
};

export const upsertUnresolvedTaskMutation = <T extends TaskConflictProjection>(
    taskId: string,
    conflict: T | undefined,
    outcome: UnresolvedTaskMutation
): T | undefined => {
    const unresolvedMutations = {
        ...(conflict?.unresolvedMutations ?? {}),
        [String(outcome.generation)]: outcome
    };
    return projectTaskConflict(taskId, {
        ...conflict,
        taskId,
        message: outcome.message,
        detectedAt: outcome.detectedAt,
        generation: outcome.generation,
        remoteEntity: outcome.remoteEntity,
        remoteRevision: outcome.remoteRevision,
        remoteAvailability: outcome.remoteAvailability,
        unresolvedMutations
    } as T);
};

export const settleTaskConflictOutcomes = <T extends TaskConflictProjection>(
    taskId: string,
    conflict: T,
    generations: Iterable<number>
): T | undefined => {
    const unresolvedMutations = { ...(conflict.unresolvedMutations ?? {}) };
    for (const generation of generations) delete unresolvedMutations[String(generation)];
    return projectTaskConflict(taskId, { ...conflict, unresolvedMutations } as T);
};

export const clearScheduleConflictOwnership = <T extends TaskConflictProjection>(conflict: T, settledGeneration?: number, discardOutcome = false): T | undefined => {
    const remaining = { ...conflict };
    delete remaining.scheduleOperation;
    delete remaining.scheduleReview;
    delete remaining.scheduleChoice;
    const outcomes = { ...(conflict.unresolvedMutations ?? {}) };
    if (discardOutcome && settledGeneration !== undefined) delete outcomes[String(settledGeneration)];
    return projectTaskConflict(conflict.taskId, { ...remaining, unresolvedMutations: outcomes } as T);
};
