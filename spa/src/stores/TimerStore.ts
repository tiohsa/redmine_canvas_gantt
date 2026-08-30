import { create } from 'zustand';
import type { Task } from '../types';
import type { TimerIntervalMinutes, TimerPreferences, TimerRecordingContext, TimerSession } from '../types/timer';
import {
    calculateCurrentDeadlineIntervalMinutes,
    calculateRecordedHours,
    calculateTimerElapsed,
    createTimerSession,
    evaluateTimerTick,
    extendTimerSession,
    generateSessionId,
    stopTimerSession
} from '../domain/timer/timerDomain';
import {
    acquireTimerSession,
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
    startDialogTask: Task | null;
    pendingWorkModalOpen: boolean;
    otherRunningNotice: OtherRunningNotice | null;
    otherPendingNotice: OtherPendingNotice | null;

    // Actions
    startTimer: (task: Task, minutes: TimerIntervalMinutes) => Promise<boolean>;
    extendTimer: (minutes: TimerIntervalMinutes) => Promise<void>;
    stopTimer: () => Promise<void>;
    resumeTimer: (minutes: TimerIntervalMinutes) => Promise<void>;
    discardTimer: () => Promise<void>;
    recordTime: () => Promise<void>;
    completeTimerRecording: (context: TimerRecordingContext) => Promise<void>;
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

export const useTimerStore = create<TimerStoreState>((set, get) => ({
    session: initialSession,
    preferences: initialPreferences,
    startDialogTask: null,
    pendingWorkModalOpen: false,
    otherRunningNotice: null,
    otherPendingNotice: null,

    startTimer: async (task: Task, minutes: TimerIntervalMinutes) => {
        const canonicalSession = loadStoredTimerSession();
        const state = { ...get(), session: canonicalSession };
        if (canonicalSession !== get().session) set({ session: canonicalSession });

        // 1. Check if an active or pending timer already exists
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
            } else if (state.session.state === 'stopped_pending_record') {
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

        // 2. Permission check
        if (task.canLogTime === false) {
            useUIStore.getState().addNotification(
                i18n.t('label_timer_cannot_log_time') || 'You do not have permission to log time on this issue.',
                'error'
            );
            return false;
        }

        // 3. User autoStop preference snapshot
        const autoStop = state.preferences.autoStop;

        // Request notification permission opportunistically on user click
        void requestNotificationPermission();

        const rawUserId = window.RedmineCanvasGantt?.userId;
        const userId = typeof rawUserId === 'number' && Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : undefined;

        const newSession = createTimerSession({
            issueId: task.id,
            subject: task.subject,
            minutes,
            autoStop,
            userId
        });

        // 4. Concurrency check and acquire
        const acquireResult = await acquireTimerSession(newSession);
        if (!acquireResult.acquired) {
            const conflictId = acquireResult.conflictSession?.issueId ?? 'another issue';
            const conflictMsg = (i18n.t('label_timer_conflict_cancelled') || 'Timer start was cancelled because a timer for #%{id} was started in another tab.')
                .replace('%{id}', String(conflictId));
            useUIStore.getState().addNotification(conflictMsg, 'warning');
            set({ session: acquireResult.session, startDialogTask: null });
            return false;
        }

        set({
            session: acquireResult.session,
            startDialogTask: null,
            otherRunningNotice: null,
            otherPendingNotice: null
        });

        return true;
    },

    extendTimer: async (minutes: TimerIntervalMinutes) => {
        const { session } = get();
        if (!session) return;
        const now = Date.now();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== session.sessionId) return undefined;
            const recovered = evaluateTimerTick(canonical, now).session;
            return extendTimerSession(recovered, minutes, now);
        }, undefined, now);
        set({
            session: result.session,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
    },

    stopTimer: async () => {
        const { session } = get();
        if (!session || session.state === 'stopped_pending_record') return;
        const now = Date.now();
        const recordingAttemptId = generateSessionId();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== session.sessionId || canonical.state === 'stopped_pending_record') return undefined;
            const recovered = evaluateTimerTick(canonical, now).session;
            const stopped = recovered.state === 'stopped_pending_record'
                ? recovered
                : stopTimerSession(recovered, now);
            return { ...stopped, recordingAttemptId };
        }, undefined, now);
        const nextSession = result.session;
        if (!result.applied || !nextSession) {
            set({ session: nextSession });
            return;
        }

        set({
            session: nextSession,
            otherRunningNotice: null,
            otherPendingNotice: null
        });

        // Open Redmine TimeEntry form in IssueIframeDialog prefilled with hours
        const { formatted } = calculateRecordedHours(nextSession);
        const url = buildRedmineUrl(`/issues/${nextSession.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url, {
            timerRecording: {
                origin: 'timer',
                sessionId: nextSession.sessionId,
                issueId: nextSession.issueId,
                recordingAttemptId
            }
        });
    },

    resumeTimer: async (minutes: TimerIntervalMinutes) => {
        await get().extendTimer(minutes);
    },

    discardTimer: async () => {
        const sessionId = get().session?.sessionId;
        const result = await mutateStoredTimerSession((canonical) => (
            canonical && (!sessionId || canonical.sessionId !== sessionId) ? undefined : null
        ));
        set({
            session: result.session,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
    },

    recordTime: async () => {
        const localSession = get().session;
        const recordingAttemptId = generateSessionId();
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || canonical.sessionId !== localSession?.sessionId || canonical.state !== 'stopped_pending_record') {
                return undefined;
            }
            return { ...canonical, recordingAttemptId };
        });
        const session = result.session;
        if (!result.applied || !session || session.state !== 'stopped_pending_record') {
            set({ session });
            return;
        }

        const { formatted } = calculateRecordedHours(session);
        const url = buildRedmineUrl(`/issues/${session.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url, {
            timerRecording: {
                origin: 'timer',
                sessionId: session.sessionId,
                issueId: session.issueId,
                recordingAttemptId
            }
        });
        set({ pendingWorkModalOpen: false });
    },

    completeTimerRecording: async (context) => {
        const result = await mutateStoredTimerSession((canonical) => {
            if (!canonical || context.origin !== 'timer') return undefined;
            if (canonical.sessionId !== context.sessionId) return undefined;
            if (String(canonical.issueId) !== String(context.issueId)) return undefined;
            if (canonical.state !== 'stopped_pending_record') return undefined;
            if (canonical.recordingAttemptId !== context.recordingAttemptId) return undefined;
            return null;
        });
        set({
            session: result.session,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
    },

    setAutoStopPreference: (autoStop: boolean) => {
        persistTimerPreferences({ autoStop });
        set(state => ({
            preferences: {
                ...state.preferences,
                autoStop
            }
        }));
    },

    openStartDialog: (task: Task) => {
        const state = get();

        // If a session exists for the same issue and is running, highlight/focus
        if (state.session) {
            if (String(state.session.issueId) === String(task.id)) {
                if (state.session.state === 'stopped_pending_record') {
                    set({ pendingWorkModalOpen: true });
                    return;
                }
                // Already running for this task
                return;
            }

            // A session exists for another issue
            if (state.session.state === 'running' || state.session.state === 'expired') {
                set({
                    otherRunningNotice: {
                        issueId: state.session.issueId,
                        subject: state.session.subject
                    }
                });
                return;
            } else if (state.session.state === 'stopped_pending_record') {
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

    closeStartDialog: () => {
        set({ startDialogTask: null });
    },

    openPendingWorkModal: () => {
        set({ pendingWorkModalOpen: true });
    },

    closePendingWorkModal: () => {
        set({ pendingWorkModalOpen: false });
    },

    closeOtherNotices: () => {
        set({ otherRunningNotice: null, otherPendingNotice: null });
    },

    tick: async () => {
        const now = Date.now();
        let notification: { session: TimerSession; type: 'running_expired' | 'stopped' } | null = null;
        const mutation = await mutateStoredTimerSession((canonical) => {
            if (!canonical) return undefined;
            const tickResult = evaluateTimerTick(canonical, now);
            if (!tickResult.stateChanged) return undefined;
            if (tickResult.shouldNotify) {
                notification = { session: tickResult.session, type: tickResult.notifyType ?? 'running_expired' };
            }
            return tickResult.session;
        }, undefined, now);
        if (mutation.session !== get().session) set({ session: mutation.session });

        if (mutation.applied && notification) {
            const claimed = notification as { session: TimerSession; type: 'running_expired' | 'stopped' };
            sendTimerNotification({
                scopeKey: getTimerStorageKeys().session,
                sessionId: claimed.session.sessionId,
                issueId: claimed.session.issueId,
                deadlineAt: claimed.session.deadlineAt ?? 0,
                subject: claimed.session.subject,
                minutes: calculateCurrentDeadlineIntervalMinutes(claimed.session),
                type: claimed.type
            });
        }
    },

    syncFromStorage: () => {
        const storedSession = loadStoredTimerSession();
        const storedPrefs = loadStoredTimerPreferences();
        set({
            session: storedSession,
            preferences: storedPrefs
        });
    }
}));

// Setup global storage listener for multi-tab sync and timer tick interval
if (typeof window !== 'undefined') {
    const storageKeys = getTimerStorageKeys();
    window.addEventListener('storage', (event) => {
        if (event.key === storageKeys.session || event.key === storageKeys.preferences) {
            useTimerStore.getState().syncFromStorage();
        }
    });

    if (import.meta.env.MODE !== 'test') {
        setInterval(() => {
            void useTimerStore.getState().tick();
        }, 1000);
    }
}
