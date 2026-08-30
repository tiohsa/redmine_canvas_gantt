import { create } from 'zustand';
import type { Task } from '../types';
import type {
    TimerIntervalMinutes,
    TimerPreferences,
    TimerRecordingContext,
    TimerRecordingResolution,
    TimerSession
} from '../types/timer';
import {
    beginTimerRecording,
    beginTimerRecordingSubmission,
    calculateCurrentDeadlineIntervalMinutes,
    calculateRecordedHours,
    calculateTimerElapsed,
    createTimerSession,
    evaluateTimerTick,
    extendTimerSession,
    generateSessionId,
    markTimerRecordingUnknown,
    markTimerRecordingValidationError,
    cancelTimerRecording,
    recoverTimerRecording,
    completeTimerRecording,
    resolveUnknownTimerRecording,
    stopTimerSession
} from '../domain/timer/timerDomain';
import {
    acquireTimerSession,
    getCurrentTimerTabId,
    getTimerStorageKeys,
    loadStoredTimerPreferences,
    loadStoredTimerSession,
    persistTimerPreferences,
    mutateStoredTimerSession
} from '../services/timerStorage';
import { requestNotificationPermission, sendTimerNotification } from '../services/timerNotification';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { useUIStore } from './UIStore';
import { i18n } from '../utils/i18n';

export interface OtherRunningNotice {
    issueId: number | string;
    subject: string;
}

export interface OtherPendingNotice {
    issueId: number | string;
    subject: string;
    elapsedMs: number;
}

export interface TimerStoreState {
    session: TimerSession | null;
    preferences: TimerPreferences;
    isReady: boolean;
    startDialogTask: Task | null;
    pendingWorkModalOpen: boolean;
    otherRunningNotice: OtherRunningNotice | null;
    otherPendingNotice: OtherPendingNotice | null;

    startTimer: (task: Task, minutes: TimerIntervalMinutes) => Promise<boolean>;
    extendTimer: (minutes: TimerIntervalMinutes) => Promise<void>;
    stopTimer: () => Promise<void>;
    resumeTimer: (minutes: TimerIntervalMinutes) => Promise<void>;
    discardTimer: () => Promise<void>;
    recordTime: () => Promise<void>;
    beginTimerRecordingSubmission: (context: TimerRecordingContext) => Promise<boolean>;
    markTimerRecordingValidationError: (context: TimerRecordingContext) => Promise<boolean>;
    markTimerRecordingUnknown: (context: TimerRecordingContext) => Promise<boolean>;
    cancelTimerRecording: (context: TimerRecordingContext) => Promise<boolean>;
    recoverTimerRecording: (context: TimerRecordingContext) => Promise<boolean>;
    completeTimerRecording: (context: TimerRecordingContext) => Promise<void>;
    resolveUnknownTimerRecording: (context: TimerRecordingContext, resolution: TimerRecordingResolution) => Promise<boolean>;
    setAutoStopPreference: (autoStop: boolean) => void;
    openStartDialog: (task: Task) => void;
    closeStartDialog: () => void;
    openPendingWorkModal: () => void;
    closePendingWorkModal: () => void;
    closeOtherNotices: () => void;
    tick: () => Promise<void>;
    syncFromStorage: () => void;
}

const initialPreferences = loadStoredTimerPreferences();
const initialSession = loadStoredTimerSession();
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let startupPromise: Promise<void> | null = null;

const sameSession = (left: TimerSession | null, right: TimerSession | null): boolean => (
    left?.sessionId !== undefined && left?.sessionId === right?.sessionId
);

const acceptsSnapshot = (current: TimerSession | null, next: TimerSession | null): boolean => {
    if (!current || !next) return true;
    if (!sameSession(current, next)) return true;
    return next.revision >= current.revision;
};

const scheduleDeadlineReconciliation = (session: TimerSession | null): void => {
    if (deadlineTimer !== null) {
        clearTimeout(deadlineTimer);
        deadlineTimer = null;
    }
    if (!session || session.state !== 'running' || session.deadlineAt === undefined) return;

    const delay = Math.max(0, session.deadlineAt - Date.now());
    deadlineTimer = setTimeout(() => {
        deadlineTimer = null;
        void useTimerStore.getState().tick();
    }, delay);
};

const updateSessionAndSchedule = (session: TimerSession | null): void => {
    let acceptedSession = session;
    useTimerStore.setState((state) => {
        if (!acceptsSnapshot(state.session, session)) {
            acceptedSession = state.session;
            return {};
        }
        return { session };
    });
    scheduleDeadlineReconciliation(acceptedSession);
};

