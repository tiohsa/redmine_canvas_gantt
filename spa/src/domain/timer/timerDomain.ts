import type {
    TimerIntervalMinutes,
    TimerRecordingPhase,
    TimerRecordingResolution,
    TimerSegment,
    TimerSession,
    TimerTickResult
} from '../../types/timer';

export const TIMER_SESSION_VERSION = 4;

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
        revision: 1,
        issueId,
        subject,
        autoStop,
        deadlineAt,
        segments: [{ startedAt: now }],
        state: 'running',
        notifiedDeadlineAt: undefined,
        userId,
        createdAt: now,
        updatedAt: now
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
            const notifyType = session.autoStop ? 'stopped' : 'running_expired';
            const shouldNotify = session.notifiedDeadlineAt !== session.deadlineAt || session.notifiedType !== notifyType;
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
                    notifiedDeadlineAt,
                    notifiedType: notifyType
                };

                return {
                    session: updatedSession,
                    stateChanged: true,
                    shouldNotify,
                    notifyType
                };
            } else {
                // When autoStop is OFF, state becomes expired, but current segment remains open
                const updatedSession: TimerSession = {
                    ...session,
                    state: 'expired',
                    notifiedDeadlineAt,
                    notifiedType: notifyType
                };

                return {
                    session: updatedSession,
                    stateChanged: true,
                    shouldNotify,
                    notifyType
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
    if (session.recordingAttempt) return session;

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
            deadlineAt: now + extensionMs,
        };
    }

    return session;
};

const transitionRecording = (
    session: TimerSession,
    attemptId: string,
    phase: TimerRecordingPhase
): TimerSession | undefined => {
    const attempt = session.recordingAttempt;
    if (session.state !== 'stopped_pending_record' || !attempt || attempt.id !== attemptId) return undefined;
    return { ...session, recordingAttempt: { ...attempt, phase } };
};

export const beginTimerRecording = (
    session: TimerSession,
    ownerTabId: string,
    attemptId: string = generateSessionId(),
    now: number = Date.now()
): TimerSession | undefined => {
    if (session.state !== 'stopped_pending_record' || session.recordingAttempt || typeof ownerTabId !== 'string' || ownerTabId.trim() === '') return undefined;
    return {
        ...session,
        recordingAttempt: {
            id: attemptId,
            ownerTabId,
            openedAt: now,
            phase: 'editing'
        }
    };
};

export const beginTimerRecordingSubmission = (
    session: TimerSession,
    attemptId: string,
    now: number = Date.now()
): TimerSession | undefined => {
    if (session.recordingAttempt?.phase !== 'editing') return undefined;
    const next = transitionRecording(session, attemptId, 'submitting');
    return next ? { ...next, updatedAt: now } : undefined;
};

export const markTimerRecordingValidationError = (
    session: TimerSession,
    attemptId: string,
    now: number = Date.now()
): TimerSession | undefined => {
    if (session.recordingAttempt?.phase !== 'submitting') return undefined;
    const next = transitionRecording(session, attemptId, 'editing');
    return next ? { ...next, updatedAt: now } : undefined;
};

export const markTimerRecordingUnknown = (
    session: TimerSession,
    attemptId: string,
    now: number = Date.now()
): TimerSession | undefined => {
    if (session.recordingAttempt?.phase !== 'submitting') return undefined;
    const next = transitionRecording(session, attemptId, 'unknown');
    return next ? { ...next, updatedAt: now } : undefined;
};

export const cancelTimerRecording = (
    session: TimerSession,
    attemptId: string,
    now: number = Date.now()
): TimerSession | undefined => {
    if (session.recordingAttempt?.phase !== 'editing') return undefined;
    const next = transitionRecording(session, attemptId, 'editing');
    if (!next) return undefined;
    const withoutAttempt = { ...next };
    delete withoutAttempt.recordingAttempt;
    return { ...withoutAttempt, updatedAt: now };
};

export const recoverTimerRecording = (
    session: TimerSession,
    attemptId: string,
    now: number = Date.now()
): TimerSession | undefined => {
    const attempt = session.recordingAttempt;
    if (session.state !== 'stopped_pending_record' || !attempt || attempt.id !== attemptId) return undefined;

    if (attempt.phase === 'editing') {
        const withoutAttempt = { ...session };
        delete withoutAttempt.recordingAttempt;
        return { ...withoutAttempt, updatedAt: now };
    }

    if (attempt.phase === 'submitting') {
        return {
            ...session,
            recordingAttempt: { ...attempt, phase: 'unknown' },
            updatedAt: now
        };
    }

    return undefined;
};

export const completeTimerRecording = (session: TimerSession, attemptId: string): null | undefined => {
    if (session.state !== 'stopped_pending_record') return undefined;
    if (session.recordingAttempt?.id !== attemptId || session.recordingAttempt.phase !== 'submitting') return undefined;
    return null;
};

export const resolveUnknownTimerRecording = (
    session: TimerSession,
    attemptId: string,
    resolution: TimerRecordingResolution,
    now: number = Date.now()
): TimerSession | null | undefined => {
    if (session.state !== 'stopped_pending_record') return undefined;
    if (session.recordingAttempt?.id !== attemptId || session.recordingAttempt.phase !== 'unknown') return undefined;
    if (resolution === 'recorded') return null;
    const withoutAttempt = { ...session };
    delete withoutAttempt.recordingAttempt;
    return { ...withoutAttempt, updatedAt: now };
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
    const hours = rounded;
    const formatted = hours.toFixed(2);

    return {
        totalMs,
        totalSeconds,
        rawHours,
        hours,
        formatted
    };
};

export const calculateCurrentDeadlineIntervalMinutes = (session: TimerSession): number => {
    if (session.deadlineAt === undefined || session.segments.length === 0) return 0;
    const currentSegment = session.segments[session.segments.length - 1];
    if (!currentSegment) return 0;
    return Math.max(0, Math.round((session.deadlineAt - currentSegment.startedAt) / (60 * 1000)));
};

export const formatTimerDuration = (totalMs: number): string => {
    const safeMs = Math.max(0, totalMs);
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => String(num).padStart(2, '0');

    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
};

export const formatTimerDurationHoursMinutes = (totalMs: number): string => {
    const safeMs = Math.max(0, totalMs);
    const totalMinutes = Math.floor(safeMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}`;
};

export const formatElapsedMinutesText = (totalMs: number, isJapanese: boolean = false): string => {
    const totalMinutes = Math.round(totalMs / (60 * 1000));
    if (isJapanese) {
        return `${totalMinutes}分`;
    }
    return `${totalMinutes} min`;
};

export const formatTimerExtensionLabel = (minutes: TimerIntervalMinutes, localizedMinutesTemplate?: string): string => {
    const template = localizedMinutesTemplate || '%{count} min';
    const formatted = template.replace('%{count}', String(minutes));
    return formatted.startsWith('+') ? formatted : `+${formatted}`;
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
