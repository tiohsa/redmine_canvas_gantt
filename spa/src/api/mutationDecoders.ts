import type { PersistedTaskState, Relation, Task } from '../types';
import { parseDateOnly } from '../utils/dateOnly';
import { decodeMutationFailure, type MutationFailure, type MutationStatusValue } from './mutationOutcome';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
    if (!value || typeof value !== 'object') return null;
    return value as UnknownRecord;
};

export type MutationStatus = MutationStatusValue;

export interface MutationMetadata {
    completeness?: 'complete' | 'partial';
    invalidatedEntityIds?: string[];
    deletedEntityIds?: string[];
    entity?: PersistedTaskState;
    revision?: number;
    failure?: MutationFailure;
}

export type ScheduleMutationConflict = {
    taskId?: string;
    expectedRevision?: number;
    actualRevision?: number;
};

export type ScheduleAdjustment = { taskId: string; beforeStartDate?: number | null; beforeDueDate?: number | null;
    startDate?: number | null; dueDate?: number | null };
export type ScheduleResolutionContext = { token: string; taskIds: string[]; relations: Relation[] };

export type ScheduleMutationResult = MutationMetadata & {
    status: MutationStatus;
    operationId: string;
    entities: PersistedTaskState[];
    revisions: Record<string, number>;
    errors?: string[];
    conflict?: ScheduleMutationConflict;
    conflicts?: ScheduleMutationConflict[];
    resolutionContext?: ScheduleResolutionContext;
    adjustments?: ScheduleAdjustment[];
};

export interface UpdateTaskResult extends MutationMetadata {
    status: MutationStatus;
    entity?: PersistedTaskState;
    revision?: number;
    lockVersion?: number;
    taskId?: string;
    parentId?: string;
    siblingPosition?: 'tail';
    error?: string;
}

export interface BaselineDeleteResult extends MutationMetadata {
    status: 'ok';
    baseline: null;
    deletedSnapshotId: string;
}

export const mutationStatusForHttp = (status: number): Exclude<MutationStatus, 'ok'> => {
    if (status === 409) return 'conflict';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 422) return 'validation_error';
    return 'transient_error';
};

export const parseMutationMetadata = (value: unknown): Pick<UpdateTaskResult, 'completeness' | 'invalidatedEntityIds' | 'deletedEntityIds' | 'failure'> => {
    const record = asRecord(value);
    const completeness = record?.completeness;
    const ids = record?.invalidated_entity_ids;
    const deletedIds = record?.deleted_entity_ids;
    const metadata: Pick<UpdateTaskResult, 'completeness' | 'invalidatedEntityIds' | 'deletedEntityIds' | 'failure'> = {};
    if (completeness === 'complete' || completeness === 'partial') metadata.completeness = completeness;
    if (Array.isArray(ids)) metadata.invalidatedEntityIds = ids
        .filter(id => typeof id === 'number' || typeof id === 'string')
        .map(String);
    if (Array.isArray(deletedIds)) metadata.deletedEntityIds = deletedIds
        .filter(id => typeof id === 'number' || typeof id === 'string')
        .map(String);
    const failure = decodeMutationFailure(record?.failure);
    if (failure) metadata.failure = failure;
    return metadata;
};

export const parseBaselineDeleteResult = (value: unknown, expectedSnapshotId: string): BaselineDeleteResult | undefined => {
    const data = asRecord(value);
    if (
        data?.status !== 'ok' ||
        data.completeness !== 'complete' ||
        data.baseline !== null ||
        data.deleted_snapshot_id !== expectedSnapshotId
    ) {
        return undefined;
    }

    return {
        status: 'ok',
        baseline: null,
        deletedSnapshotId: expectedSnapshotId,
        ...parseMutationMetadata(data)
    };
};

