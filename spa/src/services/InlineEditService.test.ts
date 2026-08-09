import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineEditService } from './InlineEditService';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { apiClient } from '../api/client';
import type { Task } from '../types';
import { configureBusinessCalendar } from '../utils/businessCalendar';

vi.mock('../api/client', () => ({
    apiClient: {
        updateTaskFields: vi.fn()
    }
}));

const buildTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    subject: 'Original subject',
    startDate: 0,
    dueDate: 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 3,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

describe('InlineEditService', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
        vi.clearAllMocks();
    });

    it('applies optimistic update and stores returned lock version on success', async () => {
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'ok',
            lockVersion: 4
        });

        await InlineEditService.saveTaskFields({
            taskId: 'task-1',
            optimisticTaskUpdates: { subject: 'Updated subject' },
            rollbackTaskUpdates: { subject: 'Original subject' },
            fields: { subject: 'Updated subject' }
        });

        const updated = useTaskStore.getState().allTasks.find((task) => task.id === 'task-1');
        expect(updated?.subject).toBe('Updated subject');
        expect(updated?.lockVersion).toBe(4);
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(false);
        expect(useTaskStore.getState().localTaskPatches['task-1']).toBeUndefined();
        expect(useTaskStore.getState().serverTaskSnapshot.entitiesById['task-1']?.subject).toBe('Updated subject');
        expect(useUIStore.getState().notifications).toHaveLength(0);
        expect(apiClient.updateTaskFields).toHaveBeenCalledWith('task-1', {
            subject: 'Updated subject',
            lock_version: 3
        }, expect.stringMatching(/^mutation:/));
    });

    it('sends the canonical working date for an inline date edit', async () => {
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
            const initialTask = buildTask({
                projectId: 'p1',
                startDate: Date.UTC(2026, 0, 5),
                dueDate: Date.UTC(2026, 0, 6)
            });
            useTaskStore.setState({ allTasks: [initialTask], tasks: [initialTask] });
            vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 4 });

            await InlineEditService.saveTaskFields({
                taskId: 'task-1',
                optimisticTaskUpdates: { dueDate: Date.UTC(2026, 0, 7) },
                rollbackTaskUpdates: { dueDate: initialTask.dueDate },
                fields: { due_date: '2026-01-07' }
            });

            expect(apiClient.updateTaskFields).toHaveBeenCalledWith('task-1', {
                due_date: '2026-01-06',
                lock_version: 3
            }, expect.stringMatching(/^mutation:/));
        } finally {
            configureBusinessCalendar(undefined);
        }
    });

    it('rolls back optimistic update and pushes error notification on failure', async () => {
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });

        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'error',
            error: 'Validation failed'
        });

        await expect(
            InlineEditService.saveTaskFields({
                taskId: 'task-1',
                optimisticTaskUpdates: { subject: 'Updated subject' },
                rollbackTaskUpdates: { subject: 'Original subject' },
                fields: { subject: 'Updated subject' }
            })
        ).rejects.toThrow('Validation failed');

        const rolledBack = useTaskStore.getState().allTasks.find((task) => task.id === 'task-1');
        expect(rolledBack?.subject).toBe('Original subject');
        expect(useUIStore.getState().notifications[0]?.type).toBe('error');
        expect(useUIStore.getState().notifications[0]?.message).toBe('Validation failed');
    });

    it('tombstones the task without rollback when a rejected mutation is not_found', async () => {
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });

        vi.mocked(apiClient.updateTaskFields).mockRejectedValueOnce(
            Object.assign(new Error('Task no longer exists'), { status: 'not_found' })
        );

        await expect(
            InlineEditService.saveTaskFields({
                taskId: 'task-1',
                optimisticTaskUpdates: { subject: 'Local edit' },
                rollbackTaskUpdates: { subject: 'Original subject' },
                fields: { subject: 'Local edit' }
            })
        ).rejects.toThrow('Task no longer exists');

        const state = useTaskStore.getState();
        expect(state.allTasks.some((task) => task.id === 'task-1')).toBe(false);
        expect(state.taskTombstones['task-1']?.source).toBe('server');
        expect(state.modifiedTaskIds.has('task-1')).toBe(false);
        expect(state.localTaskPatches['task-1']).toBeUndefined();
        expect(state.taskConflicts['task-1']).toBeUndefined();
        expect(useUIStore.getState().notifications[0]?.message).toBe('Task no longer exists');
    });

    it('does not let an earlier failure roll back a newer inline edit', async () => {
        const firstSave = deferred<{ status: 'error'; error: string }>();
        vi.mocked(apiClient.updateTaskFields)
            .mockReturnValueOnce(firstSave.promise)
            .mockResolvedValueOnce({ status: 'error', error: 'First edit failed' })
            .mockResolvedValueOnce({ status: 'ok', lockVersion: 5 });
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });

        const first = InlineEditService.saveTaskFields({
            taskId: 'task-1',
            optimisticTaskUpdates: { subject: 'First edit' },
            rollbackTaskUpdates: { subject: 'Original subject' },
            fields: { subject: 'First edit' }
        });
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));

        const second = InlineEditService.saveTaskFields({
            taskId: 'task-1',
            optimisticTaskUpdates: { subject: 'Second edit' },
            rollbackTaskUpdates: { subject: 'First edit' },
            fields: { subject: 'Second edit' }
        });
        firstSave.resolve({ status: 'error', error: 'First edit failed' });

        const results = await Promise.allSettled([first, second]);
        expect(results[0]?.status).toBe('rejected');
        expect(results[1]?.status).toBe('fulfilled');
        expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Second edit');
        expect(useTaskStore.getState().allTasks[0]?.lockVersion).toBe(5);
        expect(apiClient.updateTaskFields).toHaveBeenLastCalledWith('task-1', {
            subject: 'Second edit',
            lock_version: 3
        }, expect.stringMatching(/^mutation:/));
    });

    it('uses the committed lock version for a queued newer inline edit', async () => {
        const firstSave = deferred<{ status: 'ok'; lockVersion: number }>();
        vi.mocked(apiClient.updateTaskFields)
            .mockReturnValueOnce(firstSave.promise)
            .mockResolvedValueOnce({ status: 'ok', lockVersion: 5 });
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });

        const first = InlineEditService.saveTaskFields({
            taskId: 'task-1',
            optimisticTaskUpdates: { subject: 'First edit' },
            rollbackTaskUpdates: { subject: 'Original subject' },
            fields: { subject: 'First edit' }
        });
        await vi.waitFor(() => expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1));

        const second = InlineEditService.saveTaskFields({
            taskId: 'task-1',
            optimisticTaskUpdates: { subject: 'Second edit' },
            rollbackTaskUpdates: { subject: 'First edit' },
            fields: { subject: 'Second edit' }
        });
        expect(apiClient.updateTaskFields).toHaveBeenCalledTimes(1);

        firstSave.resolve({ status: 'ok', lockVersion: 4 });
        await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
        expect(apiClient.updateTaskFields).toHaveBeenLastCalledWith('task-1', {
            subject: 'Second edit',
            lock_version: 4
        }, expect.stringMatching(/^mutation:/));
        expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Second edit');
        expect(useTaskStore.getState().allTasks[0]?.lockVersion).toBe(5);
    });

    it('keeps the optimistic edit dirty when the server reports a conflict', async () => {
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'conflict',
            error: 'The task changed on the server.',
            entity: { id: 'task-1', subject: 'Remote edit', lockVersion: 4 },
            revision: 4
        });

        await expect(
            InlineEditService.saveTaskFields({
                taskId: 'task-1',
                optimisticTaskUpdates: { subject: 'Local edit' },
                rollbackTaskUpdates: { subject: 'Original subject' },
                fields: { subject: 'Local edit' }
            })
        ).rejects.toThrow('The task changed on the server.');

        expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Local edit');
        expect(useTaskStore.getState().modifiedTaskIds.has('task-1')).toBe(true);
        expect(useTaskStore.getState().taskConflicts['task-1']).toMatchObject({
            message: 'The task changed on the server.',
            generation: 1,
            remoteEntity: { id: 'task-1', subject: 'Remote edit', lockVersion: 4 },
            remoteRevision: 4
        });
    });
});
