import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore, derivedRecalculationCounters, resetDerivedRecalculationCounters } from './TaskStore';
import type { Relation, Task } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { apiClient } from '../api/client';
import { taskMutationService } from '../services/taskMutationService';
import { useUIStore } from './UIStore';
import { AutoScheduleMoveMode, DatePlacementMode } from '../types/constraints';
import { loadLastUsedSharedQueryProjectState, loadLastUsedSharedQueryState } from '../utils/sharedQueryState';
import { configureBusinessCalendar } from '../utils/businessCalendar';
import { WorkloadLogicService } from '../services/WorkloadLogicService';
import { createReadContext } from './taskStore/stateContract';
import { parseDateOnly } from '../utils/dateOnly';
import { loadPreferences, saveDisplayPreferences } from '../utils/preferences';
import * as criticalPathCalculation from '../scheduling/criticalPath';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchData: vi.fn(),
        updateTask: vi.fn(),
        updateTaskFields: vi.fn()
    }
}));


const MONDAY = Date.UTC(2026, 0, 5);
const TUESDAY = Date.UTC(2026, 0, 6);
const WEDNESDAY = Date.UTC(2026, 0, 7);
const THURSDAY = Date.UTC(2026, 0, 8);
const FRIDAY = Date.UTC(2026, 0, 9);
const DAY = 24 * 60 * 60 * 1000;

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: 0,
    dueDate: 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const buildApiData = (tasks: Task[], relations: Relation[] = []) => ({
    tasks,
    relations,
    versions: [],
    filterOptions: { projects: [], assignees: [] },
    statuses: [],
    customFields: [],
    project: { id: 'p1', name: 'P1' },
    permissions: { editable: true, viewable: true, baselineEditable: true }
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('TaskStore viewport clamping', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('preserves physical parenthood through layout when children are filtered out', () => {
        const parent = buildTask({ id: 'parent', hasPhysicalChildren: true });
        useTaskStore.getState().applyApiData(buildApiData([parent]));

        expect(useTaskStore.getState().allTasks.find(task => task.id === parent.id)?.hasPhysicalChildren).toBe(true);
        expect(useTaskStore.getState().tasks.find(task => task.id === parent.id)).toMatchObject({
            hasChildren: false, hasPhysicalChildren: true
        });
    });

    it('updates calendar validation state from each accepted data response and clears it on recovery', () => {
        useTaskStore.getState().applyApiData({
            ...buildApiData([]),
            businessCalendar: {
                status: 'ok', validationStatus: 'stale',
                validationMessage: 'Last valid calendar remains active.',
                revision: 'accepted-revision', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: [],
                diagnostic: { code: 'INVALID_CSV', file: 'holiday.csv', line: 2, message: 'Invalid date.', value: 'bad' }
            }
        });
        expect(useTaskStore.getState().businessCalendarValidation).toMatchObject({
            status: 'stale', message: 'Last valid calendar remains active.',
            diagnostic: { file: 'holiday.csv', value: 'bad' }
        });

        useTaskStore.getState().applyApiData({
            ...buildApiData([]),
            businessCalendar: {
                status: 'ok', validationStatus: 'valid', revision: 'new-revision',
                defaultCalendarId: null, projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });
        expect(useTaskStore.getState().businessCalendarValidation).toEqual({
            status: 'valid', message: null, diagnostic: null
        });
    });

    it('updateViewport は scrollY を rowCount に合わせてクランプする', () => {
        const { updateViewport } = useTaskStore.getState();
        useTaskStore.setState({ rowCount: 10 });

        updateViewport({ scrollY: 999999 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(0); // If height > content, it clamps to 0?
        // Wait, if rowCount=10, height=600, rowHeight=32 -> content=320. 320 < 600. maxScroll=0.

        useTaskStore.setState({ rowCount: 100 }); // 3200px
        const BOTTOM_PADDING_PX = 40;
        const maxScroll2 = 100 * 32 + BOTTOM_PADDING_PX - 600; // 2640

        updateViewport({ scrollY: 5000 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(maxScroll2);
    });

    it('同じViewport値の更新と同じrowHeightの再設定をStore更新にしない', () => {
        const listener = vi.fn();
        const unsubscribe = useTaskStore.subscribe(listener);
        const viewport = useTaskStore.getState().viewport;

        useTaskStore.getState().updateViewport({ ...viewport });
        useTaskStore.getState().setRowHeight(viewport.rowHeight);

        expect(listener).not.toHaveBeenCalled();
        expect(useTaskStore.getState().viewport).toBe(viewport);

        unsubscribe();
    });
});

describe('TaskStore canonical mutation reconciliation', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('projects derived parent dates without writing them and settles from an unchanged canonical ancestor', async () => {
        const parent = buildTask({
            id: 'derived-parent', startDate: MONDAY, dueDate: FRIDAY, datesDerived: true, lockVersion: 4
        });
        const child = buildTask({
            id: 'visible-child', parentId: parent.id, startDate: TUESDAY, dueDate: WEDNESDAY, lockVersion: 2
        });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [
                { id: child.id, startDate: THURSDAY, dueDate: FRIDAY, lockVersion: 3 },
                { id: parent.id, startDate: MONDAY, dueDate: FRIDAY, datesDerived: true, lockVersion: 4 }
            ],
            revisions: { [child.id]: 3, [parent.id]: 4 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', { value: scheduleMutation, configurable: true, writable: true });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...parent }, { ...child, startDate: THURSDAY, dueDate: FRIDAY, lockVersion: 3 }
        ]));

        try {
            useTaskStore.setState({ autoSave: false });
            useTaskStore.getState().setTasks([parent, child]);
            useTaskStore.getState().updateTask(child.id, { startDate: THURSDAY, dueDate: FRIDAY });

            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([child.id]));
            expect(useTaskStore.getState().localTaskPatches[parent.id]).toEqual([
                expect.objectContaining({
                    projection: { startDate: THURSDAY, dueDate: FRIDAY },
                    mutationIntent: {}
                })
            ]);

            const failures = await useTaskStore.getState().saveChanges();

            expect(failures).toEqual(new Map());
            expect(scheduleMutation.mock.calls[0][0].map((change: { taskId: string }) => change.taskId)).toEqual([child.id]);
            expect(useTaskStore.getState().allTasks.find(task => task.id === parent.id)).toMatchObject({
                startDate: MONDAY, dueDate: FRIDAY, lockVersion: 4
            });
            expect(useTaskStore.getState().localTaskPatches[parent.id]).toBeUndefined();
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('keeps a newer parent projection when an older child schedule response arrives', async () => {
        const parent = buildTask({
            id: 'racing-derived-parent', startDate: MONDAY, dueDate: FRIDAY, datesDerived: true, lockVersion: 4
        });
        const firstChild = buildTask({
            id: 'first-child', parentId: parent.id, startDate: TUESDAY, dueDate: WEDNESDAY, lockVersion: 2
        });
        const secondChild = buildTask({
            id: 'second-child', parentId: parent.id, startDate: WEDNESDAY, dueDate: THURSDAY, lockVersion: 2
        });
        const firstResponse = deferred<Awaited<ReturnType<typeof apiClient.scheduleMutation>>>();
        const secondResponse = deferred<Awaited<ReturnType<typeof apiClient.scheduleMutation>>>();
        const scheduleMutation = vi.fn()
            .mockImplementationOnce(() => firstResponse.promise)
            .mockImplementationOnce(() => secondResponse.promise);
        Object.defineProperty(apiClient, 'scheduleMutation', { value: scheduleMutation, configurable: true, writable: true });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([parent, firstChild, secondChild]));

        try {
            useTaskStore.setState({ autoSave: false });
            useTaskStore.getState().setTasks([parent, firstChild, secondChild]);
            useTaskStore.getState().updateTask(firstChild.id, { startDate: THURSDAY, dueDate: FRIDAY });
            const saving = useTaskStore.getState().saveChanges();
            await vi.waitFor(() => expect(scheduleMutation).toHaveBeenCalledTimes(1));

            useTaskStore.getState().updateTask(secondChild.id, { startDate: TUESDAY, dueDate: THURSDAY });
            firstResponse.resolve({
                status: 'ok', operationId: 'first', entities: [
                    { id: firstChild.id, startDate: THURSDAY, dueDate: FRIDAY, lockVersion: 3 },
                    { id: parent.id, startDate: MONDAY, dueDate: FRIDAY, datesDerived: true, lockVersion: 4 }
                ], revisions: { [firstChild.id]: 3, [parent.id]: 4 }
            });
            await vi.waitFor(() => expect(scheduleMutation).toHaveBeenCalledTimes(2));

            expect(useTaskStore.getState().allTasks.find(task => task.id === parent.id)).toMatchObject({
                startDate: TUESDAY, dueDate: FRIDAY
            });
            expect(useTaskStore.getState().localTaskPatches[parent.id]).toHaveLength(2);

            secondResponse.resolve({
                status: 'ok', operationId: 'second', entities: [
                    { id: secondChild.id, startDate: TUESDAY, dueDate: THURSDAY, lockVersion: 3 },
                    { id: parent.id, startDate: MONDAY, dueDate: FRIDAY, datesDerived: true, lockVersion: 4 }
                ], revisions: { [secondChild.id]: 3, [parent.id]: 4 }
            });
            expect(await saving).toEqual(new Map());

            expect(useTaskStore.getState().allTasks.find(task => task.id === parent.id)).toMatchObject({
                startDate: MONDAY, dueDate: FRIDAY, lockVersion: 4
            });
            expect(useTaskStore.getState().localTaskPatches[parent.id]).toBeUndefined();
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('rejects direct date edits on derived parents while leaving other fields editable', () => {
        const parent = buildTask({ id: 'derived-parent-edit', datesDerived: true, subject: 'Parent' });
        useTaskStore.getState().setTasks([parent]);

        useTaskStore.getState().updateTask(parent.id, { startDate: TUESDAY, subject: 'Updated parent' });

        expect(useTaskStore.getState().allTasks[0]).toMatchObject({
            startDate: 0, subject: 'Updated parent'
        });
        expect(useTaskStore.getState().localTaskPatches[parent.id]).toEqual([
            expect.objectContaining({ mutationIntent: { subject: 'Updated parent' } })
        ]);
    });

    it('does not recalculate a derived parent from a child subject-only edit', () => {
        const parent = buildTask({
            id: 'derived-parent-subject-edit', startDate: MONDAY, dueDate: FRIDAY, datesDerived: true
        });
        const child = buildTask({
            id: 'subject-only-child', parentId: parent.id, startDate: TUESDAY, dueDate: WEDNESDAY
        });
        useTaskStore.getState().setTasks([parent, child]);

        useTaskStore.getState().updateTask(child.id, { subject: 'Changed child' });

        expect(useTaskStore.getState().allTasks.find(task => task.id === parent.id)).toMatchObject({
            startDate: MONDAY, dueDate: FRIDAY
        });
        expect(useTaskStore.getState().localTaskPatches[parent.id]).toBeUndefined();
    });

    it('keeps the server canonical value after settling the committed generation', () => {
        const original = buildTask({ id: 'canonical-task', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(original.id, { subject: 'local intent' });
        const generation = useTaskStore.getState().editGenerations[original.id];

        useTaskStore.getState().applyTaskMutationMetadata(original.id, {
            completeness: 'partial',
            entity: { id: original.id, subject: 'server normalized', lockVersion: 2 },
            revision: 2
        });
        useTaskStore.getState().commitTaskOperation(original.id, generation, 2);

        expect(useTaskStore.getState().allTasks.find(task => task.id === original.id)?.subject)
            .toBe('server normalized');
    });

    it('reapplies only a later local generation over the server canonical value', () => {
        const original = buildTask({ id: 'pending-task', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(original.id, { subject: 'first intent' });
        const committedGeneration = useTaskStore.getState().editGenerations[original.id];
        useTaskStore.getState().updateTask(original.id, { subject: 'later intent' });

        useTaskStore.getState().applyTaskMutationMetadata(original.id, {
            completeness: 'partial',
            entity: { id: original.id, subject: 'server normalized', lockVersion: 2 },
            revision: 2
        });
        useTaskStore.getState().commitTaskOperation(original.id, committedGeneration, 2);

        expect(useTaskStore.getState().allTasks.find(task => task.id === original.id)?.subject)
            .toBe('later intent');
        expect(useTaskStore.getState().localTaskPatches[original.id]).toHaveLength(1);
    });

    it('keeps a projection-only local change out of modified task ownership', () => {
        const original = buildTask({ id: 'projection-only', subject: 'persisted', statusId: 1 });
        useTaskStore.getState().setTasks([original]);

        useTaskStore.getState().updateTask(
            original.id,
            { subject: 'server projection', statusId: 2 },
            {}
        );

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === original.id)).toMatchObject({
            subject: 'server projection',
            statusId: 2
        });
        expect(state.localTaskPatches[original.id]).toEqual([
            expect.objectContaining({
                projection: { subject: 'server projection', statusId: 2 },
                mutationIntent: {}
            })
        ]);
        expect(state.modifiedTaskIds.has(original.id)).toBe(false);
    });

    it('rolls back failed Tracker Preview materialization while preserving a later generation', () => {
        const original = buildTask({
            id: 'tracker-preview',
            trackerId: 1,
            trackerName: 'Tracker A',
            statusId: 1,
            statusName: 'S1',
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { [original.id]: original },
                revisions: { [original.id]: original.lockVersion },
                context: null
            }
        });
        useTaskStore.getState().updateTask(
            original.id,
            { trackerId: 2, trackerName: 'Tracker B', statusId: 2, statusName: 'S2' },
            { trackerId: 2 }
        );
        const failedGeneration = useTaskStore.getState().editGenerations[original.id];
        useTaskStore.getState().updateTask(original.id, { subject: 'later local edit' });

        useTaskStore.getState().rollbackTaskOperation(original.id, failedGeneration);

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === original.id)).toMatchObject({
            trackerId: 1,
            trackerName: 'Tracker A',
            statusId: 1,
            statusName: 'S1',
            subject: 'later local edit'
        });
        expect(state.localTaskPatches[original.id]).toEqual([
            expect.objectContaining({ generation: failedGeneration + 1, mutationIntent: { subject: 'later local edit' } })
        ]);
        expect(state.modifiedTaskIds.has(original.id)).toBe(true);
    });

    it('manual save serializes the intended value when projection differs', async () => {
        const original = buildTask({ id: 'divergent-intent', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(
            original.id,
            { subject: 'server projection' },
            { subject: 'explicit intended value' }
        );
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 2 });

        await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: original.id, subject: 'server projection' }),
            expect.any(String),
            { subject: 'explicit intended value' }
        );
    });

    it('settles schedule-owned and residual fields independently in one manual save', async () => {
        const original = buildTask({ id: 'mixed-fields', subject: 'persisted', dueDate: TUESDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [{ id: original.id, dueDate: WEDNESDAY, lockVersion: 2 }],
            revisions: { [original.id]: 2 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            entity: { id: original.id, subject: 'local subject', lockVersion: 3 }
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...original, dueDate: WEDNESDAY, subject: 'local subject', lockVersion: 3 }
        ]));

        try {
            useTaskStore.getState().setTasks([original]);
            useTaskStore.getState().updateTask(original.id, { dueDate: WEDNESDAY, subject: 'local subject' });

            const failures = await useTaskStore.getState().saveChanges();

            expect(failures).toEqual(new Map());
            expect(scheduleMutation).toHaveBeenCalledTimes(1);
            expect(scheduleMutation.mock.calls[0][0][0]).toMatchObject({
                taskId: original.id,
                dueDate: WEDNESDAY
            });
            expect(apiClient.updateTask).toHaveBeenCalledWith(
                expect.objectContaining({ id: original.id, lockVersion: 2 }),
                expect.any(String),
                { subject: 'local subject' }
            );
            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
            expect(useTaskStore.getState().localTaskPatches[original.id]).toBeUndefined();
            expect(useTaskStore.getState().allTasks[0]).toMatchObject({
                dueDate: WEDNESDAY,
                subject: 'local subject',
                lockVersion: 3
            });
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('coalesces schedule resync and invalidation refresh after a mixed task save', async () => {
        const original = buildTask({ id: 'coalesced-refresh', subject: 'Before', dueDate: TUESDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [{ id: original.id, dueDate: WEDNESDAY, lockVersion: 2 }],
            revisions: { [original.id]: 2 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            entity: { id: original.id, subject: 'After', dueDate: WEDNESDAY, lockVersion: 3 },
            invalidatedEntityIds: ['related-task']
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...original, subject: 'After', dueDate: WEDNESDAY, lockVersion: 3 }
        ]));

        try {
            useTaskStore.getState().setTasks([original]);
            useTaskStore.getState().updateTask(original.id, { dueDate: WEDNESDAY, subject: 'After' });

            const failures = await useTaskStore.getState().saveChanges();

            expect(failures).toEqual(new Map());
            expect(scheduleMutation).toHaveBeenCalledTimes(1);
            expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
            expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
            expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
            expect(useTaskStore.getState().localTaskPatches[original.id]).toBeUndefined();
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('keeps the date placement mode captured by a manual edit after the preference changes', async () => {
        const original = buildTask({ id: 'captured-mode', dueDate: MONDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [{ id: original.id, dueDate: FRIDAY, lockVersion: 2 }],
            revisions: { [original.id]: 2 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });

        try {
            useTaskStore.getState().setTasks([original]);
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays });
            useTaskStore.getState().updateTask(original.id, { dueDate: FRIDAY });
            useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });

            expect(useTaskStore.getState().localTaskPatches[original.id]?.[0]).toEqual(
                expect.objectContaining({
                    mutationContext: { datePlacementMode: DatePlacementMode.CalendarDays }
                })
            );

            await useTaskStore.getState().saveChanges();

            expect(scheduleMutation).toHaveBeenCalledWith(
                [expect.objectContaining({ taskId: original.id, datePlacementMode: DatePlacementMode.CalendarDays })],
                expect.any(String)
            );
        } finally {
            useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('keeps working_days as the captured mode when the preference changes to calendar_days', async () => {
        const original = buildTask({ id: 'captured-working-mode', dueDate: MONDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'ok',
            entities: [{ id: original.id, dueDate: TUESDAY, lockVersion: 2 }],
            revisions: { [original.id]: 2 }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });

        try {
            useTaskStore.getState().setTasks([original]);
            useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
            useTaskStore.getState().updateTask(original.id, { dueDate: TUESDAY });
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays });

            await useTaskStore.getState().saveChanges();

            expect(scheduleMutation).toHaveBeenCalledWith(
                [expect.objectContaining({ taskId: original.id, datePlacementMode: DatePlacementMode.WorkingDays })],
                expect.any(String)
            );
            expect(scheduleMutation.mock.calls[0][2]).toBeUndefined();
        } finally {
            useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it.each([
        { derived: false, retry: false, priorManual: false },
        { derived: false, retry: true, priorManual: false },
        { derived: true, retry: false, priorManual: false },
        { derived: true, retry: true, priorManual: true }
    ].flatMap(scenario => [false, true].map(autoSave => ({ ...scenario, autoSave }))))('saves mixed task modes for selected external projects in one batch (dependency-derived=$derived, retry=$retry, prior-manual=$priorManual, auto-save=$autoSave)', async ({ derived, retry, priorManual, autoSave }) => {
        const friday = parseDateOnly('2027-01-01')!;
        const saturday = parseDateOnly('2027-01-02')!;
        const monday = parseDateOnly('2027-01-04')!;
        const originals = [
            buildTask({ id: 'A', projectId: 'external-project', startDate: friday, dueDate: friday, lockVersion: 1 }),
            buildTask({ id: 'B', projectId: 'external-project', startDate: friday, dueDate: friday, lockVersion: 3 })
        ];
        const previousUI = useUIStore.getState();
        const scheduleMutation = vi.fn().mockImplementation(async () => ({
            status: 'ok',
            entities: useTaskStore.getState().allTasks.map(task => ({ ...task, lockVersion: task.lockVersion + 1 })),
            revisions: { A: 2, B: 4 }
        }));
        if (retry) {
            scheduleMutation.mockImplementationOnce(async () => {
                useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
                throw new Error('response lost');
            });
        }
        Object.defineProperty(apiClient, 'scheduleMutation', { value: scheduleMutation, configurable: true });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => buildApiData(useTaskStore.getState().allTasks));
        if (retry) vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData(originals));
        configureBusinessCalendar({
            defaultCalendarId: 'weekdays',
            calendars: { weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} } }
        });

        try {
            useTaskStore.setState({
                autoSave,
                confirmedProjectScope: {
                    rootProjectId: 'opened-project', mode: 'member_all', selectionExplicit: true,
                    selectedProjectIds: ['opened-project', 'external-project'],
                    effectiveProjectIds: ['opened-project', 'external-project'], schedulingAllowed: false
                }
            });
            useTaskStore.getState().setTasks(originals);
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays, autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush });
            if (priorManual) useTaskStore.getState().updateTask('B', { startDate: saturday, dueDate: saturday });
            if (derived) useTaskStore.getState().setRelations([{ id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 }]);
            useTaskStore.getState().updateTask('A', { startDate: saturday, dueDate: saturday });
            if (!derived) {
                useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
                useTaskStore.getState().updateTask('B', { startDate: monday, dueDate: monday });
            }
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays });

            expect(await useTaskStore.getState().saveChanges()).toEqual(new Map());

            expect(scheduleMutation).toHaveBeenCalledTimes(retry ? 2 : 1);
            for (const call of scheduleMutation.mock.calls) {
                expect(call).toEqual([
                    [
                        expect.objectContaining({ taskId: 'A', startDate: saturday, dueDate: saturday, datePlacementMode: DatePlacementMode.CalendarDays }),
                        expect.objectContaining({ taskId: 'B', startDate: monday, dueDate: monday, datePlacementMode: DatePlacementMode.WorkingDays })
                    ],
                    expect.any(String)
                ]);
            }
        } finally {
            useTaskStore.setState({ confirmedProjectScope: null });
            useUIStore.setState(previousUI);
            configureBusinessCalendar(null);
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it.each([false, true])('keeps the latest date mode on local conflict retry (dependency-derived=%s)', async (derived) => {
        const friday = parseDateOnly('2027-01-01')!;
        const saturday = parseDateOnly('2027-01-02')!;
        const tasks = ['A', 'B'].map(id => buildTask({ id, startDate: friday, dueDate: friday, lockVersion: 1 }));
        const previousUI = useUIStore.getState();
        vi.mocked(apiClient.updateTaskFields).mockReset().mockResolvedValue({ status: 'ok', lockVersion: 3 });
        configureBusinessCalendar({
            defaultCalendarId: 'weekdays',
            calendars: { weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} } }
        });

        const schedule = vi.spyOn(taskMutationService, 'scheduleMutation').mockImplementation(async (_changes, resolution) => {
            const entities = tasks.map(task => ({ ...task, lockVersion: 2 }));
            return { status: 'ok', operationId: 'review', entities, revisions: { A: 2, B: 2 },
                ...(resolution?.preview ? { resolutionContext: { token: 'test', taskIds: ['A', 'B'], relations: useTaskStore.getState().relations } } : {}) };
        });
        try {
            useTaskStore.getState().setTasks(tasks);
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays, autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush });
            useTaskStore.getState().updateTask('B', { startDate: saturday, dueDate: saturday });
            if (derived) {
                useTaskStore.getState().setRelations([{ id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 }]);
                useTaskStore.getState().updateTask('A', { startDate: saturday, dueDate: saturday });
            }
            useTaskStore.getState().registerTaskConflict('B', 'Conflict', undefined, { ...tasks[1], lockVersion: 2 }, 2);
            useUIStore.setState({ datePlacementMode: derived ? DatePlacementMode.CalendarDays : DatePlacementMode.WorkingDays });

            await useTaskStore.getState().resolveTaskConflict('B', 'local');

            expect(apiClient.updateTaskFields).not.toHaveBeenCalled();
            await useTaskStore.getState().applyScheduleConflict('B');
            expect(schedule).toHaveBeenCalledTimes(2);
            expect(schedule.mock.calls[1][0]).toEqual([expect.objectContaining({
                taskId: 'B', startDate: derived ? parseDateOnly('2027-01-04') : saturday,
                dueDate: derived ? parseDateOnly('2027-01-04') : saturday,
                baseRevision: 2, datePlacementMode: derived ? DatePlacementMode.WorkingDays : DatePlacementMode.CalendarDays
            })]);
            expect(useTaskStore.getState().taskConflicts.B).toBeUndefined();
        } finally {
            schedule.mockRestore();
            useUIStore.setState(previousUI);
            configureBusinessCalendar(null);
        }
    });

    it('uses the latest date edit mode for the whole merged task interval, including an earlier start edit', async () => {
        const friday = parseDateOnly('2027-01-01')!;
        const saturday = parseDateOnly('2027-01-02')!;
        const monday = parseDateOnly('2027-01-04')!;
        const tuesday = parseDateOnly('2027-01-05')!;
        const original = buildTask({ id: 'merged-mode', startDate: friday, dueDate: monday, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({ status: 'ok', entities: [], revisions: {} });
        Object.defineProperty(apiClient, 'scheduleMutation', { value: scheduleMutation, configurable: true });
        const previousUI = useUIStore.getState();
        configureBusinessCalendar({
            defaultCalendarId: 'weekdays',
            calendars: { weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} } }
        });

        try {
            useTaskStore.getState().setTasks([original]);
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays });
            useTaskStore.getState().updateTask(original.id, { startDate: saturday });
            const firstPatch = useTaskStore.getState().localTaskPatches[original.id][0];
            expect(firstPatch.mutationIntent).toEqual({ startDate: saturday });
            useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
            useTaskStore.getState().updateTask(original.id, { dueDate: tuesday });
            expect(useTaskStore.getState().localTaskPatches[original.id][0]).toEqual(firstPatch);
            expect(firstPatch.mutationContext?.datePlacementMode).toBe(DatePlacementMode.CalendarDays);
            // A later date edit normalizes the whole interval; preference alone does not.
            useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays });
            useTaskStore.getState().updateTask(original.id, { subject: 'later non-date edit' });

            await useTaskStore.getState().saveChanges();

            expect(scheduleMutation).toHaveBeenCalledExactlyOnceWith([
                expect.objectContaining({
                    taskId: original.id, startDate: monday, dueDate: tuesday,
                    datePlacementMode: DatePlacementMode.WorkingDays
                })
            ], expect.any(String));
        } finally {
            useUIStore.setState(previousUI);
            configureBusinessCalendar(null);
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('keeps local schedule intent without creating task conflicts on a topology conflict', async () => {
        const tasks = [
            buildTask({ id: 'topology-A', dueDate: TUESDAY, lockVersion: 1 }),
            buildTask({ id: 'topology-B', dueDate: TUESDAY, lockVersion: 1 })
        ];
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            errors: ['The schedule topology changed while the operation was running.'],
            failure: {
                kind: 'conflict' as const,
                resourceRole: 'scope' as const,
                resourceType: 'schedule_scope',
                remoteAvailability: 'needs_refresh' as const
            }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData(tasks));

        try {
            useTaskStore.getState().setTasks(tasks);
            useTaskStore.getState().updateTask('topology-A', { dueDate: WEDNESDAY });
            useTaskStore.getState().updateTask('topology-B', { dueDate: WEDNESDAY });

            const failures = await useTaskStore.getState().saveChanges();
            const state = useTaskStore.getState();

            expect(failures).toEqual(new Map([
                ['topology-A', 'The schedule topology changed while the operation was running.'],
                ['topology-B', 'The schedule topology changed while the operation was running.']
            ]));
            expect(state.modifiedTaskIds).toEqual(new Set(['topology-A', 'topology-B']));
            expect(state.localTaskPatches['topology-A']).toHaveLength(1);
            expect(state.localTaskPatches['topology-B']).toHaveLength(1);
            expect(state.taskConflicts).toEqual({});
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });

    it('refreshes and retains a local schedule intent for a single-task topology conflict', async () => {
        const task = buildTask({ id: 'topology-single', dueDate: TUESDAY, lockVersion: 1 });
        const scheduleMutation = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            errors: ['The schedule topology changed while the operation was running.'],
            failure: {
                kind: 'conflict' as const,
                resourceRole: 'scope' as const,
                resourceType: 'schedule_scope',
                remoteAvailability: 'needs_refresh' as const
            }
        });
        Object.defineProperty(apiClient, 'scheduleMutation', {
            value: scheduleMutation,
            configurable: true,
            writable: true
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([task]));

        try {
            useTaskStore.getState().setTasks([task]);
            useTaskStore.getState().updateTask(task.id, { dueDate: WEDNESDAY });

            const failures = await useTaskStore.getState().saveChanges();
            await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
            const state = useTaskStore.getState();

            expect(failures).toEqual(new Map([
                [task.id, 'The schedule topology changed while the operation was running.']
            ]));
            expect(state.modifiedTaskIds).toEqual(new Set([task.id]));
            expect(state.localTaskPatches[task.id]).toEqual([
                expect.objectContaining({
                    projection: expect.objectContaining({ dueDate: WEDNESDAY }),
                    mutationIntent: expect.objectContaining({ dueDate: WEDNESDAY })
                })
            ]);
            expect(state.taskConflicts).toEqual({});
        } finally {
            delete (apiClient as unknown as { scheduleMutation?: unknown }).scheduleMutation;
        }
    });
});