export const parseMutationEntity = (value: unknown): PersistedTaskState | undefined => {
    const record = asRecord(value);
    if (!record) return undefined;
    const id = record.id;
    if (id === undefined || id === null) return undefined;
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
    const parseDate = (key: string): number | undefined => {
        const candidate = record[key];
        if (typeof candidate === 'string') return parseDateOnly(candidate) ?? undefined;
        return undefined;
    };
    const parseNullableNumber = (key: string): number | undefined => {
        const candidate = record[key];
        return typeof candidate === 'number' ? candidate : undefined;
    };
    const parseNullableId = (key: string): string | undefined => {
        const candidate = record[key];
        return candidate === null ? undefined : candidate === undefined ? undefined : String(candidate);
    };
    const entity: PersistedTaskState = {
        id: String(id),
        ...(typeof record.subject === 'string' ? { subject: record.subject } : {}),
        ...(has('project_id') ? { projectId: parseNullableId('project_id') } : {}),
        ...(typeof record.project_name === 'string' ? { projectName: record.project_name } : {}),
        ...(has('start_date') ? { startDate: parseDate('start_date') } : {}),
        ...(has('due_date') ? { dueDate: parseDate('due_date') } : {}),
        ...(typeof record.ratio_done === 'number' ? { ratioDone: record.ratio_done } : {}),
        ...(typeof record.status_id === 'number' ? { statusId: record.status_id } : {}),
        ...(typeof record.status_name === 'string' ? { statusName: record.status_name } : {}),
        ...(record.assigned_to_id === null || typeof record.assigned_to_id === 'number' ? { assignedToId: record.assigned_to_id } : {}),
        ...(record.assigned_to_name === null || typeof record.assigned_to_name === 'string' ? { assignedToName: record.assigned_to_name } : {}),
        ...(has('parent_id') ? { parentId: parseNullableId('parent_id') } : {}),
        ...(typeof record.has_physical_children === 'boolean' ? { hasPhysicalChildren: record.has_physical_children } : {}),
        ...(typeof record.dates_derived === 'boolean' ? { datesDerived: record.dates_derived } : {}),
        ...(typeof record.lock_version === 'number' ? { lockVersion: record.lock_version } : {}),
        ...(has('tracker_id') ? { trackerId: parseNullableNumber('tracker_id') } : {}),
        ...(typeof record.tracker_name === 'string' ? { trackerName: record.tracker_name } : {}),
        ...(has('fixed_version_id') ? { fixedVersionId: parseNullableId('fixed_version_id') } : {}),
        ...(has('priority_id') ? { priorityId: parseNullableNumber('priority_id') } : {}),
        ...(typeof record.priority_name === 'string' ? { priorityName: record.priority_name } : {}),
        ...(typeof record.priority_position === 'number' ? { priorityPosition: record.priority_position } : {}),
        ...(has('author_id') ? { authorId: parseNullableNumber('author_id') } : {}),
        ...(typeof record.author_name === 'string' ? { authorName: record.author_name } : {}),
        ...(has('category_id') ? { categoryId: parseNullableNumber('category_id') } : {}),
        ...(has('category_name') ? { categoryName: typeof record.category_name === 'string' ? record.category_name : undefined } : {}),
        ...(has('estimated_hours') ? { estimatedHours: parseNullableNumber('estimated_hours') } : {}),
        ...(typeof record.created_on === 'string' ? { createdOn: record.created_on } : {}),
        ...(typeof record.updated_on === 'string' ? { updatedOn: record.updated_on } : {}),
        ...(typeof record.spent_hours === 'number' ? { spentHours: record.spent_hours } : {}),
        ...(has('fixed_version_name') ? { fixedVersionName: typeof record.fixed_version_name === 'string' ? record.fixed_version_name : undefined } : {}),
        ...(asRecord(record.custom_field_values) ? { customFieldValues: asRecord(record.custom_field_values) as Task['customFieldValues'] } : {})
    };
    return entity;
};

type MutationHttpContext = { status: number; ok: boolean };

