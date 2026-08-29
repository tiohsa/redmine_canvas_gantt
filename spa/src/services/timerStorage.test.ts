import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    loadStoredTimerSession,
    persistTimerSession,
    clearStoredTimerSession,
    loadStoredTimerPreferences,
    persistTimerPreferences,
    acquireTimerSession,
    isValidTimerSession,
    TIMER_SESSION_STORAGE_KEY,
    TIMER_PREFS_STORAGE_KEY
} from './timerStorage';
import type { TimerSession } from '../types/timer';

describe('Timer Storage & Persistence', () => {
    const baseTime = 1700000000000;

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    const createSampleSession = (overrides?: Partial<TimerSession>): TimerSession => ({
        version: 1,
        sessionId: 'session-123',
        issueId: 101,
        subject: 'Backend Test',
        autoStop: false,
        state: 'running',
        deadlineAt: baseTime + 30 * 60 * 1000,
        segments: [{ startedAt: baseTime }],
        createdAt: baseTime,
        userId: 5,
        ...overrides
    });

    it('persists and loads a valid timer session', () => {
        const session = createSampleSession();
        persistTimerSession(session);

        const loaded = loadStoredTimerSession({ userId: 5 }, baseTime + 1000);
        expect(loaded).toEqual(session);
    });

    it('clears stored timer session', () => {
        const session = createSampleSession();
        persistTimerSession(session);
        expect(window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY)).not.toBeNull();

        clearStoredTimerSession();
        expect(window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY)).toBeNull();
        expect(loadStoredTimerSession({ userId: 5 })).toBeNull();
    });

    it('gracefully handles invalid JSON in localStorage', () => {
        window.localStorage.setItem(TIMER_SESSION_STORAGE_KEY, '{invalid-json:');
        expect(loadStoredTimerSession({ userId: 5 })).toBeNull();
    });

    it('validates schema correctly and rejects corrupt/partial data', () => {
        expect(isValidTimerSession(null)).toBe(false);
        expect(isValidTimerSession({})).toBe(false);
        expect(isValidTimerSession({ version: 2 })).toBe(false); // wrong version
        expect(isValidTimerSession({ ...createSampleSession(), sessionId: '' })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), state: 'unknown' })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), segments: [] })).toBe(false);
        expect(isValidTimerSession({ ...createSampleSession(), segments: [{ startedAt: -5 }] })).toBe(false);
        expect(isValidTimerSession(createSampleSession())).toBe(true);
    });

    it('does not restore session if userId belongs to a different user', () => {
        const session = createSampleSession({ userId: 42 });
        persistTimerSession(session);

        const loaded = loadStoredTimerSession({ userId: 99 }, baseTime + 1000);
        expect(loaded).toBeNull();
    });

    it('auto-recovers running session to expired when autoStop is OFF upon reload past deadline', () => {
        const session = createSampleSession({
            autoStop: false,
            state: 'running',
            deadlineAt: baseTime + 30 * 60 * 1000
        });
        persistTimerSession(session);

        // Reload 35 minutes later
        const loaded = loadStoredTimerSession({ userId: 5 }, baseTime + 35 * 60 * 1000);
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
        persistTimerSession(session);

        // Reload 60 minutes later
        const loaded = loadStoredTimerSession({ userId: 5 }, baseTime + 60 * 60 * 1000);
        expect(loaded).not.toBeNull();
        expect(loaded?.state).toBe('stopped_pending_record');
        expect(loaded?.segments[0].stoppedAt).toBe(deadline); // Exact deadline
    });

    it('persists and loads timer preferences independently', () => {
        expect(loadStoredTimerPreferences()).toEqual({ autoStop: false });

        persistTimerPreferences({ autoStop: true });
        expect(loadStoredTimerPreferences()).toEqual({ autoStop: true });

        // Invalid JSON fallback
        window.localStorage.setItem(TIMER_PREFS_STORAGE_KEY, 'invalid');
        expect(loadStoredTimerPreferences()).toEqual({ autoStop: false });
    });

    it('acquireTimerSession prevents conflicting start and resolves tie-breaks deterministically', () => {
        const sessionA = createSampleSession({ sessionId: 'session-A', createdAt: baseTime });
        const resultA = acquireTimerSession(sessionA, { userId: 5 });
        expect(resultA.acquired).toBe(true);

        const sessionB = createSampleSession({ sessionId: 'session-B', issueId: 202, createdAt: baseTime + 1000 });
        const resultB = acquireTimerSession(sessionB, { userId: 5 });
        expect(resultB.acquired).toBe(false);
        expect(resultB.conflictSession?.sessionId).toBe('session-A');
    });
});