describe('TaskStore Auto Save mode transitions', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('enables Auto Save immediately when no task changes are pending', async () => {
        const saveChanges = vi.fn();
        useTaskStore.setState({ autoSave: false, saveChanges });

        await useTaskStore.getState().requestAutoSaveChange(true);

        expect(saveChanges).not.toHaveBeenCalled();
        expect(useTaskStore.getState()).toMatchObject({ autoSave: true, autoSaveTransition: 'idle' });
    });

    it('saves pending changes before enabling Auto Save', async () => {
        const saveChanges = vi.fn(async () => {
            useTaskStore.setState({ modifiedTaskIds: new Set() });
            return new Map<string, string>();
        });
        useTaskStore.setState({ autoSave: false, modifiedTaskIds: new Set(['task-1']), saveChanges });

        const enabling = useTaskStore.getState().requestAutoSaveChange(true);

        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'enabling' });
        await enabling;

        expect(saveChanges).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState()).toMatchObject({ autoSave: true, autoSaveTransition: 'idle' });
    });

    it('keeps Manual Save and pending changes when enabling Auto Save cannot save them', async () => {
        const pending = new Set(['task-1']);
        const saveChanges = vi.fn(async () => new Map([['task-1', 'validation failed']]));
        useTaskStore.setState({ autoSave: false, modifiedTaskIds: pending, saveChanges });

        await useTaskStore.getState().requestAutoSaveChange(true);

        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'idle' });
        expect(useTaskStore.getState().modifiedTaskIds).toBe(pending);
    });

    it('keeps dirty drafts when saveChanges returns no failures without settling them', async () => {
        useTaskStore.setState({ autoSave: false });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'persisted' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'draft' });
        const patches = useTaskStore.getState().localTaskPatches;
        const saveChanges = vi.fn().mockResolvedValue(new Map());
        useTaskStore.setState({ saveChanges });

        await useTaskStore.getState().requestAutoSaveChange(true);

        expect(saveChanges).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'idle' });
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set(['task-1']));
        expect(useTaskStore.getState().localTaskPatches).toBe(patches);
    });

    it('notifies and resolves the enable action when saving throws, preserving the draft', async () => {
        useUIStore.setState({ notifications: [] });
        useTaskStore.setState({ autoSave: false });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'persisted' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'draft' });
        const patches = useTaskStore.getState().localTaskPatches;
        useTaskStore.setState({ saveChanges: vi.fn().mockRejectedValue(new Error('network error')) });

        await expect(useTaskStore.getState().requestAutoSaveChange(true)).resolves.toBeUndefined();

        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'idle' });
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set(['task-1']));
        expect(useTaskStore.getState().localTaskPatches).toBe(patches);
        expect(useUIStore.getState().notifications).toEqual([
            expect.objectContaining({ message: 'network error', type: 'error' })
        ]);
    });

    it('coalesces repeated Auto Save enable requests while saving pending changes', async () => {
        const saving = deferred<Map<string, string>>();
        const saveChanges = vi.fn(() => saving.promise);
        useTaskStore.setState({ autoSave: false, modifiedTaskIds: new Set(['task-1']), saveChanges });

        const first = useTaskStore.getState().requestAutoSaveChange(true);
        const second = useTaskStore.getState().requestAutoSaveChange(true);
        const third = useTaskStore.getState().requestAutoSaveChange(true);

        expect(saveChanges).toHaveBeenCalledTimes(1);
        useTaskStore.setState({ modifiedTaskIds: new Set() });
        saving.resolve(new Map());
        await Promise.all([first, second, third]);

        expect(useTaskStore.getState()).toMatchObject({ autoSave: true, autoSaveTransition: 'idle' });
    });

    it('disables Auto Save immediately without cancelling a pending mutation', async () => {
        const response = deferred<Awaited<ReturnType<typeof apiClient.updateTask>>>();
        vi.mocked(apiClient.updateTask).mockClear().mockReturnValueOnce(response.promise);
        useTaskStore.setState({ autoSave: true });
        useTaskStore.getState().setTasks([buildTask({ id: 'pending-off', subject: 'persisted', lockVersion: 1 })]);
        useTaskStore.getState().updateTask('pending-off', { subject: 'draft' });
        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        let settled = false;
        void saving.then(() => { settled = true; });

        await useTaskStore.getState().requestAutoSaveChange(false);

        expect(settled).toBe(false);
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set(['pending-off']));
        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'idle' });
        response.resolve({ status: 'ok', lockVersion: 2, entity: { id: 'pending-off', subject: 'draft', lockVersion: 2 } });
        await expect(saving).resolves.toEqual(new Map());
        expect(useTaskStore.getState().modifiedTaskIds.size).toBe(0);
        expect(useTaskStore.getState().localTaskPatches['pending-off'] ?? []).toEqual([]);
        expect(useTaskStore.getState().allTasks[0]).toMatchObject({ subject: 'draft', lockVersion: 2 });
        expect(useTaskStore.getState()).toMatchObject({ autoSave: false, autoSaveTransition: 'idle' });
    });
});

describe('TaskStore bar operation rollback', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('restores the task and clears its optimistic patch after a terminal failure', () => {
        const original = buildTask({
            id: 'bar-task',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0].startDate).toBe(WEDNESDAY);
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');

        useTaskStore.getState().rollbackBarOperation(operationId);

        const state = useTaskStore.getState();
        expect(state.allTasks[0]).toMatchObject(original);
        expect(state.modifiedTaskIds).not.toContain('bar-task');
        expect(state.localTaskPatches['bar-task']).toBeUndefined();
    });

    it('does not rollback a later edit owned by a newer generation', () => {
        const original = buildTask({
            id: 'bar-task',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('bar-task', {
            startDate: FRIDAY,
            dueDate: FRIDAY
        });

        useTaskStore.getState().rollbackBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0].startDate).toBe(FRIDAY);
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');
    });

    it('rolls back only the bar fields when a later edit changes another field', () => {
        const original = buildTask({
            id: 'bar-task',
            subject: 'original',
            startDate: MONDAY,
            dueDate: TUESDAY,
            lockVersion: 4
        });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('bar-task', {
            startDate: WEDNESDAY,
            dueDate: THURSDAY
        });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('bar-task', { subject: 'later edit' });

        useTaskStore.getState().rollbackBarOperation(operationId);

        expect(useTaskStore.getState().allTasks[0]).toMatchObject({
            subject: 'later edit',
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('bar-task');
    });

    it('keeps a later bar operation outside the earlier operation baseline', () => {
        const taskA = buildTask({ id: 'bar-a', startDate: MONDAY, dueDate: TUESDAY });
        const taskB = buildTask({ id: 'bar-b', startDate: MONDAY, dueDate: TUESDAY });
        useTaskStore.setState({ allTasks: [taskA, taskB], tasks: [taskA, taskB] });

        const firstOperation = useTaskStore.getState().beginBarOperation('bar-a');
        useTaskStore.getState().updateTask('bar-a', { dueDate: WEDNESDAY });
        useTaskStore.getState().endBarOperation(firstOperation);

        const secondOperation = useTaskStore.getState().beginBarOperation('bar-b');
        useTaskStore.getState().updateTask('bar-b', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(secondOperation);

        useTaskStore.getState().rollbackBarOperation(firstOperation);

        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-a')?.dueDate).toBe(TUESDAY);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-b')?.dueDate).toBe(THURSDAY);
    });

    it('does not let an older save callback complete a newer bar operation', () => {
        const original = buildTask({ id: 'bar-task', startDate: MONDAY, dueDate: TUESDAY });
        useTaskStore.setState({ allTasks: [original], tasks: [original] });

        const olderOperation = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: WEDNESDAY });
        useTaskStore.getState().endBarOperation(olderOperation);
        const olderGeneration = useTaskStore.getState().barOperations[olderOperation].entityGenerations['bar-task'];

        const newerOperation = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(newerOperation);
        const newerGeneration = useTaskStore.getState().barOperations[newerOperation].entityGenerations['bar-task'];

        expect(newerGeneration).toBeGreaterThan(olderGeneration);
        useTaskStore.getState().completeBarOperationTask('bar-task', olderGeneration);

        expect(useTaskStore.getState().barOperations[olderOperation]).toBeUndefined();
        expect(useTaskStore.getState().barOperations[newerOperation]).toBeDefined();
    });
});

describe('TaskStore zoom behavior', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setZoomLevel は表示範囲の中央を維持する', () => {
        const { setZoomLevel } = useTaskStore.getState();
        const initialViewport = useTaskStore.getState().viewport;
        const initialScale = ZOOM_SCALES[1];
        useTaskStore.setState({
            viewport: {
                ...initialViewport,
                startDate: 1000,
                scrollX: 500, // visibleStart = 1000 + 500/scale
                scale: initialScale
            }
        });

        const expectedCenter = 1000 + (500 + initialViewport.width / 2) / initialScale;

        setZoomLevel(2); // Zoom in

        const newViewport = useTaskStore.getState().viewport;
        const newScale = ZOOM_SCALES[2];
        const newCenter = newViewport.startDate + (newViewport.scrollX + newViewport.width / 2) / newScale;

        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });

    it('setViewMode は表示範囲の中央を維持する', () => {
        const { setViewMode } = useTaskStore.getState();
        // Start at Week (zoom 1)
        const ONE_DAY = 24 * 60 * 60 * 1000;
        useTaskStore.setState({
            viewMode: 'Week',
            zoomLevel: 1,
            viewport: {
                ...useTaskStore.getState().viewport,
                startDate: 0,
                scrollX: 1600,
                scale: ZOOM_SCALES[1],
                width: 800,
                height: 600
            },
            allTasks: [
                buildTask({ id: 'range', startDate: 0, dueDate: ONE_DAY * 800 })
            ]
        });
        const initialViewport = useTaskStore.getState().viewport;
        const expectedCenter = initialViewport.startDate + (1600 + initialViewport.width / 2) / ZOOM_SCALES[1];

        // Switch to Month (zoom 0)
        setViewMode('Month');

        const { viewMode, zoomLevel, viewport } = useTaskStore.getState();
        const newCenter = viewport.startDate + (viewport.scrollX + viewport.width / 2) / ZOOM_SCALES[0];
        expect(viewMode).toBe('Month');
        expect(zoomLevel).toBe(0);
        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });

    it('setZoomLevel はタスク範囲が未定でも中央を維持する', () => {
        const { setZoomLevel } = useTaskStore.getState();
        useTaskStore.setState({
            allTasks: [],
            viewport: {
                ...useTaskStore.getState().viewport,
                startDate: 1000,
                scrollX: 500,
                scale: ZOOM_SCALES[0]
            }
        });

        const initialViewport = useTaskStore.getState().viewport;
        const expectedCenter = 1000 + (500 + initialViewport.width / 2) / ZOOM_SCALES[0];

        setZoomLevel(2);

        const newViewport = useTaskStore.getState().viewport;
        const newCenter = newViewport.startDate + (newViewport.scrollX + newViewport.width / 2) / ZOOM_SCALES[2];

        expect(newCenter).toBeCloseTo(expectedCenter, 5);
    });
});

describe('TaskStore assignee filter', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setSelectedAssigneeIds はタスクをフィルタリングする', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task 2', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task 3', assignedToId: undefined, assignedToName: 'None' }),
        ];

        const { setTasks, setSelectedAssigneeIds } = useTaskStore.getState();
        setTasks(mockTasks);

        // Filter by User A
        setSelectedAssigneeIds([10]);
        expect(useTaskStore.getState().tasks.length).toBe(1);
        expect(useTaskStore.getState().tasks[0].id).toBe('1');

        // Filter by User A and None
        setSelectedAssigneeIds([10, null]);
        expect(useTaskStore.getState().tasks.length).toBe(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toContain('1');
        expect(useTaskStore.getState().tasks.map(t => t.id)).toContain('3');

        // Clear filter
        setSelectedAssigneeIds([]);
        expect(useTaskStore.getState().tasks.length).toBe(3);
    });

    it('setGroupByAssignee は担当者ヘッダーでグルーピングする', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task 2', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task 3', assignedToId: 10, assignedToName: 'User A' })
        ];

        const { setTasks, setGroupByAssignee } = useTaskStore.getState();
        setTasks(mockTasks);
        setGroupByAssignee(true);

        const rows = useTaskStore.getState().layoutRows;
        const headerRows = rows.filter((row) => row.type === 'header');

        expect(useTaskStore.getState().groupByAssignee).toBe(true);
        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(headerRows.length).toBe(2);
        expect(headerRows.every((row) => row.type === 'header' && row.groupKind === 'assignee')).toBe(true);
    });

    it('setSelectedAssigneeIds は last-used shared query state を保存する', () => {
        const mockTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task 1', assignedToId: 10, assignedToName: 'User A' })
        ];

        const { setTasks, setSelectedAssigneeIds } = useTaskStore.getState();
        setTasks(mockTasks);
        setSelectedAssigneeIds([10]);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            selectedAssigneeIds: [10]
        });
    });
});

describe('TaskStore tracker filter', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([]));
    });

    it('filters tasks by tracker and preserves the other selections', () => {
        const { setTasks, setSelectedTrackerIds } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'bug', trackerId: 3 }),
            buildTask({ id: 'feature', trackerId: 8 }),
            buildTask({ id: 'unknown', trackerId: undefined })
        ]);
        useTaskStore.setState({ selectedStatusIds: [2] });

        setSelectedTrackerIds([3]);

        expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(['bug']);
        expect(useTaskStore.getState().selectedStatusIds).toEqual([2]);
        expect(useTaskStore.getState().queryContext.overrides).toEqual({
            tracker: { mode: 'subset', values: [3] }
        });
    });
});

describe('TaskStore shared query persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('does not persist an unspecified Canvas Project scope', () => {
        useTaskStore.getState().applyResolvedQueryState({});

        expect(loadLastUsedSharedQueryState(1)).toEqual({ groupBy: null });
        expect(new URL(window.location.href).searchParams.has('canvas_project_ids[]')).toBe(false);
    });

    it('persists an explicitly empty Canvas Project scope', () => {
        useTaskStore.getState().setSelectedProjectIds([]);

        expect(useTaskStore.getState().projectSelectionExplicit).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            canvasProjectIds: []
        });
        expect(new URL(window.location.href).searchParams.get('canvas_project_ids[]')).toBe('none');
    });

    it('applyResolvedQueryState は query_id と shared state を保存する', () => {
        useTaskStore.getState().applyResolvedQueryState({
            queryId: 12,
            selectedStatusIds: [1, 2],
            groupBy: 'assignee',
            showSubprojects: false
        });

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1, 2],
            groupBy: 'assignee',
            showSubprojects: false
        });
    });

    it('applySavedQuery replaces Redmine query overrides while preserving Canvas project scope', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                queryId: 12,
                groupBy: 'assignee'
            }
        });

        useTaskStore.getState().setGroupByProject(true);
        useTaskStore.setState({
            queryContext: {
                baseQueryId: 7,
                overrides: {
                    assignee: { mode: 'subset', values: [7] }
                }
            },
            isQueryModified: true
        });
        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: { queryId: 12 },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(useTaskStore.getState().queryContext).toEqual({
            baseQueryId: 12,
            overrides: {}
        });
        expect(useTaskStore.getState().isQueryModified).toBe(false);
        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'assignee'
        });
    });

    it('applySavedQuery preserves member project candidates when the filter is enabled', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'member-project', name: 'Member project' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12 }
        });
        useTaskStore.setState({ memberProjectsOnly: true });

        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: {
                queryId: 12,
                memberProjectsOnly: true
            },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().filterOptions.projects).toEqual([
            { id: 'member-project', name: 'Member project' }
        ]);
        expect(useTaskStore.getState().memberProjectsOnly).toBe(true);
    });

    it('setGroupByProject preserves showSubprojects when enabling project grouping', () => {
        useTaskStore.setState({ showSubprojects: false });

        useTaskStore.getState().setGroupByProject(true);

        expect(useTaskStore.getState().groupByProject).toBe(true);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
        expect(useTaskStore.getState().explicitGroupByOverride).toBe('project');
        expect(useTaskStore.getState().showSubprojects).toBe(false);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            showSubprojects: false
        });
    });

    it('setGroupByProject preserves showSubprojects when disabling project grouping', () => {
        useTaskStore.setState({
            groupByProject: true,
            groupByAssignee: false,
            showSubprojects: true
        });

        useTaskStore.getState().setGroupByProject(false);

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
        expect(useTaskStore.getState().showSubprojects).toBe(true);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null
        });
    });

    it('applySavedQuery sends the saved query with the independent Canvas project scope', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                queryId: 12,
                selectedStatusIds: [3]
            }
        });
        useTaskStore.setState({
            selectedStatusIds: [1, 2],
            selectedAssigneeIds: [7],
            selectedProjectIds: ['p1'],
            projectSelectionExplicit: true,
            selectedVersionIds: ['v1']
        });

        await useTaskStore.getState().applySavedQuery(12);

        expect(apiClient.fetchData).toHaveBeenCalledWith({
            query: {
                queryId: 12,
                canvasProjectIds: ['p1']
            },
            queryContext: { baseQueryId: 12, overrides: {} }
        });
        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(useTaskStore.getState().selectedStatusIds).toEqual([3]);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [3],
            groupBy: null,
            canvasProjectIds: ['p1']
        });
    });

    it('does not restore the previous Canvas grouping when a saved query has no group_by', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12, groupBy: null }
        });
        useTaskStore.setState({ groupByProject: true, groupByAssignee: false });

        await useTaskStore.getState().applySavedQuery(12);

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
    });

    it('keeps an explicit group_by override ahead of a server initial-state default', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            ...buildApiData([]),
            initialState: { groupBy: 'project' }
        });
        useTaskStore.setState({
            explicitGroupByOverride: null,
            groupByProject: false,
            groupByAssignee: false
        });

        await useTaskStore.getState().refreshData();

        expect(useTaskStore.getState().groupByProject).toBe(false);
        expect(useTaskStore.getState().groupByAssignee).toBe(false);
    });

    it('preserves Canvas showSubprojects when a saved query is applied', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: { queryId: 12, groupBy: 'project' }
        });
        useTaskStore.setState({ showSubprojects: false, selectedProjectIds: ['p1', 'p2'], projectSelectionExplicit: true });

        await useTaskStore.getState().applySavedQuery(12);

        expect(useTaskStore.getState().showSubprojects).toBe(false);
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
    });

    it('setMemberProjectsOnly refreshes data without pruning hidden selected projects or sharing the UI flag', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Alpha' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                memberProjectsOnly: true,
                canvasProjectIds: ['p1', 'p2']
            }
        });

        await useTaskStore.getState().setMemberProjectsOnly(true);

        expect(apiClient.fetchData).toHaveBeenCalled();
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null,
            canvasProjectIds: ['p1', 'p2']
        });
    });
});

describe('TaskStore member project candidate lifecycle', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useTaskStore.setState({ currentProjectId: 'p1', memberProjectsOnly: false });
        localStorage.clear();
        saveDisplayPreferences({ memberProjectsOnly: false }, 'p1');
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('uses normalized server selection and parks external IDs when switching off', () => {
        useTaskStore.setState({ selectedProjectIds: ['p1', 'p2', 'denied'], projectSelectionExplicit: true, memberProjectsOnly: true });
        useTaskStore.getState().applyApiData({
            ...buildApiData([]),
            projectScope: {
                rootProjectId: 'p1', mode: 'member_all', selectionExplicit: true,
                selectedProjectIds: ['p1', 'p2'], effectiveProjectIds: ['p1', 'p2']
            }
        });
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);

        useTaskStore.getState().applyApiData({
            ...buildApiData([]),
            projectScope: {
                rootProjectId: 'p1', mode: 'current_tree', selectionExplicit: true,
                selectedProjectIds: ['p1'], effectiveProjectIds: ['p1']
            }
        });
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1']);
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual(['p2']);
        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
    });

    it('restores checked external projects when member projects are shown again', async () => {
        const scopedResponse = (mode: 'member_all' | 'current_tree', selectedProjectIds: string[]) => ({
            ...buildApiData([]),
            filterOptions: {
                projects: selectedProjectIds.map((id) => ({ id, name: id })), assignees: []
            },
            projectScope: {
                rootProjectId: 'p1', mode, selectionExplicit: true,
                selectedProjectIds, effectiveProjectIds: selectedProjectIds
            }
        });
        useTaskStore.getState().applyApiData(scopedResponse('member_all', ['p1', 'p2']));

        vi.mocked(apiClient.fetchData)
            .mockResolvedValueOnce(scopedResponse('current_tree', ['p1']))
            .mockResolvedValueOnce(scopedResponse('current_tree', ['p1']))
            .mockResolvedValueOnce(scopedResponse('member_all', ['p1', 'p2']));

        await useTaskStore.getState().setMemberProjectsOnly(false);
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1']);
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual(['p2']);
        expect(loadLastUsedSharedQueryProjectState()?.scopeState).toMatchObject({
            canvasProjectIds: ['p1'], inactiveExternalProjectIds: ['p2']
        });

        await useTaskStore.getState().refreshData();
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual(['p2']);

        await useTaskStore.getState().setMemberProjectsOnly(true);
        expect(apiClient.fetchData).toHaveBeenLastCalledWith(expect.objectContaining({
            query: expect.objectContaining({ memberProjectsOnly: true, canvasProjectIds: ['p1', 'p2'] })
        }));
        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'p2']);
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual([]);
        expect(loadLastUsedSharedQueryProjectState()?.scopeState.inactiveExternalProjectIds).toBeUndefined();
    });

    it.each([{ ids: [] as string[] }, { ids: ['p1'] }])('discards parked projects after an explicit selection change to $ids', async ({ ids }) => {
        const scopedResponse = (mode: 'member_all' | 'current_tree', selectedProjectIds: string[]) => ({
            ...buildApiData([]),
            projectScope: {
                rootProjectId: 'p1', mode, selectionExplicit: true,
                selectedProjectIds, effectiveProjectIds: selectedProjectIds
            }
        });
        useTaskStore.getState().applyApiData(scopedResponse('member_all', ['p1', 'p2']));
        vi.mocked(apiClient.fetchData).mockResolvedValue(scopedResponse('current_tree', ['p1']));
        await useTaskStore.getState().setMemberProjectsOnly(false);
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual(['p2']);

        useTaskStore.getState().setSelectedProjectIds(ids);
        expect(useTaskStore.getState().inactiveExternalProjectIds).toEqual([]);
        vi.mocked(apiClient.fetchData).mockResolvedValue(scopedResponse('current_tree', ids));
        await useTaskStore.getState().refreshData();
        vi.mocked(apiClient.fetchData).mockResolvedValue(scopedResponse('member_all', ids));
        await useTaskStore.getState().setMemberProjectsOnly(true);

        expect(apiClient.fetchData).toHaveBeenLastCalledWith(expect.objectContaining({
            query: expect.objectContaining({ memberProjectsOnly: true, canvasProjectIds: ids })
        }));
        expect(useTaskStore.getState().selectedProjectIds).not.toContain('p2');
        expect(loadLastUsedSharedQueryProjectState()?.scopeState.inactiveExternalProjectIds).toBeUndefined();
    });

    it('keeps an implicit server scope out of the shared project selection', () => {
        useTaskStore.setState({ selectedProjectIds: ['stale'], projectSelectionExplicit: true });
        useTaskStore.getState().applyApiData({
            ...buildApiData([]),
            projectScope: {
                rootProjectId: 'p1', mode: 'current_tree', selectionExplicit: false,
                selectedProjectIds: [], effectiveProjectIds: ['p1']
            }
        });
        expect(useTaskStore.getState().selectedProjectIds).toEqual([]);
        expect(useTaskStore.getState().projectSelectionExplicit).toBe(false);
        expect(loadLastUsedSharedQueryState('p1') ?? {}).not.toHaveProperty('canvasProjectIds');
    });

    it('commits and persists the mode together with the latest candidates after success', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(request.promise);
        const operation = useTaskStore.getState().setMemberProjectsOnly(true);

        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(false);
        expect(apiClient.fetchData).toHaveBeenCalledWith(expect.objectContaining({
            query: expect.objectContaining({ memberProjectsOnly: true })
        }));

        request.resolve(buildApiData([]));
        await operation;
        expect(useTaskStore.getState().memberProjectsOnly).toBe(true);
        expect(useTaskStore.getState().filterOptions.projects).toEqual([]);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(true);
        expect(loadLastUsedSharedQueryState() ?? {}).not.toHaveProperty('memberProjectsOnly');
    });

    it('keeps the confirmed mode and candidates on failure and permits retry', async () => {
        const previous = { projects: [{ id: 'p1', name: 'Project' }], assignees: [] };
        useTaskStore.setState({ filterOptions: previous });
        vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('offline'));

        await expect(useTaskStore.getState().setMemberProjectsOnly(true)).rejects.toThrow('offline');
        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
        expect(useTaskStore.getState().filterOptions).toEqual(previous);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(false);
        expect(useTaskStore.getState().dataReadStatus).toBe('error');

        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([]));
        await useTaskStore.getState().setMemberProjectsOnly(true);
        expect(useTaskStore.getState().memberProjectsOnly).toBe(true);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(true);
    });

    it.each(['success', 'failure'] as const)('ignores stale switch %s while a reverse switch is loading', async (result) => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const firstOperation = useTaskStore.getState().setMemberProjectsOnly(true);
        const secondOperation = useTaskStore.getState().setMemberProjectsOnly(false);

        if (result === 'success') first.resolve(buildApiData([]));
        else first.reject(new Error('stale failure'));
        await firstOperation;
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');
        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(false);

        second.resolve(buildApiData([]));
        await secondOperation;
        expect(useTaskStore.getState().dataReadStatus).toBe('ready');
        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
    });

    it.each(['success', 'failure'] as const)('ignores stale switch %s after a filter refresh succeeds', async (result) => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const filtered = buildApiData([buildTask({ id: 'filtered', assignedToId: 10, projectId: 'p1' })]);
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(first.promise).mockResolvedValueOnce(filtered);
        const operation = useTaskStore.getState().setMemberProjectsOnly(true);
        useTaskStore.getState().setSelectedAssigneeIds([10]);
        await vi.waitFor(() => expect(useTaskStore.getState().dataReadStatus).toBe('ready'));

        if (result === 'success') first.resolve(buildApiData([]));
        else first.reject(new Error('stale failure'));
        await operation;
        expect(useTaskStore.getState().allTasks).toEqual(filtered.tasks);
        expect(useTaskStore.getState().memberProjectsOnly).toBe(false);
        expect(loadPreferences('p1').memberProjectsOnly).toBe(false);
    });
});

