import { describe, expect, it } from 'vitest';
import { getTimerNotificationTag } from './timerNotification';

describe('timer notification identity', () => {
    const identity = {
        scopeKey: 'timer-session:https%3A%2F%2Fredmine.example:user:7',
        sessionId: 'session-1',
        deadlineAt: 1_700_001_800_000,
        type: 'running_expired' as const
    };

    it('is stable for the same scope, session, deadline, and type', () => {
        expect(getTimerNotificationTag(identity)).toBe(getTimerNotificationTag({ ...identity }));
    });

    it.each([
        { scopeKey: 'other-scope' },
        { sessionId: 'session-2' },
        { deadlineAt: identity.deadlineAt + 1 },
        { type: 'stopped' as const }
    ])('changes when an identity component changes: %o', (change) => {
        expect(getTimerNotificationTag({ ...identity, ...change })).not.toBe(getTimerNotificationTag(identity));
    });
});
