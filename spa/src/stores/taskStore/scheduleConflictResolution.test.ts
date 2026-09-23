import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../TaskStore';
import { taskMutationService } from '../../services/taskMutationService';
import { createServerSnapshot } from './stateContract';
import { scheduleConflictPlan } from './scheduleConflictResolution';
import type { Task } from '../../types';
import { parseDateOnly } from '../../utils/dateOnly';
import { configureBusinessCalendar } from '../../utils/businessCalendar';

vi.mock('../../services/taskMutationService', async importOriginal => ({
    ...await importOriginal<typeof import('../../services/taskMutationService')>(),
    taskMutationService: { scheduleMutation: vi.fn(), updateTaskFields: vi.fn() }
}));
const date = (day: number) => parseDateOnly(`2027-01-${String(day).padStart(2, '0')}`)!;
const task = (id: string, start: number, due: number): Task => ({ id, subject: id, startDate: date(start), dueDate: date(due),
    lockVersion: 2, ratioDone: 0, statusId: 1, editable: true, rowIndex: 0, hasChildren: false });
const api = vi.mocked(taskMutationService.scheduleMutation);

function setup(bridge = false) {
    const tasks = [task('A', 4, 5), task('B', 6, 7), ...(bridge ? [task('C', 8, 11)] : []), task('unrelated', 4, 5)];
    const target = bridge ? 'C' : 'B';
    const relations = [{ id: 'AB', from: 'A', to: 'B', type: 'precedes', delay: 0 },
        ...(bridge ? [{ id: 'BC', from: 'B', to: 'C', type: 'precedes', delay: 0 }] : [])];
    useTaskStore.setState({ allTasks: tasks, tasks, relations, serverTaskSnapshot: createServerSnapshot(tasks),
        localTaskPatches: Object.fromEntries(['A', target, 'unrelated'].map(id => [id, [{ entityId: id, generation: 1,
            operationId: `edit:${id}:1`, mutationIntent: { startDate: date(id === 'A' ? 1 : 12), dueDate: date(id === 'A' ? 4 : 13) },
            projection: { startDate: date(id === 'A' ? 1 : 12), dueDate: date(id === 'A' ? 4 : 13) } }]])),
        editGenerations: { A: 1, [target]: 1, unrelated: 1 }, modifiedTaskIds: new Set(['A', target, 'unrelated']),
        taskConflicts: Object.fromEntries(['A', target].map(id => [id, { taskId: id, detectedAt: 1, generation: 1,
            message: 'Conflict', remoteRevision: 2, remoteEntity: tasks.find(task => task.id === id), remoteAvailability: 'known' as const,
            scheduleOperation: { A: 1, [target]: 1 } }])) });
    api.mockImplementation(async (changes, resolution) => {
        const entities = tasks.filter(task => task.id !== 'unrelated').map(task => {
            const change = changes.find(change => change.taskId === task.id);
            return change ? { ...task, startDate: change.startDate ?? undefined, dueDate: change.dueDate ?? undefined, lockVersion: 3 } : task;
        });
        return { status: 'ok', operationId: 'schedule:test', entities, revisions: Object.fromEntries(entities.map(task => [task.id, task.lockVersion])),
            ...(resolution?.preview ? { resolutionContext: { token: 'review:1', taskIds: entities.map(task => task.id), relations } } : {}) };
    });
    return { target, tasks };
}

