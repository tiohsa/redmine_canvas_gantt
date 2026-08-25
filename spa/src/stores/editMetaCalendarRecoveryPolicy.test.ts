import { describe, expect, it } from 'vitest';
import type { MutationOutcome } from '../api/mutationOutcome';
import { createReadContext, type ReadApplyOutcome } from './taskStore/stateContract';
import { decideEditMetaCalendarRecovery } from './editMetaCalendarRecoveryPolicy';

const calendarConflict: MutationOutcome = {
    kind: 'conflict',
    status: 'conflict',
    failure: {
        kind: 'conflict',
        resourceRole: 'scope',
        resourceType: 'business_calendar',
        remoteAvailability: 'needs_refresh'
    }
};

const nonCalendarConflict: MutationOutcome = {
    kind: 'conflict',
    status: 'conflict'
};

const readContext = createReadContext({
    generation: 1,
    projectId: null,
    query: { taskId: '1' },
    scope: { taskId: '1' },
    purpose: 'edit_meta',
    mergePolicy: 'replace'
});

const applied: ReadApplyOutcome = { status: 'applied', context: readContext };
const superseded: ReadApplyOutcome = { status: 'superseded', context: readContext };

describe('EditMeta calendar recovery policy', () => {
    it.each([
        {
            label: 'non-calendar conflict',
            outcome: nonCalendarConflict,
            retryAttempted: false,
            readCurrent: true,
            expected: 'not_calendar_conflict'
        },
        {
            label: 'previously retried conflict',
            outcome: calendarConflict,
            retryAttempted: true,
            readCurrent: true,
            expected: 'retry_exhausted'
        },
        {
            label: 'stale read before refresh',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: false,
            expected: 'stale'
        },
        {
            label: 'eligible conflict before refresh',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: true,
            expected: 'refresh'
        },
        {
            label: 'superseded authoritative refresh',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: true,
            refreshOutcome: superseded,
            failedCalendarRevision: 'R1',
            refreshedCalendarRevision: 'R2',
            expected: 'superseded'
        },
        {
            label: 'empty refreshed revision',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: true,
            refreshOutcome: applied,
            failedCalendarRevision: 'R1',
            refreshedCalendarRevision: '',
            expected: 'not_refreshed'
        },
        {
            label: 'unchanged refreshed revision',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: true,
            refreshOutcome: applied,
            failedCalendarRevision: 'R1',
            refreshedCalendarRevision: 'R1',
            expected: 'not_refreshed'
        },
        {
            label: 'advanced refreshed revision',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: true,
            refreshOutcome: applied,
            failedCalendarRevision: 'R1',
            refreshedCalendarRevision: 'R2',
            expected: 'retry'
        },
        {
            label: 'stale read after refresh',
            outcome: calendarConflict,
            retryAttempted: false,
            readCurrent: false,
            refreshOutcome: applied,
            failedCalendarRevision: 'R1',
            refreshedCalendarRevision: 'R2',
            expected: 'stale'
        }
    ] as const)('returns $expected for $label', (input) => {
        expect(decideEditMetaCalendarRecovery(input)).toBe(input.expected);
    });
});
