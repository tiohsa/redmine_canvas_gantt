import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    loadStoredTimerSession,
    persistTimerSession,
    clearStoredTimerSession,
    loadStoredTimerPreferences,
    persistTimerPreferences,
    acquireTimerSession,
    isValidTimerSession,
    getTimerStorageKeys,
    mutateStoredTimerSession,
    TIMER_PREFS_STORAGE_KEY,
    TIMER_SESSION_STORAGE_KEY
} from './timerStorage';
import type { TimerSession } from '../types/timer';
import { calculateTimerElapsed, evaluateTimerTick, extendTimerSession } from '../domain/timer/timerDomain';

describe('Timer Storage & Persistence', () => {
    const baseTime = 1700000000000;
    const scope = { userId: 5, instanceKey: 'https://redmine.example.test/redmine' };

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    const createSampleSession = (overrides?: Partial<TimerSession>): TimerSession => ({
        version: 2,
        sessionId: 'session-123',
        revision: 1,
        issueId: 101,
        subject: 'Backend Test',
        autoStop: false,
        state: 'running',
        deadlineAt: baseTime + 30 * 60 * 1000,
        segments: [{ startedAt: baseTime }],
        createdAt: baseTime,
        updatedAt: baseTime,
        userId: 5,
        ...overrides
    });

    it('persists and loads a valid timer session', () => {
        const session = createSampleSession();
        persistTimerSession(session, scope);

        const loaded = loadStoredTimerSession(scope, baseTime + 1000);
        expect(loaded).toEqual(session);
    });

    it('clears stored timer session', () => {
        const session = createSampleSession();
        persistTimerSession(session, scope);
        expect(window.localStorage.getItem(getTimerStorageKeys(scope).session)).not.toBeNull();

        clearStoredTimerSession(scope);
        expect(window.localStorage.getItem(getTimerStorageKeys(scope).session)).toBeNull();
        expect(loadStoredTimerSession(scope)).toBeNull();
    });

    it('gracefully handles invalid JSON in localStorage', () => {
        window.localStorage.setItem(getTimerStorageKeys(scope).session, '{invalid-json:');
        expect(loadStoredTimerSession(scope)).toBeNull();
    });

    it('validates schema correctly and rejects corrupt/partial data', () => {
        expect(isValidTimerSession(null)).toBe(false);
        expect(isValidTimerSession({})).toBe(false);
        expect(isValidTimerSession({ version: 1 })).toBe(false); // wrong version
        expect(isValidTimerSession({ ...createSampleSession(), sessionId: '' })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), revision: 0 })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), revision: 1.5 })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), state: 'unknown' })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), segments: [] })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), segments: [{ startedAt: -5 }] })).toBe(false);
        expect(isValidTimerSession(createSampleSession())).toBe(true);
    });

    it('does not restore session if userId belongs to a different user', () => {
        const session = createSampleSession({ userId: 42 });
        persistTimerSession(session, scope);

        const loaded = loadStoredTimerSession({ ...scope, userId: 99 }, baseTime + 1000);
        expect(loaded).toBeNull();
    });

    it('auto-recovers running session to expired when autoStop is OFF upon reload past deadline', () => {
        const session = createSampleSession({
            autoStop: false,
            state: 'running',
            deadlineAt: baseTime + 30 * 60 * 1000
        });
        persistTimerSession(session, scope);

        // Reload 35 minutes later
        const loaded = loadStoredTimerSession(scope, baseTime + 35 * 60 * 1000);
        expect(loaded).not.toBeNull();
        expect(loaded?.state).toBe('expired');
        expect(loaded?.segments[0].stoppedAt).toBeUndefined(); // Remains open
    });

    it('auto-recovers running session to stopped_pending_record when autoStop is ON upon reload past deadline', () => {
        const deadline = baseTime + 30 * 60 * 1000;
        const session = createSampleSession({
            autoStop: true,
            state: 'running',
            deadlineAt: deadline
        });
        persistTimerSession(session, scope);

        // Reload 60 minutes later
        const loaded = loadStoredTimerSession(scope, baseTime + 60 * 60 * 1000);
        expect(loaded).not.toBeNull();
        expect(loaded?.state).toBe('stopped_pending_record');
        expect(loaded?.segments[0].stoppedAt).toBe(deadline); // Exact deadline
    });

    it('persists and loads timer preferences independently', () => {
        expect(loadStoredTimerPreferences(scope)).toEqual({ autoStop: false });

        persistTimerPreferences({ autoStop: true }, scope);
        expect(loadStoredTimerPreferences(scope)).toEqual({ autoStop: true });

        // Invalid JSON fallback
        window.localStorage.setItem(getTimerStorageKeys(scope).preferences, 'invalid');
        expect(loadStoredTimerPreferences(scope)).toEqual({ autoStop: false });
    });

    it('acquireTimerSession prevents conflicting start and resolves tie-breaks deterministically', async () => {
        const sessionA = createSampleSession({ sessionId: 'session-A', createdAt: baseTime });
        const resultA = await acquireTimerSession(sessionA, scope);
        expect(resultA.acquired).toBe(true);

        const sessionB = createSampleSession({ sessionId: 'session-B', issueId: 202, createdAt: baseTime + 1000 });
        const resultB = await acquireTimerSession(sessionB, scope);
        expect(resultB.acquired).toBe(false);
        expect(resultB.conflictSession?.sessionId).toBe('session-A');
    });

    it('separates session and preference keys by Redmine instance and user', () => {
        const userA = getTimerStorageKeys({ instanceKey: 'https://redmine.example/a', userId: 1 });
        const userB = getTimerStorageKeys({ instanceKey: 'https://redmine.example/a', userId: 2 });
        const instanceB = getTimerStorageKeys({ instanceKey: 'https://redmine.example/b', userId: 1 });

        expect(userA.session).not.toBe(userB.session);
        expect(userA.preferences).not.toBe(userB.preferences);
        expect(userA.session).not.toBe(instanceB.session);
        expect(userA.preferences).not.toBe(instanceB.preferences);
        expect(userA.session).not.toBe(TIMER_SESSION_STORAGE_KEY);
        expect(userA.preferences).not.toBe(TIMER_PREFS_STORAGE_KEY);
    });

    it('does not claim or delete legacy unscoped timer data', () => {
        const legacy = JSON.stringify(createSampleSession());
        window.localStorage.setItem(TIMER_SESSION_STORAGE_KEY, legacy);
        window.localStorage.setItem(TIMER_PREFS_STORAGE_KEY, JSON.stringify({ autoStop: true }));

        expect(loadStoredTimerSession(scope)).toBeNull();
        expect(loadStoredTimerPreferences(scope)).toEqual({ autoStop: false });
        expect(window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY)).toBe(legacy);
        expect(window.localStorage.getItem(TIMER_PREFS_STORAGE_KEY)).toBe(JSON.stringify({ autoStop: true }));
    });

    it('applies stale-tab operations to the latest canonical revision', async () => {
        const original = createSampleSession();
        persistTimerSession(original, scope);
        const oldDeadline = original.deadlineAt!;

        const extension = await mutateStoredTimerSession(
            canonical => extendTimerSession(canonical!, 15, baseTime + 20 * 60 * 1000),
            scope,
            baseTime + 20 * 60 * 1000
        );
        expect(extension.session?.revision).toBe(2);
        expect(extension.session?.deadlineAt).toBe(oldDeadline + 15 * 60 * 1000);

        const staleTick = await mutateStoredTimerSession(canonical => {
            const tick = evaluateTimerTick(canonical!, oldDeadline);
            return tick.stateChanged ? tick.session : undefined;
        }, scope, oldDeadline);

        expect(staleTick.applied).toBe(false);
        expect(staleTick.session?.revision).toBe(2);
        expect(staleTick.session?.deadlineAt).toBe(oldDeadline + 15 * 60 * 1000);
    });

    it('writes the canonical session body once for one successful mutation', async () => {
        const original = createSampleSession();
        persistTimerSession(original, scope);
        const sessionKey = getTimerStorageKeys(scope).session;
        const setItem = vi.spyOn(Storage.prototype, 'setItem');

        await mutateStoredTimerSession(
            canonical => extendTimerSession(canonical!, 15, baseTime + 20 * 60 * 1000),
            scope,
            baseTime + 20 * 60 * 1000
        );

        expect(setItem.mock.calls.filter(([key]) => key === sessionKey)).toHaveLength(1);
    });

    it('claims a deadline notification only once across competing mutations', async () => {
        const deadline = baseTime + 30 * 60 * 1000;
        persistTimerSession(createSampleSession({ deadlineAt: deadline }), scope);
        let notificationClaims = 0;
        const tick = () => mutateStoredTimerSession(canonical => {
            const result = evaluateTimerTick(canonical!, deadline);
            if (!result.stateChanged) return undefined;
            if (result.shouldNotify) notificationClaims += 1;
            return result.session;
        }, scope, deadline);

        await tick();
        await tick();

        expect(notificationClaims).toBe(1);
        expect(loadStoredTimerSession(scope, deadline)?.notifiedDeadlineAt).toBe(deadline);
    });

    it.each([1, 16, 64, 256])('serializes, restores, and calculates duration for %i segments', (segmentCount) => {
        const segments = Array.from({ length: segmentCount }, (_, index) => ({
            startedAt: baseTime + index * 120_000,
            stoppedAt: baseTime + index * 120_000 + 60_000
        }));
        const session = createSampleSession({ state: 'stopped_pending_record', segments, deadlineAt: undefined });
        const serialized = JSON.stringify(session);

        persistTimerSession(session, scope);

        expect(calculateTimerElapsed(session)).toBe(segmentCount * 60_000);
        expect(loadStoredTimerSession(scope)).toEqual(session);
        expect(isValidTimerSession(JSON.parse(serialized))).toBe(true);
        if (segmentCount === 256) {
            expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(64 * 1024);
        }
    });
});
