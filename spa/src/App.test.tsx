import { act, render } from '@testing-library/react';
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
    GanttToolbar: () => {
        toolbarRenderMock();
        return <div data-testid="gantt-toolbar" />;
    }
}));

vi.mock('./components/Toast', () => ({ default: () => <div /> }));
vi.mock('./components/ConflictResolutionPanel', () => ({ ConflictResolutionPanel: () => <div /> }));
vi.mock('./components/timer/GlobalTimer', () => ({ GlobalTimer: () => <div /> }));
vi.mock('./components/timer/TimerStartModal', () => ({ TimerStartModal: () => <div /> }));
vi.mock('./components/timer/PendingWorkModal', () => ({ PendingWorkModal: () => <div /> }));
vi.mock('./components/timer/OtherNoticeModal', () => ({ OtherNoticeModal: () => <div /> }));

describe('App store subscriptions', () => {
    beforeEach(() => {
        resetCanvasGanttTestState();
        toolbarRenderMock.mockClear();
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
});
