export type TimerIntervalMinutes = 5 | 10 | 15 | 30 | 60;

export const TIMER_INTERVAL_MINUTES: TimerIntervalMinutes[] = [5, 10, 15, 30, 60];

export type TimerState = 'running' | 'expired' | 'stopped_pending_record';

export interface TimerSegment {
    startedAt: number;
    stoppedAt?: number;
}

export interface TimerSession {
    version: number;
    sessionId: string;
    issueId: number | string;
    subject: string;
    autoStop: boolean;
    deadlineAt?: number;
    segments: TimerSegment[];
    state: TimerState;
    notifiedDeadlineAt?: number;
    userId?: number;
    createdAt: number;
}

export interface TimerPreferences {
    autoStop: boolean;
}

export interface TimerTickResult {
    session: TimerSession;
    stateChanged: boolean;
    shouldNotify: boolean;
    notifyType?: 'running_expired' | 'stopped';
}
