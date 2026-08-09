import type { Task } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import { taskMutationService } from './taskMutationService';
import { classifyMutationError, classifyMutationResult } from '../api/mutationOutcome';
import { formatDateOnly } from '../utils/dateOnly';
import { hasLocalPatchOwnership } from '../stores/taskStore/stateContract';

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
        const canonicalTask = useTaskStore.getState().allTasks.find((task) => task.id === taskId);
        const canonicalFields = { ...fields };
        if (Object.prototype.hasOwnProperty.call(fields, 'start_date') && fields.start_date !== '') {
            canonicalFields.start_date = formatDateOnly(canonicalTask?.startDate);
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'due_date') && fields.due_date !== '') {
            canonicalFields.due_date = formatDateOnly(canonicalTask?.dueDate);
        }
        const operationGeneration = useTaskStore.getState().editGenerations[taskId] ?? 0;
        const ownsOperation = () => hasLocalPatchOwnership(
            useTaskStore.getState().localTaskPatches[taskId],
            taskId,
            operationGeneration,
            `edit:${taskId}:${operationGeneration}`
        );

        let result;
        try {
            result = await taskMutationService.updateTaskFields(
                taskId,
                () => {
                    const latest = useTaskStore.getState().allTasks.find((task) => task.id === taskId);
                    return {
                        ...canonicalFields,
                        lock_version: latest?.lockVersion ?? current.lockVersion
                    };
                },
                {
                    onResult: (completedResult) => {
                        if (completedResult.status === 'ok') {
                            if (completedResult.completeness || completedResult.invalidatedEntityIds || completedResult.deletedEntityIds) {
                                useTaskStore.getState().applyTaskMutationMetadata(taskId, completedResult);
                            }
                            useTaskStore.getState().commitTaskOperation(taskId, operationGeneration, completedResult.lockVersion);
                            return;
                        }

                        if (completedResult.status === 'conflict') {
                            useTaskStore.getState().registerTaskConflict(
                                taskId,
                                completedResult.error || (i18n.t('label_conflict') || 'Conflict'),
                                operationGeneration,
                                completedResult.entity,
                                completedResult.revision ?? completedResult.entity?.lockVersion
                            );
                            return;
                        }
                        if (completedResult.status === 'not_found' && ownsOperation()) {
                            useTaskStore.getState().markTaskTombstone(taskId, 'server');
                            return;
                        }
                        if (classifyMutationResult(completedResult).kind === 'transient') return;
                        if (ownsOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
                            useTaskStore.getState().rollbackTaskOperation(taskId, operationGeneration, rollbackTaskUpdates);
                        }
                    },
                    onError: (error) => {
                        if (classifyMutationError(error).status === 'not_found' && ownsOperation()) {
                            useTaskStore.getState().markTaskTombstone(taskId, 'server');
                            return;
                        }
                        if (classifyMutationError(error).kind === 'transient') return;
                        if (ownsOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
                            useTaskStore.getState().rollbackTaskOperation(taskId, operationGeneration, rollbackTaskUpdates);
                        }
                    }
                }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_save') || 'Failed to save');
            useUIStore.getState().addNotification(message, 'error');
            throw error;
        }

        if (result.status === 'ok') return;

        // An optimistic-lock conflict means the server may have accepted a
        // newer remote version. Keep the local edit dirty so the normal save
        // path can retry it with the current lock version; rolling it back
        // here would silently discard the user's change.
        useUIStore.getState().addNotification(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'), 'error');
        throw new Error(result.error || (i18n.t('label_failed_to_save') || 'Failed to save'));
    }
}
