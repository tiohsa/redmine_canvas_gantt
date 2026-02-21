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
});
