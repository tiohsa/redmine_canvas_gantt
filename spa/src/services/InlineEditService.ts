import type { Task } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import { enqueueTaskWrite } from '../stores/taskStore/taskPersistence';

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
        const operationGeneration = useTaskStore.getState().editGenerations[taskId] ?? 0;
        const isCurrentOperation = () => (
            useTaskStore.getState().editGenerations[taskId] === operationGeneration
        );

        const { apiClient } = await import('../api/client');
        let result;
        try {
            result = await enqueueTaskWrite(taskId, () => {
                const latest = useTaskStore.getState().allTasks.find((task) => task.id === taskId);
                return apiClient.updateTaskFields(taskId, {
                    ...fields,
                    lock_version: latest?.lockVersion ?? current.lockVersion
                });
            });
        } catch (error) {
            if (isCurrentOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
                updateTask(taskId, rollbackTaskUpdates);
            }
            const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_save') || 'Failed to save');
            useUIStore.getState().addNotification(message, 'error');
            throw error;
        }

        if (result.status === 'ok') {
            if (result.lockVersion !== undefined) {
                useTaskStore.getState().setTaskLockVersion(taskId, result.lockVersion);
            }
            return;
        }

        // An optimistic-lock conflict means the server may have accepted a
        // newer remote version. Keep the local edit dirty so the normal save
        // path can retry it with the current lock version; rolling it back
        // here would silently discard the user's change.
        if (result.status !== 'conflict' && isCurrentOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
            updateTask(taskId, rollbackTaskUpdates);
        }

        useUIStore.getState().addNotification(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'), 'error');
        throw new Error(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'));
    }
}
