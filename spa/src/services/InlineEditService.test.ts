import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineEditService } from './InlineEditService';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task } from '../types';

vi.mock('../api/client', () => ({
    apiClient: {
        updateTaskFields: vi.fn()
    }
}));

import { apiClient } from '../api/client';

const buildTask = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    subject: 'Task',
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

        useTaskStore.getState().setTasks([buildTask({ categoryId: 1, categoryName: 'Old' })]);
        vi.mocked(apiClient.updateTaskFields).mockReset();
    });

    it('updates lockVersion on successful save', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 4, taskId: '1' });

        await InlineEditService.saveTaskFields({
            taskId: '1',
            optimisticTaskUpdates: { categoryId: 2, categoryName: 'New' },
            rollbackTaskUpdates: { categoryId: 1, categoryName: 'Old' },
            fields: { category_id: 2 }
        });

        const updated = useTaskStore.getState().allTasks.find((task) => task.id === '1');
        expect(updated?.categoryId).toBe(2);
        expect(updated?.categoryName).toBe('New');
        expect(updated?.lockVersion).toBe(4);
    });

    it('rolls back optimistic updates and notifies on conflict/error', async () => {
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'conflict', error: 'Conflict error' });

        await expect(
            InlineEditService.saveTaskFields({
                taskId: '1',
                optimisticTaskUpdates: { categoryId: 2, categoryName: 'New' },
                rollbackTaskUpdates: { categoryId: 1, categoryName: 'Old' },
                fields: { category_id: 2 }
            })
        ).rejects.toThrow('Conflict error');

        const rolledBack = useTaskStore.getState().allTasks.find((task) => task.id === '1');
        expect(rolledBack?.categoryId).toBe(1);
        expect(rolledBack?.categoryName).toBe('Old');
        expect(useUIStore.getState().notifications.at(-1)?.message).toBe('Conflict error');
    });
});
