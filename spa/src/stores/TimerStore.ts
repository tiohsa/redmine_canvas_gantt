import { create } from 'zustand';
import type { Task } from '../types';
import type { TimerIntervalMinutes, TimerPreferences, TimerSession } from '../types/timer';
import {
    calculateRecordedHours,
    calculateTimerElapsed,
    createTimerSession,
    evaluateTimerTick,
    extendTimerSession,
    stopTimerSession
} from '../domain/timer/timerDomain';
import {
    acquireTimerSession,
    clearStoredTimerSession,
    loadStoredTimerPreferences,
    loadStoredTimerSession,
    persistTimerPreferences,
    persistTimerSession,
    TIMER_PREFS_STORAGE_KEY,
    TIMER_SESSION_STORAGE_KEY
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
    startTimer: (task: Task, minutes: TimerIntervalMinutes, autoStop?: boolean) => boolean;
    extendTimer: (minutes: TimerIntervalMinutes) => void;
    stopTimer: () => void;
    resumeTimer: (minutes: TimerIntervalMinutes) => void;
    discardTimer: () => void;
    recordTime: () => void;
    clearSessionOnSaveSuccess: (issueId: number | string) => void;
    setAutoStopPreference: (autoStop: boolean) => void;
    openStartDialog: (task: Task) => void;
    closeStartDialog: () => void;
    openPendingWorkModal: () => void;
    closePendingWorkModal: () => void;
    closeOtherNotices: () => void;
    tick: () => void;
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

    startTimer: (task: Task, minutes: TimerIntervalMinutes, customAutoStop?: boolean) => {
        const state = get();

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
        const autoStop = customAutoStop ?? state.preferences.autoStop;

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
        const acquireResult = acquireTimerSession(newSession);
        if (!acquireResult.acquired) {
            const conflictId = acquireResult.conflictSession?.issueId ?? 'another issue';
            const conflictMsg = (i18n.t('label_timer_conflict_cancelled') || 'Timer start was cancelled because a timer for #%{id} was started in another tab.')
                .replace('%{id}', String(conflictId));
            useUIStore.getState().addNotification(conflictMsg, 'warning');
            set({ session: acquireResult.session, startDialogTask: null });
            return false;
        }

        set({
            session: newSession,
            startDialogTask: null,
            otherRunningNotice: null,
            otherPendingNotice: null
        });

        return true;
    },

    extendTimer: (minutes: TimerIntervalMinutes) => {
        const { session } = get();
        if (!session) return;

        const nextSession = extendTimerSession(session, minutes);
        persistTimerSession(nextSession);
        set({
            session: nextSession,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
    },

    stopTimer: () => {
        const { session } = get();
        if (!session || session.state === 'stopped_pending_record') return;

        const nextSession = stopTimerSession(session);
        // Persist to storage BEFORE opening standard Redmine form (Section 28)
        persistTimerSession(nextSession);

        set({
            session: nextSession,
            otherRunningNotice: null,
            otherPendingNotice: null
        });

        // Open Redmine TimeEntry form in IssueIframeDialog prefilled with hours
        const { formatted } = calculateRecordedHours(nextSession);
        const url = buildRedmineUrl(`/issues/${nextSession.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url);
    },

    resumeTimer: (minutes: TimerIntervalMinutes) => {
        get().extendTimer(minutes);
    },

    discardTimer: () => {
        clearStoredTimerSession();
        set({
            session: null,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
    },

    recordTime: () => {
        const { session } = get();
        if (!session) return;

        const { formatted } = calculateRecordedHours(session);
        const url = buildRedmineUrl(`/issues/${session.issueId}/time_entries/new?time_entry[hours]=${formatted}`);
        useUIStore.getState().openIssueDialog(url);
        set({ pendingWorkModalOpen: false });
    },

    clearSessionOnSaveSuccess: (issueId?: number | string) => {
        const { session } = get();
        if (session && (!issueId || String(session.issueId) === String(issueId))) {
            clearStoredTimerSession();
            set({
                session: null,
                pendingWorkModalOpen: false,
                otherRunningNotice: null,
                otherPendingNotice: null
            });
        }
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

    tick: () => {
        const { session } = get();
        if (!session) return;

        const result = evaluateTimerTick(session, Date.now());
        if (result.stateChanged) {
            persistTimerSession(result.session);
            set({ session: result.session });
        }

        if (result.shouldNotify) {
            const minutes = session.deadlineAt
                ? Math.max(1, Math.round((session.deadlineAt - session.segments[0].startedAt) / (60 * 1000)))
                : 0;
            sendTimerNotification({
                issueId: session.issueId,
                subject: session.subject,
                minutes,
                type: result.notifyType ?? 'running_expired'
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
    window.addEventListener('storage', (event) => {
        if (event.key === TIMER_SESSION_STORAGE_KEY || event.key === TIMER_PREFS_STORAGE_KEY) {
            useTimerStore.getState().syncFromStorage();
        }
    });

    if (import.meta.env.MODE !== 'test') {
        setInterval(() => {
            useTimerStore.getState().tick();
        }, 1000);
    }
}