const reconcileCanonicalDeadline = async (now: number = Date.now()) => {
    let notification: { session: TimerSession; type: 'running_expired' | 'stopped' } | null = null;
    const result = await mutateStoredTimerSession((canonical) => {
        if (!canonical || canonical.state !== 'running' || canonical.deadlineAt === undefined || now < canonical.deadlineAt) {
            return undefined;
        }

        const tickResult = evaluateTimerTick(canonical, now);
        if (!tickResult.stateChanged) return undefined;
        if (tickResult.shouldNotify) {
            notification = {
                session: tickResult.session,
                type: tickResult.notifyType ?? 'running_expired'
            };
        }
        return tickResult.session;
    }, undefined, now);

    const claimedNotification = notification as { session: TimerSession; type: 'running_expired' | 'stopped' } | null;
    if (result.applied && claimedNotification) {
        sendTimerNotification({
            scopeKey: getTimerStorageKeys().session,
            sessionId: claimedNotification.session.sessionId,
            issueId: claimedNotification.session.issueId,
            deadlineAt: claimedNotification.session.deadlineAt ?? 0,
            subject: claimedNotification.session.subject,
            minutes: calculateCurrentDeadlineIntervalMinutes(claimedNotification.session),
            type: claimedNotification.type
        });
    }

    return result;
};

const isCurrentTimerRecordingDialog = (session: TimerSession): boolean => {
    const recording = useUIStore.getState().issueDialogContext?.timerRecording;
    return Boolean(
        recording &&
        recording.origin === 'timer' &&
        recording.sessionId === session.sessionId &&
        String(recording.issueId) === String(session.issueId) &&
        session.recordingAttempt?.id === recording.attemptId
    );
};

const reconcileRecordingReservation = async (now: number = Date.now()) => {
    const currentTabId = getCurrentTimerTabId();
    return mutateStoredTimerSession((canonical) => {
        const attempt = canonical?.recordingAttempt;
        if (canonical?.state !== 'stopped_pending_record' || !attempt || attempt.ownerTabId !== currentTabId) {
            return undefined;
        }

        if (attempt.phase === 'editing') {
            if (isCurrentTimerRecordingDialog(canonical)) return undefined;
            return cancelTimerRecording(canonical, attempt.id, now);
        }

        if (attempt.phase !== 'submitting') return undefined;

        return {
            ...canonical,
            recordingAttempt: {
                ...attempt,
                phase: 'unknown'
            },
            updatedAt: now
        };
    }, undefined, now);
};

const ensureTimerStoreReady = async (): Promise<void> => {
    if (useTimerStore.getState().isReady) return;

    if (!startupPromise) {
        startupPromise = (async () => {
            const recordingResult = await reconcileRecordingReservation();
            const result = await reconcileCanonicalDeadline();
            const session = result.session ?? recordingResult.session ?? loadStoredTimerSession();
            useTimerStore.setState({ session, isReady: true });
            scheduleDeadlineReconciliation(session);
        })().catch((error) => {
            console.debug('Timer startup reconciliation failed', error);
            const session = loadStoredTimerSession();
            useTimerStore.setState({ session, isReady: true });
            scheduleDeadlineReconciliation(session);
        }).finally(() => {
            startupPromise = null;
        });
    }

    await startupPromise;
};

const recordingContextMatches = (session: TimerSession | null, context: TimerRecordingContext): boolean => (
    Boolean(
        session &&
        context.origin === 'timer' &&
        session.sessionId === context.sessionId &&
        String(session.issueId) === String(context.issueId) &&
        session.recordingAttempt?.id === context.attemptId
    )
);

