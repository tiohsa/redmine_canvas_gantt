import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../../stores/TimerStore';
import {
    calculateRecordedHours,
    calculateTimerElapsed,
    calculateTimerOverrun,
    calculateTimerRemaining,
    formatElapsedMinutesText,
    formatTimerExtensionLabel,
    formatTimerDuration,
    formatTimerDurationHoursMinutes
} from '../../domain/timer/timerDomain';
import { fontFamilies, designTokens } from '../../styles/designTokens';
import { i18n } from '../../utils/i18n';
import type { TimerIntervalMinutes } from '../../types/timer';

export const GlobalTimer: React.FC = () => {
    const session = useTimerStore(state => state.session);
    const stopTimer = useTimerStore(state => state.stopTimer);
    const extendTimer = useTimerStore(state => state.extendTimer);
    const recordTime = useTimerStore(state => state.recordTime);
    const openPendingWorkModal = useTimerStore(state => state.openPendingWorkModal);

    const [now, setNow] = useState(() => Date.now());
    const [isExtendMenuOpen, setIsExtendMenuOpen] = useState(false);

    // Refresh every second for smooth ticking
    useEffect(() => {
        if (!session) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [session]);

    if (!session) return null;

    const tr = (key: string) => i18n.t(key) ?? '';
    const isJa = (typeof window !== 'undefined' && window.RedmineCanvasGantt?.language === 'ja') || i18n.t('general_text_yes') === 'はい';

    const elapsedMs = calculateTimerElapsed(session, now);
    const remainingMs = calculateTimerRemaining(session, now);
    const overrunMs = calculateTimerOverrun(session, now);
    const { formatted: formattedHours } = calculateRecordedHours(session, now);

    const elapsedFormatted = formatTimerDuration(elapsedMs);
    const workTimeFormatted = formatTimerDurationHoursMinutes(elapsedMs);
    const remainingFormatted = formatTimerDuration(remainingMs);
    const overrunFormatted = formatTimerDuration(overrunMs);

    const isRunning = session.state === 'running';
    const isExpired = session.state === 'expired';
    const isPending = session.state === 'stopped_pending_record';
    const recordingPhase = session.recordingAttempt?.phase;
    const pendingPrimaryAction = session.recordingAttempt === undefined
        ? 'record'
        : recordingPhase === 'unknown'
            ? 'resolve'
            : 'recover';

    const handleExtend = (minutes: TimerIntervalMinutes) => {
        setIsExtendMenuOpen(false);
        void extendTimer(minutes);
    };

    return (
        <div
            data-testid="global-timer"
            tabIndex={-1}
            style={{
                position: 'fixed',
                bottom: '20px',
                right: '24px',
                zIndex: 2000,
                backgroundColor: isPending ? '#fffcf0' : '#181e25',
                color: isPending ? designTokens.textPrimary : '#ffffff',
                borderRadius: '16px',
                padding: '10px 16px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
                border: isPending ? `1px solid ${designTokens.warningFg}` : '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontFamily: fontFamilies.ui,
                fontSize: '13px',
                maxWidth: '480px',
                boxSizing: 'border-box'
            }}
        >
            {/* Status Icon */}
            <div
                data-testid="global-timer-icon"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    lineHeight: 1,
                    flexShrink: 0
                }}
            >
                {isPending ? '🕘' : isExpired ? '⚠️' : '⏱'}
            </div>

            {/* Task and Time Details */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <div
                    data-testid="global-timer-subject"
                    style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                    title={`#${session.issueId} ${session.subject}`}
                >
                    #{session.issueId} {session.subject}
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    marginTop: '2px',
                    fontFamily: fontFamilies.mono,
                    color: isPending ? designTokens.textSecondary : 'rgba(255,255,255,0.8)'
                }}>
                    {isRunning && (
                        <>
                            <span data-testid="global-timer-work-time">
                                {tr('label_timer_work_time') || 'Work'} {workTimeFormatted}
                            </span>
                            <span>/</span>
                            <span data-testid="global-timer-remaining" style={{ color: '#4ade80', fontWeight: 600 }}>
                                {tr('label_timer_remaining') || 'Remaining'} {remainingFormatted}
                            </span>
                            <span>/</span>
                            <span data-testid="global-timer-elapsed">
                                {tr('label_timer_elapsed') || 'Elapsed'} {elapsedFormatted}
                            </span>
                        </>
                    )}

                    {isExpired && (
                        <>
                            <span data-testid="global-timer-work-time">
                                {tr('label_timer_work_time') || 'Work'} {workTimeFormatted}
                            </span>
                            <span>/</span>
                            <span data-testid="global-timer-overrun" style={{ color: '#f87171', fontWeight: 700 }}>
                                {tr('label_timer_overrun') || 'Overrun'} {overrunFormatted}
                            </span>
                            <span>/</span>
                            <span data-testid="global-timer-elapsed">
                                {tr('label_timer_elapsed') || 'Elapsed'} {elapsedFormatted}
                            </span>
                        </>
                    )}

                    {isPending && (
                        <span data-testid="global-timer-pending-text" style={{ color: designTokens.warningFg, fontWeight: 600 }}>
                            {session.recordingAttempt?.phase === 'unknown'
                                ? (tr('label_timer_recording_unknown') || 'Recording result needs confirmation')
                                : (tr('label_timer_pending_work') || 'Unrecorded')}: {workTimeFormatted} ({formatElapsedMinutesText(elapsedMs, isJa)} / {formattedHours}h)
                        </span>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, position: 'relative' }}>
                {(isRunning || isExpired) && (
                    <>
                        {/* Quick +15 Extend Button */}
                        <button
                            type="button"
                            data-testid="global-timer-quick-extend"
                            onClick={() => void extendTimer(15)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '9999px',
                                border: '1px solid rgba(255,255,255,0.25)',
                                background: 'rgba(255,255,255,0.1)',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            title={formatTimerExtensionLabel(15, tr('label_timer_minutes') || '%{count} min')}
                        >
                            {formatTimerExtensionLabel(15, tr('label_timer_minutes') || '%{count} min')}
                        </button>

                        {/* Extend dropdown toggle */}
                        <button
                            type="button"
                            data-testid="global-timer-extend-menu-toggle"
                            onClick={() => setIsExtendMenuOpen(!isExtendMenuOpen)}
                            style={{
                                padding: '5px 8px',
                                borderRadius: '9999px',
                                border: '1px solid rgba(255,255,255,0.25)',
                                background: isExtendMenuOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                                color: '#ffffff',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                            title={tr('label_timer_extend') || 'Extend timer'}
                        >
                            ▾
                        </button>

                        {isExtendMenuOpen && (
                            <div
                                data-testid="global-timer-extend-menu"
                                style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    right: 0,
                                    marginBottom: '8px',
                                    backgroundColor: '#ffffff',
                                    color: '#333333',
                                    borderRadius: '12px',
                                    boxShadow: designTokens.menuShadow,
                                    padding: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    zIndex: 2100,
                                    border: `1px solid ${designTokens.borderSubtle}`
                                }}
                            >
                                {([5, 10, 15, 30, 60] as TimerIntervalMinutes[]).map((min) => (
                                    <button
                                        key={min}
                                        type="button"
                                        data-testid={`global-timer-extend-${min}`}
                                        onClick={() => handleExtend(min)}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: designTokens.textPrimary,
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        {formatTimerExtensionLabel(min, tr('label_timer_minutes') || '%{count} min')}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Stop Button */}
                        <button
                            type="button"
                            data-testid="global-timer-stop-button"
                            onClick={() => void stopTimer()}
                            style={{
                                padding: '5px 14px',
                                borderRadius: '9999px',
                                border: 'none',
                                background: '#ef4444',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(239,68,68,0.3)'
                            }}
                        >
                            {tr('label_timer_stop') || 'Stop'}
                        </button>
                    </>
                )}

                {isPending && (
                    <>
                        <button
                            type="button"
                            data-testid="global-timer-record-button"
                            onClick={() => void (pendingPrimaryAction === 'record' ? recordTime() : openPendingWorkModal())}
                            style={{
                                padding: '5px 14px',
                                borderRadius: '9999px',
                                border: 'none',
                                background: '#181e25',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            📝 {pendingPrimaryAction === 'record'
                                ? (tr('label_timer_record_time') || 'Record')
                                : pendingPrimaryAction === 'recover'
                                    ? (tr('label_timer_recording_recover') || 'Recover recording')
                                    : (tr('label_timer_recording_unknown') || 'Confirm recording result')}
                        </button>

                        <button
                            type="button"
                            data-testid="global-timer-manage-button"
                            onClick={openPendingWorkModal}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '9999px',
                                border: `1px solid ${designTokens.controlBorder}`,
                                background: '#ffffff',
                                color: designTokens.textPrimary,
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            ⋯
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
