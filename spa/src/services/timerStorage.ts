import type { TimerPreferences, TimerSegment, TimerSession } from '../types/timer';
import { evaluateTimerTick, TIMER_SESSION_VERSION } from '../domain/timer/timerDomain';

export const TIMER_SESSION_STORAGE_KEY = 'redmine_canvas_gantt_timer_session';
export const TIMER_PREFS_STORAGE_KEY = 'redmine_canvas_gantt_timer_preferences';

export interface StorageScope {
    userId?: number;
    instanceKey?: string;
}

export const getStorageScope = (): StorageScope => {
    const redmineBase = window.RedmineCanvasGantt?.redmineBase ?? '';
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const instanceKey = `${origin}${redmineBase}`;
    const rawUserId = window.RedmineCanvasGantt?.userId;
    const userId = typeof rawUserId === 'number' && Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : undefined;
    return { userId, instanceKey };
};

export const isValidTimerSegment = (value: unknown): value is TimerSegment => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.startedAt !== 'number' || isNaN(candidate.startedAt) || candidate.startedAt <= 0) {
        return false;
    }
    if (candidate.stoppedAt !== undefined) {
        if (typeof candidate.stoppedAt !== 'number' || isNaN(candidate.stoppedAt) || candidate.stoppedAt < candidate.startedAt) {
            return false;
        }
    }
    return true;
};

export const isValidTimerSession = (value: unknown): value is TimerSession => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;

    if (candidate.version !== TIMER_SESSION_VERSION) return false;
    if (typeof candidate.sessionId !== 'string' || candidate.sessionId.trim() === '') return false;
    if (candidate.issueId === undefined || candidate.issueId === null || candidate.issueId === '') return false;
    if (typeof candidate.subject !== 'string') return false;
    if (typeof candidate.autoStop !== 'boolean') return false;
    if (typeof candidate.createdAt !== 'number' || isNaN(candidate.createdAt)) return false;

    const validStates = ['running', 'expired', 'stopped_pending_record'];
    if (typeof candidate.state !== 'string' || !validStates.includes(candidate.state)) return false;

    if (candidate.deadlineAt !== undefined && (typeof candidate.deadlineAt !== 'number' || isNaN(candidate.deadlineAt))) {
        return false;
    }
    if (candidate.notifiedDeadlineAt !== undefined && (typeof candidate.notifiedDeadlineAt !== 'number' || isNaN(candidate.notifiedDeadlineAt))) {
        return false;
    }
    if (candidate.userId !== undefined && (typeof candidate.userId !== 'number' || isNaN(candidate.userId))) {
        return false;
    }

    if (!Array.isArray(candidate.segments) || candidate.segments.length === 0) return false;
    for (const segment of candidate.segments) {
        if (!isValidTimerSegment(segment)) return false;
    }

    return true;
};

export const isValidTimerPreferences = (value: unknown): value is TimerPreferences => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.autoStop === 'boolean';
};

export const loadStoredTimerSession = (scope: StorageScope = getStorageScope(), now: number = Date.now()): TimerSession | null => {
    try {
        const raw = window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY);
        if (!raw) return null;

        const parsed: unknown = JSON.parse(raw);
        if (!isValidTimerSession(parsed)) {
            return null;
        }

        // Check user scope: if session belongs to another user, do not restore
        if (scope.userId && parsed.userId && parsed.userId !== scope.userId) {
            return null;
        }

        // Recover state based on timestamps
        if (parsed.state === 'running') {
            const tickResult = evaluateTimerTick(parsed, now);
            if (tickResult.stateChanged) {
                persistTimerSession(tickResult.session);
                return tickResult.session;
            }
        }

        return parsed;
    } catch {
        return null;
    }
};

export const persistTimerSession = (session: TimerSession | null): void => {
    try {
        if (session === null) {
            window.localStorage.removeItem(TIMER_SESSION_STORAGE_KEY);
        } else {
            window.localStorage.setItem(TIMER_SESSION_STORAGE_KEY, JSON.stringify(session));
        }
    } catch (e) {
        console.warn('Failed to persist timer session to localStorage', e);
    }
};

export const clearStoredTimerSession = (): void => {
    try {
        window.localStorage.removeItem(TIMER_SESSION_STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear timer session from localStorage', e);
    }
};

export const loadStoredTimerPreferences = (): TimerPreferences => {
    const defaultPrefs: TimerPreferences = { autoStop: false };
    try {
        const raw = window.localStorage.getItem(TIMER_PREFS_STORAGE_KEY);
        if (!raw) return defaultPrefs;

        const parsed: unknown = JSON.parse(raw);
        if (isValidTimerPreferences(parsed)) {
            return parsed;
        }
        return defaultPrefs;
    } catch {
        return defaultPrefs;
    }
};

export const persistTimerPreferences = (prefs: TimerPreferences): void => {
    try {
        window.localStorage.setItem(TIMER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.warn('Failed to persist timer preferences to localStorage', e);
    }
};

export interface AcquireSessionResult {
    acquired: boolean;
    session: TimerSession;
    conflictSession?: TimerSession;
}

export const acquireTimerSession = (
    newSession: TimerSession,
    scope: StorageScope = getStorageScope()
): AcquireSessionResult => {
    const existing = loadStoredTimerSession(scope);
    if (existing && existing.sessionId !== newSession.sessionId) {
        return {
            acquired: false,
            session: existing,
            conflictSession: existing
        };
    }

    persistTimerSession(newSession);

    // Re-verify immediately to ensure another tab didn't write concurrently
    const written = loadStoredTimerSession(scope);
    if (written && written.sessionId !== newSession.sessionId) {
        // Tie break: earlier createdAt wins; if equal, string compare sessionId
        const won = (newSession.createdAt < written.createdAt) ||
            (newSession.createdAt === written.createdAt && newSession.sessionId < written.sessionId);

        if (won) {
            persistTimerSession(newSession);
            return { acquired: true, session: newSession };
        } else {
            return { acquired: false, session: written, conflictSession: written };
        }
    }

    return { acquired: true, session: newSession };
};
