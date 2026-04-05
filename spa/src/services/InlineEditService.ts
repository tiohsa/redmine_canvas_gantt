import type { Task } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';

export class InlineEditService {
    static async saveTaskFields(params: {
        taskId: string;
        optimisticTaskUpdates: Partial<Task>;
        rollbackTaskUpdates: Partial<Task>;
        fields: Record<string, unknown>;
    }) {
        const { taskId, optimisticTaskUpdates, rollbackTaskUpdates, fields } = params;
        const { allTasks, updateTask } = useTaskStore.getState();
        const current = allTasks.find((t) => t.id === taskId);
        if (!current) throw new Error(i18n.t('label_task_not_found') || 'Task not found');

        if (Object.keys(optimisticTaskUpdates).length > 0) {
            updateTask(taskId, optimisticTaskUpdates);
        }

        const { apiClient } = await import('../api/client');
        const result = await apiClient.updateTaskFields(taskId, { ...fields, lock_version: current.lockVersion });

        if (result.status === 'ok' && result.lockVersion !== undefined) {
            updateTask(taskId, { lockVersion: result.lockVersion });
            return;
        }

        if (Object.keys(rollbackTaskUpdates).length > 0) {
            updateTask(taskId, rollbackTaskUpdates);
        }

        useUIStore.getState().addNotification(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'), 'error');
        throw new Error(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'));
    }
}

