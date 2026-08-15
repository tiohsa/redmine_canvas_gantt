import type { Task } from '../types';
import type { DraftContractViolation, EditOption, TaskEditMeta } from '../types/editMeta';
import type { FetchEditMetaOptions } from '../stores/EditMetaStore';
import {
    buildContextMutationIntent,
    materializedTaskUpdates,
    type ContextChangeKind
} from '../stores/taskStore/draftIntent';
import type { TaskFields } from './taskMutationService';

type FetchEditMeta = (taskId: string, options?: FetchEditMetaOptions) => Promise<TaskEditMeta>;

export type ContextPreviewParams = {
    task: Task;
    kind: ContextChangeKind;
    targetId: number;
    fetchEditMeta: FetchEditMeta;
};

export type ContextPreviewResult = {
    meta: TaskEditMeta;
    materialized: Record<string, unknown>;
    projection: Partial<Task>;
    rollbackTaskUpdates: Partial<Task>;
    mutationIntent: TaskFields;
    capabilityContext: TaskEditMeta['capabilityContext'];
};

export class ContextPreviewViolationError extends Error {
    readonly violation: DraftContractViolation;

    constructor(violation: DraftContractViolation) {
        super(violation.message);
        this.name = 'ContextPreviewViolationError';
        this.violation = violation;
    }
}

const optionName = (options: EditOption[] | undefined, value: unknown): string | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const id = Number(value);
    return options?.find(option => option.id === id)?.name;
};

const hasMaterialized = (materialized: Record<string, unknown>, field: string): boolean => (
    Object.prototype.hasOwnProperty.call(materialized, field)
);

const materializedNames = (materialized: Record<string, unknown>, meta: TaskEditMeta, task: Task): Partial<Task> => {
    const updates: Partial<Task> = {};

    if (hasMaterialized(materialized, 'project_id')) {
        updates.projectName = materialized.project_id == null || materialized.project_id === ''
            ? undefined
            : optionName(meta.options.projects, materialized.project_id) ?? task.projectName;
    }
    if (hasMaterialized(materialized, 'tracker_id')) {
        updates.trackerName = materialized.tracker_id == null || materialized.tracker_id === ''
            ? undefined
            : optionName(meta.options.trackers, materialized.tracker_id) ?? task.trackerName;
    }
    if (hasMaterialized(materialized, 'status_id')) {
        updates.statusName = materialized.status_id == null || materialized.status_id === ''
            ? undefined
            : optionName(meta.options.statuses, materialized.status_id) ?? task.statusName;
    }
    if (hasMaterialized(materialized, 'assigned_to_id')) {
        updates.assignedToName = materialized.assigned_to_id == null || materialized.assigned_to_id === ''
            ? null
            : optionName(meta.options.assignees, materialized.assigned_to_id) ?? task.assignedToName;
    }
    if (hasMaterialized(materialized, 'priority_id')) {
        const option = meta.options.priorities?.find(candidate => candidate.id === Number(materialized.priority_id));
        updates.priorityName = materialized.priority_id == null || materialized.priority_id === ''
            ? undefined
            : option?.name ?? task.priorityName;
        updates.priorityPosition = materialized.priority_id == null || materialized.priority_id === ''
            ? undefined
            : option?.position ?? task.priorityPosition;
    }
    if (hasMaterialized(materialized, 'category_id')) {
        updates.categoryName = materialized.category_id == null || materialized.category_id === ''
            ? undefined
            : optionName(meta.options.categories, materialized.category_id) ?? task.categoryName;
    }
    if (hasMaterialized(materialized, 'fixed_version_id')) {
        updates.fixedVersionName = materialized.fixed_version_id == null || materialized.fixed_version_id === ''
            ? undefined
            : optionName(meta.options.versions, materialized.fixed_version_id) ?? task.fixedVersionName;
    }

    return updates;
};

const targetProjection = (
    kind: ContextChangeKind,
    targetId: number,
    meta: TaskEditMeta,
    task: Task,
    materializedUpdates: Partial<Task>
): Partial<Task> => {
    if (kind === 'project') {
        const projectId = materializedUpdates.projectId ?? String(targetId);
        return {
            projectId,
            projectName: optionName(meta.options.projects, projectId) ?? task.projectName
        };
    }
    const trackerId = materializedUpdates.trackerId ?? targetId;
    return {
        trackerId,
        trackerName: optionName(meta.options.trackers, trackerId) ?? task.trackerName
    };
};

const rollbackFor = (task: Task, projection: Partial<Task>): Partial<Task> => Object.fromEntries(
    Object.keys(projection).map(field => [field, task[field as keyof Task]])
) as Partial<Task>;

export const previewContextChange = async ({
    task,
    kind,
    targetId,
    fetchEditMeta
}: ContextPreviewParams): Promise<ContextPreviewResult> => {
    const options = kind === 'project'
        ? { targetProjectId: targetId, force: true }
        : { targetTrackerId: targetId, force: true };
    const meta = await fetchEditMeta(task.id, options);
    const violation = meta.draftContract?.violations[0];
    if (violation) throw new ContextPreviewViolationError(violation);

    const materialized = meta.draftContract?.materialized ?? {};
    const materializedUpdates = materializedTaskUpdates(materialized, task);
    const projection = {
        ...materializedUpdates,
        ...materializedNames(materialized, meta, task),
        ...targetProjection(kind, targetId, meta, task, materializedUpdates)
    };

    return {
        meta,
        materialized,
        projection,
        rollbackTaskUpdates: rollbackFor(task, projection),
        mutationIntent: buildContextMutationIntent(kind, targetId),
        capabilityContext: meta.capabilityContext
    };
};
