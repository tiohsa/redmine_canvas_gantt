import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTimerStore } from './TimerStore';
import { useUIStore } from './UIStore';
import type { Task } from '../types';
import { getTimerStorageKeys } from '../services/timerStorage';

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
        await useTimerStore.getState().completeTimerRecording({
            origin: 'timer',
            sessionId: session!.sessionId,
            issueId: '123',
            recordingAttemptId: session!.recordingAttemptId!
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
            recordingAttemptId: 'normal-time-entry'
        });
        expect(useTimerStore.getState().session?.state).toBe('running');

        await useTimerStore.getState().stopTimer();
        const pending = useTimerStore.getState().session!;
        await useTimerStore.getState().completeTimerRecording({
            origin: 'timer',
            sessionId: pending.sessionId,
            issueId: running.issueId,
            recordingAttemptId: 'stale-attempt'
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

    it('discards timer session explicitly on user confirmation', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        await useTimerStore.getState().discardTimer();

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(getTimerStorageKeys().session)).toBeNull();
    });

    it('syncFromStorage updates local store state when storage changes in another tab', () => {
        expect(useTimerStore.getState().session).toBeNull();

        const externalSession = {
            version: 2,
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

    it('linearizes resume versus discard without resurrecting a discarded session', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();

        await Promise.all([
            useTimerStore.getState().resumeTimer(15),
            useTimerStore.getState().discardTimer()
        ]);

        expect(useTimerStore.getState().session).toBeNull();
        expect(window.localStorage.getItem(getTimerStorageKeys().session)).toBeNull();
    });

    it('linearizes TimeEntry success versus resume without clearing a resumed session', async () => {
        await useTimerStore.getState().startTimer(mockTask, 30);
        await useTimerStore.getState().stopTimer();
        const pending = useTimerStore.getState().session!;
        const context = {
            origin: 'timer' as const,
            sessionId: pending.sessionId,
            issueId: pending.issueId,
            recordingAttemptId: pending.recordingAttemptId!
        };

        await Promise.all([
            useTimerStore.getState().resumeTimer(15),
            useTimerStore.getState().completeTimerRecording(context)
        ]);

        const canonical = useTimerStore.getState().session;
        expect(canonical?.state).toBe('running');
        expect(canonical?.recordingAttemptId).toBeUndefined();
        expect(canonical?.segments).toHaveLength(2);
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
});