export const parseMutationTaskResult = (value: unknown, http: MutationHttpContext): UpdateTaskResult => {
    const data = asRecord(value) ?? {};
    const rawEntity = asRecord(data.entity);
    const entity = parseMutationEntity(data.entity);
    const revision = typeof data.revision === 'number' ? data.revision : entity?.lockVersion;
    const rawStatus = data.status;
    const hasInvalidCanonicalDate = ['start_date', 'due_date'].some(key => {
        if (!rawEntity || !Object.prototype.hasOwnProperty.call(rawEntity, key)) return false;
        const date = rawEntity[key];
        return date !== null && (typeof date !== 'string' || parseDateOnly(date) === null);
    });
    const status: MutationStatus = http.status === 409
        ? 'conflict'
        : !http.ok
            ? mutationStatusForHttp(http.status)
        : rawStatus === 'ok' && hasInvalidCanonicalDate
            ? 'protocol_error'
        : typeof rawStatus === 'string' && ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error'].includes(rawStatus)
            ? rawStatus as MutationStatus
            : typeof rawStatus === 'string'
                ? 'protocol_error'
                : http.ok ? 'protocol_error' : mutationStatusForHttp(http.status);
    const protocolError = status === 'protocol_error';
    return {
        status,
        ...(!protocolError ? parseMutationMetadata(data) : {}),
        ...(!protocolError && entity ? { entity } : {}),
        ...(!protocolError && revision !== undefined ? { revision } : {}),
        lockVersion: protocolError ? undefined : typeof data.lock_version === 'number' ? data.lock_version : entity?.lockVersion,
        taskId: protocolError ? undefined : data.task_id ? String(data.task_id) : entity?.id,
        parentId: protocolError ? undefined : data.parent_id === null ? undefined : (data.parent_id ? String(data.parent_id) : entity?.parentId),
        siblingPosition: !protocolError && data.sibling_position === 'tail' ? 'tail' : undefined,
        error: typeof data.error === 'string' ? data.error : undefined
    };
};

export const parseScheduleMutationConflict = (value: unknown): ScheduleMutationConflict | undefined => {
    const raw = asRecord(value);
    if (!raw) return undefined;
    const taskId = raw.task_id ?? raw.taskId;
    const expectedRevision = raw.expectedRevision ?? raw.expected_revision;
    const actualRevision = raw.actualRevision ?? raw.actual_revision;
    return {
        ...(typeof taskId === 'string' || typeof taskId === 'number' ? { taskId: String(taskId) } : {}),
        ...(typeof expectedRevision === 'number' ? { expectedRevision } : {}),
        ...(typeof actualRevision === 'number' ? { actualRevision } : {})
    };
};

