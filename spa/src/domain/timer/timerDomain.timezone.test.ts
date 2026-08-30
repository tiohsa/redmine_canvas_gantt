import { describe, expect, it } from 'vitest';
import { isTimerSpanningMultipleDays } from './timerDomain';
import type { TimerSession } from '../../types/timer';

describe('Timer domain timezone behavior', () => {
    it('uses the local calendar day when a work segment crosses midnight', () => {
        const startedAt = new Date(2026, 0, 10, 23, 30).getTime();
        const stoppedAt = new Date(2026, 0, 11, 0, 30).getTime();
        const session: TimerSession = {
            version: 4,
            sessionId: 'timezone-session',
            revision: 1,
            issueId: 1,
            subject: 'Timezone task',
            autoStop: false,
            state: 'stopped_pending_record',
            segments: [{ startedAt, stoppedAt }],
            createdAt: startedAt,
            updatedAt: stoppedAt
        };

        expect(isTimerSpanningMultipleDays(session)).toBe(true);
    });

    it('does not confuse a long same-day segment with a calendar-day crossing', () => {
        const startedAt = new Date(2026, 0, 10, 9, 0).getTime();
        const stoppedAt = new Date(2026, 0, 10, 23, 59).getTime();
        const session: TimerSession = {
            version: 4,
            sessionId: 'timezone-same-day-session',
            revision: 1,
            issueId: 1,
            subject: 'Timezone task',
            autoStop: false,
            state: 'stopped_pending_record',
            segments: [{ startedAt, stoppedAt }],
            createdAt: startedAt,
            updatedAt: stoppedAt
        };

        expect(isTimerSpanningMultipleDays(session)).toBe(false);
    });
});
