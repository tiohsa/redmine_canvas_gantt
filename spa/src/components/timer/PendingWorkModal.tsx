import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../../stores/TimerStore';
import { TIMER_INTERVAL_MINUTES } from '../../types/timer';
import {
    calculateRecordedHours,
    calculateTimerElapsed,
    formatElapsedMinutesText,
    formatTimerDuration,
    isTimerSpanningMultipleDays
} from '../../domain/timer/timerDomain';
import { fontFamilies, designTokens } from '../../styles/designTokens';
import { i18n } from '../../utils/i18n';

export const PendingWorkModal: React.FC = () => {
    const pendingWorkModalOpen = useTimerStore(state => state.pendingWorkModalOpen);
    const session = useTimerStore(state => state.session);
    const closePendingWorkModal = useTimerStore(state => state.closePendingWorkModal);
    const recordTime = useTimerStore(state => state.recordTime);
    const resumeTimer = useTimerStore(state => state.resumeTimer);
    const discardTimer = useTimerStore(state => state.discardTimer);

    const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!pendingWorkModalOpen) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (isDiscardConfirmOpen) {
                    setIsDiscardConfirmOpen(false);
                } else {
                    closePendingWorkModal();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pendingWorkModalOpen, isDiscardConfirmOpen, closePendingWorkModal]);

    if (!pendingWorkModalOpen || !session) return null;

    const tr = (key: string) => i18n.t(key) ?? '';
    const isJa = (typeof window !== 'undefined' && window.RedmineCanvasGantt?.language === 'ja') || i18n.t('general_text_yes') === 'はい';

    const totalMs = calculateTimerElapsed(session);
    const { formatted } = calculateRecordedHours(session);
    const elapsedText = formatElapsedMinutesText(totalMs, isJa);
    const durationFormatted = formatTimerDuration(totalMs);
    const isCrossDay = isTimerSpanningMultipleDays(session);

    const handleDiscardConfirm = () => {
        setIsDiscardConfirmOpen(false);
        discardTimer();
    };

    return (
        <div
            data-testid="pending-work-modal-backdrop"
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: designTokens.surfaceOverlay,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2500,
                fontFamily: fontFamilies.ui,
                fontSize: '13px'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) closePendingWorkModal();
            }}
        >
            <div
                data-testid="pending-work-modal"
                style={{
                    width: '420px',
                    maxWidth: '92vw',
                    backgroundColor: designTokens.appBg,
                    borderRadius: '16px',
                    boxShadow: designTokens.dialogShadow,
                    border: '1px solid rgba(0,0,0,0.08)',
                    padding: '24px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '20px', lineHeight: 1 }}>🕘</span>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: designTokens.warningFg }}>
                            {tr('label_timer_pending_work') || 'Unrecorded work time exists'}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: designTokens.textPrimary, marginTop: '2px' }}>
                            #{session.issueId} {session.subject}
                        </div>
                    </div>
                </div>

                {/* Measured Time Card */}
                <div style={{
                    backgroundColor: designTokens.surfaceSubtle,
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    border: `1px solid ${designTokens.borderSubtle}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: designTokens.textSecondary, fontSize: '12px' }}>
                            {tr('label_timer_elapsed') || 'Elapsed'}:
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: designTokens.textPrimary, fontFamily: fontFamilies.mono }}>
                            {durationFormatted} ({elapsedText} / {formatted}h)
                        </span>
                    </div>

                    {isCrossDay && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            borderRadius: '8px',
                            backgroundColor: designTokens.warningBg,
                            color: designTokens.warningFg,
                            fontSize: '11px',
                            lineHeight: 1.4
                        }}>
                            ⚠ {tr('label_timer_cross_day_warning') || 'This work time spans across multiple days. Please split if necessary.'}
                        </div>
                    )}
                </div>

                {/* Confirm Discard Dialog or Main Actions */}
                {isDiscardConfirmOpen ? (
                    <div style={{
                        padding: '12px',
                        backgroundColor: designTokens.errorBg,
                        borderRadius: '12px',
                        border: `1px solid ${designTokens.errorBorder}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ color: designTokens.errorFg, fontSize: '12px', fontWeight: 600 }}>
                            {(tr('label_timer_discard_confirm') || 'Are you sure you want to discard %{time} of unrecorded work time?').replace('%{time}', elapsedText)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                data-testid="pending-work-discard-cancel"
                                onClick={() => setIsDiscardConfirmOpen(false)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: '#ffffff',
                                    color: designTokens.textPrimary,
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('button_cancel') || 'Cancel'}
                            </button>
                            <button
                                type="button"
                                data-testid="pending-work-discard-confirm"
                                onClick={handleDiscardConfirm}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: designTokens.errorFg,
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('label_timer_discard') || 'Discard'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Primary Record Button */}
                        <button
                            type="button"
                            data-testid="pending-work-record-button"
                            onClick={recordTime}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: '9999px',
                                border: 'none',
                                background: '#181e25',
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                            }}
                        >
                            <span>📝 {tr('label_timer_record_time') || 'Record time'} ({formatted}h)</span>
                        </button>

                        {/* Resume / Extension Buttons */}
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: designTokens.textSecondary, marginBottom: '6px' }}>
                                {tr('label_timer_extend') || 'Resume / Extend'}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {TIMER_INTERVAL_MINUTES.map((minutes) => (
                                    <button
                                        key={minutes}
                                        type="button"
                                        data-testid={`pending-work-resume-button-${minutes}`}
                                        onClick={() => resumeTimer(minutes)}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: '9999px',
                                            border: `1px solid ${designTokens.controlBorder}`,
                                            background: designTokens.controlBg,
                                            color: designTokens.textPrimary,
                                            fontWeight: 500,
                                            fontSize: '12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        +{minutes}m
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Footer Discard & Close */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: `1px solid ${designTokens.borderSubtle}`, paddingTop: '12px' }}>
                            <button
                                type="button"
                                data-testid="pending-work-discard-button"
                                onClick={() => setIsDiscardConfirmOpen(true)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: designTokens.errorFg,
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                🗑 {tr('label_timer_discard') || 'Discard'}
                            </button>

                            <button
                                type="button"
                                data-testid="pending-work-close-button"
                                onClick={closePendingWorkModal}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: '#f0f0f0',
                                    color: '#333333',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('button_close') || 'Close'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
