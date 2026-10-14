import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useTaskStore } from './stores/TaskStore';
import { useTimerStore } from './stores/TimerStore';
import { useUIStore } from './stores/UIStore';
import { resetCanvasGanttTestState } from './test/testSetup';

const toolbarRenderMock = vi.fn();

vi.mock('./components/GanttContainer', () => ({
    GanttContainer: () => <div data-testid="gantt-container" />
}));

vi.mock('./components/GanttToolbar', () => ({
    GanttToolbar: ({ onOpenRelationReview }: { onOpenRelationReview?: () => void }) => {
        toolbarRenderMock();
        return <div data-testid="gantt-toolbar"><button onClick={onOpenRelationReview}>Review relations</button></div>;
    }
}));

vi.mock('./components/Toast', () => ({ default: () => <div /> }));
vi.mock('./components/ConflictResolutionPanel', () => ({
    ConflictResolutionPanel: ({ relationReviewRequest }: { relationReviewRequest?: number }) =>
        <div data-testid="relation-review-request">{relationReviewRequest}</div>
}));
vi.mock('./components/timer/GlobalTimer', () => ({ GlobalTimer: () => <div /> }));
vi.mock('./components/timer/TimerStartModal', () => ({ TimerStartModal: () => <div /> }));
vi.mock('./components/timer/PendingWorkModal', () => ({ PendingWorkModal: () => <div /> }));
vi.mock('./components/timer/OtherNoticeModal', () => ({ OtherNoticeModal: () => <div /> }));

describe('App store subscriptions', () => {
    beforeEach(() => {
        resetCanvasGanttTestState();
        toolbarRenderMock.mockClear();
    });

    it('opens relation review again on each toolbar request', () => {
        render(<App />);
        expect(screen.getByTestId('relation-review-request')).toHaveTextContent('0');
        fireEvent.click(screen.getByRole('button', { name: 'Review relations' }));
        expect(screen.getByTestId('relation-review-request')).toHaveTextContent('1');
        fireEvent.click(screen.getByRole('button', { name: 'Review relations' }));
        expect(screen.getByTestId('relation-review-request')).toHaveTextContent('2');
    });

    it('warns on leaving with task or relation drafts and removes the listener on unmount', () => {
        const { unmount } = render(<App />);
        const unload = () => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        };
        expect(unload()).toBe(false);
        act(() => useTaskStore.setState({ modifiedTaskIds: new Set(['1']) }));
        expect(unload()).toBe(true);
        act(() => useTaskStore.setState({
            modifiedTaskIds: new Set(),
            pendingRelationChanges: {
                draft: {
                    draftId: 'draft', operation: 'create', generation: 1, status: 'pending',
                    desired: { from: '1', to: '2', type: 'precedes', delay: 0 }
                }
            }
        }));
        expect(unload()).toBe(true);
        unmount();
        expect(unload()).toBe(false);
    });

    it('does not re-evaluate App children for UI, task, viewport, or timer state App does not use', () => {
        render(<App />);
        toolbarRenderMock.mockClear();

        act(() => {
            useUIStore.getState().setSidebarFontSize(15);
            useUIStore.getState().setSidebarWidth(420);
            useUIStore.getState().setColumnWidth('subject', 320);
            useUIStore.getState().setVisibleColumns(['id', 'subject']);
            useTaskStore.getState().setRowHeight(44);
            useTaskStore.getState().updateViewport({ scrollX: 120, scrollY: 80 });
            useTaskStore.getState().selectTask('task-1');
            useTimerStore.setState({ isReady: true });
        });

        expect(toolbarRenderMock).not.toHaveBeenCalled();
    });

    it('re-evaluates App children when App-owned zoom or fullscreen state changes', () => {
        render(<App />);
        toolbarRenderMock.mockClear();

        act(() => {
            useTaskStore.getState().setZoomLevel(2);
        });
        expect(toolbarRenderMock).toHaveBeenCalledTimes(1);

        toolbarRenderMock.mockClear();
        act(() => {
            useUIStore.getState().setFullScreen(true);
        });
        expect(toolbarRenderMock).toHaveBeenCalledTimes(1);
    });

    it('keeps a localized calendar warning visible and removes it after recovery', () => {
        vi.useFakeTimers();
        useTaskStore.setState({
            businessCalendarValidation: {
                status: 'stale',
                message: '最後に正常に読み込んだカレンダーを使用しています。',
                diagnostic: {
                    code: 'INVALID_CSV', file: 'holiday.csv', line: 2,
                    message: 'カレンダーの日付が不正です。', cause: 'Date is invalid.', value: '2027/2/30'
                }
            }
        });
        render(<App />);

        const banner = screen.getByRole('alert');
        expect(banner).toHaveTextContent('最後に正常に読み込んだカレンダーを使用しています。');
        expect(banner).toHaveTextContent('holiday.csv:2');
        expect(banner).toHaveTextContent('カレンダーの日付が不正です。');
        expect(banner).toHaveTextContent('Date is invalid.');
        expect(banner).toHaveTextContent('2027/2/30');

        act(() => vi.advanceTimersByTime(4_000));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        act(() => {
            useTaskStore.setState({
                businessCalendarValidation: { status: 'valid', message: null, diagnostic: null }
            });
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        vi.useRealTimers();
    });
});
