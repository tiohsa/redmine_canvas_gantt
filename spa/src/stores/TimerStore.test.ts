import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTimerStore } from './TimerStore';
import { useUIStore } from './UIStore';
import type { Task } from '../types';
import { getTimerStorageKeys, loadStoredTimerSession, persistTimerSession } from '../services/timerStorage';

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
            isReady: false,
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
        vi.useRealTimers();
        window.localStorage.clear();
    });

    it('starts a timer session with chosen duration and autoStop preference snapshot', async () => {
        const store = useTimerStore.getState();
        store.setAutoStopPreference(true);

        const started = await store.startTimer(mockTask, 30);
        expect(started).toBe(true);

        const currentSession = useTimerStore.getState().session;
        expect(currentSession).not.toBeNull();
        expect(currentSession?.issueId).toBe('123');
        expect(currentSession?.subject).toBe('API設計');
        expect(currentSession?.autoStop).toBe(true);
        expect(currentSession?.state).toBe('running');
        expect(currentSession?.segments).toHaveLength(1);

        // Verify persisted to localStorage
        const storedRaw = window.localStorage.getItem(getTimerStorageKeys().session);
        expect(storedRaw).not.toBeNull();
    });

    it('prevents starting timer if task.canLogTime is false', async () => {
        const taskWithoutLogTime: Task = {
            ...mockTask,
            canLogTime: false
        };

        const started = await useTimerStore.getState().startTimer(taskWithoutLogTime, 15);
        expect(started).toBe(false);
        expect(useTimerStore.getState().session).toBeNull();
        expect(useUIStore.getState().notifications).toHaveLength(1);
    });

    it('prevents starting a second timer while another issue is running', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);

        const task2: Task = { ...mockTask, id: '456', subject: 'Code Review' };
        const started = await useTimerStore.getState().startTimer(task2, 15);

        expect(started).toBe(false);
        expect(useTimerStore.getState().session?.issueId).toBe('123');
        expect(useTimerStore.getState().otherRunningNotice?.issueId).toBe('123');
    });

    it('prevents starting a new timer when pending work exists for another issue', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer(); // becomes stopped_pending_record

        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');

        const task2: Task = { ...mockTask, id: '456', subject: 'Code Review' };
        const started = await useTimerStore.getState().startTimer(task2, 15);

        expect(started).toBe(false);
        expect(useTimerStore.getState().otherPendingNotice?.issueId).toBe('123');
    });

    it('manual stop saves session to storage and opens Redmine TimeEntry dialog', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        const session = useTimerStore.getState().session;
        expect(session?.state).toBe('stopped_pending_record');
        expect(session?.segments[0].stoppedAt).toBeDefined();

        // Verify issueDialogUrl is opened with time_entries/new and prefilled hours
        const dialogUrl = useUIStore.getState().issueDialogUrl;
        expect(dialogUrl).toContain('/issues/123/time_entries/new');
        expect(dialogUrl).toContain('time_entry[hours]=');
    });

    it('manual stop after an auto-stop deadline preserves the exact deadline stop time', async () => {
        vi.useFakeTimers();
        const startedAt = new Date('2026-08-29T10:00:00Z').getTime();
        vi.setSystemTime(startedAt);
        useTimerStore.getState().setAutoStopPreference(true);
        await useTimerStore.getState().startTimer(mockTask, 5);

        vi.setSystemTime(startedAt + 10 * 60 * 1000);
        await useTimerStore.getState().stopTimer();

        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');
        expect(useTimerStore.getState().session?.segments[0].stoppedAt).toBe(startedAt + 5 * 60 * 1000);
        vi.useRealTimers();
    });

    it('extends running timer by adding minutes to deadline', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const initialDeadline = useTimerStore.getState().session?.deadlineAt ?? 0;

        await useTimerStore.getState().extendTimer(15);

        const newDeadline = useTimerStore.getState().session?.deadlineAt ?? 0;
        expect(newDeadline).toBe(initialDeadline + 15 * 60 * 1000);
        expect(useTimerStore.getState().session?.segments).toHaveLength(1);
    });

    it('resumes from pending state as a new segment', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        expect(useTimerStore.getState().session?.segments).toHaveLength(1);

        const pending = useTimerStore.getState().session!;
        await useTimerStore.getState().cancelTimerRecording({
            origin: 'timer',
            sessionId: pending.sessionId,
            issueId: pending.issueId,
            attemptId: pending.recordingAttempt!.id
        });

        await useTimerStore.getState().resumeTimer(15);

        const session = useTimerStore.getState().session;
        expect(session?.state).toBe('running');
        expect(session?.segments).toHaveLength(2);
        expect(session?.segments[1].stoppedAt).toBeUndefined();
    });

    it('clears timer session on TimeEntry save success', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        expect(useTimerStore.getState().session).not.toBeNull();

        const session = useTimerStore.getState().session;
        await useTimerStore.getState().beginTimerRecordingSubmission({
            origin: 'timer',
            sessionId: session!.sessionId,
            issueId: session!.issueId,
            attemptId: session!.recordingAttempt!.id
        });
        await useTimerStore.getState().completeTimerRecording({
            origin: 'timer',
            sessionId: session!.sessionId,
            issueId: '123',
            attemptId: session!.recordingAttempt!.id
        });

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(getTimerStorageKeys().session)).toBeNull();
    });

    it('does not clear a running session or a pending session owned by another recording attempt', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const running = useTimerStore.getState().session!;

        await useTimerStore.getState().completeTimerRecording({
            origin: 'timer',
            sessionId: running.sessionId,
            issueId: running.issueId,
            attemptId: 'normal-time-entry'
        });
        expect(useTimerStore.getState().session?.state).toBe('running');

        await useTimerStore.getState().stopTimer();
        const pending = useTimerStore.getState().session!;
        await useTimerStore.getState().completeTimerRecording({
            origin: 'timer',
            sessionId: pending.sessionId,
            issueId: running.issueId,
            attemptId: 'stale-attempt'
        });
        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');
    });

    it('does not write the canonical session during a steady running tick', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const sessionKey = getTimerStorageKeys().session;
        const setItem = vi.spyOn(Storage.prototype, 'setItem');

        await useTimerStore.getState().tick();

        expect(setItem.mock.calls.filter(([key]) => key === sessionKey)).toHaveLength(0);
    });

    it('reconciles an overdue canonical session during startup before exposing it to actions', async () => {
        vi.useFakeTimers();
        const startedAt = 1_700_000_000_000;
        vi.setSystemTime(startedAt + 35 * 60 * 1000);
        const overdue = {
            version: 3,
            sessionId: 'overdue-session',
            revision: 1,
            issueId: 123,
            subject: 'Overdue task',
            autoStop: true,
            deadlineAt: startedAt + 30 * 60 * 1000,
            segments: [{ startedAt }],
            state: 'running' as const,
            createdAt: startedAt,
            updatedAt: startedAt
        };
        persistTimerSession(overdue);
        useTimerStore.setState({ session: overdue, isReady: false });

        await useTimerStore.getState().tick();

        const reconciled = useTimerStore.getState().session;
        expect(reconciled?.state).toBe('stopped_pending_record');
        expect(reconciled?.revision).toBe(2);
        expect(loadStoredTimerSession()?.state).toBe('stopped_pending_record');
        vi.useRealTimers();
    });

    it('reconciles an interrupted submission to unknown during startup', async () => {
        const startedAt = Date.now() - 30 * 60 * 1000;
        const submitting = {
            version: 3,
            sessionId: 'interrupted-submission',
            revision: 4,
            issueId: 123,
            subject: 'Interrupted task',
            autoStop: false,
            state: 'stopped_pending_record' as const,
            recordingAttempt: {
                id: 'interrupted-attempt',
                openedAt: startedAt,
                phase: 'submitting' as const
            },
            segments: [{ startedAt, stoppedAt: Date.now() }],
            createdAt: startedAt,
            updatedAt: Date.now()
        };
        persistTimerSession(submitting);
        useTimerStore.setState({ session: submitting, isReady: false });

        await useTimerStore.getState().tick();

        expect(useTimerStore.getState().session?.recordingAttempt?.phase).toBe('unknown');
        expect(useTimerStore.getState().session?.revision).toBe(5);
        expect(loadStoredTimerSession()?.recordingAttempt?.phase).toBe('unknown');
    });

    it('keeps an unknown save outcome until explicit user resolution', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();
        const pending = useTimerStore.getState().session!;
        const context = {
            origin: 'timer' as const,
            sessionId: pending.sessionId,
            issueId: pending.issueId,
            attemptId: pending.recordingAttempt!.id
        };

        await useTimerStore.getState().beginTimerRecordingSubmission(context);
        await useTimerStore.getState().markTimerRecordingUnknown(context);
        expect(useTimerStore.getState().session?.recordingAttempt?.phase).toBe('unknown');

        await useTimerStore.getState().resolveUnknownTimerRecording(context, 'unregistered');
        expect(useTimerStore.getState().session?.recordingAttempt).toBeUndefined();
        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');

        await useTimerStore.getState().recordTime();
        const secondAttempt = useTimerStore.getState().session!.recordingAttempt!;
        const secondContext = { ...context, attemptId: secondAttempt.id };
        await useTimerStore.getState().beginTimerRecordingSubmission(secondContext);
        await useTimerStore.getState().markTimerRecordingUnknown(secondContext);
        await useTimerStore.getState().resolveUnknownTimerRecording(secondContext, 'recorded');
        expect(useTimerStore.getState().session).toBeNull();
    });

    it('discards timer session explicitly on user confirmation', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        const pending = useTimerStore.getState().session!;
        await useTimerStore.getState().cancelTimerRecording({
            origin: 'timer',
            sessionId: pending.sessionId,
            issueId: pending.issueId,
            attemptId: pending.recordingAttempt!.id
        });
        await useTimerStore.getState().discardTimer();

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(getTimerStorageKeys().session)).toBeNull();
    });

    it('syncFromStorage updates local store state when storage changes in another tab', () => {
        expect(useTimerStore.getState().session).toBeNull();

        const externalSession = {
            version: 3,
            sessionId: 'external-1',
            revision: 1,
            issueId: 999,
            subject: 'External Tab Task',
            autoStop: false,
            state: 'running' as const,
            segments: [{ startedAt: Date.now() }],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        window.localStorage.setItem(getTimerStorageKeys().session, JSON.stringify(externalSession));
        useTimerStore.getState().syncFromStorage();

        expect(useTimerStore.getState().session?.issueId).toBe(999);
        expect(useTimerStore.getState().session?.subject).toBe('External Tab Task');
    });

    it('linearizes extend versus stop against one canonical revision chain', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const initialDeadline = useTimerStore.getState().session!.deadlineAt!;

        await Promise.all([
            useTimerStore.getState().extendTimer(15),
            useTimerStore.getState().stopTimer()
        ]);

        const canonical = useTimerStore.getState().session!;
        expect(canonical.revision).toBe(3);
        expect(canonical.deadlineAt).toBe(initialDeadline + 15 * 60 * 1000);
        expect(canonical.state).toBe('stopped_pending_record');
        expect(canonical.segments.filter(segment => segment.stoppedAt === undefined)).toHaveLength(0);
    });

    it('rejects resume and discard while a recording reservation is active', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        await Promise.all([
            useTimerStore.getState().resumeTimer(15),
            useTimerStore.getState().discardTimer()
        ]);

        expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');
        expect(useTimerStore.getState().session?.recordingAttempt?.phase).toBe('editing');
        expect(window.localStorage.getItem(getTimerStorageKeys().session)).not.toBeNull();
    });

    it('does not create a second recording attempt while one is active', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        const firstAttempt = useTimerStore.getState().session?.recordingAttempt;
        const firstDialogUrl = useUIStore.getState().issueDialogUrl;

        await useTimerStore.getState().recordTime();

        expect(useTimerStore.getState().session?.recordingAttempt).toEqual(firstAttempt);
        expect(useUIStore.getState().issueDialogUrl).toBe(firstDialogUrl);
    });

    it('linearizes TimeEntry success versus resume without clearing a resumed session', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();
        const pending = useTimerStore.getState().session!;
        const context = {
            origin: 'timer' as const,
            sessionId: pending.sessionId,
            issueId: pending.issueId,
            attemptId: pending.recordingAttempt!.id
        };

        await useTimerStore.getState().beginTimerRecordingSubmission(context);

        await Promise.all([
            useTimerStore.getState().resumeTimer(15),
            useTimerStore.getState().completeTimerRecording(context)
        ]);

        const canonical = useTimerStore.getState().session;
        expect(canonical).toBeNull();
    });

    it('does not let storage sync roll back a concurrent canonical extension', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const initialDeadline = useTimerStore.getState().session!.deadlineAt!;

        const extension = useTimerStore.getState().extendTimer(15);
        useTimerStore.getState().syncFromStorage();
        await extension;

        expect(useTimerStore.getState().session?.deadlineAt).toBe(initialDeadline + 15 * 60 * 1000);
        expect(useTimerStore.getState().session?.revision).toBe(2);
    });

    it('applies both concurrent extensions to the canonical deadline and revision chain', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        const initial = useTimerStore.getState().session!;

        await Promise.all([
            useTimerStore.getState().extendTimer(15),
            useTimerStore.getState().extendTimer(15)
        ]);

        const canonical = useTimerStore.getState().session!;
        expect(canonical.deadlineAt).toBe(initial.deadlineAt! + 30 * 60 * 1000);
        expect(canonical.revision).toBe(initial.revision + 2);
    });
});
