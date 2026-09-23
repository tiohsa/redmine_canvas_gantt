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
        (conflict.remoteRevision === undefined || response.lockVersion === undefined ||
            response.lockVersion === conflict.remoteRevision);
    const snapshotIsCurrent = readStatus === 'ready' && activeReadContext && snapshot.context &&
        snapshot.context.projectId === activeReadContext.projectId &&
        snapshot.context.queryIdentity === activeReadContext.queryIdentity &&
        snapshot.context.scopeIdentity === activeReadContext.scopeIdentity;
    const snapshotEntity = snapshotIsCurrent && responseRevision !== undefined
        ? snapshot.entitiesById[conflict.taskId] : undefined;
    const snapshotRevision = snapshot.revisions[conflict.taskId];
    if (snapshotEntity && snapshotRevision !== undefined && responseRevision !== undefined &&
        snapshotRevision >= responseRevision &&
        (snapshotEntity.lockVersion === undefined || snapshotEntity.lockVersion >= responseRevision)) {
        return { entity: snapshotEntity, revision: snapshotRevision };
    }
    // A newer snapshot from another read cannot confirm this view, but it does
    // prove that the older conflict response is no longer safe to adopt.
    if (snapshot.entitiesById[conflict.taskId] && snapshotRevision !== undefined &&
        responseRevision !== undefined && snapshotRevision > responseRevision) return undefined;
    if (responseIsKnown && responseRevision !== undefined) {
        return { entity: response, revision: responseRevision };
    }
    return undefined;
};
