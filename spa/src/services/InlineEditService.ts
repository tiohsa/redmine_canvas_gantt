import type { Task } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { responseMatchesIntendedFields, taskMutationService } from './taskMutationService';
import { classifyMutationError, classifyMutationResult, classifyMutationSourceDisposition } from '../api/mutationOutcome';
import { formatDateOnly } from '../utils/dateOnly';
import { hasLocalPatchOwnership } from '../stores/taskStore/stateContract';
import { useUIStore } from '../stores/UIStore';
import { materializedTaskUpdates } from '../stores/taskStore/draftIntent';
import { mutationLifecycleMetrics } from '../stores/taskStore/taskPersistence';
import { canApplyReadResponse } from '../stores/taskStore/stateContract';

export class InlineEditService {
    static async saveTaskFields(params: {
        taskId: string;
        optimisticTaskUpdates: Partial<Task>;
        rollbackTaskUpdates: Partial<Task>;
        fields: Record<string, unknown>;
    }) {
        const { taskId, optimisticTaskUpdates, rollbackTaskUpdates, fields } = params;
        const { allTasks, updateTask, autoSave } = useTaskStore.getState();
        const current = allTasks.find((t) => t.id === taskId);
        if (!current) throw new Error(i18n.t('label_task_not_found') || 'Task not found');
        const datePlacementMode = useUIStore.getState().datePlacementMode;

        if (Object.keys(optimisticTaskUpdates).length > 0) {
            updateTask(taskId, optimisticTaskUpdates, materializedTaskUpdates(fields), datePlacementMode);
        }
        if (!autoSave) return;

        const operationGeneration = useTaskStore.getState().editGenerations[taskId] ?? 0;
        const canonicalTask = useTaskStore.getState().allTasks.find((task) => task.id === taskId);
        const canonicalFields = { ...fields };
        if (Object.prototype.hasOwnProperty.call(fields, 'start_date') && fields.start_date !== '') {
            canonicalFields.start_date = formatDateOnly(canonicalTask?.startDate);
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'due_date') && fields.due_date !== '') {
            canonicalFields.due_date = formatDateOnly(canonicalTask?.dueDate);
        }
        const ownsOperation = () => hasLocalPatchOwnership(
            useTaskStore.getState().localTaskPatches[taskId],
            taskId,
            operationGeneration,
            `edit:${taskId}:${operationGeneration}`
        );