describe('TaskStore version layout exclusivity', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('turning on version headers disables dependency organization', () => {
        useTaskStore.setState({ organizeByDependency: true, showVersions: false });

        useTaskStore.getState().setShowVersions(true);

        expect(useTaskStore.getState().showVersions).toBe(true);
        expect(useTaskStore.getState().organizeByDependency).toBe(false);
    });

    it('turning on dependency organization disables version headers', () => {
        useTaskStore.setState({ organizeByDependency: false, showVersions: true });

        useTaskStore.getState().setOrganizeByDependency(true);

        expect(useTaskStore.getState().organizeByDependency).toBe(true);
        expect(useTaskStore.getState().showVersions).toBe(false);
    });
});

describe('TaskStore API data application', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    vi.mocked(apiClient.fetchData).mockReset();
  });

  it('preserves user-owned hidden columns when mutation refresh reapplies query initial state', () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);

    useTaskStore.getState().applyApiData({
      ...buildApiData([]),
      initialState: { visibleColumns: ['id', 'subject', 'status'] }
    });

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('user');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('restores preferences at a saved-query boundary when query columns disappear', () => {
    const preferenceState = useUIStore.getInitialState();
    const initialLoadContext = createReadContext({
      generation: 1,
      projectId: 'p1',
      query: { visibleColumns: ['status', 'subject'] },
      scope: {},
      purpose: 'initial_load'
    });
    const savedQueryContext = createReadContext({
      generation: 2,
      projectId: 'p1',
      query: { queryId: 12 },
      scope: {},
      purpose: 'saved_query'
    });

    // Simulate useInitialGanttData applying URL/query columns first
    useUIStore.getState().applyQueryVisibleColumns(['status', 'subject']);

    useTaskStore.getState().applyApiData({
      ...buildApiData([]),
      initialState: { visibleColumns: ['status', 'subject'] }
    }, initialLoadContext);

    let uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['status', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['status', 'subject']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);

    useTaskStore.getState().applyApiData(
      { ...buildApiData([]), initialState: {} },
      savedQueryContext
    );

    uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(preferenceState.visibleColumns);
    expect(uiState.columnSettings).toEqual(preferenceState.columnSettings);
    expect(uiState.columnStateSource).toBe('preference');
    expect(uiState.columnsExplicitInQuery).toBe(false);
  });

  it('preserves query-owned columns when a regular refresh omits column state', async () => {
    useUIStore.getState().applyQueryVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: {}
    });

    await useTaskStore.getState().refreshData();

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('applies explicit saved-query columns at the query boundary after a user change', async () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: { queryId: 12, visibleColumns: ['status'] }
    });

    await useTaskStore.getState().applySavedQuery(12);

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['status']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['status']);
    expect(uiState.columnStateSource).toBe('query');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('preserves user-owned columns when saved-query response omits column state', async () => {
    useUIStore.getState().setVisibleColumns(['id', 'subject']);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: { queryId: 12 }
    });

    await useTaskStore.getState().applySavedQuery(12);

    const uiState = useUIStore.getState();
    expect(uiState.visibleColumns).toEqual(['id', 'subject']);
    expect(uiState.columnSettings.filter((column) => column.visible).map((column) => column.key))
      .toEqual(['id', 'subject']);
    expect(uiState.columnStateSource).toBe('user');
    expect(uiState.columnsExplicitInQuery).toBe(true);
  });

  it('restores preferences when clearing query-owned saved-query columns', async () => {
    const preferenceState = useUIStore.getInitialState();
    useUIStore.getState().applyQueryVisibleColumns(['status', 'subject']);
    useTaskStore.getState().restoreActiveQueryId(12);
    vi.mocked(apiClient.fetchData).mockResolvedValue({
      ...buildApiData([]),
      initialState: {}
    });

    await useTaskStore.getState().clearSavedQuery();

    const uiState = useUIStore.getState();
    expect(useTaskStore.getState().activeQueryId).toBeNull();
    expect(uiState.visibleColumns).toEqual(preferenceState.visibleColumns);
    expect(uiState.columnSettings).toEqual(preferenceState.columnSettings);
    expect(uiState.columnStateSource).toBe('preference');
    expect(uiState.columnsExplicitInQuery).toBe(false);
  });

  it('refreshData reports loading and applies API data with one final state update', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Project 1' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                groupBy: 'project',
                selectedProjectIds: ['p1']
            }
        });
        let notifications = 0;
        const unsubscribe = useTaskStore.subscribe(() => {
            notifications += 1;
        });

        await useTaskStore.getState().refreshData();
        unsubscribe();

        expect(notifications).toBe(2);
        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['t1']);
    });

    it('does not present a failed refresh as ready data', async () => {
        let rejectRequest!: (error: Error) => void;
        vi.mocked(apiClient.fetchData).mockImplementation(() => new Promise<Awaited<ReturnType<typeof apiClient.fetchData>>>((_, reject) => { rejectRequest = reject; }));
        useTaskStore.setState({ allTasks: [buildTask({ id: 'old' })], initialDataLoaded: true, dataReadStatus: 'ready' });
        const request = useTaskStore.getState().refreshData();
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');
        rejectRequest(new Error('offline'));
        await expect(request).rejects.toThrow('offline');
        expect(useTaskStore.getState().dataReadStatus).toBe('error');
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['old']);
    });

    it('settles a superseded refresh after a local edit without losing the draft', async () => {
        const original = buildTask({ id: '1', subject: 'Server' });
        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([original]));
        await useTaskStore.getState().refreshData();

        const delayed = deferred<Awaited<ReturnType<typeof apiClient.fetchData>>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(delayed.promise);
        const refresh = useTaskStore.getState().refreshData();
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');

        useTaskStore.getState().updateTask('1', { subject: 'Draft' });
        delayed.resolve(buildApiData([{ ...original, subject: 'Stale response' }]));
        await expect(refresh).resolves.toEqual(expect.objectContaining({ status: 'superseded' }));

        const state = useTaskStore.getState();
        expect(state.dataReadStatus).toBe('ready');
        expect(state.allTasks.find(task => task.id === '1')?.subject).toBe('Draft');
        expect(state.localTaskPatches['1']?.at(-1)?.mutationIntent).toMatchObject({ subject: 'Draft' });
        expect(apiClient.fetchData).toHaveBeenCalledTimes(2);
    });

    it('settles the read status after a successful mutation resync', async () => {
        const original = buildTask({ id: '1', subject: 'Server' });
        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([original]));
        await useTaskStore.getState().refreshData();
        useTaskStore.getState().registerTaskConflict('1', 'Conflict');

        const delayed = deferred<Awaited<ReturnType<typeof apiClient.fetchData>>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(delayed.promise);
        const resolution = useTaskStore.getState().resolveTaskConflict('1', 'remote');
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');
        delayed.resolve(buildApiData([{ ...original, subject: 'Remote', lockVersion: 2 }]));
        await resolution;

        expect(useTaskStore.getState().dataReadStatus).toBe('ready');
        expect(useTaskStore.getState().allTasks.find(task => task.id === '1')?.subject).toBe('Remote');
    });

    it('settles the read status after a failed mutation resync', async () => {
        const original = buildTask({ id: '1', subject: 'Server' });
        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([original]));
        await useTaskStore.getState().refreshData();
        useTaskStore.getState().registerTaskConflict('1', 'Conflict');

        const delayed = deferred<Awaited<ReturnType<typeof apiClient.fetchData>>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(delayed.promise);
        const resolution = useTaskStore.getState().resolveTaskConflict('1', 'remote');
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');
        delayed.reject(new Error('offline'));
        await resolution;

        expect(useTaskStore.getState().dataReadStatus).toBe('error');
        expect(useTaskStore.getState().taskConflicts['1']).toBeDefined();
    });

    it('applyApiData filters selectedProjectIds without mutating initialState', () => {
        const initialState = {
            groupBy: 'project' as const,
            selectedProjectIds: ['p1', 'missing']
        };

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p1', name: 'Project 1' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState
        });

        expect(useTaskStore.getState().selectedProjectIds).toEqual(['p1', 'missing']);
        expect(initialState.selectedProjectIds).toEqual(['p1', 'missing']);
    });

    it('applyApiData clears the active query id when API initialState omits queryId', () => {
        useTaskStore.setState({ activeQueryId: 12 });

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                selectedStatusIds: [1]
            }
        });

        expect(useTaskStore.getState().activeQueryId).toBeNull();
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null,
            selectedStatusIds: [1]
        });
    });

    it('applyApiData preserves the active query id when API omits initialState', () => {
        useTaskStore.setState({ activeQueryId: 12 });

        useTaskStore.getState().applyApiData({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });

        expect(useTaskStore.getState().activeQueryId).toBe(12);
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'project'
        });
    });

    it('setFilterOptions only updates filterOptions', () => {
        const { setFilterOptions, setTasks } = useTaskStore.getState();
        setTasks([buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })]);
        const layoutRows = useTaskStore.getState().layoutRows;
        const rowCount = useTaskStore.getState().rowCount;

        setFilterOptions({
            projects: [{ id: 'p2', name: 'Project 2' }],
            assignees: []
        });

        expect(useTaskStore.getState().filterOptions.projects).toEqual([{ id: 'p2', name: 'Project 2' }]);
        expect(useTaskStore.getState().layoutRows).toBe(layoutRows);
        expect(useTaskStore.getState().rowCount).toBe(rowCount);
    });
});

describe('TaskStore version label visibility', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('Ver表示ONなら選択なしでもバージョン名を表示する', () => {
        const { setTasks, setVersions, setSelectedVersionIds } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Version 1',
                effectiveDate: 0,
                startDate: 0,
                ratioDone: 0,
                projectId: 'p1',
                status: 'open'
            }
        ]);

        setTasks([
            buildTask({
                id: 't1',
                projectId: 'p1',
                fixedVersionId: 'v1',
                startDate: 0,
                dueDate: 0
            })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow?.name).toBe('Version 1');

        setSelectedVersionIds(['v1']);
        const selectedVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(selectedVersionRow?.name).toBe('Version 1');
    });

    it('期日未設定のバージョンでも対象タスクがあればバージョン行を表示する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Undated Version',
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({
                id: 't1',
                projectId: 'p1',
                fixedVersionId: 'v1',
                startDate: undefined,
                dueDate: undefined
            })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow).toMatchObject({
            type: 'version',
            versionId: 'v1',
            name: 'Undated Version',
            projectId: 'p1',
            startDate: undefined,
            dueDate: undefined
        });
    });

    it('effectiveDate がないバージョン行の描画範囲を配下 root タスクの日付から補完する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Task Range Version',
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', startDate: MONDAY, dueDate: FRIDAY, displayOrder: 1 })
        ]);

        const versionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(versionRow).toMatchObject({
            type: 'version',
            versionId: 'v1',
            startDate: MONDAY,
            dueDate: FRIDAY
        });
    });

    it('担当者グループ内の同じ version ID は複合 row ID で衝突しない', () => {
        const { setTasks, setVersions, setGroupByAssignee } = useTaskStore.getState();

        useTaskStore.setState({
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Shared Version',
                effectiveDate: FRIDAY,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 10, assignedToName: 'A', displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 11, assignedToName: 'B', displayOrder: 1 })
        ]);
        setGroupByAssignee(true);

        const versionRows = useTaskStore.getState().layoutRows.filter((row) => row.type === 'version');
        expect(versionRows).toHaveLength(2);
        expect(new Set(versionRows.map((row) => row.id)).size).toBe(2);
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', 'v1']);
    });

    it('片方の担当者グループ内 version row を閉じても別グループの同じ version は閉じない', () => {
        const { setTasks, setVersions, setGroupByAssignee, toggleVersionExpansion } = useTaskStore.getState();

        useTaskStore.setState({
            showVersions: true
        });

        setVersions([
            {
                id: 'v1',
                name: 'Shared Version',
                effectiveDate: FRIDAY,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'a', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 10, assignedToName: 'A', displayOrder: 0 }),
            buildTask({ id: 'b', projectId: 'p1', fixedVersionId: 'v1', assignedToId: 11, assignedToName: 'B', displayOrder: 1 })
        ]);
        setGroupByAssignee(true);

        const firstVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version');
        expect(firstVersionRow?.type).toBe('version');
        if (!firstVersionRow || firstVersionRow.type !== 'version') throw new Error('version row not found');

        toggleVersionExpansion(firstVersionRow.id);

        const state = useTaskStore.getState();
        expect(state.versionExpansion[firstVersionRow.id]).toBe(false);
        expect(state.tasks.map((task) => task.id)).toEqual(['b']);
    });

    it('親子で対象バージョンが異なる場合は親の version group 配下に子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v2', displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1']);
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('親が未設定で子に version がある場合は未設定グループ配下に親子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            i18n: {
                ...(window.RedmineCanvasGantt?.i18n ?? {}),
                label_none: '未設定'
            }
        };
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: undefined, startDate: MONDAY, dueDate: THURSDAY, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: FRIDAY, displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows).toHaveLength(1);
        expect(versionRows[0]).toMatchObject({
            type: 'version',
            versionId: '_none',
            name: '未設定',
            projectId: 'p1',
            startDate: MONDAY,
            dueDate: THURSDAY
        });
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('通常 version と未設定 root が同じ project にある場合は未設定 row を最後に表示する', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Version 1', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'none-root', projectId: 'p1', fixedVersionId: undefined, displayOrder: 0 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 })
        ]);

        const versionRows = useTaskStore.getState().layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', '_none']);
    });

    it('親が version ありで子が未設定の場合は親の version group 配下に子を残す', () => {
        const { setTasks, setVersions } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: undefined, displayOrder: 1 })
        ]);

        const state = useTaskStore.getState();
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1']);
        expect(state.tasks.map((task) => task.id)).toEqual(['parent', 'child']);
    });

    it('未設定 version row を閉じても他 version row には影響しない', () => {
        const { setTasks, setVersions, toggleVersionExpansion } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Version 1', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'none-root', projectId: 'p1', fixedVersionId: undefined, displayOrder: 0 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 })
        ]);

        const noneVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === '_none');
        expect(noneVersionRow?.type).toBe('version');
        if (!noneVersionRow || noneVersionRow.type !== 'version') throw new Error('none version row not found');

        toggleVersionExpansion(noneVersionRow.id);

        const state = useTaskStore.getState();
        expect(state.versionExpansion[noneVersionRow.id]).toBe(false);
        expect(state.tasks.map((task) => task.id)).toEqual(['version-root']);
        expect(state.layoutRows.filter((row) => row.type === 'version').map((row) => row.versionId)).toEqual(['v1', '_none']);
    });

    it('version filter の context-only 親が未設定なら表示 bucket は未設定になる', () => {
        const { setTasks, setVersions, setSelectedVersionIds } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', fixedVersionId: undefined, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 1 }),
            buildTask({ id: 'version-root', projectId: 'p1', fixedVersionId: 'v1', displayOrder: 2 })
        ]);
        setSelectedVersionIds(['v1']);

        const state = useTaskStore.getState();
        const parent = state.tasks.find((task) => task.id === 'parent');
        const versionRows = state.layoutRows.filter((row) => row.type === 'version');
        expect(parent?.isContextOnly).toBe(true);
        expect(versionRows.map((row) => row.versionId)).toEqual(['v1', '_none']);
        expect(versionRows[1]).toMatchObject({
            type: 'version',
            versionId: '_none'
        });
        expect(state.tasks.map((task) => task.id)).toEqual(['version-root', 'parent', 'child']);
    });
});

describe('TaskStore filter hierarchy', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('setFilterText は親タスクを子タスクの上に表示する', () => {
        const tasks = [
            buildTask({ id: 'parent', subject: 'Parent', hasChildren: true }),
            buildTask({ id: 'child', subject: 'Child Match', parentId: 'parent' })
        ];

        const { setTasks, setFilterText } = useTaskStore.getState();
        setTasks(tasks);
        setFilterText('Match');

        const visibleTasks = useTaskStore.getState().tasks;
        expect(visibleTasks.map(task => task.id)).toEqual(['parent', 'child']);
        expect(visibleTasks.find(task => task.id === 'parent')?.isContextOnly).toBe(true);
        expect(visibleTasks.find(task => task.id === 'child')?.isContextOnly).toBe(false);
    });
});

describe('TaskStore hierarchy layout guides', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('keeps ancestor vertical guides through descendants when an ancestor has following siblings', () => {
        const { setTasks } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'root', subject: 'Root', displayOrder: 0 }),
            buildTask({ id: 'a2', subject: 'A2', parentId: 'root', displayOrder: 0 }),
            buildTask({ id: 'a2-child-1', subject: 'A2 child 1', parentId: 'a2', displayOrder: 0 }),
            buildTask({ id: 'a2-child-2', subject: 'A2 child 2', parentId: 'a2', displayOrder: 1 }),
            buildTask({ id: 'a', subject: 'A', parentId: 'root', displayOrder: 1 })
        ]);

        const tasks = useTaskStore.getState().tasks;
        expect(tasks.map(task => task.id)).toEqual(['root', 'a2', 'a2-child-1', 'a2-child-2', 'a']);
        expect(tasks.find(task => task.id === 'a2')?.treeLevelGuides).toEqual([false]);
        expect(tasks.find(task => task.id === 'a2-child-1')?.treeLevelGuides).toEqual([true, false]);
        expect(tasks.find(task => task.id === 'a2-child-2')?.treeLevelGuides).toEqual([true, false]);
        expect(tasks.find(task => task.id === 'a')?.treeLevelGuides).toEqual([false]);
    });
});

describe('TaskStore project filter with subproject toggle', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('サブプロジェクト非表示でもPJフィルタ選択は表示する', () => {
        const { setTasks, setSelectedProjectIds } = useTaskStore.getState();

        useTaskStore.setState({
            showSubprojects: false,
            currentProjectId: 'p1'
        });

        setTasks([
            buildTask({ id: 't1', projectId: 'p1', projectName: 'P1' }),
            buildTask({ id: 't2', projectId: 'p2', projectName: 'P2' })
        ]);

        setSelectedProjectIds(['p2']);

        const visibleIds = useTaskStore.getState().tasks.map(t => t.id);
        expect(visibleIds).toEqual(['t2']);
    });

    it('uses filter option metadata for selected project headers without visible tasks', () => {
        const { setTasks } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            groupByAssignee: false,
            showVersions: false,
            filterOptions: {
                projects: [{ id: 'p2', name: 'Empty Project' }],
                assignees: []
            },
            selectedProjectIds: ['p2']
        });

        setTasks([
            buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })
        ]);

        const headerRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'header');
        expect(headerRow).toMatchObject({
            type: 'header',
            projectId: 'p2',
            projectName: 'Empty Project'
        });
    });

    it('keeps API selected empty project headers named from filter options', async () => {
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [
                buildTask({ id: 't1', projectId: 'p1', projectName: 'Project 1' })
            ],
            relations: [],
            versions: [],
            filterOptions: {
                projects: [{ id: 'p2', name: 'Empty Project' }],
                assignees: []
            },
            statuses: [],
            customFields: [],
            project: { id: '1', name: 'Demo' },
            permissions: { editable: true, viewable: true, baselineEditable: true },
            initialState: {
                groupBy: 'project',
                selectedProjectIds: ['p2']
            }
        });

        await useTaskStore.getState().refreshData();

        const headerRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'header');
        expect(headerRow).toMatchObject({
            type: 'header',
            projectId: 'p2',
            projectName: 'Empty Project'
        });
    });
});

describe('TaskStore background refresh safety', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
    });

    it('setSelectedAssigneeIds catches failed background refreshes', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('network down'));

        useTaskStore.getState().setSelectedAssigneeIds([10]);
        await vi.waitFor(() => {
            expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledWith('Failed to refresh data', expect.any(Error));
        });

        consoleError.mockRestore();
    });
});

