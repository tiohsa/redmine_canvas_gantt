import { describe, it, expect } from 'vitest';
import {
    createTimerSession,
    calculateTimerElapsed,
    calculateTimerRemaining,
    calculateTimerOverrun,
    evaluateTimerTick,
    extendTimerSession,
    stopTimerSession,
    calculateRecordedHours,
    calculateCurrentDeadlineIntervalMinutes,
    formatTimerDuration,
    formatElapsedMinutesText,
    isTimerSpanningMultipleDays
} from './timerDomain';
import type { TimerSession } from '../../types/timer';

describe('Timer Domain Logic', () => {
    const baseTime = 1700000000000; // Fixed timestamp for reproducible tests

    it('creates a timer session with valid defaults for 5, 10, 15, 30, 60 minutes', () => {
        const intervals = [5, 10, 15, 30, 60] as const;
        for (const interval of intervals) {
            const session = createTimerSession({
                issueId: 123,
                subject: 'API設計',
                minutes: interval,
                autoStop: false,
                now: baseTime,
                userId: 1
            });

            expect(session.issueId).toBe(123);
            expect(session.subject).toBe('API設計');
            expect(session.state).toBe('running');
            expect(session.autoStop).toBe(false);
            expect(session.deadlineAt).toBe(baseTime + interval * 60 * 1000);
            expect(session.segments).toHaveLength(1);
            expect(session.segments[0].startedAt).toBe(baseTime);
            expect(session.segments[0].stoppedAt).toBeUndefined();
        }
    });

    it('calculates elapsed, remaining, and overrun for running timer', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: false,
            now: baseTime
        });

        // 10 minutes in
        const now10m = baseTime + 10 * 60 * 1000;
        expect(calculateTimerElapsed(session, now10m)).toBe(10 * 60 * 1000);
        expect(calculateTimerRemaining(session, now10m)).toBe(20 * 60 * 1000);
        expect(calculateTimerOverrun(session, now10m)).toBe(0);

        // Exactly at deadline (30 min)
        const now30m = baseTime + 30 * 60 * 1000;
        expect(calculateTimerElapsed(session, now30m)).toBe(30 * 60 * 1000);
        expect(calculateTimerRemaining(session, now30m)).toBe(0);
        expect(calculateTimerOverrun(session, now30m)).toBe(0);

        // 5 minutes overrun (35 min)
        const now35m = baseTime + 35 * 60 * 1000;
        expect(calculateTimerElapsed(session, now35m)).toBe(35 * 60 * 1000);
        expect(calculateTimerRemaining(session, now35m)).toBe(0);
        expect(calculateTimerOverrun(session, now35m)).toBe(5 * 60 * 1000);
    });

    it('transitions to EXPIRED when autoStop is OFF and triggers notification once', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: false,
            now: baseTime
        });

        const deadline = baseTime + 30 * 60 * 1000;
        const tickAtDeadline = evaluateTimerTick(session, deadline);

        expect(tickAtDeadline.stateChanged).toBe(true);
        expect(tickAtDeadline.session.state).toBe('expired');
        expect(tickAtDeadline.shouldNotify).toBe(true);
        expect(tickAtDeadline.notifyType).toBe('running_expired');
        expect(tickAtDeadline.session.segments[0].stoppedAt).toBeUndefined(); // Segment remains open!

        // Subsequent tick does not re-notify
        const nextTick = evaluateTimerTick(tickAtDeadline.session, deadline + 1000);
        expect(nextTick.stateChanged).toBe(false);
        expect(nextTick.shouldNotify).toBe(false);
    });

    it('stops at exact deadlineAt when autoStop is ON, without adding callback delay', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: true,
            now: baseTime
        });

        const deadline = baseTime + 30 * 60 * 1000;
        const callbackDelayedTime = deadline + 8000; // 8 seconds callback delay

        const tickResult = evaluateTimerTick(session, callbackDelayedTime);

        expect(tickResult.stateChanged).toBe(true);
        expect(tickResult.session.state).toBe('stopped_pending_record');
        expect(tickResult.shouldNotify).toBe(true);
        expect(tickResult.notifyType).toBe('stopped');
        expect(tickResult.session.segments[0].stoppedAt).toBe(deadline); // Exactly deadline, not delayed time!
        expect(calculateTimerElapsed(tickResult.session, callbackDelayedTime)).toBe(30 * 60 * 1000);
    });

    it('handles manual stop correctly', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: false,
            now: baseTime
        });

        const stopTime = baseTime + 12 * 60 * 1000 + 30 * 1000; // 12m 30s
        const stoppedSession = stopTimerSession(session, stopTime);

        expect(stoppedSession.state).toBe('stopped_pending_record');
        expect(stoppedSession.segments[0].stoppedAt).toBe(stopTime);
        expect(calculateTimerElapsed(stoppedSession)).toBe(12 * 60 * 1000 + 30 * 1000);
    });

    it('extends running timer by adding to current deadline', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: false,
            now: baseTime
        });

        // Extend by 15 min at 20 min in
        const extendTime = baseTime + 20 * 60 * 1000;
        const extended = extendTimerSession(session, 15, extendTime);

        expect(extended.state).toBe('running');
        expect(extended.deadlineAt).toBe(baseTime + 45 * 60 * 1000);
        expect(extended.segments).toHaveLength(1);
    });

    it('extends expired timer from current time and transitions back to running', () => {
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: false,
            now: baseTime
        });

        const expiredSession: TimerSession = {
            ...session,
            state: 'expired',
            deadlineAt: baseTime + 30 * 60 * 1000
        };

        // Extend by 15 min at 33 min
        const extendTime = baseTime + 33 * 60 * 1000;
        const extended = extendTimerSession(expiredSession, 15, extendTime);

        expect(extended.state).toBe('running');
        expect(extended.deadlineAt).toBe(extendTime + 15 * 60 * 1000);
        expect(extended.segments).toHaveLength(1);
    });

    it('resumes from stopped_pending_record as a new segment, excluding the gap', () => {
        // Segment 1: 10:00 - 10:30 (30 min)
        const session = createTimerSession({
            issueId: 123,
            subject: 'Task',
            minutes: 30,
            autoStop: true,
            now: baseTime
        });

        const stopped = stopTimerSession(session, baseTime + 30 * 60 * 1000);

        // Resume at 10:33 with +15 min (gap of 3 min)
        const resumeTime = baseTime + 33 * 60 * 1000;
        const resumed = extendTimerSession(stopped, 15, resumeTime);

        expect(resumed.state).toBe('running');
        expect(resumed.deadlineAt).toBe(resumeTime + 15 * 60 * 1000);
        expect(resumed.segments).toHaveLength(2);
        expect(resumed.segments[0].startedAt).toBe(baseTime);
        expect(resumed.segments[0].stoppedAt).toBe(baseTime + 30 * 60 * 1000);
        expect(resumed.segments[1].startedAt).toBe(resumeTime);
        expect(resumed.segments[1].stoppedAt).toBeUndefined();

        // 10 minutes into segment 2 (at 10:43)
        const checkTime = resumeTime + 10 * 60 * 1000;
        // Total elapsed: 30 min + 10 min = 40 min (gap of 3 min excluded!)
        expect(calculateTimerElapsed(resumed, checkTime)).toBe(40 * 60 * 1000);
        expect(calculateCurrentDeadlineIntervalMinutes(resumed)).toBe(15);
    });

    it('calculates recorded hours rounded to 2 decimal places', () => {
        // 30 min -> 0.50
        const session30m: TimerSession = {
            version: 2,
            sessionId: 's1',
            revision: 1,
            issueId: 1,
            subject: 'Test',
            autoStop: false,
            state: 'stopped_pending_record',
            createdAt: baseTime,
            updatedAt: baseTime,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 }]
        };
        expect(calculateRecordedHours(session30m).hours).toBe(0.50);
        expect(calculateRecordedHours(session30m).formatted).toBe('0.50');

        // 45 min -> 0.75
        const session45m: TimerSession = {
            ...session30m,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + 45 * 60 * 1000 }]
        };
        expect(calculateRecordedHours(session45m).hours).toBe(0.75);
        expect(calculateRecordedHours(session45m).formatted).toBe('0.75');

        // 47 min 13 sec -> 47*60 + 13 = 2833s -> 2833/3600 = 0.78694... -> 0.79
        const session47m13s: TimerSession = {
            ...session30m,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + (47 * 60 + 13) * 1000 }]
        };
        expect(calculateRecordedHours(session47m13s).hours).toBe(0.79);
        expect(calculateRecordedHours(session47m13s).formatted).toBe('0.79');

        // Multiple segments: 30 min + 15 min = 45 min -> 0.75
        const sessionMulti: TimerSession = {
            ...session30m,
            segments: [
                { startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 },
                { startedAt: baseTime + 40 * 60 * 1000, stoppedAt: baseTime + 55 * 60 * 1000 }
            ]
        };
        expect(calculateRecordedHours(sessionMulti).hours).toBe(0.75);

        const tenSeconds: TimerSession = {
            ...session30m,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + 10 * 1000 }]
        };
        expect(calculateRecordedHours(tenSeconds).hours).toBe(0);
        expect(calculateRecordedHours(tenSeconds).formatted).toBe('0.00');
    });

    it('formats duration string correctly', () => {
        expect(formatTimerDuration(0)).toBe('00:00');
        expect(formatTimerDuration(45 * 1000)).toBe('00:45');
        expect(formatTimerDuration(18 * 60 * 1000 + 42 * 1000)).toBe('18:42');
        expect(formatTimerDuration(65 * 60 * 1000 + 15 * 1000)).toBe('1:05:15');
    });

    it('formats elapsed minutes text', () => {
        expect(formatElapsedMinutesText(45 * 60 * 1000, false)).toBe('45 min');
        expect(formatElapsedMinutesText(45 * 60 * 1000, true)).toBe('45分');
    });

    it('detects when timer segments span multiple days', () => {
        const sameDaySession: TimerSession = {
            version: 2,
            sessionId: 's1',
            revision: 1,
            issueId: 1,
            subject: 'Test',
            autoStop: false,
            state: 'stopped_pending_record',
            createdAt: baseTime,
            updatedAt: baseTime,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 }]
        };
        expect(isTimerSpanningMultipleDays(sameDaySession)).toBe(false);

        const crossDaySession: TimerSession = {
            version: 2,
            sessionId: 's1',
            revision: 1,
            issueId: 1,
            subject: 'Test',
            autoStop: false,
            state: 'stopped_pending_record',
            createdAt: baseTime,
            updatedAt: baseTime,
            segments: [{ startedAt: baseTime, stoppedAt: baseTime + 28 * 3600 * 1000 }]
        };
        expect(isTimerSpanningMultipleDays(crossDaySession)).toBe(true);
    });
});