describe('schedule conflict group resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        configureBusinessCalendar({ defaultCalendarId: 'weekdays', calendars: {
            weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} }
        } });
    });

    for (const autoSave of [true, false]) for (const order of [['A', 'B'], ['B', 'A']]) {
        it(`selects without saving and applies the same mixed plan: autosave=${autoSave}, order=${order}`, async () => {
            setup();
            useTaskStore.setState({ autoSave });
            const patches = useTaskStore.getState().localTaskPatches;
            for (const id of order) await useTaskStore.getState().resolveTaskConflict(id, id === 'A' ? 'remote' : 'local');
            expect(api).toHaveBeenCalledTimes(1);
            expect(api.mock.calls[0][1]?.preview).toBe(true);
            expect(taskMutationService.updateTaskFields).not.toHaveBeenCalled();
            expect(useTaskStore.getState().localTaskPatches).toBe(patches);
            expect(Object.keys(useTaskStore.getState().taskConflicts)).toEqual(['A', 'B']);
            await useTaskStore.getState().applyScheduleConflict('A');
            expect(api).toHaveBeenCalledTimes(2);
            expect(api.mock.calls[1][0]).toEqual([expect.objectContaining({ taskId: 'B', baseRevision: 2, startDate: date(12), dueDate: date(13) })]);
            expect(useTaskStore.getState().taskConflicts).toEqual({});
            expect(useTaskStore.getState().allTasks.find(task => task.id === 'A')?.startDate).toBe(date(4));
            expect(useTaskStore.getState().allTasks.find(task => task.id === 'B')?.startDate).toBe(date(12));
            expect(useTaskStore.getState().localTaskPatches.unrelated).toEqual(patches.unrelated);
        });
    }

    it('keeps both drafts and choices when mixed dates violate the dependency', async () => {
        setup();
        const state = useTaskStore.getState();
        useTaskStore.setState({ localTaskPatches: { ...state.localTaskPatches, B: [{ ...state.localTaskPatches.B[0],
            mutationIntent: { startDate: date(4), dueDate: date(5) } }] } });
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        await useTaskStore.getState().resolveTaskConflict('B', 'local');
        const patches = useTaskStore.getState().localTaskPatches;
        const review = useTaskStore.getState().taskConflicts.A.scheduleReview!;
        expect(scheduleConflictPlan(useTaskStore.getState(), review).error).toBeTruthy();
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(api).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().localTaskPatches).toBe(patches);
        expect(useTaskStore.getState().taskConflicts.B.scheduleChoice).toBe('local');
    });

    it('keeps choices and drafts after the server refuses a callback-induced change', async () => {
        setup();
        await useTaskStore.getState().resolveTaskConflict('A', 'local');
        await useTaskStore.getState().resolveTaskConflict('B', 'remote');
        api.mockResolvedValueOnce({ status: 'validation_error', operationId: 'apply', entities: [], revisions: {}, errors: ['Selected dates would change'] });
        const patches = useTaskStore.getState().localTaskPatches;
        await useTaskStore.getState().applyScheduleConflict('B');
        expect(useTaskStore.getState().localTaskPatches).toBe(patches);
        expect(useTaskStore.getState().taskConflicts.A.scheduleChoice).toBe('local');
        expect(useTaskStore.getState().taskConflicts.B.scheduleChoice).toBe('remote');
        expect(useTaskStore.getState().taskConflicts.B.scheduleReview?.error).toBe('Selected dates would change');
    });

    it('shows a read-only successor adjustment, then applies only the explicitly accepted result', async () => {
        const { tasks } = setup();
        const state = useTaskStore.getState();
        useTaskStore.setState({ taskConflicts: { A: { ...state.taskConflicts.A, scheduleOperation: { A: 1 } } },
            localTaskPatches: { A: state.localTaskPatches.A, unrelated: state.localTaskPatches.unrelated },
            modifiedTaskIds: new Set(['A', 'unrelated']) });
        await useTaskStore.getState().resolveTaskConflict('A', 'local');
        const adjustment = { taskId: 'B', beforeStartDate: date(6), beforeDueDate: date(7), startDate: date(5), dueDate: date(6) };
        api.mockResolvedValueOnce({ status: 'validation_error', operationId: 'probe', entities: [], revisions: {},
            errors: ['Review the adjusted schedule before applying.'], adjustments: [adjustment] });
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(useTaskStore.getState().taskConflicts.B).toBeUndefined();
        expect(useTaskStore.getState().taskConflicts.A.scheduleReview?.adjustments?.values).toEqual([adjustment]);
        expect(useTaskStore.getState().localTaskPatches.A).toBeDefined();
        expect(api).toHaveBeenCalledTimes(2);

        await useTaskStore.getState().applyScheduleConflict('A');
        expect(api).toHaveBeenCalledTimes(2);
        api.mockResolvedValueOnce({ status: 'ok', operationId: 'approved',
            entities: [{ ...tasks[0], startDate: date(1), dueDate: date(4), lockVersion: 3 },
                { ...tasks[1], startDate: date(5), dueDate: date(6), lockVersion: 3 }],
            revisions: { A: 3, B: 3 } });
        await useTaskStore.getState().applyScheduleConflict('A', true);
        expect(api.mock.calls[2][1]?.acceptedAdjustments).toEqual([adjustment]);
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'B')?.startDate).toBe(date(5));
        expect(useTaskStore.getState().taskConflicts.A).toBeUndefined();
    });

    it('clears a pending adjustment when the user changes the selected version', async () => {
        setup();
        await useTaskStore.getState().resolveTaskConflict('A', 'local');
        await useTaskStore.getState().resolveTaskConflict('B', 'remote');
        api.mockResolvedValueOnce({ status: 'validation_error', operationId: 'probe', entities: [], revisions: {},
            adjustments: [{ taskId: 'B', startDate: date(5), dueDate: date(6) }] });
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(useTaskStore.getState().taskConflicts.A.scheduleReview?.adjustments).toBeDefined();
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        expect(useTaskStore.getState().taskConflicts.A.scheduleReview?.adjustments).toBeUndefined();
        await useTaskStore.getState().applyScheduleConflict('A', true);
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('validates through B in A→B→C without turning B into a conflict or saving unrelated drafts', async () => {
        setup(true);
        await useTaskStore.getState().resolveTaskConflict('C', 'local');
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        expect(useTaskStore.getState().taskConflicts.B).toBeUndefined();
        expect(useTaskStore.getState().taskConflicts.A.scheduleReview?.taskIds).toEqual(['A', 'B', 'C']);
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(api.mock.calls[1][0].map(change => change.taskId)).toEqual(['C']);
    });

    it('requires re-review after a scope conflict without refreshing the token or losing choices', async () => {
        setup();
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        await useTaskStore.getState().resolveTaskConflict('B', 'local');
        api.mockResolvedValueOnce({ status: 'conflict', operationId: 'apply', entities: [], revisions: {} });
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(useTaskStore.getState().taskConflicts.A.scheduleReview?.stale).toBe(true);
        expect(useTaskStore.getState().taskConflicts.B.scheduleChoice).toBe('local');
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('preserves later date generations and residual non-date fields on successful application', async () => {
        setup();
        const patches = useTaskStore.getState().localTaskPatches;
        patches.B[0].mutationIntent.subject = 'Unsent title';
        useTaskStore.setState({ barOperations: { original: { operationId: 'original', baselineAllTasks: [],
            baselineGenerations: { B: 0 }, entityGenerations: { B: 1 }, completedTaskIds: [] } } });
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        await useTaskStore.getState().resolveTaskConflict('B', 'local');
        useTaskStore.setState({ localTaskPatches: { ...patches, B: [...patches.B, { entityId: 'B', generation: 2,
            operationId: 'later', mutationIntent: { dueDate: date(14) }, projection: { dueDate: date(14) } }] } });
        await useTaskStore.getState().applyScheduleConflict('A');
        expect(api.mock.calls[1][0][0].dueDate).toBe(date(13));
        expect(useTaskStore.getState().localTaskPatches.B.map(patch => patch.mutationIntent)).toEqual([{ subject: 'Unsent title' }, { dueDate: date(14) }]);
        expect(useTaskStore.getState().modifiedTaskIds.has('B')).toBe(true);
        expect(useTaskStore.getState().barOperations.original).toBeDefined();
    });

    it('keeps drafts and operation ownership when the review is unavailable', async () => {
        setup();
        const operation = useTaskStore.getState().beginBarOperation('A');
        useTaskStore.getState().updateTask('A', { dueDate: date(6) });
        useTaskStore.getState().endBarOperation(operation);
        const before = useTaskStore.getState();
        api.mockResolvedValueOnce({ status: 'not_found', operationId: 'review', entities: [], revisions: {}, errors: ['Scope unavailable'] });
        await expect(useTaskStore.getState().resolveTaskConflict('A', 'remote')).rejects.toThrow('Scope unavailable');
        expect(useTaskStore.getState().localTaskPatches).toBe(before.localTaskPatches);
        expect(useTaskStore.getState().barOperations).toBe(before.barOperations);
    });

    it('settles only reviewed ownership and keeps an operation created while applying', async () => {
        setup();
        const operation = useTaskStore.getState().beginBarOperation('B');
        useTaskStore.getState().updateTask('B', { startDate: date(12), dueDate: date(13) });
        useTaskStore.getState().endBarOperation(operation);
        const generation = useTaskStore.getState().editGenerations.B;
        useTaskStore.getState().registerTaskConflict('B', 'Conflict', generation, task('B', 6, 7), 2);
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        await useTaskStore.getState().resolveTaskConflict('B', 'local');
        let finish!: (value: Awaited<ReturnType<typeof taskMutationService.scheduleMutation>>) => void;
        api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const applying = useTaskStore.getState().applyScheduleConflict('A');
        const later = useTaskStore.getState().beginBarOperation('B');
        useTaskStore.getState().updateTask('B', { subject: 'Later edit' });
        useTaskStore.getState().endBarOperation(later);
        finish({ status: 'ok', operationId: 'apply', entities: [task('A', 4, 5), { ...task('B', 12, 13), lockVersion: 3 }], revisions: { A: 2, B: 3 } });
        await applying;
        expect(useTaskStore.getState().barOperations[operation]).toBeUndefined();
        expect(useTaskStore.getState().barOperations[later]).toBeDefined();
        expect(useTaskStore.getState().allTasks.find(task => task.id === 'B')?.subject).toBe('Later edit');
    });

    it('does not let a late review replace a newer conflict', async () => {
        setup();
        const implementation = api.getMockImplementation()!;
        let finish!: (value: Awaited<ReturnType<typeof taskMutationService.scheduleMutation>>) => void;
        api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const selecting = useTaskStore.getState().resolveTaskConflict('A', 'remote');
        useTaskStore.getState().registerTaskConflict('A', 'New conflict', 2, { ...task('A', 4, 5), lockVersion: 3 }, 3);
        const newer = useTaskStore.getState().taskConflicts.A;
        finish(await implementation([], { taskIds: ['A', 'B'], preview: true }));
        await selecting;
        expect(useTaskStore.getState().taskConflicts.A).toBe(newer);
        expect(useTaskStore.getState().taskConflicts.A.scheduleChoice).toBeUndefined();
    });

    it('does not settle a newly conflicted read-only intermediary after an older apply completes', async () => {
        setup(true);
        await useTaskStore.getState().resolveTaskConflict('A', 'remote');
        await useTaskStore.getState().resolveTaskConflict('C', 'local');
        const implementation = api.getMockImplementation()!;
        let finish!: (value: Awaited<ReturnType<typeof taskMutationService.scheduleMutation>>) => void;
        api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const applying = useTaskStore.getState().applyScheduleConflict('A');
        useTaskStore.getState().registerTaskConflict('B', 'New conflict', 2, { ...task('B', 6, 7), lockVersion: 3 }, 3);
        const patches = useTaskStore.getState().localTaskPatches;
        finish(await implementation([], { taskIds: ['A', 'C'], token: 'review:1' }));
        await applying;
        expect(useTaskStore.getState().taskConflicts.B.message).toBe('New conflict');
        expect(useTaskStore.getState().localTaskPatches).toBe(patches);
    });
});