describe('TaskStore asynchronous state ownership', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.fetchData).mockReset();
        vi.mocked(apiClient.updateTask).mockReset();
    });

    it('applies only the newest refresh when responses complete in reverse order', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        let refreshCount = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(() => {
            refreshCount += 1;
            return refreshCount === 1 ? first.promise : second.promise;
        });

        const firstRefresh = useTaskStore.getState().refreshData();
        const secondRefresh = useTaskStore.getState().refreshData();
        second.resolve(buildApiData([buildTask({ id: 'new' })]));
        await Promise.resolve();
        first.resolve(buildApiData([buildTask({ id: 'old' })]));

        await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
            expect.objectContaining({ status: 'superseded' }),
            expect.objectContaining({ status: 'applied' })
        ]);
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['new']);
    });

    it('keeps the newer refresh loading when an older response is discarded', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const firstRefresh = useTaskStore.getState().refreshData();
        const secondRefresh = useTaskStore.getState().refreshData();
        first.resolve(buildApiData([buildTask({ id: 'old' })]));
        await expect(firstRefresh).resolves.toEqual(expect.objectContaining({ status: 'superseded' }));
        expect(useTaskStore.getState().dataReadStatus).toBe('loading');

        second.resolve(buildApiData([buildTask({ id: 'new' })]));
        await expect(secondRefresh).resolves.toEqual(expect.objectContaining({ status: 'applied' }));
        expect(useTaskStore.getState().dataReadStatus).toBe('ready');
    });

    it('does not surface a superseded request rejection after a newer refresh wins', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData)
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        const firstRefresh = useTaskStore.getState().refreshData();
        const secondRefresh = useTaskStore.getState().refreshData();
        second.resolve(buildApiData([buildTask({ id: 'new' })]));
        first.reject(new Error('request aborted after supersession'));

        await expect(firstRefresh).resolves.toEqual(expect.objectContaining({ status: 'superseded' }));
        await expect(secondRefresh).resolves.toEqual(expect.objectContaining({ status: 'applied' }));
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['new']);
    });

    it('applies only the newest saved query when query responses complete in reverse order', async () => {
        const first = deferred<ReturnType<typeof buildApiData>>();
        const second = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData)
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        const firstQuery = useTaskStore.getState().applySavedQuery(1);
        const secondQuery = useTaskStore.getState().applySavedQuery(2);
        second.resolve(buildApiData([buildTask({ id: 'query-2' })]));
        first.resolve(buildApiData([buildTask({ id: 'query-1' })]));

        await Promise.all([firstQuery, secondQuery]);
        expect(useTaskStore.getState().activeQueryId).toBe(2);
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['query-2']);
    });

    it('keeps only the third filter refresh when three requests overlap', async () => {
        const requests = [deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>()];
        vi.mocked(apiClient.fetchData).mockImplementationOnce(() => requests[0].promise)
            .mockImplementationOnce(() => requests[1].promise)
            .mockImplementationOnce(() => requests[2].promise);

        const refreshes = [
            useTaskStore.getState().refreshData(),
            useTaskStore.getState().refreshData(),
            useTaskStore.getState().refreshData()
        ];
        requests[2].resolve(buildApiData([buildTask({ id: 'filter-3' })]));
        requests[1].resolve(buildApiData([buildTask({ id: 'filter-2' })]));
        requests[0].resolve(buildApiData([buildTask({ id: 'filter-1' })]));
        await Promise.all(refreshes);

        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['filter-3']);
    });

    it('keeps only the last result after three actual assignee filter changes', async () => {
        const requests = [deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>(), deferred<ReturnType<typeof buildApiData>>()];
        let requestIndex = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(() => requests[requestIndex++].promise);

        useTaskStore.getState().setSelectedAssigneeIds([1]);
        useTaskStore.getState().setSelectedAssigneeIds([2]);
        useTaskStore.getState().setSelectedAssigneeIds([3]);
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(3));

        requests[2].resolve(buildApiData([buildTask({ id: 'assignee-3' })]));
        requests[1].resolve(buildApiData([buildTask({ id: 'assignee-2' })]));
        requests[0].resolve(buildApiData([buildTask({ id: 'assignee-1' })]));
        await vi.waitFor(() => expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['assignee-3']));
    });

    it('can refresh successfully after the newest request fails', async () => {
        vi.mocked(apiClient.fetchData).mockRejectedValueOnce(new Error('temporary failure'));
        const failed = useTaskStore.getState().refreshData();
        await expect(failed).rejects.toThrow('temporary failure');

        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([buildTask({ id: 'recovered' })]));
        await useTaskStore.getState().refreshData();
        expect(useTaskStore.getState().allTasks.map(task => task.id)).toEqual(['recovered']);
    });

    it('keeps an edit made while a refresh is in flight dirty and local', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);

        const refresh = useTaskStore.getState().refreshData();
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        request.resolve(buildApiData([buildTask({ id: 'task-1', dueDate: 3 })]));
        await refresh;

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('does not re-add a dirty task when a refresh changes scope', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockResolvedValueOnce(buildApiData([buildTask({ id: 'task-1', projectId: '1', dueDate: 2 })]))
            .mockReturnValueOnce(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', projectId: '1', dueDate: 2 })]);
        await useTaskStore.getState().refreshData();
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        useTaskStore.getState().setCurrentProjectId('2');

        const refresh = useTaskStore.getState().refreshData();
        request.resolve(buildApiData([]));
        await refresh;

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.localTaskPatches['task-1']).toHaveLength(1);
    });

    it('does not recalculate critical path for a non-scheduling field edit', () => {
        resetDerivedRecalculationCounters();
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', assignedToId: null })]);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-1', { assignedToId: 7 });

        expect(derivedRecalculationCounters.criticalPath).toBe(0);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('preserves unchanged visible task references when editing one of 5,000 tasks', () => {
        useTaskStore.getState().setCalculateCriticalPathEnabled(false);
        useTaskStore.getState().setTasks(Array.from({ length: 5000 }, (_, index) => buildTask({
            id: `task-${index}`,
            subject: `Task ${index}`,
            ratioDone: 0
        })));
        const before = useTaskStore.getState().tasks;
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-2500', { ratioDone: 25 });

        const after = useTaskStore.getState();
        expect(after.tasks).toHaveLength(5000);
        expect(after.tasks[2500]).not.toBe(before[2500]);
        expect(after.tasks[2500].ratioDone).toBe(25);
        after.tasks.forEach((task, index) => {
            if (index !== 2500) expect(task).toBe(before[index]);
        });
        expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 0 });
    });

    it('updates each dependency-adjusted visible task and preserves unrelated references', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });
        useTaskStore.setState({ groupByProject: false, groupByAssignee: false, showVersions: false, sortConfig: null });
        useTaskStore.getState().setTasks([
            buildTask({ id: 'source', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'successor-a', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: 'successor-b', startDate: FRIDAY, dueDate: FRIDAY }),
            buildTask({ id: 'unrelated', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        useTaskStore.getState().setRelations([
            { id: 'r1', from: 'source', to: 'successor-a', type: 'precedes' },
            { id: 'r2', from: 'successor-a', to: 'successor-b', type: 'precedes' }
        ]);
        const before = useTaskStore.getState().tasks;

        useTaskStore.getState().updateTask('source', { dueDate: WEDNESDAY });

        const after = useTaskStore.getState();
        expect(after.allTasks.find(task => task.id === 'successor-a')?.startDate).toBe(THURSDAY);
        expect(after.allTasks.find(task => task.id === 'successor-b')?.startDate).not.toBe(FRIDAY);
        expect(after.tasks.find(task => task.id === 'successor-a')).not.toBe(before.find(task => task.id === 'successor-a'));
        expect(after.tasks.find(task => task.id === 'successor-b')).not.toBe(before.find(task => task.id === 'successor-b'));
        expect(after.tasks.find(task => task.id === 'unrelated')).toBe(before.find(task => task.id === 'unrelated'));
    });

    it.each([
        ['progress', { ratioDone: 30 }],
        ['status', { statusId: 2 }],
        ['date', { dueDate: WEDNESDAY }]
    ] as const)('preserves filtered context task layout after a %s edit', (field, updates) => {
        for (const sortingSuspended of [false, true]) {
            useTaskStore.setState(useTaskStore.getInitialState(), true);
            useTaskStore.setState({
                groupByProject: false,
                groupByAssignee: false,
                showVersions: false,
                sortConfig: null
            });
            useTaskStore.getState().setTasks([
                buildTask({ id: 'parent', subject: 'Parent', hasChildren: true, startDate: MONDAY, dueDate: TUESDAY }),
                buildTask({ id: 'child', subject: 'Visible child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY })
            ]);
            useTaskStore.getState().setFilterText('Visible child');
            if (sortingSuspended) useTaskStore.setState({ isSortingSuspended: true });
            const before = useTaskStore.getState();
            const visibleParent = before.tasks.find(task => task.id === 'parent');
            expect(visibleParent?.isContextOnly).toBe(true);
            resetDerivedRecalculationCounters();

            useTaskStore.getState().updateTask('child', updates);

            const after = useTaskStore.getState();
            expect(after.tasks.map(task => task.id)).toEqual(['parent', 'child']);
            if (field === 'date') {
                expect(after.allTasks.find(task => task.id === 'parent')).not.toBe(before.allTasks.find(task => task.id === 'parent'));
                expect(after.tasks[0]).not.toBe(visibleParent);
            } else {
                expect(after.tasks[0]).toBe(visibleParent);
            }
            expect(after.tasks[0]).toMatchObject({
                isContextOnly: true,
                rowIndex: visibleParent?.rowIndex,
                indentLevel: visibleParent?.indentLevel,
                treeLevelGuides: visibleParent?.treeLevelGuides,
                isLastChild: visibleParent?.isLastChild,
                hasChildren: visibleParent?.hasChildren
            });
            expect(after.tasks[1]).toMatchObject({
                rowIndex: before.tasks[1].rowIndex,
                indentLevel: before.tasks[1].indentLevel,
                treeLevelGuides: before.tasks[1].treeLevelGuides,
                isLastChild: before.tasks[1].isLastChild,
                hasChildren: before.tasks[1].hasChildren,
                isContextOnly: before.tasks[1].isContextOnly
            });
            expect(after.layoutRows.filter(row => row.type === 'task').map(row => row.type === 'task' ? row.taskId : row.type))
                .toEqual(['parent', 'child']);
        }
    });

    it.each([
        ['project', 'projectName', 'groupByProject', 'projectId', 'p1', 'Project One', 'Renamed Project'],
        ['assignee', 'assignedToName', 'groupByAssignee', 'assignedToId', 7, 'User One', 'Renamed User']
    ] as const)('rebuilds the active %s heading only when its name changes', (group, nameField, groupField, idField, groupId, currentName, nextName) => {
        useTaskStore.setState({
            groupByProject: groupField === 'groupByProject',
            groupByAssignee: groupField === 'groupByAssignee',
            sortConfig: null,
            filterOptions: { projects: [], assignees: [] },
            projectExpansion: {
                [group === 'project' ? String(groupId) : `assignee:${groupId}`]: false
            }
        });
        useTaskStore.getState().setTasks([buildTask({
            id: 'task-1',
            [nameField]: currentName,
            [idField]: groupId
        } as Partial<Task>)]);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-1', { [nameField]: nextName });

        expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 1 });
        expect(useTaskStore.getState().layoutRows.find(row => row.type === 'header')).toMatchObject({ projectName: nextName });
        expect(useTaskStore.getState().tasks).toEqual([]);
        expect(useTaskStore.getState().projectExpansion[group === 'project' ? String(groupId) : `assignee:${groupId}`]).toBe(false);

        useTaskStore.setState({ sortConfig: { key: nameField, direction: 'asc' } });
        resetDerivedRecalculationCounters();
        useTaskStore.getState().updateTask('task-1', { [nameField]: nextName });
        expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 0 });

        useTaskStore.getState().setGroupByProject(false);
        useTaskStore.getState().setGroupByAssignee(false);
        useTaskStore.getState().setSortConfig(null);
        resetDerivedRecalculationCounters();
        useTaskStore.getState().updateTask('task-1', { [nameField]: 'A different name' });
        expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 0 });
    });

    it('preserves filtered context layout when a bar-operation date rollback reuses layout', () => {
        useTaskStore.setState({
            groupByProject: false,
            groupByAssignee: false,
            showVersions: false,
            sortConfig: null,
        });
        const parent = buildTask({ id: 'parent', subject: 'Parent', startDate: MONDAY, dueDate: TUESDAY, hasChildren: true });
        const child = buildTask({ id: 'child', subject: 'Visible child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY, rowIndex: 1, indentLevel: 1 });
        const visibleParent = { ...parent, isContextOnly: true };
        useTaskStore.setState({
            allTasks: [parent, child],
            tasks: [visibleParent, child],
            layoutRows: [
                { type: 'task', taskId: 'parent', rowIndex: 0 },
                { type: 'task', taskId: 'child', rowIndex: 1 }
            ],
            rowCount: 2,
            groupByProject: false,
            groupByAssignee: false,
            showVersions: false,
            sortConfig: null
        });
        expect(useTaskStore.getState().tasks[0].isContextOnly).toBe(true);
        const operationId = useTaskStore.getState().beginBarOperation('child');
        useTaskStore.getState().updateTask('child', { dueDate: WEDNESDAY });
        useTaskStore.getState().endBarOperation(operationId);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().rollbackBarOperation(operationId);

        const after = useTaskStore.getState();
        expect(after.allTasks.find(task => task.id === 'child')?.dueDate).toBe(TUESDAY);
        expect(after.tasks[0]).toMatchObject({
            isContextOnly: true,
            rowIndex: visibleParent.rowIndex,
            indentLevel: visibleParent.indentLevel,
            treeLevelGuides: visibleParent.treeLevelGuides,
            isLastChild: visibleParent.isLastChild,
            hasChildren: visibleParent.hasChildren
        });
        expect(after.layoutRows.filter(row => row.type === 'task').map(row => row.type === 'task' ? row.taskId : row.type))
            .toEqual(['parent', 'child']);
        expect(derivedRecalculationCounters.layout).toBe(0);
    });

    it('recalculates scheduling and critical path once without rebuilding task-only layout for a date edit', () => {
        useTaskStore.setState({
            groupByProject: false, groupByAssignee: false, showVersions: false,
            sortConfig: { key: 'subject', direction: 'asc' }
        });
        resetDerivedRecalculationCounters();
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY })]);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('task-1', { dueDate: WEDNESDAY });

        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(0);
    });

    it('rebuilds layout when a task subject changes the active text filter', () => {
        const { setTasks, setFilterText, updateTask } = useTaskStore.getState();
        setTasks([buildTask({ id: 'task-1', subject: 'Needle' })]);
        setFilterText('Needle');
        resetDerivedRecalculationCounters();

        updateTask('task-1', { subject: 'Other' });

        expect(useTaskStore.getState().tasks).toEqual([]);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it.each(['project', 'assignee'] as const)('refreshes %s summary dates after moving a task with subject sorting', (group) => {
        useTaskStore.setState({
            groupByProject: group === 'project',
            groupByAssignee: group === 'assignee',
            sortConfig: { key: 'subject', direction: 'asc' },
            showVersions: false
        });
        useTaskStore.getState().setTasks([
            buildTask({ id: 'A', subject: 'A', projectId: 'p1', assignedToId: 7, startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', subject: 'B', projectId: 'p1', assignedToId: 7, startDate: TUESDAY, dueDate: WEDNESDAY })
        ]);
        const before = useTaskStore.getState();
        expect(before.layoutRows.find(row => row.type === 'header')).toMatchObject({ startDate: MONDAY, dueDate: WEDNESDAY });
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('A', { startDate: WEDNESDAY, dueDate: THURSDAY });

        const after = useTaskStore.getState();
        expect(after.layoutRows.find(row => row.type === 'header')).toMatchObject({ startDate: TUESDAY, dueDate: THURSDAY });
        expect(after.tasks.map(task => [task.id, task.rowIndex])).toEqual(before.tasks.map(task => [task.id, task.rowIndex]));
        expect(derivedRecalculationCounters).toEqual({ scheduling: 1, criticalPath: 1, layout: 1 });
    });

    it.each(['fallback', 'no-version', 'explicit'] as const)('refreshes %s version summaries after resizing a task', (kind) => {
        useTaskStore.setState({
            groupByProject: false,
            groupByAssignee: false,
            sortConfig: { key: 'subject', direction: 'asc' },
            showVersions: true
        });
        useTaskStore.getState().setVersions([{
            id: 'v1', name: 'Version 1', status: 'open', projectId: 'p1',
            startDate: kind === 'explicit' ? MONDAY : undefined,
            effectiveDate: kind === 'explicit' ? FRIDAY : undefined
        }]);
        useTaskStore.getState().setTasks([
            buildTask({ id: 'A', projectId: 'p1', fixedVersionId: kind === 'no-version' ? undefined : 'v1', startDate: TUESDAY, dueDate: WEDNESDAY })
        ]);
        const before = useTaskStore.getState();
        expect(before.layoutRows.find(row => row.type === 'version')).toMatchObject({
            startDate: kind === 'explicit' ? MONDAY : TUESDAY,
            dueDate: kind === 'explicit' ? FRIDAY : WEDNESDAY
        });
        useTaskStore.getState().setCalculateCriticalPathEnabled(false);
        resetDerivedRecalculationCounters();

        useTaskStore.getState().updateTask('A', { dueDate: THURSDAY });

        const after = useTaskStore.getState();
        expect(after.layoutRows.find(row => row.type === 'version')).toMatchObject({
            startDate: kind === 'explicit' ? MONDAY : TUESDAY,
            dueDate: kind === 'explicit' ? FRIDAY : THURSDAY
        });
        expect(after.rowCount).toBe(before.rowCount);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);
    });

    it('refreshes collapsed group summary dates from tasks hidden by the group', () => {
        useTaskStore.setState({
            groupByProject: true, groupByAssignee: false, showVersions: false,
            projectExpansion: { p1: false }, sortConfig: { key: 'subject', direction: 'asc' }
        });
        useTaskStore.getState().setTasks([
            buildTask({ id: 'A', projectId: 'p1', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        expect(useTaskStore.getState().tasks).toEqual([]);

        useTaskStore.getState().updateTask('A', { dueDate: THURSDAY });

        expect(useTaskStore.getState().layoutRows.find(row => row.type === 'header')).toMatchObject({ startDate: MONDAY, dueDate: THURSDAY });
        expect(useTaskStore.getState().tasks).toEqual([]);
    });

    it('disables critical path atomically while scheduling state remains active', () => {
        const { setTasks, setRelations, setCalculateCriticalPathEnabled, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ]);
        setRelations([{ id: 'r1', from: 'A', to: 'B', type: 'precedes' }]);

        setCalculateCriticalPathEnabled(false);

        expect(useTaskStore.getState()).toMatchObject({
            calculateCriticalPathEnabled: false,
            criticalPathMetrics: {},
            criticalPathProjectFinish: undefined
        });

        resetDerivedRecalculationCounters();
        updateTask('A', { dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.schedulingStates).toBeDefined();
        expect(state.calculateCriticalPathEnabled).toBe(false);
        expect(state.criticalPathMetrics).toEqual({});
        expect(state.criticalPathProjectFinish).toBeUndefined();
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);
    });

    it('re-enables critical path with a metrics-only recalculation', () => {
        const { setTasks, setRelations, setCalculateCriticalPathEnabled } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ]);
        setRelations([{ id: 'r1', from: 'A', to: 'B', type: 'precedes' }]);
        setCalculateCriticalPathEnabled(false);
        resetDerivedRecalculationCounters();

        setCalculateCriticalPathEnabled(true);

        const state = useTaskStore.getState();
        expect(state.calculateCriticalPathEnabled).toBe(true);
        expect(state.criticalPathMetrics.A?.critical).toBe(true);
        expect(state.criticalPathMetrics.B?.critical).toBe(true);
        expect(state.criticalPathProjectFinish).toBe(THURSDAY);
        expect(derivedRecalculationCounters.scheduling).toBe(0);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(0);
    });

    it('keeps edits intact and does not issue writes across rapid toggle changes', () => {
        const { setTasks, updateTask, setCalculateCriticalPathEnabled } = useTaskStore.getState();
        setTasks([buildTask({ id: 'task-1', subject: 'Before' })]);
        updateTask('task-1', { subject: 'Draft' });
        const before = useTaskStore.getState();
        const apiCallsBefore = vi.mocked(apiClient.updateTask).mock.calls.length;
        resetDerivedRecalculationCounters();

        setCalculateCriticalPathEnabled(false);
        setCalculateCriticalPathEnabled(true);
        setCalculateCriticalPathEnabled(false);

        const state = useTaskStore.getState();
        expect(state.modifiedTaskIds).toBe(before.modifiedTaskIds);
        expect(state.localTaskPatches).toBe(before.localTaskPatches);
        expect(state.calculateCriticalPathEnabled).toBe(false);
        expect(state.criticalPathMetrics).toEqual({});
        expect(vi.mocked(apiClient.updateTask).mock.calls).toHaveLength(apiCallsBefore);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.scheduling).toBe(0);
        expect(derivedRecalculationCounters.layout).toBe(0);
    });

    it('applies an accepted fetch with zero calculator calls when critical path is disabled before response', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);

        const refresh = useTaskStore.getState().refreshData();
        useTaskStore.getState().setCalculateCriticalPathEnabled(false);
        resetDerivedRecalculationCounters();
        const calculator = vi.spyOn(criticalPathCalculation, 'calculateCriticalPath');
        try {
            request.resolve(buildApiData([
                    buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
                    buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
                ], [{ id: 'r1', from: 'A', to: 'B', type: 'precedes' }]
            ));
            await expect(refresh).resolves.toEqual(expect.objectContaining({ status: 'applied' }));

            const state = useTaskStore.getState();
            expect(state.dataReadStatus).toBe('ready');
            expect(state.calculateCriticalPathEnabled).toBe(false);
            expect(state.criticalPathMetrics).toEqual({});
            expect(derivedRecalculationCounters.scheduling).toBe(1);
            expect(derivedRecalculationCounters.criticalPath).toBe(0);
            expect(calculator).toHaveBeenCalledTimes(0);
        } finally {
            calculator.mockRestore();
        }
    });

    it('canonicalizes direct date updates with the task project calendar', () => {
        configureBusinessCalendar({
            status: 'ok',
            revision: 'test',
            defaultCalendarId: 'p1',
            projectCalendarIds: { p1: 'p1' },
            calendars: {
                p1: {
                    id: 'p1',
                    name: 'P1',
                    nonWorkingWeekDays: [0, 6],
                    days: {
                        '2026-01-07': { name: 'Holiday', type: 'non_working' }
                    }
                }
            },
            warnings: []
        });

        try {
            useTaskStore.getState().setTasks([buildTask({
                id: 'task-1',
                projectId: 'p1',
                startDate: MONDAY,
                dueDate: TUESDAY
            })]);
            useTaskStore.getState().updateTask('task-1', { dueDate: WEDNESDAY });

            expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')).toMatchObject({
                startDate: MONDAY,
                dueDate: TUESDAY
            });
        } finally {
            configureBusinessCalendar(undefined);
        }
    });

    it('cleans local draft state when a not-found task becomes a tombstone', () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.taskTombstones['task-1']?.source).toBe('server');
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.localTaskPatches['task-1']).toBeUndefined();
    });

    it('does not keep a tombstoned task eligible for a later save', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.has('task-1')).toBe(false);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
        expect(useTaskStore.getState().localTaskPatches['task-1']).toBeUndefined();
    });

    it('clears a stale tombstone when conflict resolution adopts a remote task', async () => {
        const remoteTask = buildTask({ id: 'task-1', subject: 'remote', lockVersion: 4 });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'local' })]);
        useTaskStore.getState().markTaskTombstone('task-1', 'server');
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'not found', detectedAt: Date.now(), remoteEntity: remoteTask, remoteRevision: remoteTask.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.allTasks).toEqual([remoteTask]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('does not use an old server snapshot when conflict remote state is missing', async () => {
        const localTask = buildTask({ id: 'task-1', subject: 'local' });
        const oldSnapshot = buildTask({ id: 'task-1', subject: 'old remote', lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': oldSnapshot },
                revisions: { 'task-1': oldSnapshot.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'Conflict', detectedAt: Date.now() }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks[0]?.subject).toBe('local draft');
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.taskConflicts['task-1']).toBeDefined();
        expect(state.taskTombstones['task-1']).toBeUndefined();
    });

    it('fetches a newer remote value when a snapshot from another scope supersedes the conflict response', async () => {
        const local = buildTask({ id: 'task-1', subject: 'local', lockVersion: 1 });
        const response = buildTask({ id: 'task-1', subject: 'remote v2', lockVersion: 2 });
        const snapshot = buildTask({ id: 'task-1', subject: 'remote v3', lockVersion: 3 });
        const refreshed = buildTask({ id: 'task-1', subject: 'remote v4', lockVersion: 4 });
        const otherScope = createReadContext({ generation: 1, projectId: 'p1', query: { queryId: 1 }, scope: {}, purpose: 'refresh' });
        const activeScope = createReadContext({ generation: 2, projectId: 'p1', query: { queryId: 2 }, scope: {}, purpose: 'refresh' });
        useTaskStore.getState().applyApiData(buildApiData([local]));
        useTaskStore.setState({
            serverTaskSnapshot: { entitiesById: { 'task-1': snapshot }, revisions: { 'task-1': 3 }, context: otherScope },
            activeReadContext: activeScope,
            dataReadStatus: 'ready'
        });
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict', undefined, response, 2);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([refreshed]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(apiClient.fetchData).toHaveBeenCalled();
        expect(state.allTasks.find(task => task.id === 'task-1')?.subject).toBe('remote v4');
        expect(state.serverTaskSnapshot.entitiesById['task-1'].subject).toBe('remote v4');
        expect(state.serverTaskSnapshot.revisions['task-1']).toBe(4);
        expect(state.taskConflicts['task-1']).toBeUndefined();
    });

    it('does not copy an unrelated local draft into a partial remote response', async () => {
        const server = buildTask({ id: 'task-1', subject: 'server subject', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([server]));
        useTaskStore.getState().updateTask('task-1', { subject: 'local draft' });
        const generation = useTaskStore.getState().editGenerations['task-1'];
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict', generation,
            { id: 'task-1', dueDate: FRIDAY, lockVersion: 2 }, 2);

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')).toMatchObject({
            subject: 'server subject', dueDate: FRIDAY, lockVersion: 2
        });
        expect(state.serverTaskSnapshot.entitiesById['task-1']).toMatchObject({
            subject: 'server subject', dueDate: FRIDAY, lockVersion: 2
        });
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('does not replace a newer conflict when an earlier remote refresh fails', async () => {
        const local = buildTask({ id: 'task-1', subject: 'local', lockVersion: 1 });
        const newerRemote = buildTask({ id: 'task-1', subject: 'newer remote', lockVersion: 3 });
        useTaskStore.getState().applyApiData(buildApiData([local]));
        useTaskStore.getState().registerTaskConflict('task-1', 'First conflict');
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);

        const resolution = useTaskStore.getState().resolveTaskConflict('task-1', 'remote');
        useTaskStore.getState().registerTaskConflict('task-1', 'Newer conflict', undefined, newerRemote, 3);
        request.reject(new Error('Old refresh failed'));
        await resolution;

        const conflict = useTaskStore.getState().taskConflicts['task-1'];
        expect(conflict.message).toBe('Newer conflict');
        expect(conflict.remoteEntity?.subject).toBe('newer remote');
        expect(conflict.remoteAvailability).toBe('known');
    });

    it('does not apply a remote refresh from a view that changed while it was pending', async () => {
        const local = buildTask({ id: 'task-1', subject: 'local', lockVersion: 1 });
        const oldViewRemote = buildTask({ id: 'task-1', subject: 'old view remote', lockVersion: 2 });
        const newViewRemote = buildTask({ id: 'task-1', subject: 'new view remote', lockVersion: 3 });
        useTaskStore.getState().applyApiData(buildApiData([local]));
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockImplementationOnce(() => request.promise)
            .mockResolvedValue(buildApiData([newViewRemote]));

        const resolution = useTaskStore.getState().resolveTaskConflict('task-1', 'remote');
        useTaskStore.getState().setSelectedAssigneeIds([99]);
        request.resolve(buildApiData([oldViewRemote]));
        await resolution;
        await vi.waitFor(() => expect(useTaskStore.getState().dataReadStatus).toBe('ready'));

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')?.subject).toBe('new view remote');
        expect(state.taskConflicts['task-1']).toBeDefined();
    });

    it('cleans the settled bar operation when conflict resolution adopts the remote task (non-schedule fields)', async () => {
        const localTask = buildTask({ id: 'task-1', ratioDone: 20 });
        const remoteTask = buildTask({ id: 'task-1', ratioDone: 50, lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': { taskId: 'task-1', message: 'Conflict', detectedAt: Date.now(), remoteEntity: remoteTask, remoteRevision: remoteTask.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([remoteTask]);
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.barOperations).toEqual({});
    });

    it('settles only the resolved entity in a linked bar operation (non-schedule fields)', async () => {
        const localTasks = [
            buildTask({ id: 'task-a', ratioDone: 20 }),
            buildTask({ id: 'task-b', ratioDone: 30 })
        ];
        const remoteTaskA = buildTask({ id: 'task-a', ratioDone: 50, lockVersion: 2 });
        useTaskStore.getState().setTasks(localTasks);
        const operationId = useTaskStore.getState().beginBarOperation('task-a');
        useTaskStore.getState().updateTask('task-a', { ratioDone: 40 });
        useTaskStore.getState().updateTask('task-b', { ratioDone: 50 });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-a': remoteTaskA, 'task-b': localTasks[1] },
                revisions: { 'task-a': remoteTaskA.lockVersion, 'task-b': localTasks[1].lockVersion },
                context: null
            },
            taskConflicts: {
                'task-a': { taskId: 'task-a', message: 'Conflict', detectedAt: Date.now(), remoteEntity: remoteTaskA, remoteRevision: remoteTaskA.lockVersion }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-a', 'remote');

        const state = useTaskStore.getState();
        const operation = state.barOperations[operationId];
        expect(operation).toBeDefined();
        expect(operation.entityGenerations['task-a']).toBeUndefined();
        expect(operation.entityGenerations['task-b']).toBeDefined();
        expect(state.localTaskPatches['task-b']).toHaveLength(1);
    });

    it('preserves later-generation patches when resolving an earlier remote conflict (non-schedule fields)', async () => {
        const localTask = buildTask({ id: 'task-1', ratioDone: 20 });
        const remoteTask = buildTask({ id: 'task-1', ratioDone: 50, lockVersion: 2 });
        useTaskStore.getState().setTasks([localTask]);

        const firstOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().endBarOperation(firstOperationId);
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'];

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        const laterGeneration = useTaskStore.getState().editGenerations['task-1'];

        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-1': remoteTask },
                revisions: { 'task-1': remoteTask.lockVersion },
                context: null
            },
            taskConflicts: {
                'task-1': {
                    taskId: 'task-1',
                    message: 'Conflict',
                    detectedAt: Date.now(),
                    generation: conflictGeneration,
                    remoteEntity: remoteTask,
                    remoteRevision: remoteTask.lockVersion
                }
            }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')).toMatchObject({
            ratioDone: 50,
            subject: 'later local edit'
        });
        expect(state.localTaskPatches['task-1']).toEqual([
            expect.objectContaining({
                generation: laterGeneration,
                projection: { subject: 'later local edit' },
                mutationIntent: { subject: 'later local edit' }
            })
        ]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.barOperations[firstOperationId]).toBeUndefined();
        expect(state.barOperations[laterOperationId]).toBeDefined();
    });

    it('does not resolve a conflict by dismissing only its conflict record', async () => {
        const localTask = buildTask({ id: 'task-1', dueDate: TUESDAY });
        useTaskStore.getState().setTasks([localTask]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');

        await useTaskStore.getState().resolveTaskConflict('task-1', 'dismiss');

        const state = useTaskStore.getState();
        expect(state.taskConflicts['task-1']).toBeDefined();
        expect(state.localTaskPatches['task-1']).toHaveLength(1);
        expect(state.barOperations[operationId]).toBeDefined();
    });

    it.each([false, true].flatMap(autoSave => [false, true].map(laterServerEdit => ({ autoSave, laterServerEdit }))))(
        'pins the displayed v3 for local retry (autoSave=$autoSave, laterServerEdit=$laterServerEdit)',
        async ({ autoSave, laterServerEdit }) => {
            const original = buildTask({ id: 'task-1', subject: 'original', lockVersion: 1 });
            const other = buildTask({ id: 'task-2', subject: 'other', lockVersion: 1 });
            const remoteV2 = { ...original, subject: 'remote v2', lockVersion: 2 };
            const remoteV3 = { ...original, subject: 'remote v3', lockVersion: 3 };
            const remoteV4 = { ...original, subject: 'later server edit', lockVersion: 4 };
            const context = createReadContext({ generation: 1, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' });
            useTaskStore.getState().applyApiData(buildApiData([original, other]), context);
            useTaskStore.setState({ autoSave });
            useTaskStore.getState().updateTask(original.id, { subject: 'local intent' });
            useTaskStore.getState().updateTask(other.id, { subject: 'unrelated draft' });
            const otherPatches = useTaskStore.getState().localTaskPatches[other.id];
            useTaskStore.getState().registerTaskConflict(original.id, 'Conflict',
                useTaskStore.getState().editGenerations[original.id], remoteV2, 2);
            useTaskStore.getState().applyApiData(buildApiData([remoteV3, other]), context);
            vi.mocked(apiClient.updateTaskFields).mockImplementation(async (_id, fields) => {
                expect(fields).toEqual({ subject: 'local intent', lock_version: 3 });
                return laterServerEdit
                    ? { status: 'conflict', entity: remoteV4, revision: 4 }
                    : { status: 'ok', entity: { ...remoteV4, subject: 'local intent' }, revision: 4, lockVersion: 4 };
            });

            const retry = useTaskStore.getState().resolveTaskConflict(original.id, 'local');
            // The queued payload must not pick up an update arriving after confirmation.
            if (laterServerEdit) useTaskStore.getState().applyTaskMutationMetadata(original.id, { entity: remoteV4, revision: 4 });
            await retry;

            expect(apiClient.fetchData).not.toHaveBeenCalled();
            expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1);
            const state = useTaskStore.getState();
            expect(state.localTaskPatches[other.id]).toEqual(otherPatches);
            expect(state.allTasks.find(task => task.id === other.id)?.subject).toBe('unrelated draft');
            expect(state.modifiedTaskIds.has(other.id)).toBe(true);
            if (laterServerEdit) {
                expect(state.taskConflicts[original.id]?.remoteRevision).toBe(4);
                expect(state.modifiedTaskIds.has(original.id)).toBe(true);
                expect(state.allTasks.find(task => task.id === original.id)?.subject).toBe('local intent');
            } else {
                expect(state.taskConflicts[original.id]).toBeUndefined();
                expect(state.modifiedTaskIds.has(original.id)).toBe(false);
            }
        }
    );

    it.each(['edit', 'conflict', 'scope'] as const)('abandons local retry when %s changes during remote confirmation', async change => {
        const original = buildTask({ id: 'task-1', subject: 'original', lockVersion: 1 });
        const remote = { ...original, subject: 'remote', lockVersion: 2 };
        useTaskStore.getState().applyApiData(buildApiData([original]));
        useTaskStore.getState().updateTask(original.id, { subject: 'local intent' });
        useTaskStore.getState().registerTaskConflict(original.id, 'Conflict');
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(request.promise).mockResolvedValue(buildApiData([remote]));

        const retry = useTaskStore.getState().resolveTaskConflict(original.id, 'local');
        if (change === 'edit') useTaskStore.getState().updateTask(original.id, { subject: 'later draft' });
        if (change === 'conflict') useTaskStore.getState().registerTaskConflict(original.id, 'Newer conflict', undefined, remote, 2);
        if (change === 'scope') useTaskStore.setState({ selectedAssigneeIds: [99] });
        const conflict = useTaskStore.getState().taskConflicts[original.id];
        request.resolve(buildApiData([remote]));
        await retry;

        expect(apiClient.updateTaskFields).not.toHaveBeenCalled();
        expect(useTaskStore.getState().taskConflicts[original.id]).toBe(conflict);
        expect(useTaskStore.getState().modifiedTaskIds.has(original.id)).toBe(true);
        if (change === 'edit') expect(useTaskStore.getState().allTasks[0].subject).toBe('later draft');
    });

    it('keeps the confirmed revision fixed across transport retry after a newer server update', async () => {
        const local = buildTask({ id: 'task-1', subject: 'original', lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([local]));
        useTaskStore.getState().updateTask(local.id, { subject: 'local intent' });
        useTaskStore.getState().registerTaskConflict(local.id, 'Conflict', undefined,
            { ...local, subject: 'remote v2', lockVersion: 2 }, 2);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...local, subject: 'remote v3', lockVersion: 3 }
        ]));
        await useTaskStore.getState().refreshData();
        const remoteV4 = { ...local, subject: 'later server edit', lockVersion: 4 };
        vi.mocked(apiClient.updateTaskFields).mockImplementationOnce(async () => {
            useTaskStore.getState().applyTaskMutationMetadata(local.id, { entity: remoteV4, revision: 4 });
            return { status: 'transient_error' };
        }).mockResolvedValueOnce({ status: 'conflict', entity: remoteV4, revision: 4 });

        await useTaskStore.getState().resolveTaskConflict(local.id, 'local');

        expect(vi.mocked(apiClient.updateTaskFields).mock.calls.map(call => call[1].lock_version)).toEqual([3, 3]);
        expect(useTaskStore.getState().taskConflicts[local.id].remoteRevision).toBe(4);
        expect(useTaskStore.getState().modifiedTaskIds.has(local.id)).toBe(true);
        expect(useTaskStore.getState().allTasks.find(task => task.id === local.id)?.subject).toBe('local intent');
    });

    it('cleans the bar operation after a successful local conflict retry (non-schedule fields)', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 2 });
        const localTask = buildTask({ id: 'task-1', ratioDone: 20, lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, ratioDone: 40, lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalled();
        expect(useTaskStore.getState().barOperations).toEqual({});
    });

    it('preserves the source task and local intent when Keep Local retry loses a reference', async () => {
        useUIStore.setState(useUIStore.getInitialState(), true);
        const localTask = buildTask({ id: 'task-1', parentId: undefined, lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));
        useTaskStore.getState().updateTask('task-1', { parentId: 'missing-parent' });
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'];
        useTaskStore.getState().registerTaskConflict(
            'task-1',
            'Conflict',
            conflictGeneration,
            { ...localTask, lockVersion: 2 },
            2
        );
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'not_found',
            error: 'Parent task no longer exists',
            failure: { kind: 'not_found', resourceRole: 'reference', resourceType: 'parent_task' }
        });

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'task-1')).toBeDefined();
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.serverTaskSnapshot.entitiesById['task-1']).toBeDefined();
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.taskConflicts['task-1']).toBeUndefined();
        expect(useUIStore.getState().notifications.some(notification => notification.message.includes('Parent task no longer exists'))).toBe(true);
    });

    it('retries inline conflict resolution with the local field payload and current lock version', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', statusId: 1, statusName: 'New', lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));
        useTaskStore.getState().updateTask('task-1', { statusId: 2, statusName: 'In Progress' });
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(apiClient.fetchData).toHaveBeenCalled();
        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            'task-1',
            expect.objectContaining({ status_id: 2, lock_version: 2 }),
            expect.any(String)
        );
        const state = useTaskStore.getState();
        expect(state.taskConflicts['task-1']).toBeUndefined();
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.allTasks.find(task => task.id === 'task-1')?.lockVersion).toBe(3);
    });

    it('retries only persistence intent and excludes preview projection fields', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));
        useTaskStore.getState().updateTask(
            localTask.id,
            { projectId: '2', trackerId: 7, statusId: 4 },
            { projectId: '2' }
        );
        useTaskStore.getState().registerTaskConflict(localTask.id, 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict(localTask.id, 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            localTask.id,
            { project_id: '2', lock_version: 2 },
            expect.any(String)
        );
    });

    it('retries the intended value when the conflict projection differs', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', subject: 'persisted', lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));
        useTaskStore.getState().updateTask(
            localTask.id,
            { subject: 'server projection' },
            { subject: 'explicit intended value' }
        );
        useTaskStore.getState().registerTaskConflict(localTask.id, 'Conflict');
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, subject: 'remote subject', lockVersion: 2 }
        ]));

        await useTaskStore.getState().resolveTaskConflict(localTask.id, 'local');

        expect(apiClient.updateTaskFields).toHaveBeenCalledWith(
            localTask.id,
            { subject: 'explicit intended value', lock_version: 2 },
            expect.any(String)
        );
    });

    it('settles the conflicted operation without removing a later operation after local retry (non-schedule fields)', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 3 });
        const localTask = buildTask({ id: 'task-1', ratioDone: 20, lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));

        const conflictedOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().endBarOperation(conflictedOperationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict');

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, ratioDone: 40, subject: 'later local edit', lockVersion: 3 }
        ]));

        await useTaskStore.getState().resolveTaskConflict('task-1', 'local');

        const state = useTaskStore.getState();
        expect(state.barOperations[conflictedOperationId]).toBeUndefined();
        expect(state.barOperations[laterOperationId]).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('settles every saved generation while preserving an edit created during local retry (non-schedule fields)', async () => {
        const firstSaveRequest = deferred<{ status: 'ok'; lockVersion: number }>();
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstSaveRequest.promise);
        const localTask = buildTask({ id: 'task-1', ratioDone: 20, lockVersion: 1 });
        useTaskStore.getState().applyApiData(buildApiData([localTask]));

        const operationIds = [1, 2, 3].map(() => {
            const operationId = useTaskStore.getState().beginBarOperation('task-1');
            useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
            useTaskStore.getState().endBarOperation(operationId);
            return operationId;
        });
        const conflictGeneration = useTaskStore.getState().editGenerations['task-1'] - 2;
        useTaskStore.getState().registerTaskConflict('task-1', 'Conflict', conflictGeneration);
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            { ...localTask, ratioDone: 40, lockVersion: 2 }
        ]));

        const retry = useTaskStore.getState().resolveTaskConflict('task-1', 'local');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalled());

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);
        firstSaveRequest.resolve({ status: 'ok', lockVersion: 2 });
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));

        const intermediateState = useTaskStore.getState();
        expect(intermediateState.barOperations[laterOperationId]).toBeDefined();

        await retry;

        const state = useTaskStore.getState();
        operationIds.forEach((operationId) => expect(state.barOperations[operationId]).toBeUndefined());
        expect(state.barOperations[laterOperationId]).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('keeps unresolved conflict when no remote task is available', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', subject: 'local' })]);
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toHaveLength(1);
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.taskConflicts['task-1']).toBeDefined();
    });

    it('preserves task ownership when remote state is unavailable (non-schedule fields)', async () => {
        const localTask = buildTask({ id: 'task-1', ratioDone: 20 });
        useTaskStore.getState().setTasks([localTask]);

        const firstOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().endBarOperation(firstOperationId);
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        const laterOperationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { subject: 'later local edit' });
        useTaskStore.getState().endBarOperation(laterOperationId);

        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.allTasks).toHaveLength(1);
        expect(state.localTaskPatches['task-1']).toBeDefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(state.barOperations).toHaveProperty(firstOperationId);
    });

    it('keeps the active operation when remote state is unavailable (non-schedule fields)', async () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', ratioDone: 20 })]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { ratioDone: 40 });
        useTaskStore.getState().registerTaskConflict('task-1', 'Task no longer exists');

        expect(useTaskStore.getState().activeBarOperationId).toBe(operationId);
        await useTaskStore.getState().resolveTaskConflict('task-1', 'remote');

        const state = useTaskStore.getState();
        expect(state.barOperations).toHaveProperty(operationId);
        expect(state.activeBarOperationId).toBe(operationId);
    });

    it('applies deleted task metadata through the shared task transition', () => {
        const task = buildTask({ id: 'task-1' });
        useTaskStore.getState().setTasks([task]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: TUESDAY });
        useTaskStore.getState().endBarOperation(operationId);

        useTaskStore.getState().applyTaskMutationMetadata('task-1', {
            completeness: 'partial',
            invalidatedEntityIds: ['task-1'],
            deletedEntityIds: ['task-1']
        });

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([]);
        expect(state.taskTombstones['task-1']?.source).toBe('server');
        expect(state.barOperations).toEqual({});
    });

    it('merges explicit nullable clears without replacing view state', () => {
        const task = buildTask({ id: 'task-1', dueDate: TUESDAY, editable: true, rowIndex: 7, hasChildren: true });
        useTaskStore.getState().setTasks([task]);

        useTaskStore.getState().applyTaskMutationMetadata('task-1', {
            completeness: 'partial',
            entity: { id: 'task-1', dueDate: undefined }
        });

        const updated = useTaskStore.getState().allTasks[0];
        expect(updated).toHaveProperty('dueDate', undefined);
        expect(updated?.editable).toBe(true);
        expect(updated?.rowIndex).toBe(7);
        expect(updated?.hasChildren).toBe(true);
    });

    it('clears deleted task ownership while preserving linked task ownership', () => {
        useTaskStore.getState().setTasks([
            buildTask({ id: 'task-a', dueDate: MONDAY }),
            buildTask({ id: 'task-b', dueDate: TUESDAY })
        ]);
        const operationId = useTaskStore.getState().beginBarOperation('task-a');
        useTaskStore.getState().updateTask('task-a', { dueDate: WEDNESDAY });
        useTaskStore.getState().updateTask('task-b', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({ activeBarOperationId: operationId });

        useTaskStore.getState().removeTask('task-a');

        const state = useTaskStore.getState();
        expect(state.barOperations[operationId]?.entityGenerations['task-a']).toBeUndefined();
        expect(state.barOperations[operationId]?.entityGenerations['task-b']).toBeDefined();
        expect(state.activeBarOperationId).toBeNull();
    });

    it('clears bar operation ownership when a task tombstone is terminal', () => {
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: MONDAY })]);
        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: TUESDAY });
        useTaskStore.getState().endBarOperation(operationId);

        useTaskStore.getState().markTaskTombstone('task-1', 'server');

        expect(useTaskStore.getState().barOperations[operationId]).toBeUndefined();
    });

    it('does not let a pre-delete refresh resurrect a locally removed task', async () => {
        const request = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValue(request.promise);
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1' })]);

        const refresh = useTaskStore.getState().refreshData();
        useTaskStore.getState().removeTask('task-1');
        request.resolve(buildApiData([buildTask({ id: 'task-1' })]));
        await refresh;

        expect(useTaskStore.getState().allTasks).toEqual([]);
    });

    it('saves an edit added while the previous save is in flight', async () => {
        const firstSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            if (saveCount === 1) return firstSave.promise;
            return { status: 'ok', lockVersion: 3 };
        });
        let reloadCount = 0;
        vi.mocked(apiClient.fetchData).mockImplementation(async () => {
            reloadCount += 1;
            return buildApiData([
                buildTask({ id: 'task-1', dueDate: reloadCount === 1 ? 5 : 8, lockVersion: reloadCount + 1 })
            ]);
        });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        firstSave.resolve({ status: 'ok', lockVersion: 2 });
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(2));
        await saving;

        const state = useTaskStore.getState();
        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5, 8]);
        expect(state.allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('keeps canonical manual-save fields while reapplying only a later generation', async () => {
        const firstSave = deferred<{
            status: 'ok';
            lockVersion: number;
            completeness: 'partial';
            entity: Partial<Task> & { id: string };
            revision: number;
        }>();
        const secondSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            return saveCount === 1 ? firstSave.promise : secondSave.promise;
        });
        useTaskStore.getState().setTasks([buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            subject: 'persisted',
            lockVersion: 1
        })]);
        useTaskStore.getState().updateTask('task-1', {
            projectId: '2',
            trackerId: 2,
            statusId: 2
        });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { subject: 'later intent' });
        firstSave.resolve({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: {
                id: 'task-1',
                projectId: '3',
                trackerId: 3,
                statusId: 3,
                subject: 'server normalized',
                lockVersion: 2
            },
            revision: 2
        });
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(2));

        const afterFirstSave = useTaskStore.getState();
        expect(afterFirstSave.allTasks.find(task => task.id === 'task-1')).toMatchObject({
            projectId: '3',
            trackerId: 3,
            statusId: 3,
            subject: 'later intent',
            lockVersion: 2
        });
        expect(afterFirstSave.serverTaskSnapshot.entitiesById['task-1']).toMatchObject({
            projectId: '3',
            trackerId: 3,
            statusId: 3,
            subject: 'server normalized',
            lockVersion: 2
        });
        expect(afterFirstSave.localTaskPatches['task-1']).toHaveLength(1);
        expect(afterFirstSave.localTaskPatches['task-1'][0].projection).toEqual({ subject: 'later intent' });
        expect(afterFirstSave.localTaskPatches['task-1'][0].mutationIntent).toEqual({ subject: 'later intent' });

        secondSave.resolve({ status: 'ok', lockVersion: 3 });
        await saving;
    });

    it('aggregates project, tracker, and status edits into one manual-save PATCH', async () => {
        const original = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { projectId: '2' });
        useTaskStore.getState().updateTask('task-1', { trackerId: 2 });
        useTaskStore.getState().updateTask('task-1', { statusId: 2 });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: 'task-1', projectId: '2', trackerId: 2, statusId: 2, lockVersion: 2 },
            revision: 2
        });

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures).toEqual(new Map());
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1', projectId: '2', trackerId: 2, statusId: 2 }),
            expect.any(String),
            { project_id: '2', tracker_id: 2, status_id: 2 }
        );
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
    });

    it('discards a pending project, tracker, and status edit sequence without mutation', async () => {
        const original = buildTask({
            id: 'task-1',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { projectId: '2' });
        useTaskStore.getState().updateTask('task-1', { trackerId: 2 });
        useTaskStore.getState().updateTask('task-1', { statusId: 2 });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([original]));

        await useTaskStore.getState().discardChanges();

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')).toMatchObject({
            projectId: '1',
            trackerId: 1,
            statusId: 1
        });
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
    });

    it('keeps an edit made while a conflict refresh is in flight dirty for explicit resolution', async () => {
        const conflictRefresh = deferred<ReturnType<typeof buildApiData>>();
        let saveCount = 0;
        let reloadCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            return saveCount === 1
                ? { status: 'conflict', error: 'stale lock' }
                : { status: 'ok', lockVersion: 4 };
        });
        vi.mocked(apiClient.fetchData).mockImplementation(async () => {
            reloadCount += 1;
            if (reloadCount === 1) return conflictRefresh.promise;
            return buildApiData([buildTask({ id: 'task-1', dueDate: 8, lockVersion: 4 })]);
        });
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2, lockVersion: 1 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const saving = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        conflictRefresh.resolve(buildApiData([buildTask({ id: 'task-1', dueDate: 6, lockVersion: 2 })]));
        await saving;

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5]);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'task-1')?.dueDate).toBe(8);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(true);
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'stale lock'
        });
    });

    it('coalesces overlapping saveChanges calls for the same edit stream', async () => {
        const firstSave = deferred<{ status: 'ok'; lockVersion: number }>();
        let saveCount = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            saveCount += 1;
            if (saveCount === 1) return firstSave.promise;
            return { status: 'ok', lockVersion: 3 };
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-1', dueDate: 8, lockVersion: 3 })
        ]));
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 5 });

        const firstOperation = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(apiClient.updateTask).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });
        const secondOperation = useTaskStore.getState().saveChanges();

        firstSave.resolve({ status: 'ok', lockVersion: 2 });
        await Promise.all([firstOperation, secondOperation]);

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.dueDate)).toEqual([5, 8]);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('retries a legacy transient error and clears the task after success', async () => {
        let attempts = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            attempts += 1;
            return attempts === 1
                ? { status: 'error', error: 'temporary failure' }
                : { status: 'ok', lockVersion: 2 };
        });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-1', dueDate: 8, lockVersion: 2 })
        ]));
        useTaskStore.getState().setTasks([buildTask({ id: 'task-1', dueDate: 2 })]);
        useTaskStore.getState().updateTask('task-1', { dueDate: 8 });

        const firstFailures = await useTaskStore.getState().saveChanges();
        expect(firstFailures.size).toBe(0);
        expect(attempts).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);

        const secondFailures = await useTaskStore.getState().saveChanges();
        expect(secondFailures.size).toBe(0);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
        expect(attempts).toBe(2);
    });

    it.each(['validation_error', 'forbidden'] as const)('rolls a bar operation back on a terminal %s response', async (status) => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status,
            error: 'Dates violate a rule'
        });
        const original = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([original]));
        useTaskStore.getState().setTasks([original]);
        const operationId = useTaskStore.getState().beginBarOperation();
        useTaskStore.getState().updateTask('task-1', { startDate: WEDNESDAY, dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);

        await useTaskStore.getState().saveChanges();

        expect(useTaskStore.getState().allTasks[0]).toMatchObject(original);
        expect(useTaskStore.getState().modifiedTaskIds).not.toContain('task-1');
        expect(useTaskStore.getState().barOperations).toEqual({});
    });

    it('does not clear another task when one task fails to save', async () => {
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => (
            task.id === 'task-a'
                ? { status: 'error', error: 'task A failed' }
                : { status: 'ok', lockVersion: 2 }
        ));
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([
            buildTask({ id: 'task-a', dueDate: 8 }),
            buildTask({ id: 'task-b', dueDate: 9 })
        ]));
        useTaskStore.getState().setTasks([
            buildTask({ id: 'task-a', dueDate: 2 }),
            buildTask({ id: 'task-b', dueDate: 3 })
        ]);
        useTaskStore.getState().updateTask('task-a', { dueDate: 8 });
        useTaskStore.getState().updateTask('task-b', { dueDate: 9 });

        await useTaskStore.getState().saveChanges();
        expect(useTaskStore.getState().modifiedTaskIds.has('task-a')).toBe(true);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-b')).toBe(false);
    });

    it('continues an ordinary child task save after a bar task terminal failure', async () => {
        const barTask = buildTask({ id: 'bar-task', dueDate: 8 });
        const ordinaryTask = buildTask({ id: 'ordinary-task', parentId: 'bar-task', dueDate: 9 });
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => (
            task.id === 'bar-task'
                ? { status: 'validation_error', error: 'Dates violate a rule' }
                : { status: 'ok', lockVersion: 2 }
        ));
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([barTask, ordinaryTask]));
        useTaskStore.getState().setTasks([barTask, ordinaryTask]);

        const operationId = useTaskStore.getState().beginBarOperation('bar-task');
        useTaskStore.getState().updateTask('bar-task', { dueDate: 10 });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.getState().updateTask('ordinary-task', { ratioDone: 11 });

        await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['bar-task', 'ordinary-task']);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'bar-task')?.dueDate).toBe(9);
        expect(useTaskStore.getState().modifiedTaskIds.has('ordinary-task')).toBe(false);
        expect(useTaskStore.getState().localTaskPatches['ordinary-task']).toBeUndefined();
    });

    it('coalesces mixed scheduling and non-scheduling fields into one task save', async () => {
        const task = buildTask({ id: 'mixed-task', dueDate: 2 });
        useTaskStore.getState().setTasks([task]);
        useTaskStore.getState().updateTask('mixed-task', { dueDate: 8 });
        useTaskStore.getState().updateTask('mixed-task', { subject: 'Local subject' });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([task]));

        const failures = await useTaskStore.getState().saveChanges();
        const state = useTaskStore.getState();

        expect(failures).toEqual(new Map());
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'mixed-task' }),
            expect.any(String),
            expect.objectContaining({ due_date: '1970-01-01', subject: 'Local subject' })
        );
        expect(state.modifiedTaskIds.has('mixed-task')).toBe(false);
        expect(state.localTaskPatches['mixed-task']).toBeUndefined();
    });

    it('keeps a bar operation unresolved when conflict resync shows a different remote value', async () => {
        const original = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: TUESDAY, lockVersion: 1 });
        const remote = buildTask({ id: 'task-1', startDate: MONDAY, dueDate: FRIDAY, lockVersion: 2 });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'Conflict' });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([remote]));
        useTaskStore.getState().setTasks([original]);

        const operationId = useTaskStore.getState().beginBarOperation('task-1');
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });
        useTaskStore.getState().endBarOperation(operationId);

        await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().allTasks[0]).toMatchObject({ dueDate: THURSDAY });
        expect(useTaskStore.getState().barOperations[operationId]).toBeDefined();
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'Conflict'
        });
    });

    it('keeps a conflict terminal when both resync and follow-up refresh fail', async () => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'stale lock' });
        vi.mocked(apiClient.fetchData).mockRejectedValue(new Error('resync unavailable'));
        const original = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.get('task-1')).toBe('resync unavailable');
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'resync unavailable (remote unavailable)'
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('task-1');
    });

    it('keeps a conflict unresolved when resync response excludes the task from scope', async () => {
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'conflict', error: 'stale lock' });
        vi.mocked(apiClient.fetchData).mockResolvedValue(buildApiData([]));
        const original = buildTask({ id: 'task-1', dueDate: TUESDAY, lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask('task-1', { dueDate: THURSDAY });

        const failures = await useTaskStore.getState().saveChanges();

        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1);
        expect(failures.get('task-1')).toBe('stale lock');
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            taskId: 'task-1',
            message: 'stale lock (remote unavailable)'
        });
        expect(useTaskStore.getState().modifiedTaskIds).toContain('task-1');
    });
});

