import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import type { Task } from '../../types';
import { AutoScheduleMoveMode, DatePlacementMode } from '../../types/constraints';
import { configureBusinessCalendar } from '../../utils/businessCalendar';
import { parseDateOnly } from '../../utils/dateOnly';
import { useTaskStore } from '../TaskStore';
import { useUIStore } from '../UIStore';

vi.mock('../../api/client', () => ({ apiClient: {
    fetchData: vi.fn(), updateTask: vi.fn(), updateTaskFields: vi.fn(), scheduleMutation: vi.fn()
} }));

const date = (day: number) => parseDateOnly(`2027-01-${String(day).padStart(2, '0')}`)!;
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
    id, subject: id, projectId: 'project', startDate: date(6), dueDate: date(7),
    lockVersion: 2, ratioDone: 0, statusId: 1, editable: true, rowIndex: 0, hasChildren: false, ...overrides
});
const data = (tasks: Task[]) => ({ tasks, relations: [], versions: [], statuses: [], customFields: [],
    filterOptions: { projects: [], assignees: [] }, project: { id: 'project', name: 'Project' },
    permissions: { editable: true, viewable: true, baselineEditable: true }
});
const parent = () => task('parent', { datesDerived: true, startDate: date(4), dueDate: date(15) });

describe('derived parent schedule persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState({ datePlacementMode: DatePlacementMode.CalendarDays, autoScheduleMoveMode: AutoScheduleMoveMode.Off });
        configureBusinessCalendar({ defaultCalendarId: 'weekdays', calendars: {
            weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} }
        } });
    });
    afterEach(() => {
        configureBusinessCalendar(null);
        useUIStore.setState({ datePlacementMode: DatePlacementMode.WorkingDays });
    });

    it.each([false, true])('saves weekend child dates without writing either ancestor, autoSave=%s', async autoSave => {
        const grandparent = task('grandparent', { datesDerived: true, startDate: date(4), dueDate: date(15) });
        const p = { ...parent(), parentId: grandparent.id };
        const child = task('child', { parentId: p.id });
        const savedChild = { ...child, dueDate: date(9), lockVersion: 3 };
        vi.mocked(apiClient.fetchData).mockResolvedValue(data([grandparent, p, savedChild]));
        vi.mocked(apiClient.scheduleMutation).mockResolvedValue({ status: 'ok', operationId: 'save',
            entities: [grandparent, p, savedChild], revisions: { grandparent: 2, parent: 2, child: 3 }
        });
        useTaskStore.getState().applyApiData(data([grandparent, p, child]));
        useTaskStore.setState({ autoSave });
        const operation = useTaskStore.getState().beginBarOperation(child.id);
        useTaskStore.getState().updateTask(child.id, { dueDate: date(9) });
        useTaskStore.getState().endBarOperation(operation);
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([child.id]));
        expect(useTaskStore.getState().allTasks.find(t => t.id === p.id)?.dueDate).toBe(date(9));

        expect(await useTaskStore.getState().saveChanges()).toEqual(new Map());

        expect(apiClient.scheduleMutation).toHaveBeenCalledWith([
            expect.objectContaining({ taskId: child.id, dueDate: date(9), datePlacementMode: DatePlacementMode.CalendarDays })
        ], expect.any(String));
        for (const ancestor of [p, grandparent]) {
            expect(useTaskStore.getState().allTasks.find(t => t.id === ancestor.id)).toMatchObject(ancestor);
            expect(useTaskStore.getState().localTaskPatches[ancestor.id]).toBeUndefined();
        }
        expect(useTaskStore.getState().barOperations).toEqual({});
    });

    it('keeps the child draft and ancestor preview after a rejected schedule save and refresh', async () => {
        const p = parent();
        const child = task('child', { parentId: p.id });
        vi.mocked(apiClient.fetchData).mockResolvedValue(data([p, child]));
        vi.mocked(apiClient.scheduleMutation).mockResolvedValue({ status: 'validation_error', operationId: 'save',
            entities: [], revisions: {}, errors: ['Schedule rejected']
        });
        useTaskStore.getState().applyApiData(data([p, child]));
        useTaskStore.setState({ autoSave: false });
        useTaskStore.getState().updateTask(child.id, { dueDate: date(9) });
        const patches = useTaskStore.getState().localTaskPatches;

        expect((await useTaskStore.getState().saveChanges()).get(child.id)).toBe('Schedule rejected');
        await useTaskStore.getState().refreshData();

        expect(useTaskStore.getState().localTaskPatches).toEqual(patches);
        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([child.id]));
        expect(useTaskStore.getState().allTasks.find(t => t.id === p.id)?.dueDate).toBe(date(9));
    });

    it('settles ancestor dates even when its independent subject save fails', async () => {
        const p = parent();
        const child = task('child', { parentId: p.id });
        const savedChild = { ...child, dueDate: date(9), lockVersion: 3 };
        vi.mocked(apiClient.fetchData).mockResolvedValue(data([p, savedChild]));
        vi.mocked(apiClient.scheduleMutation).mockResolvedValue({ status: 'ok', operationId: 'save',
            entities: [p, savedChild], revisions: { parent: 2, child: 3 }
        });
        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'forbidden', error: 'Title rejected' });
        useTaskStore.getState().applyApiData(data([p, child]));
        useTaskStore.setState({ autoSave: false });
        useTaskStore.getState().updateTask(p.id, { subject: 'Unsent title' });
        useTaskStore.getState().updateTask(child.id, { dueDate: date(9) });

        expect((await useTaskStore.getState().saveChanges()).get(p.id)).toBe('Title rejected');

        expect(useTaskStore.getState().allTasks.find(t => t.id === p.id)).toMatchObject({
            startDate: p.startDate, dueDate: p.dueDate, subject: 'Unsent title'
        });
        expect(useTaskStore.getState().localTaskPatches[p.id]).toEqual([
            expect.objectContaining({ mutationIntent: { subject: 'Unsent title' }, projection: { subject: 'Unsent title' } })
        ]);
    });

    it('keeps derived parent dates out of a relation-induced schedule plan', () => {
        const p = parent();
        const source = task('source', { startDate: date(4), dueDate: date(8) });
        const child = task('child', { parentId: p.id });
        useTaskStore.getState().applyApiData(data([p, source, child]));
        configureBusinessCalendar({ defaultCalendarId: 'weekdays', calendars: {
            weekdays: { id: 'weekdays', name: 'Weekdays', nonWorkingWeekDays: [0, 6], days: {} }
        } });

        useTaskStore.getState().addRelation({ id: 'relation', from: source.id, to: child.id, type: 'precedes' });

        expect(useTaskStore.getState().modifiedTaskIds).toEqual(new Set([child.id]));
        expect(useTaskStore.getState().localTaskPatches[p.id]?.[0].mutationIntent).toEqual({});
        expect(useTaskStore.getState().allTasks.find(t => t.id === child.id)?.startDate).toBe(date(11));
    });

    it.each(['local', 'remote'] as const)('settles an ancestor preview after choosing the %s child schedule', async choice => {
        const p = parent();
        const child = task('child', { parentId: p.id });
        const remoteChild = { ...child, lockVersion: 3 };
        vi.mocked(apiClient.fetchData).mockResolvedValue(data([p, remoteChild]));
        vi.mocked(apiClient.scheduleMutation).mockResolvedValueOnce({ status: 'conflict', operationId: 'save',
            entities: [remoteChild], revisions: { child: 3 },
            conflicts: [{ taskId: child.id, expectedRevision: 2, actualRevision: 3 }]
        });
        useTaskStore.getState().applyApiData(data([p, child]));
        useTaskStore.setState({ autoSave: false });
        useTaskStore.getState().updateTask(child.id, { dueDate: date(9) });
        expect((await useTaskStore.getState().saveChanges()).has(child.id)).toBe(true);

        vi.mocked(apiClient.scheduleMutation).mockImplementation(async (changes, operationId, resolution) => ({
            status: 'ok', operationId, entities: [p, { ...remoteChild,
                ...(changes.length ? { dueDate: date(9), lockVersion: 4 } : {}) }],
            revisions: { parent: 2, child: changes.length ? 4 : 3 },
            ...(resolution?.preview ? { resolutionContext: { token: 'review', taskIds: [p.id, child.id], relations: [] } } : {})
        }));
        await useTaskStore.getState().resolveTaskConflict(child.id, choice);
        await useTaskStore.getState().applyScheduleConflict(child.id);

        expect(useTaskStore.getState().taskConflicts).toEqual({});
        expect(useTaskStore.getState().allTasks.find(t => t.id === p.id)).toMatchObject(p);
        expect(useTaskStore.getState().localTaskPatches[p.id]).toBeUndefined();
        expect(vi.mocked(apiClient.scheduleMutation).mock.calls.at(-1)?.[0].map(change => change.taskId))
            .toEqual(choice === 'local' ? [child.id] : []);
    });
});