export const parseScheduleMutationResult = (value: unknown, http: MutationHttpContext): ScheduleMutationResult => {
    const data = asRecord(value) ?? {};
    const rawEntities = Array.isArray(data.entities) ? data.entities : [];
    const canonicalDatesValid = rawEntities.every(value => {
        const entity = asRecord(value);
        if (!entity) return true;
        return (['start_date', 'due_date'] as const).every(field => {
            if (!Object.prototype.hasOwnProperty.call(entity, field)) return true;
            const date = entity[field];
            return date === null || (typeof date === 'string' && parseDateOnly(date) !== null);
        });
    });
    const entities = rawEntities.map(parseMutationEntity).filter((entity): entity is PersistedTaskState => Boolean(entity));
    const rawRevisions = asRecord(data.revisions) ?? {};
    const revisions = Object.entries(rawRevisions).reduce<Record<string, number>>((result, [id, revision]) => {
        if (typeof revision === 'number') result[String(id)] = revision;
        return result;
    }, {});
    const rawStatus = data.status;
    const knownStatuses = ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error'];
    const status: MutationStatus = http.status === 409
        ? 'conflict'
        : !http.ok
            ? mutationStatusForHttp(http.status)
        : typeof rawStatus === 'string'
            ? knownStatuses.includes(rawStatus)
                ? rawStatus === 'ok' && !canonicalDatesValid ? 'protocol_error' : rawStatus as MutationStatus
                : 'protocol_error'
            : rawStatus === undefined && http.ok ? 'protocol_error'
                : rawStatus === undefined ? mutationStatusForHttp(http.status) : 'protocol_error';
    const errors = Array.isArray(data.errors) ? data.errors.filter((error): error is string => typeof error === 'string') : undefined;
    const conflict = parseScheduleMutationConflict(data.conflict);
    const conflicts = Array.isArray(data.conflicts)
        ? data.conflicts.map(parseScheduleMutationConflict).filter((entry): entry is ScheduleMutationConflict => Boolean(entry))
        : undefined;
    const context = asRecord(data.resolution_context);
    const adjustments = Array.isArray(data.adjustments) ? data.adjustments.map((value): ScheduleAdjustment | null => {
        const entry = asRecord(value);
        if (!entry || (typeof entry.task_id !== 'number' && typeof entry.task_id !== 'string')) return null;
        const parseDate = (field: string): number | null | undefined => entry[field] === null ? null
            : typeof entry[field] === 'string' ? parseDateOnly(entry[field] as string) : undefined;
        const startDate = parseDate('start_date');
        const dueDate = parseDate('due_date');
        if (startDate === undefined || dueDate === undefined) return null;
        return { taskId: String(entry.task_id), beforeStartDate: parseDate('before_start_date'),
            beforeDueDate: parseDate('before_due_date'), startDate, dueDate };
    }).filter((entry): entry is ScheduleAdjustment => entry !== null) : undefined;
    return {
        status,
        operationId: typeof data.operation_id === 'string' ? data.operation_id : '',
        entities,
        revisions,
        ...(errors && errors.length > 0 ? { errors } : {}),
        ...(conflict ? { conflict } : {}),
        ...(conflicts ? { conflicts } : {}),
        ...(adjustments?.length ? { adjustments } : {}),
        ...(context && typeof context.token === 'string' && Array.isArray(context.task_ids) && Array.isArray(context.relations) ? {
            resolutionContext: {
                token: context.token,
                taskIds: context.task_ids.map(String),
                relations: context.relations.map(value => {
                    const relation = asRecord(value) ?? {};
                    return { id: String(relation.id), from: String(relation.from), to: String(relation.to),
                        type: String(relation.type) as Relation['type'], delay: Number(relation.delay ?? 0) };
                })
            }
        } : {}),
        ...parseMutationMetadata(data)
    };
};

/** Validate the canonical acknowledgement for every requested schedule task. */
export const isCompleteScheduleMutationAck = (
    result: Pick<ScheduleMutationResult, 'entities' | 'revisions'> | { entities?: PersistedTaskState[]; revisions?: Record<string, number> },
    changes: Array<{ taskId: string; baseRevision: number; fields: Record<string, unknown> }>
): boolean => {
    const entities = new Map((result.entities ?? []).map(entity => [entity.id, entity]));
    return changes.every(change => {
        const entity = entities.get(change.taskId);
        if (!entity) return false;
        for (const field of Object.keys(change.fields)) {
            const canonicalField = field === 'start_date' ? 'startDate' : field === 'due_date' ? 'dueDate' : null;
            if (!canonicalField || !Object.prototype.hasOwnProperty.call(entity, canonicalField)) return false;
            const value = entity[canonicalField];
            if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value))) return false;
        }
        const entityRevision = entity.lockVersion;
        const responseRevision = result.revisions?.[change.taskId];
        const revision = responseRevision ?? entityRevision;
        return Number.isSafeInteger(revision) && revision! >= change.baseRevision &&
            (entityRevision === undefined || Number.isSafeInteger(entityRevision)) &&
            (responseRevision === undefined || Number.isSafeInteger(responseRevision)) &&
            (entityRevision === undefined || responseRevision === undefined || entityRevision === responseRevision);
    });
};