describe('TaskStore focusTask', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('opens ancestor, project, and version groups before selecting the task', () => {
        const { setTasks, setVersions, toggleProjectExpansion, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        setVersions([
            {
                id: 'v1',
                name: 'Version 1',
                effectiveDate: MONDAY,
                startDate: MONDAY,
                ratioDone: 0,
                projectId: 'p1',
                status: 'open'
            }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        toggleProjectExpansion('p1');
        toggleVersionExpansion('v1');
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.projectExpansion.p1).toBe(true);
        expect(state.versionExpansion.v1).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.selectedTaskId).toBe('child');
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('opens the rendered parent version row when focusing a child with a different version', () => {
        const { setTasks, setVersions, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Parent Version', effectiveDate: WEDNESDAY, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v2', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        const parentVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === 'v1');
        expect(parentVersionRow?.type).toBe('version');
        if (!parentVersionRow || parentVersionRow.type !== 'version') throw new Error('parent version row not found');

        toggleVersionExpansion(parentVersionRow.id);
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.versionExpansion[parentVersionRow.id]).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('opens project, _none version row, and parent when focusing a child under an unversioned parent', () => {
        const { setTasks, setVersions, toggleProjectExpansion, toggleVersionExpansion, toggleTaskExpansion, focusTask } = useTaskStore.getState();

        useTaskStore.setState({
            groupByProject: true,
            showVersions: true
        });

        setVersions([
            { id: 'v1', name: 'Child Version', effectiveDate: FRIDAY, projectId: 'p1', status: 'open' }
        ]);
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: undefined, hasChildren: true, displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', projectName: 'Project 1', fixedVersionId: 'v1', startDate: TUESDAY, dueDate: WEDNESDAY, displayOrder: 1 })
        ]);

        const noneVersionRow = useTaskStore.getState().layoutRows.find((row) => row.type === 'version' && row.versionId === '_none');
        expect(noneVersionRow?.type).toBe('version');
        if (!noneVersionRow || noneVersionRow.type !== 'version') throw new Error('none version row not found');

        toggleProjectExpansion('p1');
        toggleVersionExpansion(noneVersionRow.id);
        toggleTaskExpansion('parent');

        const result = focusTask('child');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.projectExpansion.p1).toBe(true);
        expect(state.versionExpansion[noneVersionRow.id]).toBe(true);
        expect(state.taskExpansion.parent).toBe(true);
        expect(state.selectedTaskId).toBe('child');
        expect(state.tasks.some((task) => task.id === 'child')).toBe(true);
    });

    it('scrolls vertically and horizontally to make the task visible', () => {
        const { setTasks, focusTask } = useTaskStore.getState();
        const tasks: Task[] = [];

        for (let index = 0; index < 30; index += 1) {
            tasks.push(buildTask({
                id: `task-${index}`,
                projectId: 'p1',
                projectName: 'Project 1',
                displayOrder: index,
                startDate: MONDAY + index * DAY,
                dueDate: MONDAY + index * DAY
            }));
        }

        useTaskStore.setState((state) => ({
            ...state,
            viewport: {
                ...state.viewport,
                width: 400,
                height: 160,
                rowHeight: 32,
                startDate: MONDAY,
                scrollX: 0,
                scrollY: 0
            },
            groupByProject: false,
            showVersions: false
        }));
        setTasks(tasks);

        const result = focusTask('task-24');
        const state = useTaskStore.getState();

        expect(result).toEqual({ status: 'ok' });
        expect(state.selectedTaskId).toBe('task-24');
        expect(state.viewport.scrollY).toBeGreaterThan(0);
        expect(state.viewport.scrollX).toBeGreaterThan(0);
    });

    it('returns filtered_out without changing state when the task is hidden by filters', () => {
        const { setTasks, setFilterText, focusTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'visible', subject: 'Visible Task', projectId: 'p1' }),
            buildTask({ id: 'hidden', subject: 'Hidden Task', projectId: 'p1' })
        ]);
        setFilterText('Visible');

        const before = useTaskStore.getState();
        const result = focusTask('hidden');
        const after = useTaskStore.getState();

        expect(result).toEqual({ status: 'filtered_out' });
        expect(after.selectedTaskId).toBe(before.selectedTaskId);
        expect(after.viewport).toEqual(before.viewport);
    });

    it('returns missing when the task does not exist', () => {
        expect(useTaskStore.getState().focusTask('missing-task')).toEqual({ status: 'missing' });
    });
});

