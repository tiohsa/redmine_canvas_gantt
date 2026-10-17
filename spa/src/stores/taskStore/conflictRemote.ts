import type { PersistedTaskState, Task } from '../../types';
import type { MutationRemoteAvailability } from '../../api/mutationOutcome';
import type { ReadContext, ServerSnapshot } from './stateContract';

type ConflictRemoteRecord = {
    taskId: string;
    remoteEntity?: PersistedTaskState;
    remoteRevision?: number;
    remoteAvailability?: MutationRemoteAvailability;
};

export type SelectedConflictRemote = { entity: PersistedTaskState; revision: number };

export const isValidConflictRemote = (taskId: string, candidate: SelectedConflictRemote): boolean => (
    candidate.entity.id === taskId &&
    Number.isSafeInteger(candidate.revision) && candidate.revision >= 0 &&
    Number.isSafeInteger(candidate.entity.lockVersion) && candidate.entity.lockVersion === candidate.revision
);

/** Select the same confirmed server value for comparison and both conflict resolutions. */
export const selectConflictRemote = (
    conflict: ConflictRemoteRecord,
    snapshot: ServerSnapshot<Task>,
    activeReadContext: ReadContext | null,
    readStatus: 'idle' | 'loading' | 'ready' | 'error'
): SelectedConflictRemote | undefined => {
    const response = conflict.remoteEntity;
    const responseRevision = conflict.remoteRevision ?? response?.lockVersion;
    const responseIsKnown = (conflict.remoteAvailability === undefined || conflict.remoteAvailability === 'known') && response &&
        responseRevision !== undefined && isValidConflictRemote(conflict.taskId, { entity: response, revision: responseRevision });
    const snapshotIsCurrent = readStatus === 'ready' && activeReadContext && snapshot.context &&
        snapshot.context.projectId === activeReadContext.projectId &&
        snapshot.context.queryIdentity === activeReadContext.queryIdentity &&
        snapshot.context.scopeIdentity === activeReadContext.scopeIdentity;
    const snapshotEntity = snapshotIsCurrent ? snapshot.entitiesById[conflict.taskId] : undefined;
    const snapshotRevision = snapshot.revisions[conflict.taskId];
    const snapshotCandidate = snapshotEntity && snapshotRevision !== undefined
        ? { entity: snapshotEntity, revision: snapshotRevision } : undefined;
    if (snapshotCandidate && responseRevision !== undefined && isValidConflictRemote(conflict.taskId, snapshotCandidate) &&
        snapshotRevision >= responseRevision) {
        return snapshotCandidate;
    }
    // A newer snapshot from another read cannot confirm this view, but it does
    // prove that the older conflict response is no longer safe to adopt.
    if (snapshot.entitiesById[conflict.taskId] && snapshotRevision !== undefined &&
        responseRevision !== undefined && snapshotRevision > responseRevision) return undefined;
    if (responseIsKnown && response && responseRevision !== undefined) {
        return { entity: response, revision: responseRevision };
    }
    return undefined;
};
