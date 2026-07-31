import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineEditService } from './InlineEditService';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { apiClient } from '../api/client';
import type { Task } from '../types';

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
        expect(useUIStore.getState().notifications).toHaveLength(0);
        expect(apiClient.updateTaskFields).toHaveBeenCalledWith('task-1', {
            subject: 'Updated subject',
            lock_version: 3
        });
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

    it('does not let an earlier failure roll back a newer inline edit', async () => {
        const firstSave = deferred<{ status: 'error'; error: string }>();
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
        firstSave.resolve({ status: 'error', error: 'First edit failed' });

        const results = await Promise.allSettled([first, second]);
        expect(results[0]?.status).toBe('rejected');
        expect(results[1]?.status).toBe('fulfilled');
        expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Second edit');
        expect(useTaskStore.getState().allTasks[0]?.lockVersion).toBe(5);
        expect(apiClient.updateTaskFields).toHaveBeenLastCalledWith('task-1', {
            subject: 'Second edit',
            lock_version: 3
        });
    });

    it('keeps the optimistic edit dirty when the server reports a conflict', async () => {
        const initialTask = buildTask();
        useTaskStore.setState({
            allTasks: [initialTask],
            tasks: [initialTask]
        });
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({
            status: 'conflict',
            error: 'The task changed on the server.'
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
    });
});