describe('TaskStore dependency grouping', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('依存関係のあるタスクを隣接して表示する', () => {
        const tasks = [
            buildTask({ id: 'a', subject: 'A', displayOrder: 1 }),
            buildTask({ id: 'b', subject: 'B', displayOrder: 2 }),
            buildTask({ id: 'c', subject: 'C', displayOrder: 3 })
        ];

        const { setTasks, setRelations, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        const orderedIds = useTaskStore.getState().tasks.map(task => task.id);
        expect(orderedIds).toEqual(['a', 'c', 'b']);
    });

    it('sortConfig があっても依存関係の塊を優先して表示する', () => {
        useTaskStore.setState({
            groupByProject: false,
            groupByAssignee: false,
            showVersions: false,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', displayOrder: 2, startDate: 3 })
        ];

        const { setTasks, setRelations, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'c', 'b']);
    });

    it('依存整理中は version を跨ぐ依存タスクを隣接表示し version 行を出さない', () => {
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v2', displayOrder: 2, startDate: 3 })
        ];
        const versions = [
            { id: 'v1', name: 'Version 1', effectiveDate: 10, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Version 2', effectiveDate: 20, projectId: 'p1', status: 'open' }
        ];

        const { setTasks, setRelations, setVersions, setOrganizeByDependency } = useTaskStore.getState();
        setTasks(tasks);
        setVersions(versions);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        setOrganizeByDependency(true);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'c', 'b']);
        expect(useTaskStore.getState().layoutRows.some(row => row.type === 'version')).toBe(false);
        expect(useTaskStore.getState().layoutRows.filter(row => row.type === 'header')).toHaveLength(1);
    });

    it('依存整理を無効にすると sort と version grouping を維持する', () => {
        useTaskStore.setState({
            groupByProject: true,
            showVersions: true,
            sortConfig: { key: 'startDate', direction: 'asc' }
        });

        const tasks = [
            buildTask({ id: 'a', subject: 'A', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 0, startDate: 1 }),
            buildTask({ id: 'b', subject: 'B', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v1', displayOrder: 1, startDate: 2 }),
            buildTask({ id: 'c', subject: 'C', projectId: 'p1', projectName: 'P1', fixedVersionId: 'v2', displayOrder: 2, startDate: 3 })
        ];
        const versions = [
            { id: 'v1', name: 'Version 1', effectiveDate: 10, projectId: 'p1', status: 'open' },
            { id: 'v2', name: 'Version 2', effectiveDate: 20, projectId: 'p1', status: 'open' }
        ];

        const { setTasks, setRelations, setVersions } = useTaskStore.getState();
        setTasks(tasks);
        setVersions(versions);
        setRelations([{ id: 'r1', from: 'a', to: 'c', type: 'precedes' }]);

        expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual(['a', 'b', 'c']);
        expect(useTaskStore.getState().layoutRows.filter(row => row.type === 'version')).toHaveLength(2);
    });
});

describe('TaskStore start-only scheduling', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
        vi.mocked(apiClient.updateTask).mockReset();
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
    });

    const modes = [AutoScheduleMoveMode.Off, AutoScheduleMoveMode.ConstraintPush, AutoScheduleMoveMode.LinkedDownstreamShift];

    describe.each([false, true])('autoSave=%s', (autoSave) => {
        it.each(modes)('moves only the start date and saves no due date in %s mode', async (mode) => {
            const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();
            useTaskStore.setState({ autoSave });
            useUIStore.setState({ autoScheduleMoveMode: mode });
            setTasks([
                buildTask({ id: 'source', startDate: MONDAY, dueDate: MONDAY }),
                buildTask({ id: 'point', startDate: TUESDAY, dueDate: undefined }),
                buildTask({ id: 'successor', startDate: WEDNESDAY, dueDate: THURSDAY })
            ]);
            setRelations([
                { id: 'incoming', from: 'source', to: 'point', type: 'precedes' },
                { id: 'outgoing', from: 'point', to: 'successor', type: 'precedes' }
            ]);

            updateTask('point', { startDate: FRIDAY });

            const state = useTaskStore.getState();
            expect(state.allTasks.find(task => task.id === 'point')).toMatchObject({
                startDate: FRIDAY, dueDate: undefined
            });
            expect(state.allTasks.find(task => task.id === 'successor')).toMatchObject({
                startDate: WEDNESDAY, dueDate: THURSDAY
            });
            expect([...state.modifiedTaskIds]).toEqual(['point']);
            expect(state.localTaskPatches.point).toEqual([
                expect.objectContaining({ projection: { startDate: FRIDAY }, mutationIntent: { startDate: FRIDAY } })
            ]);

            // Both drag auto-save and the manual Save action use saveChanges.
            expect(await saveChanges()).toEqual(new Map());

            expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
            expect(apiClient.updateTask).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'point', startDate: FRIDAY, dueDate: undefined }),
                expect.any(String),
                { start_date: '2026-01-09' }
            );
            expect(useTaskStore.getState().allTasks.find(task => task.id === 'point')?.dueDate).toBeUndefined();
        });

        it.each(modes)('excludes a start-only successor from propagation in %s mode', (mode) => {
            const { setTasks, setRelations, updateTask } = useTaskStore.getState();
            useTaskStore.setState({ autoSave });
            useUIStore.setState({ autoScheduleMoveMode: mode });
            setTasks([
                buildTask({ id: 'source', startDate: MONDAY, dueDate: MONDAY }),
                buildTask({ id: 'point', startDate: TUESDAY, dueDate: undefined }),
                buildTask({ id: 'successor', startDate: WEDNESDAY, dueDate: THURSDAY })
            ]);
            setRelations([
                { id: 'incoming', from: 'point', to: 'source', type: 'follows' },
                { id: 'outgoing', from: 'point', to: 'successor', type: 'precedes' }
            ]);

            updateTask('source', { startDate: THURSDAY, dueDate: THURSDAY });

            const state = useTaskStore.getState();
            expect(state.allTasks.find(task => task.id === 'point')).toMatchObject({
                startDate: TUESDAY, dueDate: undefined
            });
            expect(state.allTasks.find(task => task.id === 'successor')).toMatchObject({
                startDate: WEDNESDAY, dueDate: THURSDAY
            });
            expect([...state.modifiedTaskIds]).toEqual(['source']);
            expect(state.localTaskPatches.point).toBeUndefined();
        });
    });

    it('does not fill a start-only successor when adding or changing a dependency', () => {
        const { setTasks, addRelation, replaceRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'source', startDate: MONDAY, dueDate: THURSDAY }),
            buildTask({ id: 'point', startDate: TUESDAY, dueDate: undefined })
        ]);
        const relation = { id: 'incoming', from: 'source', to: 'point', type: 'precedes' };

        addRelation(relation);
        replaceRelation({ ...relation, delay: 3 });

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'point')).toMatchObject({
            startDate: TUESDAY, dueDate: undefined
        });
        expect(state.modifiedTaskIds.size).toBe(0);
        expect(state.localTaskPatches).toEqual({});
    });
});

describe('TaskStore scheduling state and relation-driven recalculation', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
    });

    it('never invokes the critical path calculator during loads, edits, drag updates or relation changes while disabled', () => {
        const calculator = vi.spyOn(criticalPathCalculation, 'calculateCriticalPath');
        try {
            const store = useTaskStore.getState();
            store.setCalculateCriticalPathEnabled(false);
            store.applyApiData(buildApiData([
                buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
                buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
            ]));
            expect(calculator).not.toHaveBeenCalled();

            store.updateTask('A', { subject: 'Edited subject' });
            store.updateTask('A', { dueDate: WEDNESDAY });
            expect(useTaskStore.getState().allTasks.find(task => task.id === 'A')?.dueDate).toBe(WEDNESDAY);
            expect(calculator).not.toHaveBeenCalled();

            store.setSortingSuspended(true);
            for (const dueDate of [THURSDAY, FRIDAY]) {
                store.updateTask('A', { dueDate });
                expect(calculator).not.toHaveBeenCalled();
            }
            store.setSortingSuspended(false);
            store.addRelation({ id: 'cp-off-relation', from: 'A', to: 'B', type: 'precedes' });
            expect(useTaskStore.getState().allTasks.find(task => task.id === 'B')?.startDate).toBeGreaterThan(FRIDAY);
            expect(calculator).not.toHaveBeenCalled();
            store.replaceRelation({ id: 'cp-off-relation', from: 'A', to: 'B', type: 'precedes', delay: 1 });
            store.removeRelation('cp-off-relation');
            expect(useTaskStore.getState().relations).toEqual([]);
            expect(useTaskStore.getState().criticalPathMetrics).toEqual({});
            expect(calculator).toHaveBeenCalledTimes(0);

            store.setCalculateCriticalPathEnabled(true);
            expect(calculator).toHaveBeenCalledTimes(1);
            expect(useTaskStore.getState().criticalPathMetrics.A).toBeDefined();
        } finally {
            calculator.mockRestore();
        }
    });

    it('does not schedule related dates for context-only edits', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: TUESDAY, trackerId: 1 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY, trackerId: 1 })
        ]);
        setRelations([
            { id: 'r1', from: 'parent', to: 'child', type: 'precedes' }
        ]);

        updateTask('parent', { trackerId: 2 }, { trackerId: 2 });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'parent')).toMatchObject({
            trackerId: 2,
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(state.allTasks.find((task) => task.id === 'child')).toMatchObject({
            startDate: MONDAY,
            dueDate: TUESDAY
        });
        expect(state.localTaskPatches).toEqual({
            parent: [expect.objectContaining({
                projection: { trackerId: 2 },
                mutationIntent: { trackerId: 2 }
            })]
        });
    });

    it('addRelation recalculates downstream tasks and marks them modified', () => {
        const { setTasks, addRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY })
        ]);

        addRelation({ id: 'r1', from: 'A', to: 'B', type: 'precedes' });

        const state = useTaskStore.getState();
        const movedTask = state.allTasks.find((task) => task.id === 'B');
        expect(movedTask?.startDate).toBe(TUESDAY);
        expect(movedTask?.dueDate).toBe(WEDNESDAY);
        expect(state.modifiedTaskIds.has('B')).toBe(true);
    });

    it('keeps relation add, replace, and delete scheduling active while critical path is disabled', () => {
        const { setTasks, setCalculateCriticalPathEnabled, addRelation, replaceRelation, removeRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        setCalculateCriticalPathEnabled(false);

        resetDerivedRecalculationCounters();
        addRelation({ id: 'r1', from: 'A', to: 'B', type: 'precedes' });
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'B')).toMatchObject({
            startDate: TUESDAY,
            dueDate: WEDNESDAY
        });
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);

        resetDerivedRecalculationCounters();
        replaceRelation({ id: 'r1', from: 'A', to: 'B', type: 'precedes', delay: 1 });
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);

        resetDerivedRecalculationCounters();
        removeRelation('r1');
        expect(useTaskStore.getState().relations).toEqual([]);
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(0);
        expect(useTaskStore.getState().criticalPathMetrics).toEqual({});
    });

    it('recalculates a parent dependency after a child extends the parent', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'successor', startDate: TUESDAY, dueDate: TUESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'parent', to: 'successor', type: 'precedes' }
        ]);

        updateTask('child', { dueDate: TUESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'parent')?.dueDate).toBe(TUESDAY);
        expect(state.allTasks.find((task) => task.id === 'successor')?.startDate).toBe(WEDNESDAY);
    });

    it('recalculates ancestors when adding a relation pushes a child', () => {
        const { setTasks, addRelation } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'parent', parentId: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'source', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'child', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY })
        ]);

        addRelation({ id: 'r1', from: 'source', to: 'child', type: 'precedes' });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'child')?.startDate).toBe(WEDNESDAY);
        expect(state.allTasks.find((task) => task.id === 'parent')?.startDate).toBe(WEDNESDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.startDate).toBe(WEDNESDAY);
        expect(state.modifiedTaskIds.has('child')).toBe(true);
        expect(state.modifiedTaskIds.has('parent')).toBe(true);
        expect(state.modifiedTaskIds.has('grand')).toBe(true);
    });

    it('uses all updated branches when recalculating a shared ancestor', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'left-parent', parentId: 'grand', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'right-parent', parentId: 'grand', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'left', parentId: 'left-parent', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'right', parentId: 'right-parent', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'source', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'source', to: 'left', type: 'precedes' },
            { id: 'r2', from: 'source', to: 'right', type: 'precedes', delay: 1 }
        ]);

        updateTask('source', { dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'left-parent')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'right-parent')?.startDate).toBe(FRIDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'grand')?.dueDate).toBe(FRIDAY + DAY);
    });

    it('aborts an automatic move when a downstream task is not editable', () => {
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY, editable: true }),
            buildTask({ id: 'B', startDate: TUESDAY, dueDate: TUESDAY, editable: false })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        updateTask('A', { dueDate: TUESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'A')?.dueDate).toBe(MONDAY);
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(TUESDAY);
    });

    it('setRelations derives cyclic scheduling state from loaded data', () => {
        const { setTasks, setRelations } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: 0, dueDate: 1 }),
            buildTask({ id: 'B', startDate: 2, dueDate: 3 })
        ]);

        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
            { id: 'r2', from: 'B', to: 'A', type: 'precedes' }
        ]);

        expect(useTaskStore.getState().schedulingStates.A.state).toBe('cyclic');
        expect(useTaskStore.getState().schedulingStates.B.state).toBe('cyclic');
    });

    it('derives critical path metrics from loaded tasks and relations', () => {
        const { setTasks, setRelations } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ]);

        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        const state = useTaskStore.getState();
        expect(state.criticalPathMetrics.A?.critical).toBe(true);
        expect(state.criticalPathMetrics.B?.critical).toBe(true);
        expect(state.criticalPathProjectFinish).toBe(THURSDAY);
    });

    it('updateTask shifts downstream chain together in linked downstream mode', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY }),
            buildTask({ id: 'C', startDate: Date.UTC(2026, 0, 8), dueDate: Date.UTC(2026, 0, 8) })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
            { id: 'r2', from: 'B', to: 'C', type: 'precedes' }
        ]);

        updateTask('A', { startDate: TUESDAY, dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(THURSDAY);
        expect(state.allTasks.find((task) => task.id === 'C')?.startDate).toBe(Date.UTC(2026, 0, 9));
    });

    it('uses staged dependency creates for local propagation and derived scheduling after date edits', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush });
        useTaskStore.getState().setAutoSave(false);
        useTaskStore.getState().applyApiData(buildApiData([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ]));
        useTaskStore.getState().stageRelationCreate({ from: 'A', to: 'B', type: 'precedes', delay: 0 });

        useTaskStore.getState().updateTask('A', { dueDate: THURSDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'B')?.startDate).toBe(FRIDAY);
        expect(state.criticalPathMetrics.A?.critical).toBe(true);
        expect(state.criticalPathMetrics.B?.critical).toBe(true);
        expect(state.criticalPathProjectFinish).toBe(FRIDAY);
    });

    it('does not propagate through a staged dependency delete during a date edit', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush });
        useTaskStore.getState().setAutoSave(false);
        useTaskStore.getState().applyApiData(buildApiData([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ], [{ id: 'r1', from: 'A', to: 'B', type: 'precedes' }]));
        useTaskStore.getState().stageRelationDelete('r1');

        useTaskStore.getState().updateTask('A', { dueDate: THURSDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'B')?.startDate).toBe(WEDNESDAY);
        expect(state.getEffectiveRelations()).toEqual([]);
    });

    it('uses staged relation direction and delay when propagating a date edit', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush });
        useTaskStore.getState().setAutoSave(false);
        useTaskStore.getState().applyApiData(buildApiData([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ], [{ id: 'r1', from: 'A', to: 'B', type: 'precedes', delay: 0 }]));
        useTaskStore.getState().stageRelationUpdate('r1', { from: 'B', to: 'A', type: 'precedes', delay: 1 });

        useTaskStore.getState().updateTask('B', { dueDate: THURSDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find(task => task.id === 'A')?.startDate).toBeGreaterThan(TUESDAY);
        expect(state.allTasks.find(task => task.id === 'A')?.startDate).toBeGreaterThanOrEqual(FRIDAY);
        expect(state.getEffectiveRelations()).toEqual([expect.objectContaining({ from: 'B', to: 'A', delay: 1 })]);
    });

    it('updateTask leaves downstream tasks untouched when auto scheduling is off', () => {
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        const { setTasks, setRelations, updateTask } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ]);
        setRelations([
            { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
        ]);

        updateTask('A', { startDate: TUESDAY, dueDate: WEDNESDAY });

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === 'B')?.startDate).toBe(WEDNESDAY);
        expect(state.schedulingStates.A.state).toBe('conflicted');
        expect(state.schedulingStates.B.state).toBe('conflicted');
    });

    it('keeps a Monday successor fixed when moving the predecessor due date from Saturday to Friday', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];
        const addNotification = vi.fn();

        try {
            useUIStore.setState({
                autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift,
                addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
            });
            const { setTasks, setRelations, updateTask } = useTaskStore.getState();
            setTasks([
                buildTask({ id: 'A', startDate: FRIDAY, dueDate: FRIDAY + DAY }),
                buildTask({ id: 'B', startDate: FRIDAY + DAY * 3, dueDate: FRIDAY + DAY * 3 })
            ]);
            setRelations([
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
            ]);

            updateTask('A', { startDate: THURSDAY, dueDate: FRIDAY });

            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'A')).toMatchObject({
                startDate: THURSDAY,
                dueDate: FRIDAY
            });
            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'B')).toMatchObject({
                startDate: FRIDAY + DAY * 3,
                dueDate: FRIDAY + DAY * 3
            });
            expect(addNotification).not.toHaveBeenCalled();
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
    });

    it('rejects linked shift when external dependency would be violated', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];
        const addNotification = vi.fn();

        try {
            useTaskStore.getState().setCalculateCriticalPathEnabled(false);
            useUIStore.setState({
                autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift,
                addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
            });
            const { setTasks, setRelations, updateTask } = useTaskStore.getState();
            setTasks([
                buildTask({ id: 'P', startDate: MONDAY, dueDate: FRIDAY }),
                buildTask({ id: 'A', startDate: FRIDAY, dueDate: FRIDAY }),
                buildTask({ id: 'B', startDate: FRIDAY + DAY * 3, dueDate: FRIDAY + DAY * 4 })
            ]);
            setRelations([
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
                { id: 'r2', from: 'P', to: 'B', type: 'precedes' }
            ]);

            updateTask('A', { startDate: THURSDAY, dueDate: THURSDAY });

            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'A')?.startDate).toBe(FRIDAY);
            expect(useTaskStore.getState().allTasks.find((task) => task.id === 'B')?.startDate).toBe(FRIDAY + DAY * 3);
            expect(addNotification).toHaveBeenCalledTimes(1);
            expect(String(addNotification.mock.calls[0]?.[0])).toContain('external dependency');
            expect(useTaskStore.getState().criticalPathMetrics).toEqual({});
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
    });
});

describe('TaskStore filter persistence', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('updateTask preserves assignee filter', () => {
        const { setTasks, setSelectedAssigneeIds, updateTask } = useTaskStore.getState();
        const initialTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task A', assignedToId: 10, assignedToName: 'User A' }),
            buildTask({ id: '2', subject: 'Task B', assignedToId: 11, assignedToName: 'User B' }),
            buildTask({ id: '3', subject: 'Task C', assignedToId: 10, assignedToName: 'User A' }),
        ];

        setTasks(initialTasks);
        setSelectedAssigneeIds([10]); // Filter for User A (Task 1 & 3)

        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);

        // Update Task 1
        updateTask('1', { subject: 'Task A Updated' });

        // Filter should still be active
        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);
        expect(useTaskStore.getState().tasks.find(t => t.id === '1')?.subject).toBe('Task A Updated');

        // Update Task 2 (hidden) -> should remain hidden
        updateTask('2', { subject: 'Task B Updated' });
        expect(useTaskStore.getState().tasks).toHaveLength(2);
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['1', '3']);
    });

    it('removeTask respects active filters', () => {
        const { setTasks, setSelectedAssigneeIds, removeTask } = useTaskStore.getState();
        const initialTasks: Task[] = [
            buildTask({ id: '1', subject: 'Task A', assignedToId: 10 }),
            buildTask({ id: '2', subject: 'Task B', assignedToId: 11 }),
            buildTask({ id: '3', subject: 'Task C', assignedToId: 10 }),
        ];

        setTasks(initialTasks);
        setSelectedAssigneeIds([10]); // Filter [1, 3]

        removeTask('1'); // Remove visible task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);

        removeTask('2'); // Remove hidden task
        expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['3']);
    });
});