        let result;
        let attemptedBaseRevision = current.lockVersion;
        try {
            result = await taskMutationService.updateTaskFields(
                taskId,
                () => {
                    const latest = useTaskStore.getState().allTasks.find((task) => task.id === taskId);
                    attemptedBaseRevision = latest?.lockVersion ?? current.lockVersion;
                    return {
                        ...canonicalFields,
                        lock_version: attemptedBaseRevision
                    };
                },
                {
                    onResult: (completedResult) => {
                        if (completedResult.status === 'ok') {
                            useTaskStore.getState().applyTaskMutationMetadata(taskId, completedResult);
                            useTaskStore.getState().commitTaskOperation(taskId, operationGeneration, completedResult.lockVersion);
                            return;
                        }
                        if (completedResult.status === 'conflict' || completedResult.status === 'protocol_error') {
                            if (!ownsOperation()) return;
                            useTaskStore.getState().registerTaskConflict(
                                taskId,
                                completedResult.error || (i18n.t('label_conflict') || 'Conflict'),
                                operationGeneration,
                                completedResult.status === 'protocol_error' ? undefined : completedResult.entity,
                                completedResult.status === 'protocol_error' ? undefined : completedResult.revision ?? completedResult.entity?.lockVersion,
                                completedResult.status === 'protocol_error' || !completedResult.entity ? 'needs_refresh' : 'known',
                                completedResult.status === 'protocol_error' ? 'unknown' : 'conflict'
                            );
                            return;
                        }
                        if (classifyMutationSourceDisposition(completedResult) === 'target_missing' && ownsOperation()) {
                            useTaskStore.getState().markTaskTombstone(taskId, 'server');
                            return;
                        }
                        if (classifyMutationResult(completedResult).kind === 'transient') return;
                        if (ownsOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
                            useTaskStore.getState().rollbackTaskOperation(taskId, operationGeneration, rollbackTaskUpdates);
                        }
                    },
                    onError: (error) => {
                        const outcome = classifyMutationError(error);
                        if (classifyMutationSourceDisposition(error) === 'target_missing' && ownsOperation()) {
                            useTaskStore.getState().markTaskTombstone(taskId, 'server');
                            return;
                        }
                        if (outcome.kind === 'transient') return;
                        if (ownsOperation() && Object.keys(rollbackTaskUpdates).length > 0) {
                            useTaskStore.getState().rollbackTaskOperation(taskId, operationGeneration, rollbackTaskUpdates);
                        }
                    }
                },
                datePlacementMode
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_save') || 'Failed to save');
            useUIStore.getState().addNotification(message, 'error');
            throw new Error(message);
        }

        if (result.status === 'ok') return;
        if (result.status === 'protocol_error' && ownsOperation()) {
            const beforeRefresh = useTaskStore.getState();
            const conflictAtRefresh = beforeRefresh.taskConflicts[taskId];
            const outcomeAtRefresh = conflictAtRefresh?.unresolvedMutations?.[String(operationGeneration)];
            const readContextAtRefresh = beforeRefresh.activeReadContext;
            const projectAtRefresh = beforeRefresh.currentProjectId;
            let refreshContext = readContextAtRefresh;
            const isRefreshOwner = (refreshContext?: typeof readContextAtRefresh, allowUnapplied = false) => {
                const state = useTaskStore.getState();
                const currentReadContext = state.getActiveReadContext();
                const currentConflict = state.taskConflicts[taskId];
                const stillOwnsConflict = outcomeAtRefresh
                    ? currentConflict?.unresolvedMutations?.[String(operationGeneration)] === outcomeAtRefresh
                    : currentConflict === conflictAtRefresh;
                return ownsOperation() && stillOwnsConflict &&
                    state.editGenerations[taskId] === operationGeneration && state.currentProjectId === projectAtRefresh &&
                    Boolean(refreshContext && currentReadContext?.contextId === refreshContext.contextId &&
                        (allowUnapplied || canApplyReadResponse(state.activeReadContext, refreshContext)) &&
                        (!readContextAtRefresh || (refreshContext.projectId === readContextAtRefresh.projectId &&
                            refreshContext.queryIdentity === readContextAtRefresh.queryIdentity &&
                            refreshContext.scopeIdentity === readContextAtRefresh.scopeIdentity)));
            };
            try {
                const refreshPromise = beforeRefresh.refreshData();
                refreshContext = useTaskStore.getState().getActiveReadContext();
                const refreshOutcome = await refreshPromise;
                const refreshedState = useTaskStore.getState();
                if (refreshOutcome.status === 'applied' && isRefreshOwner(refreshOutcome.context)) {
                    const remote = refreshedState.serverTaskSnapshot.entitiesById[taskId];
                    const revision = refreshedState.serverTaskSnapshot.revisions[taskId];
                    const validRemote = Boolean(remote && remote.id === taskId && Number.isSafeInteger(revision) &&
                        revision! >= attemptedBaseRevision &&
                        (remote.lockVersion === undefined || remote.lockVersion === revision));
                    if (validRemote && responseMatchesIntendedFields(canonicalFields, remote!)) {
                        refreshedState.commitTaskOperation(taskId, operationGeneration, revision);
                        mutationLifecycleMetrics.reconciliationSucceeded += 1;
                        return;
                    }
                    if (remote && validRemote) {
                        mutationLifecycleMetrics.reconciliationUnresolved += 1;
                        refreshedState.registerTaskConflict(taskId, result.error || (i18n.t('label_failed_to_save') || 'Failed to save'),
                            operationGeneration, remote, revision, 'known', 'unknown');
                    } else {
                        mutationLifecycleMetrics.reconciliationUnresolved += 1;
                        refreshedState.registerTaskConflict(taskId, result.error || (i18n.t('label_failed_to_save') || 'Failed to save'),
                            operationGeneration, undefined, undefined, 'unavailable', 'unknown');
                    }
                }
            } catch {
                if (isRefreshOwner(refreshContext, true)) {
                    mutationLifecycleMetrics.reconciliationUnresolved += 1;
                    useTaskStore.getState().registerTaskConflict(taskId,
                        result.error || (i18n.t('label_failed_to_save') || 'Failed to save'), operationGeneration,
                        undefined, undefined, 'unavailable', 'unknown');
                }
            }
        }
        const message = result.error || (i18n.t('label_failed_to_save') || 'Failed to save');
        useUIStore.getState().addNotification(message, 'error');
        throw new Error(message);
    }
}
