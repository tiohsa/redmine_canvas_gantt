import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTimerStore } from './TimerStore';
import { useUIStore } from './UIStore';
import type { Task } from '../types';
import { TIMER_SESSION_STORAGE_KEY } from '../services/timerStorage';

describe('TimerStore', () => {
    const mockTask: Task = {
        id: '123',
        subject: 'API設計',
        ratioDone: 0,
        statusId: 1,
        lockVersion: 1,
        editable: true,
        canLogTime: true,
        rowIndex: 0,
        hasChildren: false
    };

    beforeEach(() => {
        window.localStorage.clear();
        useTimerStore.setState({
            session: null,
            preferences: { autoStop: false },
            startDialogTask: null,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
        useUIStore.setState({
            notifications: [],
            issueDialogUrl: null
        });
        vi.restoreAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('starts a timer session with chosen duration and autoStop preference snapshot', () => {
        const store = useTimerStore.getState();
        store.setAutoStopPreference(true);

        const started = store.startTimer(mockTask, 30);
        expect(started).toBe(true);

        const currentSession = useTimerStore.getState().session;
        expect(currentSession).not.toBeNull();
        expect(currentSession?.issueId).toBe('123');
        expect(currentSession?.subject).toBe('API設計');
        expect(currentSession?.autoStop).toBe(true);
        expect(currentSession?.state).toBe('running');
        expect(currentSession?.segments).toHaveLength(1);

        // Verify persisted to localStorage
        const storedRaw = window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY);
        expect(storedRaw).not.toBeNull();
    });

    it('prevents starting timer if task.canLogTime is false', () => {
        const taskWithoutLogTime: Task = {
            ...mockTask,
            canLogTime: false
        };

        const started = useTimerStore.getState().startTimer(taskWithoutLogTime, 15);
        expect(started).toBe(false);
        expect(useTimerStore.getState().session).toBeNull();
        expect(useUIStore.getState().notifications).toHaveLength(1);
    });

    it('prevents starting a second timer while another issue is running', () => {
        useTimerStore.getState().startTimer(mockTask, 30);

        const task2: Task = { ...mockTask, id: '456', subject: 'Code Review' };
        const started = useTimerStore.getState().startTimer(task2, 15);

        expect(started).toBe(false);
        expect(useTimerStore.getState().session?.issueId).toBe('123');
        expect(useTimerStore.getState().otherRunningNotice?.issueId).toBe('123');
    });

    it('prevents starting a new timer when pending work exists for another issue', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        useTimerStore.getState().stopTimer(); // becomes stopped_pending_record

        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');

        const task2: Task = { ...mockTask, id: '456', subject: 'Code Review' };
        const started = useTimerStore.getState().startTimer(task2, 15);

        expect(started).toBe(false);
        expect(useTimerStore.getState().otherPendingNotice?.issueId).toBe('123');
    });

    it('manual stop saves session to storage and opens Redmine TimeEntry dialog', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        useTimerStore.getState().stopTimer();

        const session = useTimerStore.getState().session;
        expect(session?.state).toBe('stopped_pending_record');
        expect(session?.segments[0].stoppedAt).toBeDefined();

        // Verify issueDialogUrl is opened with time_entries/new and prefilled hours
        const dialogUrl = useUIStore.getState().issueDialogUrl;
        expect(dialogUrl).toContain('/issues/123/time_entries/new');
        expect(dialogUrl).toContain('time_entry[hours]=');
    });

    it('extends running timer by adding minutes to deadline', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        const initialDeadline = useTimerStore.getState().session?.deadlineAt ?? 0;

        useTimerStore.getState().extendTimer(15);

        const newDeadline = useTimerStore.getState().session?.deadlineAt ?? 0;
        expect(newDeadline).toBe(initialDeadline + 15 * 60 * 1000);
        expect(useTimerStore.getState().session?.segments).toHaveLength(1);
    });

    it('resumes from pending state as a new segment', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        useTimerStore.getState().stopTimer();

        expect(useTimerStore.getState().session?.segments).toHaveLength(1);

        useTimerStore.getState().resumeTimer(15);

        const session = useTimerStore.getState().session;
        expect(session?.state).toBe('running');
        expect(session?.segments).toHaveLength(2);
        expect(session?.segments[1].stoppedAt).toBeUndefined();
    });

    it('clears timer session on TimeEntry save success', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        useTimerStore.getState().stopTimer();

        expect(useTimerStore.getState().session).not.toBeNull();

        // Simulate save success callback from IssueIframeDialog
        useTimerStore.getState().clearSessionOnSaveSuccess('123');

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY)).toBeNull();
    });

    it('discards timer session explicitly on user confirmation', () => {
        useTimerStore.getState().startTimer(mockTask, 30);
        useTimerStore.getState().stopTimer();

        useTimerStore.getState().discardTimer();

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(TIMER_SESSION_STORAGE_KEY)).toBeNull();
    });

    it('syncFromStorage updates local store state when storage changes in another tab', () => {
        expect(useTimerStore.getState().session).toBeNull();

        const externalSession = {
            version: 1,
            sessionId: 'external-1',
            issueId: 999,
            subject: 'External Tab Task',
            autoStop: false,
            state: 'running' as const,
            segments: [{ startedAt: Date.now() }],
            createdAt: Date.now()
        };

        window.localStorage.setItem(TIMER_SESSION_STORAGE_KEY, JSON.stringify(externalSession));
        useTimerStore.getState().syncFromStorage();

        expect(useTimerStore.getState().session?.issueId).toBe(999);
        expect(useTimerStore.getState().session?.subject).toBe('External Tab Task');
    });
});
