import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { UiSidebar } from '../UiSidebar';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { useEditMetaStore } from '../../stores/EditMetaStore';
import type { Task } from '../../types';
import { buildColumnSettingsFromVisibleKeys } from '../../components/sidebar/sidebarColumnSettings';
import { getColumnDefinitions } from '../../components/sidebar/sidebarColumnCatalog';
import { InlineEditService } from '../../services/InlineEditService';
import { parseDateOnly } from '../../utils/dateOnly';
import { configureBusinessCalendar } from '../../utils/businessCalendar';
import { DatePlacementMode } from '../../types/constraints';
import { apiClient } from '../../api/client';

describe('UiSidebar Date Inline Edit Integration', () => {
    const taskId = 'test-task-1';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let saveSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fetchEditMetaSpy: any;

    afterEach(() => {
        configureBusinessCalendar(null);
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        configureBusinessCalendar(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        saveSpy = vi.spyOn(InlineEditService, 'saveTaskFields').mockResolvedValue(undefined as any);
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            i18n: {
                button_edit: 'Edit', field_start_date: 'Start Date', field_due_date: 'Due Date',
                label_due_date_before_start: 'Due date (%{selected}) must be on or after the current start date (%{limit}).',
                label_start_date_after_due: 'Start date (%{selected}) must be on or before the current due date (%{limit}).',
                label_date_range_working_day_hint: 'Selecting a non-working day moves the start date to the next working day and the due date to the previous working day.'
            },
            settings: { inline_edit_start_date: '1', inline_edit_due_date: '1' }
        };

        useUIStore.setState({
            visibleColumns: ['id', 'startDate', 'dueDate'],
            columnSettings: buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'startDate', 'dueDate']),
            datePlacementMode: DatePlacementMode.WorkingDays,
            notifications: [],
            activeInlineEdit: null
        });

        useTaskStore.setState({
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 600,
                rowHeight: 32
            },
            groupByProject: false,
            selectedTaskId: null,
            modifiedTaskIds: new Set()
        });
    });

    const setupTaskWithMeta = (editable: boolean) => {
        const task: Task = {
            id: taskId,
            subject: 'Test Date Inline Edit Affordance',
            startDate: parseDateOnly('2026-05-01')!,
            dueDate: parseDateOnly('2026-05-10')!,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 1,
            editable: true, // keep task general editable true, but toggle metadata fields
            rowIndex: 0,
            hasChildren: false
        };

        const metaPayload = {
            task: {
                id: taskId,
                subject: 'Test Date Inline Edit Affordance',
                assignedToId: null,
                statusId: 1,
                doneRatio: 0,
                dueDate: '2026-05-10',
                startDate: '2026-05-01',
                priorityId: 1,
                categoryId: null,
                estimatedHours: null,
                projectId: 1,
                trackerId: 1,
                fixedVersionId: null,
                lockVersion: 1
            },
            editable: {
                subject: true,
                assignedToId: true,
                statusId: true,
                doneRatio: true,
                due_date: editable,
                start_date: editable,
                dueDate: editable,
                startDate: editable,
                priorityId: true,
                categoryId: true,
                estimatedHours: true,
                projectId: true,
                trackerId: true,
                fixedVersionId: true,
                customFieldValues: true
            },
            options: {
                statuses: [],
                assignees: [],
                priorities: [],
                categories: [],
                projects: [],
                trackers: [],
                versions: [],
                customFields: []
            },
            customFieldValues: {}
        };

        fetchEditMetaSpy = vi.fn().mockResolvedValue(metaPayload);

        useTaskStore.getState().setTasks([task]);
        useEditMetaStore.setState({
            metaByTaskId: {
                [taskId]: metaPayload
            },
            fetchEditMeta: fetchEditMetaSpy,
            loadingByTaskId: {},
            error: null
        });
        return task;
    };

    it('starts inline editing on double click', async () => {
        setupTaskWithMeta(true);
        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-startDate`);
        await act(async () => {
            fireEvent.doubleClick(cell);
        });

        await screen.findByText('Today');
        await screen.findByText('Clear');
    });

    it('calls save with proper payload when selecting a date', async () => {
        setupTaskWithMeta(true);
        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-dueDate`);
        await act(async () => {
            fireEvent.doubleClick(cell);
        });

        const todayBtn = await screen.findByText('Today');
        await act(async () => {
            fireEvent.click(todayBtn);
        });

        await waitFor(() => {
            expect(saveSpy).toHaveBeenCalledTimes(1);
        });
        const callArgs = saveSpy.mock.calls[0][0];
        expect(callArgs.taskId).toBe(taskId);
        expect(callArgs.optimisticTaskUpdates.dueDate).toBeDefined();
        expect(callArgs.fields.due_date).toBeDefined();
    });

    it('calls save with empty string payload when clicking Clear button', async () => {
        setupTaskWithMeta(true);
        render(<UiSidebar />);

        const cell = await screen.findByTestId(`cell-${taskId}-dueDate`);
        await act(async () => {
            fireEvent.doubleClick(cell);
        });

        const clearBtn = await screen.findByText('Clear');
        await act(async () => {
            fireEvent.click(clearBtn);
        });

        await waitFor(() => {
            expect(saveSpy).toHaveBeenCalledTimes(1);
        });
        const callArgs = saveSpy.mock.calls[0][0];
        expect(callArgs.taskId).toBe(taskId);
        expect(callArgs.optimisticTaskUpdates.dueDate).toBeUndefined();
        expect(callArgs.fields.due_date).toBe('');
    });

    it.each([true, false])('explains a non-working Today and permits retry (autoSave=%s)', async (autoSave) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 12, 12));
        const task = setupTaskWithMeta(true);
        saveSpy.mockRestore();
        vi.spyOn(apiClient, 'updateTaskFields').mockImplementation(async () => {
            const current = useTaskStore.getState().allTasks[0];
            const revision = current.lockVersion + 1;
            return { status: 'ok', lockVersion: revision, entity: { ...current, lockVersion: revision } };
        });
        configureBusinessCalendar({
            default_calendar_id: 'test',
            calendars: { test: { id: 'test', name: 'Test', non_working_week_days: [0, 6],
                days: { '2026-10-12': { type: 'non_working', name: 'Holiday' } } } }
        });
        useTaskStore.setState({ autoSave, relations: [] });
        useTaskStore.getState().setTasks([{ ...task, projectId: '1', startDate: undefined, dueDate: undefined }]);
        render(<UiSidebar />);

        await act(async () => { fireEvent.doubleClick(screen.getByTestId(`cell-${taskId}-startDate`)); });
        await act(async () => { fireEvent.click(await screen.findByText('Today')); });
        expect(useTaskStore.getState().allTasks[0].startDate).toBe(parseDateOnly('2026-10-13'));
        await act(async () => { fireEvent.doubleClick(screen.getByTestId(`cell-${taskId}-dueDate`)); });
        await act(async () => { fireEvent.click(await screen.findByText('Today')); });

        expect(useUIStore.getState().notifications[0]?.message).toBe(
            'Due date (2026-10-12) must be on or after the current start date (2026-10-13). ' +
            'Selecting a non-working day moves the start date to the next working day and the due date to the previous working day.'
        );
        expect(useTaskStore.getState().allTasks[0].dueDate).toBeUndefined();
        const day = document.querySelector('.react-datepicker__day--013:not(.react-datepicker__day--outside-month)')!;
        await waitFor(() => expect(day).toHaveAttribute('aria-disabled', 'false'));
        await act(async () => { fireEvent.click(day); });
        expect(useTaskStore.getState().allTasks[0].dueDate).toBe(parseDateOnly('2026-10-13'));
        expect(useUIStore.getState().activeInlineEdit).toBeNull();
    });

    it.each([
        { mode: DatePlacementMode.WorkingDays, holiday: false },
        { mode: DatePlacementMode.CalendarDays, holiday: true }
    ])('accepts Today on both empty dates ($mode, holiday=$holiday)', async ({ mode, holiday }) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 12, 12));
        const task = setupTaskWithMeta(true);
        saveSpy.mockRestore();
        configureBusinessCalendar({
            default_calendar_id: 'test',
            calendars: { test: { id: 'test', name: 'Test', non_working_week_days: [0, 6],
                days: holiday ? { '2026-10-12': { type: 'non_working', name: 'Holiday' } } : {} } }
        });
        useUIStore.setState({ datePlacementMode: mode });
        useTaskStore.setState({ autoSave: false, relations: [] });
        useTaskStore.getState().setTasks([{ ...task, projectId: '1', startDate: undefined, dueDate: undefined }]);
        render(<UiSidebar />);
        for (const field of ['startDate', 'dueDate']) {
            await act(async () => { fireEvent.doubleClick(screen.getByTestId(`cell-${taskId}-${field}`)); });
            await act(async () => { fireEvent.click(await screen.findByText('Today')); });
        }
        expect(useTaskStore.getState().allTasks[0].startDate).toBe(parseDateOnly('2026-10-12'));
        expect(useTaskStore.getState().allTasks[0].dueDate).toBe(parseDateOnly('2026-10-12'));
        expect(useUIStore.getState().notifications).toEqual([]);
    });

    it.each([DatePlacementMode.WorkingDays, DatePlacementMode.CalendarDays])('explains a reversed start date without a holiday hint (%s)', async (mode) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 4, 11, 12));
        setupTaskWithMeta(true);
        useUIStore.setState({ datePlacementMode: mode });
        render(<UiSidebar />);
        await act(async () => { fireEvent.doubleClick(screen.getByTestId(`cell-${taskId}-startDate`)); });
        await act(async () => { fireEvent.click(await screen.findByText('Today')); });
        expect(useUIStore.getState().notifications[0]?.message).toBe(
            'Start date (2026-05-11) must be on or before the current due date (2026-05-10).'
        );
        expect(saveSpy).not.toHaveBeenCalled();
    });
});
