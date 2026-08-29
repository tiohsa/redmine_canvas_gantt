import type { TimerIntervalMinutes, TimerSegment, TimerSession, TimerTickResult } from '../../types/timer';

export const TIMER_SESSION_VERSION = 1;

export interface CreateTimerSessionOptions {
    issueId: number | string;
    subject: string;
    minutes: TimerIntervalMinutes;
    autoStop: boolean;
    now?: number;
    userId?: number;
    sessionId?: string;
}

export const generateSessionId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

export const createTimerSession = ({
    issueId,
    subject,
    minutes,
    autoStop,
    now = Date.now(),
    userId,
    sessionId = generateSessionId()
}: CreateTimerSessionOptions): TimerSession => {
    const deadlineAt = now + minutes * 60 * 1000;
    return {
        version: TIMER_SESSION_VERSION,
        sessionId,
        issueId,
        subject,
        autoStop,
        deadlineAt,
        segments: [{ startedAt: now }],
        state: 'running',
        notifiedDeadlineAt: undefined,
        userId,
        createdAt: now
    };
};

export const calculateTimerElapsed = (session: TimerSession, now: number = Date.now()): number => {
    let totalMs = 0;
    for (const segment of session.segments) {
        const stop = segment.stoppedAt ?? now;
        if (stop > segment.startedAt) {
            totalMs += stop - segment.startedAt;
        }
    }
    return totalMs;
};

export const calculateTimerRemaining = (session: TimerSession, now: number = Date.now()): number => {
    if (!session.deadlineAt || session.state === 'stopped_pending_record') {
        return 0;
    }
    if (now < session.deadlineAt) {
        return session.deadlineAt - now;
    }
    return 0;
};

export const calculateTimerOverrun = (session: TimerSession, now: number = Date.now()): number => {
    if (!session.deadlineAt || session.state === 'stopped_pending_record') {
        return 0;
    }
    if (now > session.deadlineAt) {
        return now - session.deadlineAt;
    }
    return 0;
};

export const evaluateTimerTick = (session: TimerSession, now: number = Date.now()): TimerTickResult => {
    if (session.state === 'stopped_pending_record') {
        return { session, stateChanged: false, shouldNotify: false };
    }

    if (session.state === 'running') {
        if (session.deadlineAt !== undefined && now >= session.deadlineAt) {
            const shouldNotify = session.notifiedDeadlineAt !== session.deadlineAt;
            const notifiedDeadlineAt = session.deadlineAt;

            if (session.autoStop) {
                // When autoStop is ON, stoppedAt is exact deadlineAt (callback delay not added)
                const lastSegmentIndex = session.segments.length - 1;
                const updatedSegments: TimerSegment[] = session.segments.map((seg, idx) => {
                    if (idx === lastSegmentIndex && seg.stoppedAt === undefined) {
                        return { ...seg, stoppedAt: session.deadlineAt };
                    }
                    return seg;
                });

                const updatedSession: TimerSession = {
                    ...session,
                    state: 'stopped_pending_record',
                    segments: updatedSegments,
                    notifiedDeadlineAt
                };

                return {
                    session: updatedSession,
                    stateChanged: true,
                    shouldNotify,
                    notifyType: 'stopped'
                };
            } else {
                // When autoStop is OFF, state becomes expired, but current segment remains open
                const updatedSession: TimerSession = {
                    ...session,
                    state: 'expired',
                    notifiedDeadlineAt
                };

                return {
                    session: updatedSession,
                    stateChanged: true,
                    shouldNotify,
                    notifyType: 'running_expired'
                };
            }
        }
    }

    return { session, stateChanged: false, shouldNotify: false };
};

export const extendTimerSession = (
    session: TimerSession,
    minutes: TimerIntervalMinutes,
    now: number = Date.now()
): TimerSession => {
    const extensionMs = minutes * 60 * 1000;

    if (session.state === 'running') {
        const currentDeadline = session.deadlineAt ?? now;
        return {
            ...session,
            deadlineAt: currentDeadline + extensionMs
        };
    }

    if (session.state === 'expired') {
        return {
            ...session,
            state: 'running',
            deadlineAt: now + extensionMs
        };
    }

    if (session.state === 'stopped_pending_record') {
        // Resuming from stopped state creates a new segment. The gap between last stop and now is excluded.
        const newSegments: TimerSegment[] = [
            ...session.segments,
            { startedAt: now }
        ];

        return {
            ...session,
            state: 'running',
            segments: newSegments,
            deadlineAt: now + extensionMs
        };
    }

    return session;
};

export const stopTimerSession = (session: TimerSession, now: number = Date.now()): TimerSession => {
    if (session.state === 'stopped_pending_record') {
        return session;
    }

    const lastSegmentIndex = session.segments.length - 1;
    const updatedSegments: TimerSegment[] = session.segments.map((seg, idx) => {
        if (idx === lastSegmentIndex && seg.stoppedAt === undefined) {
            return { ...seg, stoppedAt: now };
        }
        return seg;
    });

    return {
        ...session,
        state: 'stopped_pending_record',
        segments: updatedSegments
    };
};

export interface RecordedHoursResult {
    totalMs: number;
    totalSeconds: number;
    rawHours: number;
    hours: number;
    formatted: string;
}

export const calculateRecordedHours = (session: TimerSession, now: number = Date.now()): RecordedHoursResult => {
    const totalMs = calculateTimerElapsed(session, now);
    const totalSeconds = totalMs / 1000;
    const rawHours = totalSeconds / 3600;
    const rounded = Math.round(rawHours * 100) / 100;
    const hours = totalSeconds > 0 ? Math.max(0.01, rounded) : 0;
    const formatted = hours.toFixed(2);

    return {
        totalMs,
        totalSeconds,
        rawHours,
        hours,
        formatted
    };
};

export const formatTimerDuration = (totalMs: number): string => {
    const safeMs = Math.max(0, totalMs);
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => String(num).padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
};

export const formatElapsedMinutesText = (totalMs: number, isJapanese: boolean = false): string => {
    const totalMinutes = Math.round(totalMs / (60 * 1000));
    if (isJapanese) {
        return `${totalMinutes}分`;
    }
    return `${totalMinutes} min`;
};

export const isTimerSpanningMultipleDays = (session: TimerSession, now: number = Date.now()): boolean => {
    if (session.segments.length === 0) return false;

    const dates = new Set<string>();

    for (const segment of session.segments) {
        const start = new Date(segment.startedAt);
        dates.add(`${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`);

        const stopTime = segment.stoppedAt ?? (session.state === 'running' || session.state === 'expired' ? now : segment.startedAt);
        const stop = new Date(stopTime);
        dates.add(`${stop.getFullYear()}-${stop.getMonth()}-${stop.getDate()}`);
    }

    return dates.size > 1;
};
