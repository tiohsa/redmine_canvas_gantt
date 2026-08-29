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

        fireEvent.click(startBtn);
        expect(useTimerStore.getState().startDialogTask?.id).toBe('101');
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
                version: 1,
                sessionId: 's-103',
                issueId: '103',
                subject: 'Task 103',
                autoStop: false,
                state: 'running',
                deadlineAt: Date.now() + 15 * 60 * 1000,
                segments: [{ startedAt: Date.now() }],
                createdAt: Date.now()
            }
        });

        render(<UiSidebar />);

        const runningBtn = screen.getByTestId('task-timer-running-103');
        expect(runningBtn).toBeTruthy();
        expect(runningBtn.textContent).toContain('⏱');
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
                version: 1,
                sessionId: 's-104',
                issueId: '104',
                subject: 'Task 104',
                autoStop: true,
                state: 'stopped_pending_record',
                deadlineAt: Date.now() - 5 * 60 * 1000,
                segments: [{ startedAt: Date.now() - 35 * 60 * 1000, stoppedAt: Date.now() - 5 * 60 * 1000 }],
                createdAt: Date.now() - 35 * 60 * 1000
            }
        });

        render(<UiSidebar />);

        const pendingBtn = screen.getByTestId('task-timer-pending-104');
        expect(pendingBtn).toBeTruthy();
        expect(pendingBtn.textContent).toContain('🕘');

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