describe('TaskStore saveChanges ordering', () => {
    const addNotification = vi.fn();

    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState({ addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void });
        addNotification.mockReset();
        vi.mocked(apiClient.updateTask).mockReset();
        vi.mocked(apiClient.fetchData).mockReset();
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [] },
            customFields: [],
            statuses: [],
            project: { id: 'p1', name: 'P1' },
            permissions: { editable: true, viewable: true, baselineEditable: true }
        });
    });

    it('coalesces non-scheduling task fields into one manual mutation', async () => {
        const task = buildTask({
            id: 'task-1',
            subject: 'Before',
            statusId: 1,
            ratioDone: 0,
            lockVersion: 3
        });
        useTaskStore.getState().setTasks([task]);
        useTaskStore.getState().updateTask('task-1', { subject: 'After' });
        useTaskStore.getState().updateTask('task-1', { statusId: 2, ratioDone: 50 });

        await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1' }),
            expect.stringMatching(/^mutation:/),
            expect.objectContaining({ subject: 'After', status_id: 2, done_ratio: 50 })
        );
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('defers successful task settlement until the whole task batch completes', async () => {
        const taskA = buildTask({ id: 'task-a', subject: 'A before', lockVersion: 1 });
        const taskB = buildTask({ id: 'task-b', subject: 'B before', lockVersion: 1 });
        useTaskStore.getState().setTasks([taskA, taskB]);
        const operationId = useTaskStore.getState().beginBarOperation('task-a');
        useTaskStore.getState().updateTask('task-a', { subject: 'A local' });
        useTaskStore.getState().updateTask('task-b', { subject: 'B local' });
        useTaskStore.getState().endBarOperation(operationId);
        useTaskStore.setState({
            serverTaskSnapshot: {
                entitiesById: { 'task-a': taskA, 'task-b': taskB },
                revisions: { 'task-a': 1, 'task-b': 1 },
                context: null
            }
        });

        const secondResponse = deferred<Awaited<ReturnType<typeof apiClient.updateTask>>>();
        const secondStarted = deferred<void>();
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'task-b') {
                secondStarted.resolve();
                return secondResponse.promise;
            }
            return {
                status: 'ok',
                lockVersion: 2,
                entity: { id: task.id, subject: 'A canonical', lockVersion: 2 },
                revision: 2
            };
        });

        resetDerivedRecalculationCounters();
        let storeUpdates = 0;
        const unsubscribe = useTaskStore.subscribe(() => { storeUpdates += 1; });
        let secondResolved = false;
        const save = useTaskStore.getState().saveChanges();
        try {
            await secondStarted.promise;

            const duringSave = useTaskStore.getState();
            expect(storeUpdates).toBe(0);
            expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 0 });
            expect(duringSave.serverTaskSnapshot.revisions['task-a']).toBe(1);
            expect(duringSave.barOperations[operationId]?.entityGenerations['task-a']).toBeDefined();
            expect(duringSave.localTaskPatches['task-a']).toHaveLength(1);

            secondResponse.resolve({ status: 'forbidden', error: 'B cannot be saved' });
            secondResolved = true;
            const failures = await save;

            const state = useTaskStore.getState();
            expect(failures.get('task-b')).toBe('B cannot be saved');
            expect(state.allTasks.find(task => task.id === 'task-a')?.subject).toBe('A canonical');
            expect(state.allTasks.find(task => task.id === 'task-b')?.subject).toBe('B before');
            expect(state.barOperations[operationId]).toBeUndefined();
            expect(state.modifiedTaskIds).toEqual(new Set());
            expect(state.localTaskPatches).toEqual({});
        } finally {
            if (!secondResolved) secondResponse.resolve({ status: 'forbidden', error: 'B cannot be saved' });
            unsubscribe();
            await save.catch(() => undefined);
        }
    });

    it('keeps a successful task settlement when an invalidation refresh fails', async () => {
        const original = buildTask({ id: 'saved-before-refresh', subject: 'Before', lockVersion: 1 });
        useTaskStore.getState().setTasks([original]);
        useTaskStore.getState().updateTask(original.id, { subject: 'After' });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 2,
            entity: { id: original.id, subject: 'Canonical', lockVersion: 2 },
            invalidatedEntityIds: ['related-task']
        });
        vi.mocked(apiClient.fetchData).mockRejectedValue(new Error('temporary refresh failure'));
        const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            const failures = await useTaskStore.getState().saveChanges();

            const state = useTaskStore.getState();
            expect(failures).toEqual(new Map());
            expect(state.allTasks.find(task => task.id === original.id)?.subject).toBe('Canonical');
            expect(state.serverTaskSnapshot.revisions[original.id]).toBe(2);
            expect(state.modifiedTaskIds).toEqual(new Set());
            expect(state.localTaskPatches[original.id]).toBeUndefined();
            expect(logError).toHaveBeenCalledWith('Failed to refresh saved tasks after mutation', expect.any(Error));
        } finally {
            logError.mockRestore();
        }
    });

    it('saveChanges updates parent before child for nested tasks', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        updateTask('child', { dueDate: 5 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['parent', 'child']);
    });

    it('ignores a legacy displayOrder patch while saving the persistable fields', async () => {
        const task = buildTask({ id: 'task-1', dueDate: 2, displayOrder: 1 });
        const { setTasks } = useTaskStore.getState();
        setTasks([task]);
        useTaskStore.setState({
            allTasks: [{ ...task, dueDate: 8 }],
            localTaskPatches: {
                'task-1': [
                    {
                        entityId: 'task-1',
                        projection: { displayOrder: 5 },
                        mutationIntent: {},
                        generation: 1,
                        operationId: 'parent-move:task-1:1'
                    },
                    {
                        entityId: 'task-1',
                        projection: { dueDate: 8 },
                        mutationIntent: { dueDate: 8 },
                        generation: 2,
                        operationId: 'edit:task-1:2'
                    }
                ]
            },
            modifiedTaskIds: new Set(['task-1']),
            editGenerations: { 'task-1': 2 }
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });

        await useTaskStore.getState().saveChanges();

        const state = useTaskStore.getState();
        expect(apiClient.updateTask).toHaveBeenCalledTimes(1);
        expect(apiClient.updateTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-1' }),
            expect.any(String),
            { due_date: '1970-01-01' }
        );
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(useTaskStore.getState().taskConflicts['task-1']).toBeUndefined();
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
    });

    it('does not silently save a dirty task without a LocalPatch', async () => {
        const task = buildTask({ id: 'task-1', dueDate: 2 });
        const { setTasks } = useTaskStore.getState();
        setTasks([task]);
        useTaskStore.setState({ modifiedTaskIds: new Set(['task-1']) });

        const failures = await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).not.toHaveBeenCalled();
        expect(failures.get('task-1')).toContain('No saveable task changes');
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(true);
    });

    it('keeps a dirty local patch when manual save receives a scope not_found', async () => {
        const task = buildTask({ id: 'task-1', subject: 'Before', lockVersion: 3 });
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([task]);
        updateTask('task-1', { subject: 'After' });
        vi.mocked(apiClient.updateTask).mockResolvedValueOnce({
            status: 'not_found',
            error: 'Task is outside the Canvas scope',
            failure: { kind: 'not_found', resourceRole: 'scope', resourceType: 'task' }
        });

        const failures = await saveChanges();

        const state = useTaskStore.getState();
        expect(failures.get('task-1')).toBe('Task is outside the Canvas scope');
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'task-1', subject: 'After' })]);
        expect(state.taskTombstones['task-1']).toBeUndefined();
        expect(state.localTaskPatches['task-1']).toEqual([
            expect.objectContaining({
                entityId: 'task-1',
                projection: expect.objectContaining({ subject: 'After' }),
                mutationIntent: expect.objectContaining({ subject: 'After' })
            })
        ]);
        expect(state.modifiedTaskIds.has('task-1')).toBe(true);
        expect(addNotification).toHaveBeenCalledWith(
            expect.stringContaining('Task is outside the Canvas scope'),
            'error'
        );
    });

    it('saveChanges updates ancestors before descendant in deep hierarchy', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'grand', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'parent', parentId: 'grand', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        updateTask('child', { dueDate: 7 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['grand', 'parent', 'child']);
    });

    it('saveChanges notifies error when any update fails', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 }),
            buildTask({ id: 'child', parentId: 'parent', startDate: 0, dueDate: 2 })
        ]);

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'child') {
                return { status: 'error', error: 'Child date is out of parent range' };
            }
            return { status: 'ok', lockVersion: 1 };
        });

        updateTask('child', { dueDate: 5 });
        await saveChanges();

        expect(addNotification).toHaveBeenCalledTimes(1);
        const [message, type] = addNotification.mock.calls[0];
        expect(String(message)).toContain('#child');
        expect(type).toBe('error');
    });

    it('saveChanges retries tasks that fail due to transient ordering constraints', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'child', startDate: 3, dueDate: 5 }),
            buildTask({ id: 'parent', startDate: 0, dueDate: 2 })
        ]);

        let parentSaved = false;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'child' && !parentSaved) {
                return { status: 'error', error: 'Date constraint violation' };
            }
            if (task.id === 'parent') {
                parentSaved = true;
            }
            return { status: 'ok', lockVersion: 2 };
        });

        updateTask('child', { startDate: 1, dueDate: 3 });
        updateTask('parent', { startDate: 0, dueDate: 0 });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['child', 'parent', 'child']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges resolves conflict when server already applied dependent updates', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: MONDAY, dueDate: TUESDAY, lockVersion: 1 }),
            buildTask({ id: '19', startDate: TUESDAY, dueDate: WEDNESDAY, lockVersion: 1 })
        ]);

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === '18') {
                return { status: 'ok', lockVersion: 2 };
            }
            if (task.id === '19') {
                return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
            }
            return { status: 'ok', lockVersion: 1 };
        });

        const latestTasks = [
            buildTask({ id: '18', startDate: TUESDAY, dueDate: TUESDAY, lockVersion: 2 }),
            buildTask({ id: '19', startDate: THURSDAY, dueDate: FRIDAY, lockVersion: 2 })
        ];
        vi.mocked(apiClient.fetchData)
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                filterOptions: { projects: [], assignees: [] },
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true, baselineEditable: true }
            })
            .mockResolvedValueOnce({
                tasks: latestTasks,
                relations: [],
                versions: [],
                filterOptions: { projects: [], assignees: [] },
                customFields: [],
                statuses: [],
                project: { id: 'p1', name: 'P1' },
                permissions: { editable: true, viewable: true, baselineEditable: true }
            });

        updateTask('18', { startDate: TUESDAY, dueDate: TUESDAY });
        updateTask('19', { startDate: THURSDAY, dueDate: FRIDAY });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges saves predecessor updates before downstream dependency updates', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: THURSDAY, dueDate: FRIDAY }),
            buildTask({ id: '19', startDate: Date.UTC(2026, 0, 13), dueDate: Date.UTC(2026, 0, 14) })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 1 }
        ]);
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });

        updateTask('18', { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saves a three-task dependency chain before downstream validation', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: '1', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: '2', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: '3', startDate: FRIDAY, dueDate: FRIDAY })
        ]);
        setRelations([
            { id: '12', from: '1', to: '2', type: 'precedes', delay: 0 },
            { id: '23', from: '2', to: '3', type: 'precedes', delay: 0 }
        ]);

        updateTask('1', { dueDate: WEDNESDAY });
        updateTask('2', { dueDate: THURSDAY });
        updateTask('3', { startDate: FRIDAY, dueDate: FRIDAY });

        const persisted = new Set<string>();
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === '2' && !persisted.has('1')) {
                return { status: 'error', error: 'Task 1 must be saved first' };
            }
            if (task.id === '3' && !persisted.has('2')) {
                return { status: 'error', error: 'Task 2 must be saved first' };
            }
            persisted.add(task.id);
            return { status: 'ok', lockVersion: 2 };
        });

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['1', '2', '3']);
        expect(failures).toEqual(new Map());
        expect(addNotification).not.toHaveBeenCalled();
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
    });

    it('saveChanges prioritizes dependency order over parent depth', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: 'parent', startDate: MONDAY, dueDate: FRIDAY }),
            buildTask({ id: '18', parentId: 'parent', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: '19', startDate: THURSDAY, dueDate: FRIDAY })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 0 }
        ]);
        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.LinkedDownstreamShift });

        updateTask('18', { startDate: TUESDAY, dueDate: WEDNESDAY });
        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds.indexOf('18')).toBeLessThan(updatedIds.indexOf('19'));
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges does not require a downstream retry after predecessor is saved first', async () => {
        const { setTasks, setRelations, saveChanges } = useTaskStore.getState();

        setTasks([
            buildTask({ id: '18', startDate: THURSDAY, dueDate: FRIDAY }),
            buildTask({ id: '19', startDate: Date.UTC(2026, 0, 13), dueDate: Date.UTC(2026, 0, 14) })
        ]);
        setRelations([
            { id: 'r1', from: '18', to: '19', type: 'precedes', delay: 1 }
        ]);
        useTaskStore.setState({
            modifiedTaskIds: new Set(['18', '19']),
            editGenerations: { '18': 1, '19': 1 },
            localTaskPatches: {
                '18': [{
                    entityId: '18',
                    projection: { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) },
                    mutationIntent: { startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12) },
                    generation: 1,
                    operationId: 'edit:18:1'
                }],
                '19': [{
                    entityId: '19',
                    projection: { startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15) },
                    mutationIntent: { startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15) },
                    generation: 1,
                    operationId: 'edit:19:1'
                }]
            },
            allTasks: [
                buildTask({ id: '18', startDate: FRIDAY, dueDate: Date.UTC(2026, 0, 12), lockVersion: 1 }),
                buildTask({ id: '19', startDate: Date.UTC(2026, 0, 14), dueDate: Date.UTC(2026, 0, 15), lockVersion: 1 })
            ]
        });

        vi.mocked(apiClient.updateTask).mockImplementation(async () => {
            return { status: 'ok', lockVersion: 2 };
        });

        await saveChanges();

        const updatedIds = vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id);
        expect(updatedIds).toEqual(['18', '19']);
        expect(addNotification).not.toHaveBeenCalled();
    });

    it('saveChanges clears all local patches after a 1,000 task successful save burst', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        const tasks = Array.from({ length: 1000 }, (_, index) => (
            buildTask({
                id: `patch-leak-${index}`,
                startDate: MONDAY,
                dueDate: TUESDAY,
                lockVersion: 1
            })
        ));

        setTasks(tasks);
        tasks.forEach((task, index) => {
            updateTask(task.id, { dueDate: TUESDAY + DAY * ((index % 5) + 1) });
        });

        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => ({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: task.id, dueDate: task.dueDate, lockVersion: 2 },
            revision: 2
        }));
        resetDerivedRecalculationCounters();
        const failures = await saveChanges();

        expect(failures).toEqual(new Map());
        expect(vi.mocked(apiClient.updateTask)).toHaveBeenCalledTimes(1000);
        expect(derivedRecalculationCounters.scheduling).toBe(2);
        expect(derivedRecalculationCounters.criticalPath).toBe(2);
        expect(derivedRecalculationCounters.layout).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
        expect(addNotification).not.toHaveBeenCalled();
    }, 30_000);

    it('deletes every task named by canonical mutation metadata without deleting the source task', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'source-task', subject: 'Before', lockVersion: 1 }),
            buildTask({ id: 'deleted-task', subject: 'Removed', lockVersion: 1 })
        ]);
        updateTask('source-task', { subject: 'Local source' });
        vi.mocked(apiClient.updateTask).mockResolvedValue({
            status: 'ok',
            lockVersion: 2,
            completeness: 'partial',
            entity: { id: 'source-task', subject: 'Canonical source', lockVersion: 2 },
            revision: 2,
            deletedEntityIds: ['deleted-task']
        });
        resetDerivedRecalculationCounters();

        await saveChanges();

        const state = useTaskStore.getState();
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'source-task', subject: 'Canonical source' })]);
        expect(state.taskTombstones['source-task']).toBeUndefined();
        expect(state.taskTombstones['deleted-task']).toMatchObject({
            entityId: 'deleted-task',
            source: 'server'
        });
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('batches target-missing tombstone settlement with other task saves', async () => {
        const { setTasks, updateTask, saveChanges } = useTaskStore.getState();
        setTasks([
            buildTask({ id: 'missing-task', subject: 'Gone', lockVersion: 1 }),
            buildTask({ id: 'surviving-task', subject: 'Before', lockVersion: 1 })
        ]);
        updateTask('missing-task', { subject: 'Gone locally' });
        updateTask('surviving-task', { subject: 'Survives' });
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => task.id === 'missing-task'
            ? {
                status: 'not_found',
                error: 'Task was deleted',
                failure: { kind: 'not_found', resourceRole: 'target', resourceType: 'task' }
            }
            : { status: 'ok', lockVersion: 2 });
        resetDerivedRecalculationCounters();

        const failures = await saveChanges();

        const state = useTaskStore.getState();
        expect(failures.get('missing-task')).toBe('Task was deleted');
        expect(state.allTasks).toEqual([expect.objectContaining({ id: 'surviving-task', subject: 'Survives' })]);
        expect(state.taskTombstones['missing-task']).toMatchObject({
            entityId: 'missing-task',
            source: 'server'
        });
        expect(state.modifiedTaskIds).toEqual(new Set());
        expect(state.localTaskPatches).toEqual({});
        expect(derivedRecalculationCounters.scheduling).toBe(1);
        expect(derivedRecalculationCounters.criticalPath).toBe(1);
        expect(derivedRecalculationCounters.layout).toBe(1);
    });

    it('retains every local patch when a dependency cycle rejects an independent task in the same batch', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'C', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        updateTask('A', { dueDate: WEDNESDAY });
        updateTask('B', { dueDate: THURSDAY });
        updateTask('C', { dueDate: FRIDAY });
        setRelations([
            { id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 },
            { id: 'BA', from: 'B', to: 'A', type: 'precedes', delay: 0 }
        ]);

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask)).not.toHaveBeenCalled();
        expect(vi.mocked(apiClient.fetchData)).not.toHaveBeenCalled();
        expect(failures.get('A')).toContain('dependency cycle');
        expect(failures.get('B')).toContain('dependency cycle');
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set(['A', 'B', 'C']));
        expect(useTaskStore.getState().localTaskPatches.A).toHaveLength(1);
        expect(useTaskStore.getState().localTaskPatches.B).toHaveLength(1);
        expect(useTaskStore.getState().localTaskPatches.C).toHaveLength(1);
        expect(useTaskStore.getState().allTasks.map(task => [task.id, task.dueDate])).toEqual([
            ['A', WEDNESDAY],
            ['B', THURSDAY],
            ['C', FRIDAY]
        ]);
        expect(addNotification).toHaveBeenCalledTimes(1);
    });

    it('retries a transient error on a downstream relation task and cleans both saved tasks', async () => {
        const { setTasks, setRelations, updateTask, saveChanges } = useTaskStore.getState();

        useUIStore.setState({ autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        setTasks([
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY })
        ]);
        updateTask('A', { dueDate: WEDNESDAY });
        updateTask('B', { dueDate: THURSDAY });
        setRelations([
            { id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 }
        ]);

        let downstreamAttempts = 0;
        vi.mocked(apiClient.updateTask).mockImplementation(async (task) => {
            if (task.id === 'B') {
                downstreamAttempts += 1;
                if (downstreamAttempts === 1) return { status: 'error', error: 'temporary relation failure' };
            }
            return { status: 'ok', lockVersion: 2 };
        });

        const failures = await saveChanges();

        expect(vi.mocked(apiClient.updateTask).mock.calls.map(([task]) => task.id)).toEqual(['A', 'B', 'B']);
        expect(failures).toEqual(new Map());
        expect(addNotification).not.toHaveBeenCalled();
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set());
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
    });
});

describe('TaskStore drag parent updates', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.updateTaskFields).mockReset();
    });

    it('moveTaskToRoot updates only local state when autoSave is OFF', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: false });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1 })
        ]);

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('ok');
        expect(result.parentId).toBeUndefined();
        expect(result.siblingPosition).toBe('tail');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().modifiedTaskIds.has('child')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches.child).toEqual([
            expect.objectContaining({
                projection: { parentId: undefined },
                mutationIntent: { parentId: undefined }
            })
        ]);
        expect(vi.mocked(apiClient.updateTaskFields)).not.toHaveBeenCalled();
    });

    it.each([false, true])('rejects a same-parent drop without mutation when autoSave is %s', async (autoSave) => {
        useTaskStore.setState({ autoSave });
        useTaskStore.getState().setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 0 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1 })
        ]);
        const before = useTaskStore.getState();

        const result = await useTaskStore.getState().moveTaskAsChild('child', 'parent');

        const after = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(after.allTasks).toEqual(before.allTasks);
        expect(after.editGenerations).toEqual(before.editGenerations);
        expect(after.localTaskPatches).toEqual(before.localTaskPatches);
        expect(after.modifiedTaskIds).toEqual(before.modifiedTaskIds);
        expect(apiClient.updateTaskFields).not.toHaveBeenCalled();
    });

    it('moveTaskToRoot sends parent_issue_id null when autoSave is ON', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3
        });

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('ok');
        expect(result.parentId).toBeUndefined();
        expect(result.siblingPosition).toBe('tail');
        expect(vi.mocked(apiClient.updateTaskFields)).toHaveBeenCalledWith(
            'child',
            { parent_issue_id: null, lock_version: 2 },
            expect.stringMatching(/^mutation:/)
        );
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBeUndefined();
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(3);
    });

    it('moveTaskAsChild sends parent_issue_id and returns the target parent when autoSave is ON', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            parentId: '11'
        });

        const result = await moveTaskAsChild('10', '11');

        expect(result).toEqual({
            status: 'ok',
            lockVersion: 3,
            parentId: '11',
            siblingPosition: 'tail'
        });
        expect(vi.mocked(apiClient.updateTaskFields)).toHaveBeenCalledWith(
            '10',
            { parent_issue_id: 11, lock_version: 2 },
            expect.stringMatching(/^mutation:/)
        );
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.lockVersion).toBe(3);
    });

    it('rolls back only the failed parent move generation when a later edit exists', async () => {
        const { setTasks, moveTaskAsChild, updateTask } = useTaskStore.getState();
        const firstMoveRequest = deferred<{ status: 'validation_error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstMoveRequest.promise);

        const firstMove = moveTaskAsChild('10', '11');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));
        updateTask('10', { subject: 'later edit' });
        firstMoveRequest.resolve({ status: 'validation_error', error: 'Parent validation failed' });
        await firstMove;

        const state = useTaskStore.getState();
        expect(state.allTasks.find((task) => task.id === '10')).toMatchObject({
            parentId: undefined,
            subject: 'later edit'
        });
        expect(state.localTaskPatches['10']).toEqual([
            expect.objectContaining({ generation: 2, operationId: 'edit:10:2' })
        ]);
        expect(state.modifiedTaskIds.has('10')).toBe(true);
    });

    it('keeps the optimistic parent move when the API request is transient', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockRejectedValueOnce(new Error('network down'));

        const result = await moveTaskAsChild('10', '11');

        expect(result.status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.lockVersion).toBe(2);
        expect(useTaskStore.getState().modifiedTaskIds.has('10')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches['10']).toBeDefined();
    });

    it('keeps the optimistic parent move after both bounded transient attempts', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields)
            .mockRejectedValueOnce(new Error('network down'))
            .mockRejectedValueOnce(new Error('network still down'));

        const result = await moveTaskAsChild('10', '11');

        expect(result.status).toBe('error');
        expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(2);
        expect(useTaskStore.getState().allTasks.find((task) => task.id === '10')?.parentId).toBe('11');
        expect(useTaskStore.getState().modifiedTaskIds.has('10')).toBe(true);
        expect(useTaskStore.getState().localTaskPatches['10']).toBeDefined();
    });

    it('ignores a terminal response after its operation ownership was already removed', async () => {
        const { setTasks, moveTaskAsChild, rollbackTaskOperation, updateTask } = useTaskStore.getState();
        const firstMoveRequest = deferred<{ status: 'validation_error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValueOnce(firstMoveRequest.promise);

        const firstMove = moveTaskAsChild('10', '11');
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));
        rollbackTaskOperation('10', 1, { parentId: undefined });
        updateTask('10', { subject: 'newer edit' });

        firstMoveRequest.resolve({ status: 'validation_error', error: 'late failure' });
        await firstMove;

        expect(useTaskStore.getState().allTasks.find((task) => task.id === '10')).toMatchObject({
            parentId: undefined,
            subject: 'newer edit'
        });
    });

    it('moveTaskToRoot rolls back when API response still has parentId', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 3,
            parentId: 'parent'
        });

        const result = await moveTaskToRoot('child');

        expect(result.status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBe('parent');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(2);
    });

    it('moveTaskAsChild tombstones the task when API resolves not_found', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: '11', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: '10', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'not_found',
            error: 'Task no longer exists'
        });

        const result = await moveTaskAsChild('10', '11');

        const state = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(state.allTasks.some((task) => task.id === '10')).toBe(false);
        expect(state.taskTombstones['10']?.source).toBe('server');
        expect(state.modifiedTaskIds.has('10')).toBe(false);
        expect(state.localTaskPatches['10']).toBeUndefined();
    });

    it('moveTaskToRoot tombstones the task when API rejects with not_found', async () => {
        const { setTasks, moveTaskToRoot } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', parentId: 'parent', projectId: 'p1', displayOrder: 1, lockVersion: 2 })
        ]);

        vi.mocked(apiClient.updateTaskFields).mockRejectedValueOnce(
            Object.assign(new Error('Task no longer exists'), { status: 'not_found' })
        );

        const result = await moveTaskToRoot('child');

        const state = useTaskStore.getState();
        expect(result.status).toBe('error');
        expect(state.allTasks.some((task) => task.id === 'child')).toBe(false);
        expect(state.taskTombstones.child?.source).toBe('server');
        expect(state.modifiedTaskIds.has('child')).toBe(false);
        expect(state.localTaskPatches.child).toBeUndefined();
    });

    it('does not let an earlier parent move clear a later optimistic move', async () => {
        const { setTasks, moveTaskAsChild } = useTaskStore.getState();
        const first = deferred<{ status: 'ok'; lockVersion: number; parentId: string }>();
        const second = deferred<{ status: 'error'; error: string }>();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent-1', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'parent-2', projectId: 'p1', displayOrder: 2 }),
            buildTask({ id: 'child', projectId: 'p1', displayOrder: 3, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const firstMove = moveTaskAsChild('child', 'parent-1');
        await Promise.resolve();
        const secondMove = moveTaskAsChild('child', 'parent-2');
        first.resolve({ status: 'ok', lockVersion: 3, parentId: 'parent-1' });
        await vi.waitFor(() => {
            const calls = vi.mocked(apiClient.updateTaskFields).mock.calls;
            expect(calls).toHaveLength(2);
            expect(calls[1]?.[1]).toMatchObject({ lock_version: 3 });
        });
        second.resolve({ status: 'error', error: 'rejected' });

        expect((await firstMove).status).toBe('ok');
        expect((await secondMove).status).toBe('error');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.parentId).toBe('parent-2');
        expect(useTaskStore.getState().allTasks.find((t) => t.id === 'child')?.lockVersion).toBe(3);
    });

    it('records the parent move generation when a delayed conflict arrives after a later edit', async () => {
        const request = deferred<{ status: 'conflict'; error: string }>();
        const { setTasks, moveTaskAsChild, updateTask } = useTaskStore.getState();

        useTaskStore.setState({ autoSave: true });
        setTasks([
            buildTask({ id: 'parent', projectId: 'p1', displayOrder: 1 }),
            buildTask({ id: 'child', projectId: 'p1', displayOrder: 2, lockVersion: 2 })
        ]);
        vi.mocked(apiClient.updateTaskFields).mockReturnValue(request.promise);

        const move = moveTaskAsChild('child', 'parent');
        await Promise.resolve();
        const parentMoveGeneration = useTaskStore.getState().editGenerations.child;
        updateTask('child', { subject: 'later local edit' });
        expect(useTaskStore.getState().editGenerations.child).toBeGreaterThan(parentMoveGeneration);

        request.resolve({ status: 'conflict', error: 'stale parent move' });
        expect((await move).status).toBe('conflict');

        const state = useTaskStore.getState();
        expect(state.taskConflicts.child?.generation).toBe(parentMoveGeneration);
        expect(state.modifiedTaskIds.has('child')).toBe(true);
        expect(state.localTaskPatches.child).toEqual(expect.arrayContaining([
            expect.objectContaining({ generation: parentMoveGeneration })
        ]));
    });
});


