import React, { useEffect } from 'react';
import { useTimerStore } from '../../stores/TimerStore';
import { fontFamilies, designTokens } from '../../styles/designTokens';
import { i18n } from '../../utils/i18n';
import { timerButtonLayout } from './timerButtonStyles';

export const OtherNoticeModal: React.FC = () => {
    const otherRunningNotice = useTimerStore(state => state.otherRunningNotice);
    const otherPendingNotice = useTimerStore(state => state.otherPendingNotice);
    const closeOtherNotices = useTimerStore(state => state.closeOtherNotices);
    const openPendingWorkModal = useTimerStore(state => state.openPendingWorkModal);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!otherRunningNotice && !otherPendingNotice) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeOtherNotices();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [otherRunningNotice, otherPendingNotice, closeOtherNotices]);

    if (!otherRunningNotice && !otherPendingNotice) return null;

    const tr = (key: string) => i18n.t(key) ?? '';

    return (
        <div
            data-testid="timer-notice-modal-backdrop"
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
                if (e.target === e.currentTarget) closeOtherNotices();
            }}
        >
            <div
                data-testid="timer-notice-modal"
                style={{
                    width: '400px',
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
                {otherRunningNotice && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontSize: '20px', lineHeight: 1 }}>⏱</span>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: designTokens.textPrimary }}>
                                    {tr('label_timer_running') || 'Timer running'}
                                </div>
                                <div style={{ fontSize: '13px', color: designTokens.textSecondary, marginTop: '4px' }}>
                                    {(tr('label_timer_running_other') || 'Timer for #%{id} %{subject} is running.')
                                        .replace('%{id}', String(otherRunningNotice.issueId))
                                        .replace('%{subject}', otherRunningNotice.subject)}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <button
                                type="button"
                                data-testid="timer-notice-close-button"
                                onClick={closeOtherNotices}
                                style={{
                                    ...timerButtonLayout,
                                    height: '32px',
                                    padding: '0 18px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: '#181e25',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('label_timer_view_current') || 'View current timer'}
                            </button>
                        </div>
                    </>
                )}

                {otherPendingNotice && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontSize: '20px', lineHeight: 1 }}>🕘</span>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: designTokens.warningFg }}>
                                    {tr('label_timer_pending_work') || 'Unrecorded work time exists'}
                                </div>
                                <div style={{ fontSize: '13px', color: designTokens.textSecondary, marginTop: '4px' }}>
                                    {(tr('label_timer_pending_other') || 'Unrecorded work time exists for #%{id} %{subject}. Record or discard it before starting a new timer.')
                                        .replace('%{id}', String(otherPendingNotice.issueId))
                                        .replace('%{subject}', otherPendingNotice.subject)}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <button
                                type="button"
                                data-testid="timer-notice-cancel-button"
                                onClick={closeOtherNotices}
                                style={{
                                    ...timerButtonLayout,
                                    height: '32px',
                                    padding: '0 16px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: '#f0f0f0',
                                    color: '#333333',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('button_close') || 'Close'}
                            </button>
                            <button
                                type="button"
                                data-testid="timer-notice-pending-action-button"
                                onClick={() => {
                                    closeOtherNotices();
                                    openPendingWorkModal();
                                }}
                                style={{
                                    ...timerButtonLayout,
                                    height: '32px',
                                    padding: '0 18px',
                                    borderRadius: '9999px',
                                    border: 'none',
                                    background: '#181e25',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {tr('label_timer_record_time') || 'Record / Manage'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