export const useTimerStore = create<TimerStoreState>((set, get) => ({
    session: initialSession,
    preferences: initialPreferences,
    isReady: false,
    startDialogTask: null,
    pendingWorkModalOpen: false,
    otherRunningNotice: null,
    otherPendingNotice: null,

    startTimer: async (task: Task, minutes: TimerIntervalMinutes) => {
        await ensureTimerStoreReady();
        const canonicalSession = loadStoredTimerSession();
        const state = { ...get(), session: canonicalSession };
        if (canonicalSession !== get().session) updateSessionAndSchedule(canonicalSession);

        if (state.session) {
            if (state.session.state === 'running' || state.session.state === 'expired') {
                set({
                    startDialogTask: null,
                    otherRunningNotice: {
                        issueId: state.session.issueId,
                        subject: state.session.subject
                    }
                });
                return false;
            }
            if (state.session.state === 'stopped_pending_record') {
                set({
                    startDialogTask: null,
                    otherPendingNotice: {
                        issueId: state.session.issueId,
                        subject: state.session.subject,
                        elapsedMs: calculateTimerElapsed(state.session)
                    }
                });
                return false;
            }
        }

        if (task.canLogTime === false) {
            useUIStore.getState().addNotification(
                i18n.t('label_timer_cannot_log_time') || 'You do not have permission to log time on this issue.',
                'error'
            );
            return false;
        }

        void requestNotificationPermission();
        const rawUserId = window.RedmineCanvasGantt?.userId;
        const userId = typeof rawUserId === 'number' && Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : undefined;
        const newSession = createTimerSession({
            issueId: task.id,
            subject: task.subject,
            minutes,
            autoStop: state.preferences.autoStop,
            userId
        });
        const acquireResult = await acquireTimerSession(newSession);
        if (!acquireResult.acquired) {
            const conflictId = acquireResult.conflictSession?.issueId ?? 'another issue';
            const conflictMsg = (i18n.t('label_timer_conflict_cancelled') || 'Timer start was cancelled because a timer for #%{id} was started in another tab.')
                .replace('%{id}', String(conflictId));
            useUIStore.getState().addNotification(conflictMsg, 'warning');
            updateSessionAndSchedule(acquireResult.session);
            set({ startDialogTask: null });
            return false;
        }

        updateSessionAndSchedule(acquireResult.session);
        set({ startDialogTask: null, otherRunningNotice: null, otherPendingNotice: null });
        return true;
    },

    extendTimer: async (minutes: TimerIntervalMinutes) => {
        await ensureTimerStoreReady();
        const sessionId = get().session?.sessionId;
        if (!sessionId) return;
        const now = Date.now();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== sessionId || canonical.recordingAttempt) return undefined;
            const recovered = evaluateTimerTick(canonical, now).session;
            return extendTimerSession(recovered, minutes, now);
        }, undefined, now);
        updateSessionAndSchedule(result.session);
        set({ pendingWorkModalOpen: false, otherRunningNotice: null, otherPendingNotice: null });
    },

    stopTimer: async () => {
        await ensureTimerStoreReady();
        const sessionId = get().session?.sessionId;
        if (!sessionId) return;
        const now = Date.now();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== sessionId || canonical.recordingAttempt || canonical.state === 'stopped_pending_record') return undefined;
            const recovered = evaluateTimerTick(canonical, now).session;
            const stopped = recovered.state === 'stopped_pending_record' ? recovered : stopTimerSession(recovered, now);
            return beginTimerRecording(stopped, getCurrentTimerTabId(), generateSessionId(), now);
        }, undefined, now);
        const nextSession = result.session;
        updateSessionAndSchedule(nextSession);
        if (!result.applied || !nextSession?.recordingAttempt) return;

        set({ otherRunningNotice: null, otherPendingNotice: null });
        const { formatted } = calculateRecordedHours(nextSession);
        const url = buildRedmineUrl(`/issues/${nextSession.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url, {
            timerRecording: {
                origin: 'timer',
                sessionId: nextSession.sessionId,
                issueId: nextSession.issueId,
                attemptId: nextSession.recordingAttempt.id
            }
        });
    },

    resumeTimer: async (minutes: TimerIntervalMinutes) => {
        await get().extendTimer(minutes);
    },

    discardTimer: async () => {
        await ensureTimerStoreReady();
        const sessionId = get().session?.sessionId;
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || (sessionId && canonical.sessionId !== sessionId) || canonical.recordingAttempt) return undefined;
            if (canonical.state !== 'stopped_pending_record') return undefined;
            return null;
        });
        updateSessionAndSchedule(result.session);
        set({ pendingWorkModalOpen: false, otherRunningNotice: null, otherPendingNotice: null });
    },

    recordTime: async () => {
        await ensureTimerStoreReady();
        const sessionId = get().session?.sessionId;
        if (!sessionId) return;
        const now = Date.now();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== sessionId || canonical.state !== 'stopped_pending_record') return undefined;
            return beginTimerRecording(canonical, getCurrentTimerTabId(), generateSessionId(), now);
        }, undefined, now);
        const session = result.session;
        updateSessionAndSchedule(session);
        if (!result.applied || !session?.recordingAttempt || session.state !== 'stopped_pending_record') return;

        const { formatted } = calculateRecordedHours(session);
        const url = buildRedmineUrl(`/issues/${session.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url, {
            timerRecording: {
                origin: 'timer',
                sessionId: session.sessionId,
                issueId: session.issueId,
                attemptId: session.recordingAttempt.id
            }
        });
        set({ pendingWorkModalOpen: false });
    },

    beginTimerRecordingSubmission: async (context) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return beginTimerRecordingSubmission(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        return Boolean(result.applied && result.session?.recordingAttempt?.phase === 'submitting');
    },

    markTimerRecordingValidationError: async (context) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return markTimerRecordingValidationError(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        return Boolean(result.applied && result.session?.recordingAttempt?.phase === 'editing');
    },

    markTimerRecordingUnknown: async (context) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return markTimerRecordingUnknown(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        return Boolean(result.applied && result.session?.recordingAttempt?.phase === 'unknown');
    },

    cancelTimerRecording: async (context) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return cancelTimerRecording(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        return Boolean(result.applied && !result.session?.recordingAttempt);
    },

    recoverTimerRecording: async (context) => {
        await ensureTimerStoreReady();
        const currentTabId = getCurrentTimerTabId();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            if (canonical?.recordingAttempt?.ownerTabId === currentTabId) return undefined;
            return recoverTimerRecording(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        return result.applied;
    },

    completeTimerRecording: async (context) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return completeTimerRecording(canonical!, context.attemptId);
        });
        updateSessionAndSchedule(result.session);
        set({ pendingWorkModalOpen: false, otherRunningNotice: null, otherPendingNotice: null });
    },

    resolveUnknownTimerRecording: async (context, resolution) => {
        await ensureTimerStoreReady();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!recordingContextMatches(canonical, context)) return undefined;
            return resolveUnknownTimerRecording(canonical!, context.attemptId, resolution);
        });
        updateSessionAndSchedule(result.session);
        set({ pendingWorkModalOpen: false, otherRunningNotice: null, otherPendingNotice: null });
        return Boolean(result.applied && (resolution === 'recorded' ? !result.session : !result.session?.recordingAttempt));
    },

    setAutoStopPreference: (autoStop: boolean) => {
        persistTimerPreferences({ autoStop });
        set(state => ({ preferences: { ...state.preferences, autoStop } }));
    },

    openStartDialog: (task: Task) => {
        const state = get();
        if (state.session) {
            if (String(state.session.issueId) === String(task.id)) {
                if (state.session.state === 'stopped_pending_record') set({ pendingWorkModalOpen: true });
                return;
            }
            if (state.session.state === 'running' || state.session.state === 'expired') {
                set({ otherRunningNotice: { issueId: state.session.issueId, subject: state.session.subject } });
                return;
            }
            if (state.session.state === 'stopped_pending_record') {
                set({
                    otherPendingNotice: {
                        issueId: state.session.issueId,
                        subject: state.session.subject,
                        elapsedMs: calculateTimerElapsed(state.session)
                    }
                });
                return;
            }
        }
        if (task.canLogTime === false) {
            useUIStore.getState().addNotification(
                i18n.t('label_timer_cannot_log_time') || 'You do not have permission to log time on this issue.',
                'error'
            );
            return;
        }
        set({ startDialogTask: task });
    },

    closeStartDialog: () => set({ startDialogTask: null }),
    openPendingWorkModal: () => set({ pendingWorkModalOpen: true }),
    closePendingWorkModal: () => set({ pendingWorkModalOpen: false }),
    closeOtherNotices: () => set({ otherRunningNotice: null, otherPendingNotice: null }),

    tick: async () => {
        await ensureTimerStoreReady();
        const now = Date.now();
        const canonical = loadStoredTimerSession();
        if (!canonical) {
            updateSessionAndSchedule(null);
            return;
        }
        if (canonical.state === 'running' && canonical.deadlineAt !== undefined && now < canonical.deadlineAt) {
            updateSessionAndSchedule(canonical);
            return;
        }
        const result = await reconcileCanonicalDeadline(now);
        updateSessionAndSchedule(result.session ?? canonical);
    },

    syncFromStorage: () => {
        const storedSession = loadStoredTimerSession();
        const storedPrefs = loadStoredTimerPreferences();
        const accepted = acceptsSnapshot(get().session, storedSession);
        if (accepted) set({ session: storedSession });
        set({ preferences: storedPrefs });
        scheduleDeadlineReconciliation(accepted ? storedSession : get().session);
    }
}));

if (typeof window !== 'undefined') {
    const storageKeys = getTimerStorageKeys();
    window.addEventListener('storage', (event) => {
        if (event.key === storageKeys.session || event.key === storageKeys.preferences) {
            useTimerStore.getState().syncFromStorage();
        }
    });

    if (import.meta.env.MODE !== 'test') void ensureTimerStoreReady();
}
