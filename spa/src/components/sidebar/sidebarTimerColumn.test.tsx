import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UiSidebar } from '../UiSidebar';
import { COLUMN_CATALOG, getDefaultVisibleColumnKeys, getColumnDefinitions, toRedmineColumnName, toCanvasColumnKey } from './sidebarColumnCatalog';
import { buildColumnSettingsFromVisibleKeys } from './sidebarColumnSettings';
import { useTaskStore } from '../../stores/TaskStore';
import { useTimerStore } from '../../stores/TimerStore';
import { useUIStore } from '../../stores/UIStore';
import type { Task } from '../../types';

describe('Sidebar Timer Column', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTimerStore.setState({
            session: null,
            preferences: { autoStop: false },
            startDialogTask: null,
            pendingWorkModalOpen: false,
            otherRunningNotice: null,
            otherPendingNotice: null
        });
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'timer', 'subject']);
        useUIStore.setState({
            visibleColumns: ['id', 'timer', 'subject'],
            columnSettings,
            notifications: []
        });
        useTaskStore.setState({
            viewport: { startDate: 0, scrollX: 0, scrollY: 0, scale: 1, width: 800, height: 600, rowHeight: 32 },
            groupByProject: false
        });
        vi.restoreAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('has timer in COLUMN_CATALOG with defaultVisible: false', () => {
        const timerMeta = COLUMN_CATALOG.find(c => c.key === 'timer');
        expect(timerMeta).toBeDefined();
        expect(timerMeta?.defaultVisible).toBe(false);

        const defaultVisibleKeys = getDefaultVisibleColumnKeys();
        expect(defaultVisibleKeys).not.toContain('timer');
    });

    it('renders start button for task with canLogTime: true in idle state', () => {
        const task: Task = {
            id: '101',
            subject: 'Task 101',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            canLogTime: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const startBtn = screen.getByTestId('task-timer-start-101');
        expect(startBtn).toBeTruthy();
        expect(startBtn).toHaveStyle({
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '28px',
            padding: '0px'
        });

        fireEvent.click(startBtn);
        expect(useTimerStore.getState().startDialogTask?.id).toBe('101');
    });

    it.each([
        [20, 'start', 'task-timer-start-101', 18, 14],
        [20, 'running', 'task-timer-running-101', 18, 14],
        [20, 'pending', 'task-timer-pending-101', 18, 14],
        [28, 'start', 'task-timer-start-101', 26, 22],
        [28, 'running', 'task-timer-running-101', 26, 22],
        [28, 'pending', 'task-timer-pending-101', 26, 22],
        [36, 'start', 'task-timer-start-101', 28, 22],
        [36, 'running', 'task-timer-running-101', 28, 22],
        [36, 'pending', 'task-timer-pending-101', 28, 22]
    ])('sizes the %s timer button for a %spx row', (rowHeight, state, testId, buttonSize, iconSize) => {
        useTaskStore.setState({
            viewport: { startDate: 0, scrollX: 0, scrollY: 0, scale: 1, width: 800, height: 600, rowHeight }
        });
        useTaskStore.getState().setTasks([{
            id: '101', subject: 'Task 101', startDate: 0, dueDate: 1, ratioDone: 0,
            statusId: 1, lockVersion: 1, editable: true, canLogTime: true, rowIndex: 0, hasChildren: false
        }]);
        if (state !== 'start') {
            useTimerStore.setState({
                session: {
                    version: 4, revision: 1, sessionId: 's-101', issueId: '101', subject: 'Task 101',
                    autoStop: state === 'pending', state: state === 'pending' ? 'stopped_pending_record' : 'running',
                    deadlineAt: Date.now() + 15 * 60 * 1000, segments: [{ startedAt: Date.now() }],
                    createdAt: Date.now(), updatedAt: Date.now()
                }
            });
        }

        render(<UiSidebar />);

        const button = screen.getByTestId(testId);
        expect(button).toHaveStyle({ width: `${buttonSize}px`, height: `${buttonSize}px` });
        expect(button.querySelector('svg')).toHaveAttribute('width', String(iconSize));
        expect(button.querySelector('svg')).toHaveAttribute('height', String(iconSize));
    });

    it('renders disabled dash for task with canLogTime: false', () => {
        const task: Task = {
            id: '102',
            subject: 'Task 102',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            canLogTime: false,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        render(<UiSidebar />);

        const disabledElem = screen.getByTestId('task-timer-disabled-102');
        expect(disabledElem).toBeTruthy();
        expect(disabledElem.textContent).toBe('—');
    });

    it('renders running icon when timer is active for the task', () => {
        const task: Task = {
            id: '103',
            subject: 'Task 103',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            canLogTime: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        useTimerStore.setState({
            session: {
                version: 4,
                revision: 1,
                sessionId: 's-103',
                issueId: '103',
                subject: 'Task 103',
                autoStop: false,
                state: 'running',
                deadlineAt: Date.now() + 15 * 60 * 1000,
                segments: [{ startedAt: Date.now() }],
                createdAt: Date.now(),
            updatedAt: Date.now()
            }
        });

        render(<UiSidebar />);

        const runningBtn = screen.getByTestId('task-timer-running-103');
        expect(runningBtn).toBeTruthy();
        expect(runningBtn.querySelector('svg')).toBeInTheDocument();
    });

    it('focuses the global timer when the running icon is clicked', () => {
        const task: Task = {
            id: '105',
            subject: 'Task 105',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            canLogTime: true,
            rowIndex: 0,
            hasChildren: false
        };
        useTaskStore.getState().setTasks([task]);
        useTimerStore.setState({
            session: {
                version: 4,
                revision: 1,
                sessionId: 's-105',
                issueId: '105',
                subject: 'Task 105',
                autoStop: false,
                state: 'running',
                deadlineAt: Date.now() + 15 * 60 * 1000,
                segments: [{ startedAt: Date.now() }],
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        });
        const globalTimer = document.createElement('div');
        globalTimer.dataset.testid = 'global-timer';
        document.body.appendChild(globalTimer);
        const focusSpy = vi.spyOn(globalTimer, 'focus');

        render(<UiSidebar />);
        fireEvent.click(screen.getByTestId('task-timer-running-105'));

        expect(focusSpy).toHaveBeenCalledTimes(1);
    });

    it('renders pending icon when timer has unrecorded work for the task', () => {
        const task: Task = {
            id: '104',
            subject: 'Task 104',
            startDate: 0,
            dueDate: 1,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true,
            canLogTime: true,
            rowIndex: 0,
            hasChildren: false
        };

        useTaskStore.getState().setTasks([task]);

        useTimerStore.setState({
            session: {
                version: 4,
                revision: 1,
                sessionId: 's-104',
                issueId: '104',
                subject: 'Task 104',
                autoStop: true,
                state: 'stopped_pending_record',
                deadlineAt: Date.now() - 5 * 60 * 1000,
                segments: [{ startedAt: Date.now() - 35 * 60 * 1000, stoppedAt: Date.now() - 5 * 60 * 1000 }],
                createdAt: Date.now() - 35 * 60 * 1000,
            updatedAt: Date.now()
            }
        });

        render(<UiSidebar />);

        const pendingBtn = screen.getByTestId('task-timer-pending-104');
        expect(pendingBtn).toBeTruthy();
        expect(pendingBtn.querySelector('svg')).toBeInTheDocument();

        fireEvent.click(pendingBtn);
        expect(useTimerStore.getState().pendingWorkModalOpen).toBe(true);
    });

    it('maps timer column to and from URL / Redmine query columns', () => {
        expect(toRedmineColumnName('timer')).toBeNull();
        expect(toCanvasColumnKey('timer')).toBeNull();
        expect(toRedmineColumnName('notification')).toBeNull();
        expect(toCanvasColumnKey('notification')).toBeNull();
        expect(toRedmineColumnName('subject')).toBe('subject');
        expect(toCanvasColumnKey('subject')).toBe('subject');
    });

    it('toggles timer column visibility in UIStore and updates visibleColumns', () => {
        useUIStore.setState({
            visibleColumns: ['id', 'subject'],
            columnSettings: [
                { key: 'id', visible: true },
                { key: 'timer', visible: false },
                { key: 'subject', visible: true }
            ]
        });

        useUIStore.getState().toggleColumnVisibility('timer');

        expect(useUIStore.getState().visibleColumns).toContain('timer');
        const timerSetting = useUIStore.getState().columnSettings.find(c => c.key === 'timer');
        expect(timerSetting?.visible).toBe(true);
        expect(useUIStore.getState().columnsExplicitInQuery).toBe(false);
    });
});