describe('physical hierarchy canonical reconciliation', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.mocked(apiClient.updateTaskFields).mockReset();
        vi.mocked(apiClient.fetchData).mockReset();
        useTaskStore.setState({ autoSave: true, currentProjectId: 'p1' });
    });

    it.each([
        { name: 'leaf becomes parent', toRoot: false, before: false, after: true },
        { name: 'only child leaves', toRoot: true, before: true, after: false },
        { name: 'hidden sibling remains', toRoot: true, before: true, after: true }
    ])('$name uses server hierarchy after invalidation refresh', async ({ toRoot, before, after }) => {
        const parent = buildTask({ id: '11', projectId: 'p1', hasPhysicalChildren: before,
            assignedToId: 1, estimatedHours: 8, startDate: MONDAY, dueDate: MONDAY });
        const child = buildTask({ id: '10', projectId: 'p1', parentId: toRoot ? '11' : undefined });
        useTaskStore.getState().applyApiData(buildApiData([parent, child]));
        const read = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(read.promise);
        const canonicalChild = { ...child, parentId: toRoot ? undefined : '11', lockVersion: 1 };
        vi.mocked(apiClient.updateTaskFields).mockResolvedValueOnce({
            status: 'ok', lockVersion: 1, parentId: canonicalChild.parentId,
            entity: canonicalChild, invalidatedEntityIds: ['10', '11'], completeness: 'partial'
        });
        const result = await (toRoot ? useTaskStore.getState().moveTaskToRoot('10')
            : useTaskStore.getState().moveTaskAsChild('10', '11'));
        expect(result.status).toBe('ok');
        expect(useTaskStore.getState().allTasks.find(t => t.id === '11')?.hasPhysicalChildren).toBe(before);
        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        read.resolve(buildApiData([{ ...parent, hasPhysicalChildren: after }, canonicalChild]));
        await vi.waitFor(() => expect(useTaskStore.getState().serverTaskSnapshot.entitiesById['11']?.hasPhysicalChildren).toBe(after));
        const state = useTaskStore.getState();
        expect(state.tasks.find(t => t.id === '11')).toMatchObject({ hasChildren: !toRoot, hasPhysicalChildren: after });
        const workload = WorkloadLogicService.calculateWorkload(state.allTasks, new Set(), {
            leafIssuesOnly: true, capacityThreshold: 8, todayOnwardOnly: false, includeClosedIssues: true
        });
        expect(workload.assignees.has(1)).toBe(!after);
    });

    it('rejects late invalidation reads without rolling back newer hierarchy or local edits', async () => {
        const parent = buildTask({ id: '11', projectId: 'p1', hasPhysicalChildren: false });
        const child = buildTask({ id: '10', projectId: 'p1' });
        useTaskStore.getState().applyApiData(buildApiData([parent, child]));
        const oldRead = deferred<ReturnType<typeof buildApiData>>();
        vi.mocked(apiClient.fetchData).mockReturnValueOnce(oldRead.promise)
            .mockResolvedValueOnce(buildApiData([{ ...parent, hasPhysicalChildren: false }, { ...child, lockVersion: 2 }]));
        vi.mocked(apiClient.updateTaskFields).mockResolvedValueOnce({
            status: 'ok', lockVersion: 1, parentId: '11',
            entity: { id: '10', parentId: '11', lockVersion: 1 }, invalidatedEntityIds: ['10', '11']
        }).mockResolvedValueOnce({
            status: 'ok', lockVersion: 2, entity: { id: '10', parentId: undefined, lockVersion: 2 },
            invalidatedEntityIds: ['10', '11']
        });
        await useTaskStore.getState().moveTaskAsChild('10', '11');
        await useTaskStore.getState().moveTaskToRoot('10');
        await vi.waitFor(() => expect(useTaskStore.getState().serverTaskSnapshot.entitiesById['10'].lockVersion).toBe(2));
        useTaskStore.getState().updateTask('10', { subject: 'later local edit' });
        oldRead.resolve(buildApiData([{ ...parent, hasPhysicalChildren: true }, { ...child, parentId: '11', lockVersion: 1 }]));
        await new Promise(resolve => setTimeout(resolve, 0));
        const state = useTaskStore.getState();
        expect(state.serverTaskSnapshot.entitiesById['11'].hasPhysicalChildren).toBe(false);
        expect(state.allTasks.find(t => t.id === '10')?.parentId).toBeUndefined();
        expect(state.allTasks.find(t => t.id === '10')?.subject).toBe('later local edit');
    });

    it.each(['mutation', 'read'])('rejects an older %s revision in both snapshot and view', (kind) => {
        const current = buildTask({ id: '10', hasPhysicalChildren: true, parentId: 'new', lockVersion: 4 });
        useTaskStore.getState().applyApiData(buildApiData([current]));
        const old = { ...current, hasPhysicalChildren: false, parentId: 'old', lockVersion: 3 };
        if (kind === 'mutation') useTaskStore.getState().applyTaskMutationMetadata('10', { entity: old, revision: 3 });
        else useTaskStore.getState().applyApiData(buildApiData([old]));
        expect(useTaskStore.getState().serverTaskSnapshot.entitiesById['10']).toMatchObject(current);
        expect(useTaskStore.getState().allTasks[0]).toMatchObject(current);
    });
});

describe('TaskStore relation draft persistence', () => {
    const addNotification = vi.fn();

    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState({ addNotification: addNotification as unknown as (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void });
        addNotification.mockReset();
        vi.mocked(apiClient.updateTask).mockReset().mockResolvedValue({ status: 'ok', lockVersion: 2 });
        vi.mocked(apiClient.fetchData).mockReset();
        vi.spyOn(useTaskStore.getState(), 'refreshData').mockResolvedValue({
            status: 'applied',
            context: createReadContext({ generation: 0, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' })
        });
    });

    const initialize = () => {
        const from = buildTask({ id: 'from', projectId: 'p1', startDate: MONDAY, dueDate: TUESDAY });
        const to = buildTask({ id: 'to', projectId: 'p1', startDate: WEDNESDAY, dueDate: THURSDAY });
        useTaskStore.getState().applyApiData(buildApiData([from, to]));
        return { from, to };
    };

    const stageUnknownDelete = () => {
        const { from, to } = initialize();
        const relation: Relation = { id: 'relation-1', from: from.id, to: to.id, type: 'precedes', delay: 0 };
        useTaskStore.getState().applyApiData(buildApiData([from, to], [relation]));
        useTaskStore.setState({ pendingRelationChanges: {
            'relation:relation-1': {
                draftId: 'relation:relation-1', operation: 'delete', relationId: relation.id,
                original: relation, generation: 1, status: 'unknown'
            }
        } });
        return { from, to, relation, draftId: 'relation:relation-1' };
    };

    const refreshWithSnapshot = (data: ReturnType<typeof buildApiData>) => {
        const context = createReadContext({
            generation: 1, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh'
        });
        vi.mocked(useTaskStore.getState().refreshData).mockImplementation(async () => {
            useTaskStore.setState({ activeReadContext: context });
            useTaskStore.getState().applyApiData(data, context);
            return { status: 'applied', context };
        });
    };

    it.each([
        ['from', 'assume_applied'], ['to', 'assume_applied'],
        ['from', 'retry'], ['to', 'retry']
    ] as const)(
        'keeps an unknown deletion unresolved when the refreshed snapshot filters the %s endpoint during %s',
        async (filteredEndpoint, resolution) => {
            const { from, to, relation, draftId } = stageUnknownDelete();
            const filteredTask = filteredEndpoint === 'from' ? from : to;
            const visibleTask = filteredEndpoint === 'from' ? to : from;
            useTaskStore.setState(state => ({
                allTasks: state.allTasks.map(task => task.id === filteredTask.id ? { ...task, subject: 'Local edit' } : task),
                modifiedTaskIds: new Set([...state.modifiedTaskIds, filteredTask.id]),
                localTaskPatches: {
                    ...state.localTaskPatches,
                    [filteredTask.id]: [{
                        entityId: filteredTask.id,
                        projection: { subject: 'Local edit' },
                        mutationIntent: { subject: 'Local edit' },
                        generation: 1,
                        operationId: `edit:${filteredTask.id}:1`
                    }]
                }
            }));
            refreshWithSnapshot(buildApiData([visibleTask]));

            const resolved = await useTaskStore.getState().resolveUnknownRelationChange(draftId, resolution);
            const state = useTaskStore.getState();

            expect(resolved).toBe(false);
            expect(state.allTasks.some(task => task.id === filteredTask.id)).toBe(true);
            expect(state.serverTaskSnapshot.entitiesById[filteredTask.id]).toBeUndefined();
            expect(state.pendingRelationChanges[draftId]).toMatchObject({ status: 'unknown', original: relation });
        }
    );

    it('resolves an unknown deletion as applied when both endpoints are covered and the relation is absent', async () => {
        const { from, to, draftId } = stageUnknownDelete();
        refreshWithSnapshot(buildApiData([from, to]));

        const resolved = await useTaskStore.getState().resolveUnknownRelationChange(draftId, 'assume_applied');

        expect(resolved).toBe(true);
        expect(useTaskStore.getState().pendingRelationChanges[draftId]).toBeUndefined();
    });

    it('keeps an unknown deletion unresolved when the relation remains in the refreshed snapshot', async () => {
        const { from, to, relation, draftId } = stageUnknownDelete();
        refreshWithSnapshot(buildApiData([from, to], [relation]));

        const resolved = await useTaskStore.getState().resolveUnknownRelationChange(draftId, 'assume_applied');

        expect(resolved).toBe(false);
        expect(useTaskStore.getState().pendingRelationChanges[draftId]).toMatchObject({ status: 'unknown', original: relation });
    });

    it('preserves the view guard while refreshing an unknown relation deletion', async () => {
        const { draftId } = stageUnknownDelete();
        const refresh = vi.mocked(useTaskStore.getState().refreshData);
        const request = deferred<{ status: 'applied'; context: ReturnType<typeof createReadContext> }>();
        refresh.mockReturnValueOnce(request.promise);

        const resolution = useTaskStore.getState().resolveUnknownRelationChange(draftId, 'assume_applied');
        useTaskStore.setState({ showSubprojects: true });
        request.resolve({
            status: 'applied',
            context: createReadContext({ generation: 2, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' })
        });

        expect(await resolution).toBe(false);
        expect(useTaskStore.getState().pendingRelationChanges[draftId]).toMatchObject({ status: 'unknown' });
    });

    it('reports staging acceptance and accepts satisfied no-ops without advancing the edit generation', () => {
        const { from, to } = initialize();
        useTaskStore.getState().setAutoSave(false);
        const desired = { from: from.id, to: to.id, type: 'relates' };
        expect(useTaskStore.getState().stageRelationCreate(desired)).toBe(true);
        const draft = Object.values(useTaskStore.getState().pendingRelationChanges)[0];
        const pending = useTaskStore.getState().pendingRelationChanges;
        const generation = useTaskStore.getState().relationEditGeneration;
        expect(useTaskStore.getState().stageRelationCreate(desired)).toBe(true);
        expect(useTaskStore.getState().stageRelationUpdate(`local:${draft.draftId}`, desired)).toBe(true);
        expect(useTaskStore.getState().pendingRelationChanges).toBe(pending);
        expect(useTaskStore.getState().relationEditGeneration).toBe(generation);
        expect(useTaskStore.getState().stageRelationDelete(`local:${draft.draftId}`)).toBe(true);
        expect(useTaskStore.getState().stageRelationDelete(`local:${draft.draftId}`)).toBe(true);
        expect(useTaskStore.getState().stageRelationUpdate('missing', desired)).toBe(false);

        const relation: Relation = { id: 'r1', ...desired };
        useTaskStore.getState().setRelations([relation]);
        const confirmedGeneration = useTaskStore.getState().relationEditGeneration;
        expect(useTaskStore.getState().stageRelationUpdate(relation.id, desired)).toBe(true);
        expect(useTaskStore.getState().stageRelationCreate({ ...desired, delay: 4 })).toBe(false);
        expect(useTaskStore.getState().relationEditGeneration).toBe(confirmedGeneration);
        expect(useTaskStore.getState().pendingRelationChanges).toEqual({});
    });

    it.each(['autoSave', 'enabling', 'readOnly', 'unknown'] as const)('rejects staging in %s state without changing drafts or generation', (reason) => {
        const { from, to } = initialize();
        useTaskStore.getState().setAutoSave(false);
        const relation: Relation = { id: 'r1', from: from.id, to: to.id, type: 'relates' };
        useTaskStore.getState().setRelations([relation]);
        if (reason === 'autoSave') useTaskStore.setState({ autoSave: true });
        if (reason === 'enabling') useTaskStore.setState({ autoSaveTransition: 'enabling' });
        if (reason === 'readOnly') useTaskStore.setState({ permissions: { editable: false, viewable: true, baselineEditable: true } });
        if (reason === 'unknown') useTaskStore.setState({ pendingRelationChanges: {
            unresolved: { draftId: 'unresolved', operation: 'delete', relationId: relation.id, original: relation, generation: 1, status: 'unknown' }
        } });
        const state = useTaskStore.getState();
        expect(state.stageRelationCreate({ from: from.id, to: to.id, type: 'relates' })).toBe(false);
        expect(state.stageRelationUpdate(relation.id, { from: from.id, to: to.id, type: 'blocks' })).toBe(false);
        expect(state.stageRelationDelete(relation.id)).toBe(false);
        expect(useTaskStore.getState().pendingRelationChanges).toBe(state.pendingRelationChanges);
        expect(useTaskStore.getState().relationEditGeneration).toBe(state.relationEditGeneration);
    });

    it.each(['draft', 'local'] as const)('preserves the manual %s editor on same-scope refresh and clears it on a scope change', (kind) => {
        const { from, to } = initialize();
        useTaskStore.getState().setAutoSave(false);
        const desired = { from: from.id, to: to.id, type: 'relates' };
        if (kind === 'draft') useTaskStore.getState().setDraftRelation({ ...desired, anchor: { x: 100, y: 80 } });
        else {
            useTaskStore.getState().stageRelationCreate(desired);
            const draft = Object.values(useTaskStore.getState().pendingRelationChanges)[0];
            useTaskStore.getState().selectRelation(`local:${draft.draftId}`);
        }
        useTaskStore.setState({ activeReadContext: createReadContext({ generation: 1, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' }) });
        const before = useTaskStore.getState();
        useTaskStore.getState().applyApiData(buildApiData([{ ...from }, { ...to }]),
            createReadContext({ generation: 2, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' }));
        expect(useTaskStore.getState().draftRelation).toBe(before.draftRelation);
        expect(useTaskStore.getState().selectedRelationId).toBe(before.selectedRelationId);

        useTaskStore.getState().applyApiData(buildApiData([{ ...from }, { ...to }]),
            createReadContext({ generation: 3, projectId: 'p2', query: {}, scope: {}, purpose: 'initial_load' }));
        expect(useTaskStore.getState().draftRelation).toBeNull();
        expect(useTaskStore.getState().selectedRelationId).toBeNull();
    });

    it.each([
        ['draft', 'success'], ['draft', 'failure'],
        ['selected', 'success'], ['selected', 'failure']
    ] as const)('clears the %s relation editor synchronously on discard before refresh %s', async (editor, outcome) => {
        const { from, to } = initialize();
        useTaskStore.getState().setAutoSave(false);
        const relation: Relation = { id: 'r1', from: from.id, to: to.id, type: 'precedes', delay: 0 };
        useTaskStore.getState().setRelations([relation]);
        useTaskStore.getState().updateTask(from.id, { subject: 'Unsaved' });
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'relates' });
        const pending = Object.values(useTaskStore.getState().pendingRelationChanges)[0];
        if (editor === 'draft') {
            useTaskStore.getState().setDraftRelation({ from: from.id, to: to.id, type: 'blocks', anchor: { x: 100, y: 80 } });
        } else {
            useTaskStore.getState().selectRelation(`local:${pending.draftId}`);
        }
        const context = createReadContext({ generation: 1, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' });
        const refresh = deferred<{ status: 'applied'; context: typeof context }>();
        vi.mocked(useTaskStore.getState().refreshData).mockImplementationOnce(async () => {
            const result = await refresh.promise;
            useTaskStore.getState().applyApiData(buildApiData([from, to], [relation]), result.context);
            return result;
        });
        const generation = useTaskStore.getState().relationEditGeneration;

        const discard = useTaskStore.getState().discardChanges();

        expect(useTaskStore.getState().draftRelation).toBeNull();
        expect(useTaskStore.getState().selectedRelationId).toBeNull();
        expect(useTaskStore.getState().localTaskPatches).toEqual({});
        expect(useTaskStore.getState().modifiedTaskIds.size).toBe(0);
        expect(useTaskStore.getState().pendingRelationChanges).toEqual({});
        expect(useTaskStore.getState().relationEditGeneration).toBe(generation + 1);
        expect(useTaskStore.getState().getEffectiveRelations()).toEqual([relation]);
        if (outcome === 'success') {
            refresh.resolve({ status: 'applied', context });
            await discard;
        } else {
            const rejected = expect(discard).rejects.toThrow('refresh failed');
            refresh.reject(new Error('refresh failed'));
            await rejected;
        }
        expect(useTaskStore.getState().draftRelation).toBeNull();
        expect(useTaskStore.getState().selectedRelationId).toBeNull();
    });

    it('rejects new relation edits throughout an in-flight manual save', async () => {
        const { from, to } = initialize();
        useTaskStore.getState().setAutoSave(false);
        const relation: Relation = { id: 'r1', from: from.id, to: to.id, type: 'relates' };
        useTaskStore.getState().setRelations([relation]);
        const desired = { from: to.id, to: from.id, type: 'blocks' };
        expect(useTaskStore.getState().stageRelationCreate(desired)).toBe(true);
        const request = deferred<Relation & { status: 'ok' }>();
        const create = vi.spyOn(taskMutationService, 'createRelation').mockReturnValueOnce(request.promise);
        try {
            const save = useTaskStore.getState().saveChanges();
            await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
            const state = useTaskStore.getState();
            expect(Object.values(state.pendingRelationChanges)[0].status).toBe('saving');
            expect(state.stageRelationCreate({ from: from.id, to: to.id, type: 'blocks' })).toBe(false);
            expect(state.stageRelationUpdate(relation.id, { from: from.id, to: to.id, type: 'blocks' })).toBe(false);
            expect(state.stageRelationDelete(relation.id)).toBe(false);
            expect(useTaskStore.getState().pendingRelationChanges).toBe(state.pendingRelationChanges);
            expect(useTaskStore.getState().relationEditGeneration).toBe(state.relationEditGeneration);
            request.resolve({ id: 'saved', ...desired, status: 'ok' });
            expect((await save).size).toBe(0);
            expect(create).toHaveBeenCalledTimes(1);
            expect(useTaskStore.getState().stageRelationDelete(relation.id)).toBe(true);
        } finally {
            create.mockRestore();
        }
    });

    it.each([false, true])('restores derived state immediately after an unknown deletion with dependency ordering=%s', async (organizeByDependency) => {
        useTaskStore.setState({ organizeByDependency, groupByProject: false, calculateCriticalPathEnabled: true, sortConfig: { key: 'displayOrder', direction: 'asc' } });
        useTaskStore.getState().setAutoSave(false);
        const from = buildTask({ id: 'from', projectId: 'p1', displayOrder: 3, startDate: MONDAY, dueDate: TUESDAY });
        const to = buildTask({ id: 'to', projectId: 'p1', displayOrder: 1, startDate: WEDNESDAY, dueDate: THURSDAY });
        const independent = buildTask({ id: 'independent', projectId: 'p1', displayOrder: 2, startDate: MONDAY, dueDate: MONDAY });
        const relation: Relation = { id: 'r1', from: from.id, to: to.id, type: 'precedes', delay: 0 };
        useTaskStore.getState().applyApiData(buildApiData([to, independent, from], [relation]));
        const before = useTaskStore.getState();
        const layout = before.tasks.map(task => [task.id, task.rowIndex]);
        expect(before.criticalPathMetrics.from.critical).toBe(true);
        if (organizeByDependency) expect(before.tasks.map(task => task.id)).toEqual([to.id, from.id, independent.id]);
        expect(before.stageRelationDelete(relation.id)).toBe(true);
        expect(useTaskStore.getState().getEffectiveRelations()).toEqual([]);
        expect(useTaskStore.getState().criticalPathMetrics).not.toEqual(before.criticalPathMetrics);
        if (organizeByDependency) expect(useTaskStore.getState().tasks.map(task => task.id)).toEqual([to.id, independent.id, from.id]);

        const request = deferred<Awaited<ReturnType<typeof taskMutationService.deleteRelation>>>();
        const remove = vi.spyOn(taskMutationService, 'deleteRelation').mockReturnValueOnce(request.promise);
        try {
            const save = useTaskStore.getState().saveChanges();
            await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
            request.reject(new TypeError('network lost'));
            expect((await save).size).toBe(1);
            const state = useTaskStore.getState();
            expect(Object.values(state.pendingRelationChanges)[0].status).toBe('unknown');
            expect(state.getEffectiveRelations()).toEqual([relation]);
            expect(state.schedulingStates).toEqual(before.schedulingStates);
            expect(state.criticalPathMetrics).toEqual(before.criticalPathMetrics);
            expect(state.criticalPathProjectFinish).toBe(before.criticalPathProjectFinish);
            expect(state.tasks.map(task => [task.id, task.rowIndex])).toEqual(layout);
            expect(state.layoutRows).toEqual(before.layoutRows);
            expect(state.refreshData).toHaveBeenCalledTimes(1);
            expect((await state.saveChanges()).size).toBe(1);
            expect(remove).toHaveBeenCalledTimes(1);
        } finally {
            remove.mockRestore();
        }
    });

    it('saves a relation-only draft and preserves server relations as the confirmed base', async () => {
        const { from, to } = initialize();
        const created: Relation = { id: 'new-r', from: from.id, to: to.id, type: 'precedes', delay: 0 };
        const create = vi.spyOn(taskMutationService, 'createRelation').mockResolvedValue(created as Relation & { status: 'ok' });
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });
        expect(useTaskStore.getState().relations).toEqual([]);
        expect(useTaskStore.getState().getEffectiveRelations()).toEqual([expect.objectContaining({ id: expect.stringMatching(/^local:/) })]);

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.size).toBe(0);
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(from.id, to.id, 'precedes', 0, expect.any(Function));
        expect(useTaskStore.getState().refreshData).toHaveBeenCalledTimes(2);
        expect(useTaskStore.getState().relations).toEqual([created]);
        expect(useTaskStore.getState().pendingRelationChanges).toEqual({});
        create.mockRestore();
    });

    it('does not rebuild derived task state for reference-only drafts when dependency ordering is off', () => {
        const { from, to } = initialize();
        useTaskStore.setState({ organizeByDependency: false });
        resetDerivedRecalculationCounters();

        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'relates' });

        expect(derivedRecalculationCounters).toEqual({ scheduling: 0, criticalPath: 0, layout: 0 });
        expect(useTaskStore.getState().getEffectiveRelations()).toEqual([expect.objectContaining({ type: 'relates' })]);
    });

    it('recalculates scheduling without rebuilding layout for constraint drafts when dependency ordering is off', () => {
        const { from, to } = initialize();
        useTaskStore.setState({ organizeByDependency: false });
        resetDerivedRecalculationCounters();

        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });

        expect(derivedRecalculationCounters).toEqual({ scheduling: 1, criticalPath: 1, layout: 0 });
    });

    it('keeps a confirmed relation committed when the final reconcile read fails', async () => {
        const { from, to } = initialize();
        const created: Relation = { id: 'confirmed-r', from: from.id, to: to.id, type: 'precedes', delay: 0 };
        const create = vi.spyOn(taskMutationService, 'createRelation').mockResolvedValue(created as Relation & { status: 'ok' });
        const refresh = vi.mocked(useTaskStore.getState().refreshData);
        refresh.mockReset()
            .mockResolvedValueOnce({
                status: 'applied',
                context: createReadContext({ generation: 0, projectId: 'p1', query: {}, scope: {}, purpose: 'refresh' })
            })
            .mockRejectedValueOnce(new Error('refresh failed'));
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });

        const failures = await useTaskStore.getState().saveChanges();

        expect(failures.has('relations')).toBe(true);
        expect(create).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().pendingRelationChanges).toEqual({});
        expect(useTaskStore.getState().relations).toEqual([created]);
        expect(addNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
        create.mockRestore();
    });

    it('keeps a network-unknown create blocked from automatic resend', async () => {
        const { from, to } = initialize();
        const create = vi.spyOn(taskMutationService, 'createRelation').mockRejectedValue(new TypeError('network lost'));
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });

        const first = await useTaskStore.getState().saveChanges();
        const second = await useTaskStore.getState().saveChanges();

        expect(first.size).toBe(1);
        expect(second.size).toBe(1);
        expect(create).toHaveBeenCalledTimes(1);
        expect(Object.values(useTaskStore.getState().pendingRelationChanges)[0]).toMatchObject({ status: 'unknown' });
        create.mockRestore();
    });

    it.each([
        [403, 'forbidden'],
        [404, 'not_found'],
        [409, 'conflict'],
        [422, 'validation_error']
    ] as const)('marks an HTTP %i relation rejection failed with its server message', async (httpStatus, status) => {
        const { from, to } = initialize();
        const { ApiMutationError } = await vi.importActual<typeof import('../api/client')>('../api/client');
        const message = `Server rejected relation with HTTP ${httpStatus}`;
        const create = vi.spyOn(taskMutationService, 'createRelation').mockRejectedValue(
            new ApiMutationError(status, message, httpStatus)
        );
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });

        const failures = await useTaskStore.getState().saveChanges();
        const draft = Object.values(useTaskStore.getState().pendingRelationChanges)[0];

        expect(failures.get(`relation:${draft.draftId}`)).toBe(message);
        expect(draft).toMatchObject({ status: 'failed', error: message });
        create.mockRestore();
    });

    it.each([
        [408, 'timeout'],
        [500, 'server failure']
    ] as const)('keeps an HTTP %i relation outcome unknown', async (httpStatus, description) => {
        const { from, to } = initialize();
        const { ApiMutationError } = await vi.importActual<typeof import('../api/client')>('../api/client');
        const create = vi.spyOn(taskMutationService, 'createRelation').mockRejectedValue(
            new ApiMutationError('transient_error', description, httpStatus)
        );
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });

        await useTaskStore.getState().saveChanges();

        expect(Object.values(useTaskStore.getState().pendingRelationChanges)[0]).toMatchObject({
            status: 'unknown',
            error: 'label_relation_result_unknown'
        });
        create.mockRestore();
    });

    it('does not send relations after a task write fails', async () => {
        const { from, to } = initialize();
        const create = vi.spyOn(taskMutationService, 'createRelation').mockResolvedValue({ id: 'new-r', from: from.id, to: to.id, type: 'precedes' } as Relation & { status: 'ok' });
        useTaskStore.getState().setAutoSave(false);
        useTaskStore.getState().updateTask(from.id, { subject: 'Edited' });
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });
        vi.mocked(apiClient.updateTask).mockImplementation(async () => ({ status: 'error', error: 'task rejected' }));

        const failures = await useTaskStore.getState().saveChanges();

        expect(apiClient.updateTask).toHaveBeenCalled();
        expect(failures.has(from.id)).toBe(true);
        expect(create).not.toHaveBeenCalled();
        expect(Object.values(useTaskStore.getState().pendingRelationChanges)[0]?.status).toBe('pending');
        create.mockRestore();
    });

    it('stops after an in-flight relation if endpoint task edits arrive', async () => {
        const { from, to } = initialize();
        const otherFrom = buildTask({ id: 'other-from', projectId: 'p1', startDate: MONDAY, dueDate: TUESDAY });
        const otherTo = buildTask({ id: 'other-to', projectId: 'p1', startDate: WEDNESDAY, dueDate: THURSDAY });
        useTaskStore.getState().applyApiData(buildApiData([from, to, otherFrom, otherTo]));
        const firstRequest = deferred<Relation & { status: 'ok' }>();
        const create = vi.spyOn(taskMutationService, 'createRelation')
            .mockReturnValueOnce(firstRequest.promise)
            .mockResolvedValueOnce({ id: 'new-r2', from: otherFrom.id, to: otherTo.id, type: 'precedes', delay: 0 } as Relation & { status: 'ok' });
        useTaskStore.getState().stageRelationCreate({ from: from.id, to: to.id, type: 'precedes', delay: 0 });
        useTaskStore.getState().stageRelationCreate({ from: otherFrom.id, to: otherTo.id, type: 'precedes', delay: 0 });

        const save = useTaskStore.getState().saveChanges();
        await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        useTaskStore.getState().updateTask(from.id, { subject: 'later edit' });
        firstRequest.resolve({ id: 'new-r', from: from.id, to: to.id, type: 'precedes', delay: 0, status: 'ok' });
        await save;

        expect(create).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().modifiedTaskIds.has(from.id)).toBe(true);
        expect(Object.values(useTaskStore.getState().pendingRelationChanges)).toHaveLength(1);
        expect(Object.values(useTaskStore.getState().pendingRelationChanges)[0]?.status).toBe('pending');
        create.mockRestore();
    });
});
