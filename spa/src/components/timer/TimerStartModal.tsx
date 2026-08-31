import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../../stores/TimerStore';
import { TIMER_INTERVAL_MINUTES, type TimerIntervalMinutes } from '../../types/timer';
import { fontFamilies, designTokens } from '../../styles/designTokens';
import { i18n } from '../../utils/i18n';
import { timerButtonLayout } from './timerButtonStyles';

export const TimerStartModal: React.FC = () => {
    const startDialogTask = useTimerStore(state => state.startDialogTask);
    const closeStartDialog = useTimerStore(state => state.closeStartDialog);
    const startTimer = useTimerStore(state => state.startTimer);
    const preferences = useTimerStore(state => state.preferences);
    const setAutoStopPreference = useTimerStore(state => state.setAutoStopPreference);

    const [selectedMinutes, setSelectedMinutes] = useState<TimerIntervalMinutes>(30);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!startDialogTask) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeStartDialog();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [startDialogTask, closeStartDialog]);

    if (!startDialogTask) return null;

    const handleStart = () => {
        void startTimer(startDialogTask, selectedMinutes);
    };

    const tr = (key: string) => i18n.t(key) ?? '';

    return (
        <div
            data-testid="timer-start-modal-backdrop"
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
                if (e.target === e.currentTarget) closeStartDialog();
            }}
        >
            <div
                data-testid="timer-start-modal"
                style={{
                    width: '380px',
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
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: designTokens.textMuted, fontSize: '12px', fontWeight: 600 }}>
                        <span>⏱ {tr('label_work_timer') || 'Work Timer'}</span>
                    </div>
                    <div style={{
                        marginTop: '4px',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: designTokens.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        #{startDialogTask.id} {startDialogTask.subject}
                    </div>
                </div>

                {/* Duration Pills */}
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: designTokens.textSecondary, marginBottom: '8px' }}>
                        {tr('field_estimated_hours') || 'Duration'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TIMER_INTERVAL_MINUTES.map((minutes) => {
                            const isSelected = selectedMinutes === minutes;
                            const label = (tr('label_timer_minutes') || '%{count} min').replace('%{count}', String(minutes));
                            return (
                                <button
                                    key={minutes}
                                    type="button"
                                    data-testid={`timer-duration-button-${minutes}`}
                                    onClick={() => setSelectedMinutes(minutes)}
                                    style={{
                                        ...timerButtonLayout,
                                        height: '30px',
                                        padding: '0 14px',
                                        borderRadius: '9999px',
                                        border: isSelected ? `2px solid ${designTokens.brandPrimary}` : `1px solid ${designTokens.controlBorder}`,
                                        background: isSelected ? designTokens.brandPrimary : designTokens.controlBg,
                                        color: isSelected ? '#ffffff' : designTokens.textPrimary,
                                        fontWeight: isSelected ? 700 : 500,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* AutoStop Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontSize: '13px', color: designTokens.textSecondary }}>
                    <input
                        type="checkbox"
                        data-testid="timer-autostop-checkbox"
                    checked={preferences.autoStop}
                    onChange={(e) => setAutoStopPreference(e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: designTokens.brandPrimary }}
                    />
                    <span>{tr('label_timer_auto_stop') || 'Auto-stop when time is up'}</span>
                </label>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <button
                        type="button"
                        data-testid="timer-start-cancel-button"
                        onClick={closeStartDialog}
                        style={{
                            ...timerButtonLayout,
                            height: '32px',
                            padding: '0 18px',
                            borderRadius: '9999px',
                            border: 'none',
                            background: '#f0f0f0',
                            color: '#333333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        {tr('button_cancel') || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        data-testid="timer-start-confirm-button"
                        onClick={handleStart}
                        style={{
                            ...timerButtonLayout,
                            height: '32px',
                            padding: '0 22px',
                            borderRadius: '9999px',
                            border: 'none',
                            background: '#181e25',
                            color: '#ffffff',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                    >
                        {tr('label_timer_start') || 'Start'}
                    </button>
                </div>
            </div>
        </div>
    );
};
