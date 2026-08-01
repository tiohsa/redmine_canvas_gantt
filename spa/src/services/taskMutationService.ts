import type { Relation } from '../types';
import { apiClient } from '../api/client';
import { enqueueMutationOperation } from '../stores/taskStore/taskPersistence';

/**
 * Single frontend boundary for mutations that are not part of the bulk Task
 * save loop. The API client remains responsible for transport/decoding while
 * this service owns operation ordering and entity scope.
 */
export const taskMutationService = {
    // The bulk save loop owns the queue for this method so it can order
    // dependency batches; do not add a second per-task queue here.
    updateTask: (task: Parameters<typeof apiClient.updateTask>[0], operationId?: string) => apiClient.updateTask(task, operationId),

    saveBaseline: (payload: NonNullable<Parameters<typeof apiClient.saveBaseline>[0]>) => (
        enqueueMutationOperation([`baseline:${payload.scope}`], (context) => apiClient.saveBaseline(payload, context?.operationId))
    ),

    updateTaskFields: (taskId: string, fields: Record<string, unknown>) => (
        enqueueMutationOperation([taskId], (context) => apiClient.updateTaskFields(taskId, fields, context?.operationId))
    ),

    createRelation: (fromId: string, toId: string, type: string, delay?: number): Promise<Relation> => (
        enqueueMutationOperation([fromId, toId], (context) => apiClient.createRelation(fromId, toId, type, delay, context?.operationId))
    ),

    updateRelation: (relationId: string, type: string, delay?: number): Promise<Relation> => (
        enqueueMutationOperation([relationId], (context) => apiClient.updateRelation(relationId, type, delay, context?.operationId))
    ),

    deleteRelation: (relationId: string) => (
        enqueueMutationOperation([relationId], (context) => apiClient.deleteRelation(relationId, context?.operationId))
    ),

    deleteTask: (taskId: string) => (
        enqueueMutationOperation([taskId], (context) => apiClient.deleteTask(taskId, context?.operationId))
    ),

    bulkCreateSubtasks: (payload: Parameters<typeof apiClient.bulkCreateSubtasks>[0]) => (
        enqueueMutationOperation(
            [payload.parentId, ...(payload.operationIssueIds ?? [])],
            (context) => apiClient.bulkCreateSubtasks(payload, context?.operationId)
        )
    )
};
