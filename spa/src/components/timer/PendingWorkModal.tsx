import React, { useState, useEffect } from 'react';
import { useTimerStore } from '../../stores/TimerStore';
import { TIMER_INTERVAL_MINUTES } from '../../types/timer';
import {
  calculateTimerElapsed,
  formatElapsedMinutesText,
  formatTimerExtensionLabel,
  formatTimerDuration,
  isTimerSpanningMultipleDays
} from '../../domain/timer/timerDomain';
import { fontFamilies, designTokens } from '../../styles/designTokens';
import { i18n } from '../../utils/i18n';
import { timerButtonLayout } from './timerButtonStyles';
import { WorkTimerIcon } from './WorkTimerIcon';

export const PendingWorkModal: React.FC = () => {
  const pendingWorkModalOpen = useTimerStore(state => state.pendingWorkModalOpen);
  const session = useTimerStore(state => state.session);
  const closePendingWorkModal = useTimerStore(state => state.closePendingWorkModal);
  const recordTime = useTimerStore(state => state.recordTime);
  const resumeTimer = useTimerStore(state => state.resumeTimer);
  const discardTimer = useTimerStore(state => state.discardTimer);
  const recoverTimerRecording = useTimerStore(state => state.recoverTimerRecording);
  const resolveUnknownTimerRecording = useTimerStore(state => state.resolveUnknownTimerRecording);

  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [unknownResolution, setUnknownResolution] = useState<'recorded' | 'unregistered' | null>(null);
  const [isRecoveryConfirmOpen, setIsRecoveryConfirmOpen] = useState(false);
  const [hoveredPendingAction, setHoveredPendingAction] = useState<'record' | number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pendingWorkModalOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isDiscardConfirmOpen) {
          setIsDiscardConfirmOpen(false);
        } else if (isRecoveryConfirmOpen) {
          setIsRecoveryConfirmOpen(false);
        } else {
          closePendingWorkModal();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingWorkModalOpen, isDiscardConfirmOpen, isRecoveryConfirmOpen, closePendingWorkModal]);

  if (!pendingWorkModalOpen || !session) return null;

  const tr = (key: string) => i18n.t(key) ?? '';
  const isJa = (typeof window !== 'undefined' && window.RedmineCanvasGantt?.language === 'ja') || i18n.t('general_text_yes') === 'はい';

  const totalMs = calculateTimerElapsed(session);
  const elapsedText = formatElapsedMinutesText(totalMs, isJa);
  const durationFormatted = formatTimerDuration(totalMs);
  const isCrossDay = isTimerSpanningMultipleDays(session);
  const recordingPhase = session.recordingAttempt?.phase;
  const isRecoverableRecording = Boolean(
    recordingPhase &&
    recordingPhase !== 'unknown'
  );
  const unknownSecondaryButtonStyle: React.CSSProperties = {
    ...timerButtonLayout,
    height: '30px',
    padding: '0 14px',
    borderRadius: '9999px',
    border: `1px solid ${designTokens.controlBorder}`,
    background: designTokens.controlBg,
    color: designTokens.textPrimary,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer'
  };
  const unknownPrimaryButtonStyle: React.CSSProperties = {
    ...unknownSecondaryButtonStyle,
    border: 'none',
    background: designTokens.brandPrimary,
    color: '#ffffff',
    fontWeight: 600
  };

  const handleDiscardConfirm = () => {
    setIsDiscardConfirmOpen(false);
    void discardTimer();
  };

  const handleUnknownResolutionConfirm = () => {
    if (!unknownResolution || !session.recordingAttempt) return;
    const context = {
      origin: 'timer' as const,
      sessionId: session.sessionId,
      issueId: session.issueId,
      attemptId: session.recordingAttempt.id
    };
    setUnknownResolution(null);
    void resolveUnknownTimerRecording(context, unknownResolution);
  };

  const handleRecordingRecoveryConfirm = () => {
    if (!session.recordingAttempt || !isRecoverableRecording) return;
    const context = {
      origin: 'timer' as const,
      sessionId: session.sessionId,
      issueId: session.issueId,
      attemptId: session.recordingAttempt.id
    };
    setIsRecoveryConfirmOpen(false);
    void recoverTimerRecording(context);
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
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
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
          <WorkTimerIcon state="pending" size={24} />
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
            <span data-testid="pending-work-elapsed-value" style={{ fontWeight: 700, fontSize: '16px', color: designTokens.textPrimary, fontFamily: fontFamilies.mono }}>
              {durationFormatted}
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

        {/* Confirm unknown outcome or discard, otherwise show actions */}
        {isRecoverableRecording && isRecoveryConfirmOpen ? (
          <div data-testid="pending-work-recording-recovery-confirm" style={{
            padding: '12px',
            backgroundColor: designTokens.warningBg,
            borderRadius: '12px',
            border: `1px solid ${designTokens.warningFg}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ color: designTokens.warningFg, fontSize: '12px', fontWeight: 600 }}>
              {recordingPhase === 'editing'
                ? (tr('label_timer_recording_recovery_confirm') || 'Confirm that the time-entry form is not being edited in another tab.')
                : (tr('label_timer_recording_recovery_submitting') || 'The submission may have reached Redmine. Check Redmine before recovering it.')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" data-testid="pending-work-recording-recovery-cancel" onClick={() => setIsRecoveryConfirmOpen(false)} style={unknownSecondaryButtonStyle}>
                {tr('button_cancel') || 'Cancel'}
              </button>
              <button type="button" data-testid="pending-work-recording-recovery-confirm-button" onClick={handleRecordingRecoveryConfirm} style={unknownPrimaryButtonStyle}>
                {tr('label_timer_recording_recover') || 'Recover recording'}
              </button>
            </div>
          </div>
        ) : recordingPhase === 'unknown' && unknownResolution ? (
          <div data-testid="pending-work-unknown-confirm" style={{
            padding: '12px',
            backgroundColor: designTokens.warningBg,
            borderRadius: '12px',
            border: `1px solid ${designTokens.warningFg}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ color: designTokens.warningFg, fontSize: '12px', fontWeight: 600 }}>
              {(tr('label_timer_unknown_confirm') || 'Confirm how to resolve this recording: %{resolution}').replace(
                '%{resolution}',
                unknownResolution === 'recorded'
                  ? (tr('label_timer_mark_recorded') || 'Recorded')
                  : (tr('label_timer_mark_unregistered') || 'Not registered')
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" data-testid="pending-work-unknown-cancel" onClick={() => setUnknownResolution(null)} style={unknownSecondaryButtonStyle}>
                {tr('button_cancel') || 'Cancel'}
              </button>
              <button type="button" data-testid="pending-work-unknown-confirm-button" onClick={handleUnknownResolutionConfirm} style={unknownPrimaryButtonStyle}>
                {tr('button_confirm') || 'Confirm'}
              </button>
            </div>
          </div>
        ) : isDiscardConfirmOpen ? (
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
                  ...timerButtonLayout,
                  height: '30px',
                  padding: '0 14px',
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
                  ...timerButtonLayout,
                  height: '30px',
                  padding: '0 14px',
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
        ) : recordingPhase === 'unknown' ? (
          <div data-testid="pending-work-unknown-recovery" style={{
            padding: '12px',
            backgroundColor: designTokens.warningBg,
            borderRadius: '12px',
            border: `1px solid ${designTokens.warningFg}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ color: designTokens.warningFg, fontSize: '12px', fontWeight: 600 }}>
              {tr('label_timer_unknown_recovery') || 'The time-entry result could not be confirmed. Check Redmine before choosing an outcome.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" data-testid="pending-work-unknown-recorded" onClick={() => setUnknownResolution('recorded')} style={unknownPrimaryButtonStyle}>
                {tr('label_timer_mark_recorded') || 'Recorded'}
              </button>
              <button type="button" data-testid="pending-work-unknown-unregistered" onClick={() => setUnknownResolution('unregistered')} style={unknownSecondaryButtonStyle}>
                {tr('label_timer_mark_unregistered') || 'Not registered'}
              </button>
            </div>
          </div>
        ) : isRecoverableRecording ? (
          <div data-testid="pending-work-recording-reservation" style={{
            padding: '12px',
            backgroundColor: designTokens.surfaceSubtle,
            borderRadius: '12px',
            border: `1px solid ${designTokens.borderSubtle}`,
            color: designTokens.textSecondary
          }}>
            <div>{tr('label_timer_recording_recovery') || tr('label_timer_recording_in_progress') || 'A recording reservation from another tab is still active.'}</div>
            <button type="button" data-testid="pending-work-recording-recovery" onClick={() => setIsRecoveryConfirmOpen(true)} style={unknownPrimaryButtonStyle}>
              {tr('label_timer_recording_recover') || 'Recover recording'}
            </button>
          </div>
        ) : recordingPhase ? (
          <div data-testid="pending-work-recording-reservation" style={{
            padding: '12px',
            backgroundColor: designTokens.surfaceSubtle,
            borderRadius: '12px',
            border: `1px solid ${designTokens.borderSubtle}`,
            color: designTokens.textSecondary
          }}>
            {tr('label_timer_recording_in_progress') || 'This work time is being recorded in another dialog.'}
          </div>
        ) : (
          <>
            <div data-testid="pending-work-record-section" style={{
              padding: '12px',
              borderRadius: '12px',
              border: `1px solid ${designTokens.borderSubtle}`,
              backgroundColor: designTokens.surfaceSubtle,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '12px', color: designTokens.textSecondary, lineHeight: 1.4 }}>
                {tr('label_timer_pending_record_desc') || "Open Redmine's time-entry form and save this work time."}
              </div>
              <button
                type="button"
                data-testid="pending-work-record-button"
                onClick={() => void recordTime()}
                onMouseEnter={() => setHoveredPendingAction('record')}
                onMouseLeave={() => setHoveredPendingAction(null)}
                onFocus={() => setHoveredPendingAction('record')}
                onBlur={() => setHoveredPendingAction(null)}
                style={{
                  ...timerButtonLayout,
                  width: '100%',
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: '9999px',
                  border: `1px solid ${hoveredPendingAction === 'record' ? designTokens.brandPrimary : designTokens.controlBorder}`,
                  background: hoveredPendingAction === 'record' ? designTokens.controlActiveBg : designTokens.controlBg,
                  color: hoveredPendingAction === 'record' ? designTokens.controlActiveFg : designTokens.textPrimary,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  gap: '8px',
                  boxShadow: designTokens.controlActiveShadow,
                  transition: 'background-color 120ms ease, border-color 120ms ease'
                }}
              >
                <span>📝 {tr('label_timer_record_time') || 'Record time'}</span>
              </button>
            </div>

            <div
              data-testid="pending-work-or-separator"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: designTokens.textSecondary,
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}
            >
              <span aria-hidden="true" style={{ flex: 1, height: '1px', backgroundColor: designTokens.borderSubtle }} />
              <span>{tr('label_timer_or') || 'or'}</span>
              <span aria-hidden="true" style={{ flex: 1, height: '1px', backgroundColor: designTokens.borderSubtle }} />
            </div>

            <div data-testid="pending-work-resume-section" style={{
              padding: '12px',
              borderRadius: '12px',
              border: `1px solid ${designTokens.borderSubtle}`,
              backgroundColor: designTokens.surfaceSubtle,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: designTokens.textPrimary }}>
                {tr('label_timer_pending_resume_section') || 'Continue working'}
              </div>
              <div style={{ fontSize: '12px', color: designTokens.textSecondary, lineHeight: 1.4 }}>
                {tr('label_timer_pending_resume_desc') || 'Resume the timer and add more time before recording.'}
              </div>
              <div data-testid="pending-work-resume-options" style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                {TIMER_INTERVAL_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    data-testid={`pending-work-resume-button-${minutes}`}
                    onClick={() => void resumeTimer(minutes)}
                    onMouseEnter={() => setHoveredPendingAction(minutes)}
                    onMouseLeave={() => setHoveredPendingAction(null)}
                    onFocus={() => setHoveredPendingAction(minutes)}
                    onBlur={() => setHoveredPendingAction(null)}
                    style={{
                      ...timerButtonLayout,
                      height: '28px',
                      padding: '0 12px',
                      borderRadius: '9999px',
                      border: `1px solid ${hoveredPendingAction === minutes ? designTokens.brandPrimary : designTokens.controlBorder}`,
                      background: hoveredPendingAction === minutes ? designTokens.controlActiveBg : designTokens.controlBg,
                      color: hoveredPendingAction === minutes ? designTokens.controlActiveFg : designTokens.textPrimary,
                      fontWeight: 500,
                      fontSize: '12px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'background-color 120ms ease, border-color 120ms ease'
                    }}
                  >
                    {formatTimerExtensionLabel(minutes, tr('label_timer_minutes') || '%{count} min')}
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
                  ...timerButtonLayout,
                  height: '28px',
                  padding: '0 12px',
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
                  ...timerButtonLayout,
                  height: '28px',
                  padding: '0 16px',
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
