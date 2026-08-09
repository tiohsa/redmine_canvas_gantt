import type { Relation } from '../types';
import { apiClient } from '../api/client';
import type { MutationMetadata } from '../api/client';
import { baselineProjectResourceKey, enqueueMutationOperation, relationResourceKey, taskResourceKey, type MutationLifecycle } from '../stores/taskStore/taskPersistence';
import { classifyMutationError, classifyMutationResult } from '../api/mutationOutcome';
import { parseDateOnly } from '../utils/dateOnly';

export type TaskFields = Record<string, unknown>;
type TaskFieldsFactory = TaskFields | (() => TaskFields);

const TASK_PATCH_MAX_RETRIES = 1;

const canonicalFieldName = (field: string): string => ({
    start_date: 'startDate',
    due_date: 'dueDate',
    parent_issue_id: 'parentId',
    done_ratio: 'ratioDone',
    status_id: 'statusId',
    assigned_to_id: 'assignedToId',
    priority_id: 'priorityId',
    category_id: 'categoryId',
    estimated_hours: 'estimatedHours',
    project_id: 'projectId',
    tracker_id: 'trackerId',
    fixed_version_id: 'fixedVersionId',
    custom_field_values: 'customFieldValues'
}[field] ?? field);

const sameCanonicalValue = (field: string, expected: unknown, actual: unknown): boolean => {
    if (field === 'start_date' || field === 'due_date') {
        const expectedValue = expected === null || expected === '' || expected === undefined
            ? null
            : typeof expected === 'string' ? parseDateOnly(expected) : expected;
        const actualValue = actual === undefined || actual === null ? null : actual;
        return expectedValue === actualValue;
    }
    if (field === 'custom_field_values') {
        if (!expected || typeof expected !== 'object' || !actual || typeof actual !== 'object') return expected === actual;
        return Object.entries(expected as Record<string, unknown>).every(([key, value]) => (
            Object.is(value, (actual as Record<string, unknown>)[key])
        ));
    }
    if (field === 'parent_issue_id' || field.endsWith('_id')) {
        const expectedValue = expected === null || expected === '' || expected === undefined ? null : String(expected);
        const actualValue = actual === null || actual === '' || actual === undefined ? null : String(actual);
        return expectedValue === actualValue;
    }
    if (expected === null || expected === '' || expected === undefined) return actual === null || actual === undefined || actual === '';
    if (typeof expected === 'number' && typeof actual === 'string') return expected === Number(actual);
    return Object.is(expected, actual);
};

export const responseMatchesIntendedFields = (
    fields: TaskFields,
    entity: NonNullable<Awaited<ReturnType<typeof apiClient.updateTaskFields>>['entity']>
): boolean => responseContainsIntendedFields(fields, entity) && Object.entries(fields)
    .filter(([field]) => field !== 'lock_version')
    .every(([field, expected]) => {
        const canonicalField = canonicalFieldName(field);
        if (!Object.prototype.hasOwnProperty.call(entity, canonicalField)) return false;
        if (field === 'custom_field_values') {
            if (!expected || typeof expected !== 'object') return sameCanonicalValue(field, expected, entity[canonicalField as keyof typeof entity]);
            const actual = entity[canonicalField as keyof typeof entity];
            if (!actual || typeof actual !== 'object') return false;
            return Object.entries(expected as Record<string, unknown>).every(([key, value]) => (
                Object.prototype.hasOwnProperty.call(actual, key) &&
                Object.is(value, (actual as Record<string, unknown>)[key])
            ));
        }
        return sameCanonicalValue(field, expected, entity[canonicalField as keyof typeof entity]);
    });

export const responseContainsIntendedFields = (
    fields: TaskFields,
    entity: NonNullable<Awaited<ReturnType<typeof apiClient.updateTaskFields>>['entity']>
): boolean => Object.entries(fields)
    .filter(([field]) => field !== 'lock_version')
    .every(([field]) => {
        const canonicalField = canonicalFieldName(field);
        if (!Object.prototype.hasOwnProperty.call(entity, canonicalField)) return false;
        if (field !== 'custom_field_values') return true;
        const actual = entity[canonicalField as keyof typeof entity];
        return actual !== null && typeof actual === 'object' && (
            typeof fields[field] !== 'object' || Object.keys(fields[field] as object).every(key => (
                Object.prototype.hasOwnProperty.call(actual, key)
            ))
        );
    });

export const taskMutationFields = (task: { startDate?: number; dueDate?: number; parentId?: string }): TaskFields => ({
    start_date: task.startDate,
    due_date: task.dueDate,
    parent_issue_id: task.parentId ? Number(task.parentId) : null
});

const executeTaskPatch = async (
    taskId: string,
    fields: TaskFieldsFactory,
    operationId?: string
): Promise<Awaited<ReturnType<typeof apiClient.updateTaskFields>>> => {
    let attempt = 0;
    while (true) {
        const attemptFields = typeof fields === 'function' ? fields() : fields;
        try {
            const result = await apiClient.updateTaskFields(
                taskId,
                attemptFields,
                operationId
            );
            if (attempt > 0 && result.status === 'conflict' && result.entity && responseMatchesIntendedFields(attemptFields, result.entity)) {
                return { ...result, status: 'ok' };
            }
            if (classifyMutationResult(result).kind !== 'transient' || attempt >= TASK_PATCH_MAX_RETRIES) {
                return result;
            }
        } catch (error) {
            if (classifyMutationError(error).kind !== 'transient' || attempt >= TASK_PATCH_MAX_RETRIES) {
                throw error;
            }
        }
        attempt += 1;
    }
};

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
        (context) => executeTaskPatch(taskId, fields, context?.operationId),
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
