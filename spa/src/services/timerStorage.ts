import type { TimerPreferences, TimerSegment, TimerSession } from '../types/timer';
import { evaluateTimerTick, generateSessionId, TIMER_SESSION_VERSION } from '../domain/timer/timerDomain';

export const TIMER_SESSION_STORAGE_KEY = 'redmine_canvas_gantt_timer_session';
export const TIMER_PREFS_STORAGE_KEY = 'redmine_canvas_gantt_timer_preferences';
const TIMER_MUTATION_LOCK_KEY = 'redmine_canvas_gantt_timer_lock';
const MUTATION_LOCK_LEASE_MS = 2_000;
const TIMER_LOCK_DB_NAME = 'redmine_canvas_gantt_timer_locks';
const TIMER_LOCK_STORE_NAME = 'locks';

export interface StorageScope { userId?: number; instanceKey?: string; }
export interface TimerStorageKeys { session: string; preferences: string; lock: string; }

export const getStorageScope = (): StorageScope => {
    const redmineBase = typeof window !== 'undefined' ? window.RedmineCanvasGantt?.redmineBase ?? '' : '';
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const rawUserId = typeof window !== 'undefined' ? window.RedmineCanvasGantt?.userId : undefined;
    const userId = typeof rawUserId === 'number' && Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : undefined;
    return { userId, instanceKey: `${origin}${redmineBase}` };
};

const storageScopeSuffix = (scope: StorageScope): string => {
    const instance = encodeURIComponent(scope.instanceKey ?? 'unknown-instance');
    return `${instance}:user:${scope.userId ?? 'anonymous'}`;
};

export const getTimerStorageKeys = (scope: StorageScope = getStorageScope()): TimerStorageKeys => {
    const suffix = storageScopeSuffix(scope);
    return {
        session: `${TIMER_SESSION_STORAGE_KEY}:${suffix}`,
        preferences: `${TIMER_PREFS_STORAGE_KEY}:${suffix}`,
        lock: `${TIMER_MUTATION_LOCK_KEY}:${suffix}`
    };
};

export const isValidTimerSegment = (value: unknown): value is TimerSegment => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.startedAt !== 'number' || !Number.isFinite(candidate.startedAt) || candidate.startedAt <= 0) return false;
    if (candidate.stoppedAt !== undefined && (
        typeof candidate.stoppedAt !== 'number' || !Number.isFinite(candidate.stoppedAt) || candidate.stoppedAt < candidate.startedAt
    )) return false;
    return true;
};

export const isValidTimerSession = (value: unknown): value is TimerSession => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== TIMER_SESSION_VERSION) return false;
    if (typeof candidate.sessionId !== 'string' || candidate.sessionId.trim() === '') return false;
    if (!Number.isInteger(candidate.revision) || (candidate.revision as number) < 1) return false;
    if (candidate.issueId === undefined || candidate.issueId === null || candidate.issueId === '') return false;
    if (typeof candidate.subject !== 'string' || typeof candidate.autoStop !== 'boolean') return false;
    if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) return false;
    if (typeof candidate.updatedAt !== 'number' || !Number.isFinite(candidate.updatedAt)) return false;
    if (!['running', 'expired', 'stopped_pending_record'].includes(String(candidate.state))) return false;
    if (candidate.deadlineAt !== undefined && (typeof candidate.deadlineAt !== 'number' || !Number.isFinite(candidate.deadlineAt))) return false;
    if (candidate.notifiedDeadlineAt !== undefined && (typeof candidate.notifiedDeadlineAt !== 'number' || !Number.isFinite(candidate.notifiedDeadlineAt))) return false;
    if (candidate.notifiedType !== undefined && !['running_expired', 'stopped'].includes(String(candidate.notifiedType))) return false;
    if (candidate.recordingAttemptId !== undefined && (
        typeof candidate.recordingAttemptId !== 'string' || candidate.recordingAttemptId.trim() === ''
    )) return false;
    if (candidate.userId !== undefined && (typeof candidate.userId !== 'number' || !Number.isFinite(candidate.userId))) return false;
    return Array.isArray(candidate.segments) && candidate.segments.length > 0 && candidate.segments.every(isValidTimerSegment);
};

export const isValidTimerPreferences = (value: unknown): value is TimerPreferences => {
    return Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).autoStop === 'boolean');
};

const readStoredTimerSession = (scope: StorageScope): TimerSession | null => {
    try {
        const raw = window.localStorage.getItem(getTimerStorageKeys(scope).session);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isValidTimerSession(parsed)) return null;
        if (scope.userId !== undefined && parsed.userId !== scope.userId) return null;
        return parsed;
    } catch { return null; }
};

export const loadStoredTimerSession = (scope: StorageScope = getStorageScope(), now: number = Date.now()): TimerSession | null => {
    const stored = readStoredTimerSession(scope);
    if (!stored || stored.state !== 'running') return stored;
    return evaluateTimerTick(stored, now).session;
};

export const persistTimerSession = (session: TimerSession | null, scope: StorageScope = getStorageScope()): void => {
    try {
        const key = getTimerStorageKeys(scope).session;
        if (session === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(session));
    } catch (error) { console.warn('Failed to persist timer session to localStorage', error); }
};

export const clearStoredTimerSession = (scope: StorageScope = getStorageScope()): void => persistTimerSession(null, scope);

