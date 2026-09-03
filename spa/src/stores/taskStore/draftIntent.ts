import type { Task } from '../../types';
import { PERSISTABLE_TASK_FIELDS, taskMutationFields, type TaskFields } from '../../services/taskMutationService';
import { parseDateOnly } from '../../utils/dateOnly';
import type { LocalPatch, ServerSnapshot } from './stateContract';

const persistableFields = new Set<string>(PERSISTABLE_TASK_FIELDS);
const relationConsistencyFields = new Set<keyof Task>(['startDate', 'dueDate', 'projectId']);

export const hasPendingRelationConsistencyChanges = (
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>,
    taskIds: Iterable<string>
): boolean => [...taskIds].some((taskId) => (
    (localTaskPatches[taskId] ?? []).some((patch) => (
        Object.keys(patch.mutationIntent).some((field) => relationConsistencyFields.has(field as keyof Task))
    ))
));

/** Context-changing selectors emit only the field explicitly selected by the user.
 * Server materialized policy fields are display-only and must not be resent.
 */
export type ContextChangeKind = 'project' | 'tracker';

export const buildContextMutationIntent = (kind: ContextChangeKind, id: number): TaskFields => ({
    [kind === 'project' ? 'project_id' : 'tracker_id']: id
});

export const buildProjectMutationIntent = (projectId: number): TaskFields => (
    buildContextMutationIntent('project', projectId)
);

export const buildTrackerMutationIntent = (trackerId: number): TaskFields => (
    buildContextMutationIntent('tracker', trackerId)
);

export const buildTaskDraftIntent = (
    taskId: string,
    snapshot: ServerSnapshot<Task>,
    patches: Array<LocalPatch<Task>>
): TaskFields | null => {
    const serverTask = snapshot.entitiesById[taskId];
    if (!serverTask || patches.length === 0) return null;

    const changedFields = new Set<string>();
    const intendedTask = patches.reduce<Task>((current, patch) => {
        Object.keys(patch.mutationIntent).forEach((field) => {
            if (persistableFields.has(field)) changedFields.add(field);
        });
        return { ...current, ...patch.mutationIntent };
    }, serverTask);
    if (changedFields.size === 0) return null;

    return {
        ...taskMutationFields(intendedTask, changedFields),
        lock_version: snapshot.revisions[taskId] ?? serverTask.lockVersion
    };
};

export const materializedTaskUpdates = (
    materialized: Record<string, unknown>,
    baseTask?: Pick<Task, 'customFieldValues'>
): Partial<Task> => {
    const has = (field: string) => Object.prototype.hasOwnProperty.call(materialized, field);
    const numberValue = (field: string): number | undefined => {
        const value = materialized[field];
        if (value === null || value === undefined || value === '') return undefined;
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };
    const idValue = (field: string): string | undefined => {
        const value = materialized[field];
        return value === null || value === undefined || value === '' ? undefined : String(value);
    };

    return {
        ...(has('subject') ? { subject: String(materialized.subject ?? '') } : {}),
        ...(has('project_id') ? { projectId: idValue('project_id') } : {}),
        ...(has('tracker_id') ? { trackerId: numberValue('tracker_id') } : {}),
        ...(has('status_id') ? { statusId: numberValue('status_id') } : {}),
        ...(has('assigned_to_id') ? { assignedToId: materialized.assigned_to_id == null ? null : numberValue('assigned_to_id') } : {}),
        ...(has('done_ratio') ? { ratioDone: numberValue('done_ratio') } : {}),
        ...(has('priority_id') ? { priorityId: numberValue('priority_id') } : {}),
        ...(has('category_id') ? { categoryId: numberValue('category_id') } : {}),
        ...(has('estimated_hours') ? { estimatedHours: numberValue('estimated_hours') } : {}),
        ...(has('fixed_version_id') ? { fixedVersionId: idValue('fixed_version_id') } : {}),
        ...(has('parent_issue_id') ? { parentId: idValue('parent_issue_id') } : {}),
        ...(has('start_date') ? { startDate: typeof materialized.start_date === 'string' ? parseDateOnly(materialized.start_date) ?? undefined : undefined } : {}),
        ...(has('due_date') ? { dueDate: typeof materialized.due_date === 'string' ? parseDateOnly(materialized.due_date) ?? undefined : undefined } : {}),
        ...(has('custom_field_values') && materialized.custom_field_values && typeof materialized.custom_field_values === 'object'
            ? {
                customFieldValues: {
                    ...(baseTask?.customFieldValues ?? {}),
                    ...materialized.custom_field_values as Record<string, string | null>
                }
            }
            : {})
    };
};
