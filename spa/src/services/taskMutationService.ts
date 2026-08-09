import type { Relation } from '../types';
import { apiClient } from '../api/client';
import type { MutationMetadata } from '../api/client';
import { baselineProjectResourceKey, enqueueMutationOperation, relationResourceKey, taskResourceKey, type MutationLifecycle } from '../stores/taskStore/taskPersistence';

type TaskFields = Record<string, unknown>;
type TaskFieldsFactory = TaskFields | (() => TaskFields);

/**
 * Single frontend boundary for mutations that are not part of the bulk Task
 * save loop. The API client remains responsible for transport/decoding while
 * this service owns operation ordering and entity scope.
 */
export const taskMutationService = {
    // The bulk save loop owns the queue for this method so it can order
    // dependency batches; do not add a second per-task queue here.
    updateTask: (task: Parameters<typeof apiClient.updateTask>[0], operationId?: string) => apiClient.updateTask(task, operationId),

    saveBaseline: (payload: NonNullable<Parameters<typeof apiClient.saveBaseline>[0]>) => {
        const scope = payload.scope ?? 'filtered';
        const normalizedPayload = { ...payload, scope };
        return enqueueMutationOperation(
            [`baseline:${scope}`],
            (context) => apiClient.saveBaseline(normalizedPayload, context?.operationId)
            , undefined, [baselineProjectResourceKey(window.RedmineCanvasGantt?.projectId ?? 'unknown')]
        );
    },

    updateTaskFields: (
        taskId: string,
        fields: TaskFieldsFactory,
        lifecycle?: MutationLifecycle<Awaited<ReturnType<typeof apiClient.updateTaskFields>>>
    ) => enqueueMutationOperation(
        [taskId],
        (context) => apiClient.updateTaskFields(
            taskId,
            typeof fields === 'function' ? fields() : fields,
            context?.operationId
        ),
        lifecycle,
        [taskResourceKey(taskId)]
    ),

    createRelation: (fromId: string, toId: string, type: string, delay?: number): Promise<Relation & MutationMetadata & { status: 'ok' }> => (
        enqueueMutationOperation([fromId, toId], (context) => apiClient.createRelation(fromId, toId, type, delay, context?.operationId), undefined, [taskResourceKey(fromId), taskResourceKey(toId)])
    ),

    updateRelation: (relationId: string, type: string, delay?: number, endpointIds: string[] = []): Promise<Relation & MutationMetadata & { status: 'ok' }> => (
        enqueueMutationOperation([relationId, ...endpointIds], (context) => apiClient.updateRelation(relationId, type, delay, context?.operationId), undefined, [relationResourceKey(relationId), ...endpointIds.map(taskResourceKey)])
    ),

    deleteRelation: (relationId: string, endpointIds: string[] = []): Promise<MutationMetadata & { status: 'ok' }> => (
        enqueueMutationOperation([relationId, ...endpointIds], (context) => apiClient.deleteRelation(relationId, context?.operationId), undefined, [relationResourceKey(relationId), ...endpointIds.map(taskResourceKey)])
    ),

    deleteTask: (taskId: string): Promise<MutationMetadata & { status: 'ok' }> => (
        enqueueMutationOperation([taskId], (context) => apiClient.deleteTask(taskId, context?.operationId), undefined, [taskResourceKey(taskId)])
    ),

    bulkCreateSubtasks: (payload: Parameters<typeof apiClient.bulkCreateSubtasks>[0]) => (
        enqueueMutationOperation(
            [payload.parentId, ...(payload.operationIssueIds ?? [])],
            (context) => apiClient.bulkCreateSubtasks(payload, context?.operationId),
            undefined,
            [taskResourceKey(payload.parentId), ...(payload.operationIssueIds ?? []).map(taskResourceKey)]
        )
    )
};