export const loadStoredTimerPreferences = (scope: StorageScope = getStorageScope()): TimerPreferences => {
    const fallback: TimerPreferences = { autoStop: false };
    try {
        const raw = window.localStorage.getItem(getTimerStorageKeys(scope).preferences);
        if (!raw) return fallback;
        const parsed: unknown = JSON.parse(raw);
        return isValidTimerPreferences(parsed) ? parsed : fallback;
    } catch { return fallback; }
};

export const persistTimerPreferences = (prefs: TimerPreferences, scope: StorageScope = getStorageScope()): void => {
    try { window.localStorage.setItem(getTimerStorageKeys(scope).preferences, JSON.stringify(prefs)); }
    catch (error) { console.warn('Failed to persist timer preferences to localStorage', error); }
};

interface MutationLock { token: string; expiresAt: number; }
const parseMutationLock = (raw: string | null): MutationLock | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<MutationLock>;
        return typeof parsed.token === 'string' && typeof parsed.expiresAt === 'number' ? parsed as MutationLock : null;
    } catch { return null; }
};

const withMutationLock = <T>(scope: StorageScope, callback: () => T): T | undefined => {
    const lockKey = getTimerStorageKeys(scope).lock;
    const now = Date.now();
    const existing = parseMutationLock(window.localStorage.getItem(lockKey));
    if (existing && existing.expiresAt > now) return undefined;
    const token = generateSessionId();
    window.localStorage.setItem(lockKey, JSON.stringify({ token, expiresAt: now + MUTATION_LOCK_LEASE_MS }));
    if (parseMutationLock(window.localStorage.getItem(lockKey))?.token !== token) return undefined;
    try { return callback(); }
    finally {
        if (parseMutationLock(window.localStorage.getItem(lockKey))?.token === token) window.localStorage.removeItem(lockKey);
    }
};

export interface TimerMutationResult { applied: boolean; session: TimerSession | null; reason?: 'locked' | 'unchanged'; }
export type TimerSessionMutation = (canonical: TimerSession | null) => TimerSession | null | undefined;

const applyStoredTimerMutationUnlocked = (
    mutation: TimerSessionMutation,
    scope: StorageScope,
    now: number
): TimerMutationResult => {
    const canonical = readStoredTimerSession(scope);
    const next = mutation(canonical);
    if (next === undefined) return { applied: false, session: canonical, reason: 'unchanged' };
    if (next === null) {
        persistTimerSession(null, scope);
        return { applied: true, session: null };
    }
    const persisted = { ...next, revision: canonical ? canonical.revision + 1 : 1, updatedAt: now };
    persistTimerSession(persisted, scope);
    return { applied: true, session: persisted };
};

const openTimerLockDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(TIMER_LOCK_DB_NAME, 1);
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TIMER_LOCK_STORE_NAME)) {
            request.result.createObjectStore(TIMER_LOCK_STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Timer lock database is blocked'));
});

const withIndexedDbMutationLock = async <T>(scope: StorageScope, callback: () => T): Promise<T | undefined> => {
    let database: IDBDatabase | undefined;
    try {
        database = await openTimerLockDatabase();
        return await new Promise<T | undefined>((resolve, reject) => {
            const transaction = database!.transaction(TIMER_LOCK_STORE_NAME, 'readwrite');
            let result: T | undefined;
            let callbackError: unknown;

            transaction.oncomplete = () => {
                database?.close();
                if (callbackError) reject(callbackError);
                else resolve(result);
            };
            transaction.onerror = () => {
                database?.close();
                resolve(undefined);
            };
            transaction.onabort = () => {
                database?.close();
                if (callbackError) reject(callbackError);
                else resolve(undefined);
            };

            const request = transaction.objectStore(TIMER_LOCK_STORE_NAME)
                .put(Date.now(), getTimerStorageKeys(scope).lock);
            request.onsuccess = () => {
                try {
                    result = callback();
                } catch (error) {
                    callbackError = error;
                    transaction.abort();
                }
            };
        });
    } catch {
        database?.close();
        return undefined;
    }
};

const applyStoredTimerMutation = (
    mutation: TimerSessionMutation,
    scope: StorageScope,
    now: number = Date.now()
): TimerMutationResult => {
    const result = withMutationLock(scope, () => applyStoredTimerMutationUnlocked(mutation, scope, now));
    return result ?? { applied: false, session: readStoredTimerSession(scope), reason: 'locked' };
};

export const mutateStoredTimerSession = async (
    mutation: TimerSessionMutation,
    scope: StorageScope = getStorageScope(),
    now: number = Date.now()
): Promise<TimerMutationResult> => {
    const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (lockManager) {
        return lockManager.request(getTimerStorageKeys(scope).lock, { mode: 'exclusive' }, () => (
            applyStoredTimerMutationUnlocked(mutation, scope, now)
        ));
    }
    if (typeof indexedDB !== 'undefined') {
        const result = await withIndexedDbMutationLock(scope, () => applyStoredTimerMutationUnlocked(mutation, scope, now));
        if (result) return result;
    }
    return applyStoredTimerMutation(mutation, scope, now);
};

export interface AcquireSessionResult { acquired: boolean; session: TimerSession | null; conflictSession?: TimerSession; }
export const acquireTimerSession = async (
    newSession: TimerSession,
    scope: StorageScope = getStorageScope()
): Promise<AcquireSessionResult> => {
    const result = await mutateStoredTimerSession(
        canonical => canonical && canonical.sessionId !== newSession.sessionId ? undefined : newSession,
        scope,
        newSession.updatedAt
    );
    if (result.applied && result.session) return { acquired: true, session: result.session };
    return {
        acquired: false,
        session: result.session,
        ...(result.session ? { conflictSession: result.session } : {})
    };
};
