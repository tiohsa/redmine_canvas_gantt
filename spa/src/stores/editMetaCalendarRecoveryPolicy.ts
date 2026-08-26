import type { MutationOutcome } from '../api/mutationOutcome';
import type { ReadApplyOutcome } from './taskStore/stateContract';

export type EditMetaCalendarRecoveryDecision =
    | 'refresh'
    | 'retry'
    | 'not_calendar_conflict'
    | 'retry_exhausted'
    | 'superseded'
    | 'not_refreshed'
    | 'stale';

export type EditMetaCalendarRecoveryInput = {
    outcome: MutationOutcome;
    retryAttempted: boolean;
    readCurrent: boolean;
    refreshOutcome?: ReadApplyOutcome;
    failedCalendarRevision?: string;
    refreshedCalendarRevision?: string;
};

const isBusinessCalendarConflict = (outcome: MutationOutcome): boolean => (
    outcome.status === 'conflict' &&
    outcome.failure?.resourceRole === 'scope' &&
    outcome.failure.resourceType === 'business_calendar' &&
    outcome.failure.remoteAvailability === 'needs_refresh'
);

export const decideEditMetaCalendarRecovery = (
    input: EditMetaCalendarRecoveryInput
): EditMetaCalendarRecoveryDecision => {
    if (!isBusinessCalendarConflict(input.outcome)) return 'not_calendar_conflict';
    if (input.retryAttempted) return 'retry_exhausted';
    if (!input.readCurrent) return 'stale';
    if (!input.refreshOutcome) return 'refresh';
    if (input.refreshOutcome.status === 'superseded') return 'superseded';
    if (
        !input.refreshedCalendarRevision ||
        input.refreshedCalendarRevision === input.failedCalendarRevision
    ) return 'not_refreshed';
    return 'retry';
};
