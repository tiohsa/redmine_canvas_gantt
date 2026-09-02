import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalTimer } from './GlobalTimer';
import { TimerStartModal } from './TimerStartModal';
import { PendingWorkModal } from './PendingWorkModal';
import { OtherNoticeModal } from './OtherNoticeModal';
import { useTimerStore } from '../../stores/TimerStore';
import { useUIStore } from '../../stores/UIStore';
import type { Task } from '../../types';
import { getCurrentTimerTabId, persistTimerSession } from '../../services/timerStorage';
import { fontFamilies } from '../../styles/designTokens';

const expectCenteredTimerButton = (button: HTMLElement, height: string) => {
    expect(button).toHaveStyle({
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        paddingTop: '0px',
        paddingBottom: '0px',
        fontFamily: fontFamilies.ui
    });
};

describe('Timer UI Components', () => {
    const baseTime = 1700000000000;

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
        window.sessionStorage.clear();
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
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    describe('GlobalTimer', () => {
        it('renders nothing when session is null', () => {
            const { container } = render(<GlobalTimer />);
            expect(container.firstChild).toBeNull();
        });

        it('renders running timer with remaining and elapsed time', () => {
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: false,
                    state: 'running',
                    deadlineAt: Date.now() + 20 * 60 * 1000,
                    segments: [{ startedAt: Date.now() - 10 * 60 * 1000 }],
                    createdAt: Date.now() - 10 * 60 * 1000,
                updatedAt: Date.now()
                }
            });

        render(<GlobalTimer />);
        persistTimerSession(useTimerStore.getState().session);

            expect(screen.getByTestId('global-timer')).toBeTruthy();
            expect(screen.getByTestId('global-timer-subject').textContent).toContain('#123 API設計');
            expect(screen.getByTestId('global-timer-remaining')).toBeTruthy();
            expect(screen.getByTestId('global-timer-elapsed')).toBeTruthy();
            expect(screen.queryByTestId('global-timer-work-time')).toBeNull();
            expect(screen.getByTestId('global-timer-stop-button')).toBeTruthy();
            expect(screen.getByTestId('global-timer-quick-extend')).toBeTruthy();
            expect(screen.getByTestId('global-timer-quick-extend')).toHaveTextContent('+15 min');
            expect(screen.getByTestId('global-timer')).toHaveAttribute('tabindex', '-1');
            expectCenteredTimerButton(screen.getByTestId('global-timer-quick-extend'), '28px');
            expectCenteredTimerButton(screen.getByTestId('global-timer-extend-menu-toggle'), '28px');
            expectCenteredTimerButton(screen.getByTestId('global-timer-stop-button'), '28px');
        });

        it('renders expired timer with overrun indicator', () => {
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: false,
                    state: 'expired',
                    deadlineAt: Date.now() - 5 * 60 * 1000,
                    segments: [{ startedAt: Date.now() - 35 * 60 * 1000 }],
                    createdAt: Date.now() - 35 * 60 * 1000,
                updatedAt: Date.now()
                }
            });

        render(<GlobalTimer />);
        persistTimerSession(useTimerStore.getState().session);

            expect(screen.getByTestId('global-timer-overrun')).toBeTruthy();
        });

        it('renders pending timer with record and manage actions', () => {
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: true,
                    state: 'stopped_pending_record',
                    deadlineAt: Date.now() - 10 * 60 * 1000,
                    segments: [{ startedAt: Date.now() - 40 * 60 * 1000, stoppedAt: Date.now() - 10 * 60 * 1000 }],
                    createdAt: Date.now() - 40 * 60 * 1000,
                updatedAt: Date.now()
                }
            });

            render(<GlobalTimer />);

            expect(screen.getByTestId('global-timer-record-button')).toBeTruthy();
            expect(screen.getByTestId('global-timer-manage-button')).toHaveTextContent('Manage pending work');
            expect(screen.getByTestId('global-timer-manage-button')).toHaveAccessibleName('Manage pending work');
            expect(screen.getByTestId('global-timer-pending-text')).toHaveTextContent('0:30:00');
            expect(screen.getByTestId('global-timer-pending-text')).not.toHaveTextContent('0.50h');
        });

        it('opens recovery for an editing recording attempt without creating a new attempt', () => {
            const recordingAttempt = { id: 'editing-attempt', ownerTabId: 'other-tab', openedAt: Date.now(), phase: 'editing' as const };
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'editing-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt,
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, isReady: true });
            persistTimerSession(session);
            const recordTime = vi.spyOn(useTimerStore.getState(), 'recordTime');

            render(<GlobalTimer />);
            expect(screen.getByTestId('global-timer-record-button')).toHaveTextContent('Recover recording');
            fireEvent.click(screen.getByTestId('global-timer-record-button'));

            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(true);
            expect(useTimerStore.getState().session?.recordingAttempt).toEqual(recordingAttempt);
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
            expect(recordTime).not.toHaveBeenCalled();
        });

        it('opens recovery for a submitting recording attempt without creating a new attempt', () => {
            const recordingAttempt = { id: 'submitting-attempt', ownerTabId: 'other-tab', openedAt: Date.now(), phase: 'submitting' as const };
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'submitting-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt,
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, isReady: true });
            persistTimerSession(session);
            const recordTime = vi.spyOn(useTimerStore.getState(), 'recordTime');

            render(<GlobalTimer />);
            expect(screen.getByTestId('global-timer-record-button')).toHaveTextContent('Recover recording');
            fireEvent.click(screen.getByTestId('global-timer-record-button'));

            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(true);
            expect(useTimerStore.getState().session?.recordingAttempt).toEqual(recordingAttempt);
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
            expect(recordTime).not.toHaveBeenCalled();
        });

        it('starts recording only when the pending session has no recording attempt', async () => {
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'recordable-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, isReady: true });
            persistTimerSession(session);

            render(<GlobalTimer />);
            expect(screen.getByTestId('global-timer-record-button')).toHaveTextContent('Record');
            fireEvent.click(screen.getByTestId('global-timer-record-button'));

            await waitFor(() => expect(useUIStore.getState().issueDialogUrl).toContain('/issues/123/time_entries/new'));
            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(false);
        });

        it('opens unknown recording resolution from the pending timer CTA', () => {
            const recordingAttempt = { id: 'unknown-attempt', ownerTabId: 'other-tab', openedAt: Date.now(), phase: 'unknown' as const };
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'unknown-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt,
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, isReady: true });
            persistTimerSession(session);
            const recordTime = vi.spyOn(useTimerStore.getState(), 'recordTime');

            render(<GlobalTimer />);
            expect(screen.getByTestId('global-timer-record-button')).toHaveTextContent('Confirm recording result');
            fireEvent.click(screen.getByTestId('global-timer-record-button'));

            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(true);
            expect(useTimerStore.getState().session?.recordingAttempt).toEqual(recordingAttempt);
            expect(recordTime).not.toHaveBeenCalled();
        });

        it('requires explicit confirmation to resolve an unknown recording outcome', async () => {
            const session = {
                version: 4,
                revision: 2,
                sessionId: 'unknown-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt: { id: 'unknown-attempt', ownerTabId: 'other-tab', openedAt: Date.now(), phase: 'unknown' as const },
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, pendingWorkModalOpen: true, isReady: true });
            persistTimerSession(session);

            render(<PendingWorkModal />);

            fireEvent.click(screen.getByTestId('pending-work-unknown-unregistered'));
            expect(screen.getByTestId('pending-work-unknown-confirm')).toBeTruthy();
            fireEvent.click(screen.getByTestId('pending-work-unknown-confirm-button'));

            await waitFor(() => expect(useTimerStore.getState().session?.recordingAttempt).toBeUndefined());
            expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');
        });

        it('offers explicit recovery for a reservation owned by this tab', async () => {
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'stranded-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt: { id: 'stranded-attempt', ownerTabId: getCurrentTimerTabId(), openedAt: Date.now(), phase: 'editing' as const },
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, pendingWorkModalOpen: true, isReady: true });
            persistTimerSession(session);

            render(<PendingWorkModal />);

            fireEvent.click(screen.getByTestId('pending-work-recording-recovery'));
            expect(screen.getByTestId('pending-work-recording-recovery-confirm')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('pending-work-recording-recovery-confirm-button'));

            await waitFor(() => expect(useTimerStore.getState().session?.recordingAttempt).toBeUndefined());
            expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record');
        });

        it('routes another tab submitting reservation to unknown recovery', async () => {
            const session = {
                version: 4,
                revision: 1,
                sessionId: 'stranded-submitting-session',
                issueId: '123',
                subject: 'API設計',
                autoStop: false,
                state: 'stopped_pending_record' as const,
                recordingAttempt: { id: 'stranded-submitting-attempt', ownerTabId: 'other-tab', openedAt: Date.now(), phase: 'submitting' as const },
                segments: [{ startedAt: Date.now() - 30 * 60 * 1000, stoppedAt: Date.now() }],
                createdAt: Date.now() - 30 * 60 * 1000,
                updatedAt: Date.now()
            };
            useTimerStore.setState({ session, pendingWorkModalOpen: true, isReady: true });
            persistTimerSession(session);

            render(<PendingWorkModal />);

            fireEvent.click(screen.getByTestId('pending-work-recording-recovery'));
            fireEvent.click(screen.getByTestId('pending-work-recording-recovery-confirm-button'));

            await waitFor(() => expect(useTimerStore.getState().session?.recordingAttempt?.phase).toBe('unknown'));
            expect(screen.getByTestId('pending-work-unknown-recovery')).toBeInTheDocument();
        });

        it('quick extend button extends the timer by 15 minutes', async () => {
            const now = Date.now();
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: false,
                    state: 'running',
                    deadlineAt: now + 10 * 60 * 1000,
                    segments: [{ startedAt: now }],
                    createdAt: now,
                updatedAt: Date.now()
                }
            });

        render(<GlobalTimer />);

        persistTimerSession(useTimerStore.getState().session);
        const extendBtn = screen.getByTestId('global-timer-quick-extend');
            fireEvent.click(extendBtn);

            await waitFor(() => expect(useTimerStore.getState().session?.deadlineAt).toBe(now + 25 * 60 * 1000));
        });

        it('manual stop button stops timer and triggers time entry form', async () => {
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: false,
                    state: 'running',
                    deadlineAt: Date.now() + 10 * 60 * 1000,
                    segments: [{ startedAt: Date.now() - 10 * 60 * 1000 }],
                    createdAt: Date.now() - 10 * 60 * 1000,
                updatedAt: Date.now()
                }
            });

        render(<GlobalTimer />);

        persistTimerSession(useTimerStore.getState().session);
        const stopBtn = screen.getByTestId('global-timer-stop-button');
            fireEvent.click(stopBtn);

            await waitFor(() => expect(useTimerStore.getState().session?.state).toBe('stopped_pending_record'));
            expect(useUIStore.getState().issueDialogUrl).toContain('/issues/123/time_entries/new');
        });
    });

    describe('TimerStartModal', () => {
        it('renders when startDialogTask is set', () => {
            useTimerStore.setState({ startDialogTask: mockTask });

            render(<TimerStartModal />);

            expect(screen.getByTestId('timer-start-modal')).toBeTruthy();
            expect(screen.getByText('#123 API設計')).toBeTruthy();
            expect(screen.getByTestId('timer-duration-button-5')).toBeTruthy();
            expect(screen.getByTestId('timer-duration-button-10')).toBeTruthy();
            expect(screen.getByTestId('timer-duration-button-15')).toBeTruthy();
            expect(screen.getByTestId('timer-duration-button-30')).toBeTruthy();
            expect(screen.getByTestId('timer-duration-button-60')).toBeTruthy();
            expect(screen.getByTestId('timer-autostop-checkbox')).toBeTruthy();
            expect(screen.getByTestId('timer-start-modal')).toHaveStyle({ width: '440px' });
            expect(screen.getByTestId('timer-duration-button-5').parentElement).toHaveStyle({ flexWrap: 'nowrap' });
            expectCenteredTimerButton(screen.getByTestId('timer-duration-button-5'), '30px');
            expectCenteredTimerButton(screen.getByTestId('timer-start-cancel-button'), '32px');
            expectCenteredTimerButton(screen.getByTestId('timer-start-confirm-button'), '32px');
        });

        it('allows selecting duration and starting timer', async () => {
            useTimerStore.setState({ startDialogTask: mockTask });

            render(<TimerStartModal />);

            // Select 15 min
            fireEvent.click(screen.getByTestId('timer-duration-button-15'));

            // Click start
            fireEvent.click(screen.getByTestId('timer-start-confirm-button'));

            await waitFor(() => expect(useTimerStore.getState().session).not.toBeNull());
            expect(useTimerStore.getState().session?.issueId).toBe('123');
            expect(useTimerStore.getState().startDialogTask).toBeNull();
        });

        it('updates the store preference immediately when auto-stop changes', () => {
            useTimerStore.setState({ startDialogTask: mockTask });
            render(<TimerStartModal />);

            fireEvent.click(screen.getByTestId('timer-autostop-checkbox'));

            expect(useTimerStore.getState().preferences.autoStop).toBe(true);
        });

        it('cancels start dialog when cancel button clicked', () => {
            useTimerStore.setState({ startDialogTask: mockTask });

            render(<TimerStartModal />);

            fireEvent.click(screen.getByTestId('timer-start-cancel-button'));

            expect(useTimerStore.getState().startDialogTask).toBeNull();
            expect(useTimerStore.getState().session).toBeNull();
        });
    });

    describe('PendingWorkModal', () => {
        it('renders pending work with elapsed time and options', () => {
            useTimerStore.setState({
                pendingWorkModalOpen: true,
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: true,
                    state: 'stopped_pending_record',
                    deadlineAt: baseTime + 30 * 60 * 1000,
                    segments: [{ startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 }],
                    createdAt: baseTime,
                updatedAt: Date.now()
                }
            });

        render(<PendingWorkModal />);
        persistTimerSession(useTimerStore.getState().session);

            expect(screen.getByTestId('pending-work-modal')).toBeTruthy();
            expect(screen.getByTestId('pending-work-modal')).toHaveTextContent('Elapsed:');
            expect(screen.getByTestId('pending-work-elapsed-value')).toHaveTextContent('0:30:00');
            expect(screen.getByTestId('pending-work-elapsed-value')).not.toHaveTextContent('(');
            expect(screen.getByTestId('pending-work-record-section')).not.toHaveTextContent('Record this work time');
            expect(screen.getByTestId('pending-work-record-section')).toHaveStyle({ padding: '12px', borderRadius: '12px' });
            expect(screen.getByTestId('pending-work-or-separator')).toHaveTextContent('or');
            expect(screen.getByTestId('pending-work-resume-section')).toHaveTextContent('Continue working');
            expect(screen.getByTestId('pending-work-resume-section')).toHaveStyle({ padding: '12px', borderRadius: '12px' });
            expect(screen.getByTestId('pending-work-modal')).toHaveStyle({ width: '560px' });
            expect(screen.getByTestId('pending-work-resume-options')).toHaveStyle({ flexWrap: 'nowrap' });
            expect(screen.getByTestId('pending-work-record-button')).toBeTruthy();
            expect(screen.getByTestId('pending-work-record-button')).toHaveTextContent('Record time');
            expect(screen.getByTestId('pending-work-record-button')).not.toHaveTextContent('00:30');
            expect(screen.getByTestId('pending-work-record-button')).toHaveStyle({ background: '#ffffff', color: '#222222' });
            fireEvent.mouseEnter(screen.getByTestId('pending-work-record-button'));
            expect(screen.getByTestId('pending-work-record-button')).toHaveStyle({ background: '#e8f0fe', color: '#1a73e8' });
            fireEvent.mouseLeave(screen.getByTestId('pending-work-record-button'));
            fireEvent.mouseEnter(screen.getByTestId('pending-work-resume-button-15'));
            expect(screen.getByTestId('pending-work-resume-button-15')).toHaveStyle({ background: '#e8f0fe', color: '#1a73e8' });
            fireEvent.mouseLeave(screen.getByTestId('pending-work-resume-button-15'));
            expect(screen.getByTestId('pending-work-resume-button-15')).toBeTruthy();
            expect(screen.getByTestId('pending-work-discard-button')).toBeTruthy();
            expectCenteredTimerButton(screen.getByTestId('pending-work-record-button'), '38px');
            expectCenteredTimerButton(screen.getByTestId('pending-work-resume-button-15'), '28px');
            expectCenteredTimerButton(screen.getByTestId('pending-work-discard-button'), '28px');
        });

        it('clicking record time opens time entry dialog', async () => {
            useTimerStore.setState({
                pendingWorkModalOpen: true,
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: true,
                    state: 'stopped_pending_record',
                    deadlineAt: baseTime + 30 * 60 * 1000,
                    segments: [{ startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 }],
                    createdAt: baseTime,
                updatedAt: Date.now()
                }
            });

        render(<PendingWorkModal />);

        persistTimerSession(useTimerStore.getState().session);
        fireEvent.click(screen.getByTestId('pending-work-record-button'));

            await waitFor(() => expect(useUIStore.getState().issueDialogUrl).toContain('/issues/123/time_entries/new?time_entry[hours]=0.50'));
            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(false);
        });

        it('clicking discard requires confirmation before deleting session', async () => {
            useTimerStore.setState({
                pendingWorkModalOpen: true,
                session: {
                    version: 4,
                    revision: 1,
                    sessionId: 's1',
                    issueId: '123',
                    subject: 'API設計',
                    autoStop: true,
                    state: 'stopped_pending_record',
                    deadlineAt: baseTime + 30 * 60 * 1000,
                    segments: [{ startedAt: baseTime, stoppedAt: baseTime + 30 * 60 * 1000 }],
                    createdAt: baseTime,
                updatedAt: Date.now()
                }
            });

            render(<PendingWorkModal />);

            fireEvent.click(screen.getByTestId('pending-work-discard-button'));

            // Confirmation UI is displayed
            expect(screen.getByTestId('pending-work-discard-confirm')).toBeTruthy();
            expect(useTimerStore.getState().session).not.toBeNull(); // Not deleted yet

            // Confirm
            fireEvent.click(screen.getByTestId('pending-work-discard-confirm'));
            await waitFor(() => expect(useTimerStore.getState().session).toBeNull());
        });
    });

    describe('OtherNoticeModal', () => {
        it('renders notice when another timer is running', () => {
            useTimerStore.setState({
                otherRunningNotice: { issueId: '999', subject: 'Other Issue' }
            });

            render(<OtherNoticeModal />);

            expect(screen.getByTestId('timer-notice-modal')).toBeTruthy();
            expect(screen.getByTestId('timer-notice-modal').textContent).toContain('#999 Other Issue');
            expectCenteredTimerButton(screen.getByTestId('timer-notice-close-button'), '32px');

            fireEvent.click(screen.getByTestId('timer-notice-close-button'));
            expect(useTimerStore.getState().otherRunningNotice).toBeNull();
        });

        it('renders notice when another timer is pending and allows opening pending work', () => {
            useTimerStore.setState({
                otherPendingNotice: { issueId: '999', subject: 'Other Issue', elapsedMs: 30 * 60 * 1000 }
            });

            render(<OtherNoticeModal />);

            expect(screen.getByTestId('timer-notice-modal')).toBeTruthy();
            expectCenteredTimerButton(screen.getByTestId('timer-notice-cancel-button'), '32px');
            expectCenteredTimerButton(screen.getByTestId('timer-notice-pending-action-button'), '32px');

            fireEvent.click(screen.getByTestId('timer-notice-pending-action-button'));
            expect(useTimerStore.getState().otherPendingNotice).toBeNull();
            expect(useTimerStore.getState().pendingWorkModalOpen).toBe(true);
        });
    });
});
