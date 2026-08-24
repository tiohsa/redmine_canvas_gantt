import type {
    FilterAssigneeOption,
    FilterOptions,
    FilterProjectOption,
    FilterTrackerOption,
    Relation,
    Project,
    SavedQuery,
    Task,
    PersistedTaskState,
    Version,
    TaskStatus
} from '../types';
import type { TaskEditMeta, InlineEditSettings, CustomFieldMeta, EditOption, EditMetaCapabilityContext, DraftContract } from '../types/editMeta';
import type { BaselineSaveScope, BaselineSnapshot, BaselineTaskState } from '../types/baseline';
import { buildIssueQueryParams, parseResolvedQueryState, type ResolvedQueryState } from '../utils/queryParams';
import { normalizeQueryContext } from '../query/queryStateCodec';
import { normalizeBaselineSaveScope, parseBaselineDateValue } from '../utils/baseline';
import type { QueryContext } from '../query/types';
import type { BusinessCalendarPayload } from '../types/businessCalendar';
import { getBusinessCalendarPayload, normalizeBusinessCalendarPayload } from '../utils/businessCalendar';
import { formatDateOnly, parseDateOnly } from '../utils/dateOnly';
import { sessionFetch } from './sessionFetch';
import type { MutationFailure, MutationStatusValue } from './mutationOutcome';

export {
    classifyMutationError,
    classifyMutationResult,
    classifyMutationStatus
} from './mutationOutcome';
export type { MutationOutcome, MutationOutcomeKind } from './mutationOutcome';

type ApiTask = Record<string, unknown>;
type ApiRelation = Record<string, unknown>;
type ApiVersion = Record<string, unknown>;
type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
    if (!value || typeof value !== 'object') return null;
    return value as UnknownRecord;
};

const normalizeRelation = (raw: unknown, fallback: { fromId: string; toId: string; type: string }): Relation => {
    const root = asRecord(raw);
    const candidate = root?.relation && asRecord(root.relation) ? asRecord(root.relation) : root;
    const nested = candidate?.relation && asRecord(candidate.relation) ? asRecord(candidate.relation) : null;
    const rel = nested ?? candidate ?? {};

    const idValue = rel.id;
    const fromValue = rel.issue_from_id ?? rel.issue_id ?? rel.from ?? fallback.fromId;
    const toValue = rel.issue_to_id ?? rel.issue_to ?? rel.to ?? fallback.toId;
    const typeValue = rel.relation_type ?? rel.type ?? fallback.type;
    const delayValue = rel.delay;

    const id = String(idValue ?? '');
    return {
        id,
        from: String(fromValue ?? fallback.fromId),
        to: String(toValue ?? fallback.toId),
        type: String(typeValue ?? fallback.type),
        delay: typeof delayValue === 'number' ? delayValue : undefined
    };
};

interface ApiData {
    tasks: Task[];
    relations: Relation[];
    versions: Version[];
    filterOptions: FilterOptions;
    project: Project;
    statuses: TaskStatus[];
    customFields: CustomFieldMeta[];
    permissions: { editable: boolean; viewable: boolean; baselineEditable: boolean };
    baseline?: BaselineSnapshot | null;
    initialState?: ResolvedQueryState;
    queryContext?: QueryContext;
    warnings?: string[];
    businessCalendar?: BusinessCalendarPayload;
}

export interface MutationMetadata {
    completeness?: 'complete' | 'partial';
    invalidatedEntityIds?: string[];
    deletedEntityIds?: string[];
    entity?: PersistedTaskState;
    revision?: number;
    failure?: MutationFailure;
}

export type ScheduleMutationChange = {
    taskId: string;
    baseRevision: number;
    startDate?: number | null;
    dueDate?: number | null;
    task?: unknown;
    mutationFields?: Record<string, unknown>;
};

export type ScheduleMutationResult = MutationMetadata & {
    status: MutationStatus;
    operationId: string;
    entities: PersistedTaskState[];
    revisions: Record<string, number>;
    errors?: string[];
    conflict?: {
        taskId?: string;
        expectedRevision?: number;
        actualRevision?: number;
    };
};

interface BaselineSaveResult extends MutationMetadata {
    status: 'ok' | 'error';
    baseline: BaselineSnapshot | null;
    warnings?: string[];
    error?: string;
}

export type MutationStatus = MutationStatusValue;

export class ApiMutationError extends Error {
    readonly status: Exclude<MutationStatus, 'ok'>;
    readonly httpStatus: number;
    readonly fieldErrors?: Record<string, string>;
    readonly failure?: MutationFailure;

    constructor(status: Exclude<MutationStatus, 'ok'>, message: string, httpStatus: number, fieldErrors?: Record<string, string>, failure?: MutationFailure) {
        super(message);
        this.name = 'ApiMutationError';
        this.status = status;
        this.httpStatus = httpStatus;
        this.fieldErrors = fieldErrors;
        this.failure = failure;
    }
}

interface UpdateTaskResult extends MutationMetadata {
    status: MutationStatus;
    entity?: PersistedTaskState;
    revision?: number;
    lockVersion?: number;
    taskId?: string;
    parentId?: string;
    siblingPosition?: 'tail';
    error?: string;
}

export interface BulkCreateSubtasksResult {
    status: 'ok';
    completeness?: 'complete' | 'partial';
    invalidatedEntityIds?: string[];
    successCount: number;
    failCount: number;
    results: Array<{
        status: 'ok' | 'error';
        subject: string;
        issueId?: string;
        errors?: string[];
    }>;
}

declare global {
    interface Window {
        RedmineCanvasGantt?: {
            projectId: number;
            projectPath?: string;
            issueListPath?: string;
            newIssuePath?: string;
            canvasGanttPath?: string;
            apiBase: string;
            redmineBase: string;
            authToken: string;
            apiKey?: string;
            nonWorkingWeekDays?: number[];
            settings?: InlineEditSettings & { row_height?: string; tracker_icon_map?: string };
            i18n?: Record<string, string>;
        };
    }
}

type RedmineCanvasGanttConfig = NonNullable<Window['RedmineCanvasGantt']>;

const getConfig = (): RedmineCanvasGanttConfig => {
    const config = window.RedmineCanvasGantt;
    if (!config) throw new Error('Configuration not found');
    return config;
};

const getGlobalApiBase = (config: RedmineCanvasGanttConfig): string => {
    const redmineBase = (config.redmineBase || '').replace(/\/$/, '');
    return `${redmineBase}/canvas_gantt`;
};

const buildViewContextQuery = (config: RedmineCanvasGanttConfig): string => {
    const params = new URLSearchParams(window.location.search);
    params.set('canvas_project_id', String(config.projectId));
    return params.toString();
};

const buildJsonHeaders = (config: RedmineCanvasGanttConfig, includeCsrf: boolean = false): HeadersInit => {
    const calendarRevision = includeCsrf ? getBusinessCalendarPayload().revision : null;
    return {
        'Content-Type': 'application/json',
        ...(includeCsrf ? { 'X-CSRF-Token': config.authToken } : {}),
        ...(calendarRevision
            ? { 'X-Redmine-Canvas-Gantt-Calendar-Revision': calendarRevision }
            : {})
    };
};

const parseErrorMessage = async (response: Response): Promise<string> => {
    const payload = await response.json().catch(() => ({} as UnknownRecord));
    const record = asRecord(payload) ?? {};
    const errorValue = record.error;
    if (typeof errorValue === 'string' && errorValue) return errorValue;

    const errorsValue = record.errors;
    if (Array.isArray(errorsValue) && errorsValue.every(e => typeof e === 'string')) {
        return errorsValue.join(', ');
    }

    return response.statusText;
};

const mutationStatusForHttp = (status: number): Exclude<MutationStatus, 'ok'> => {
    if (status === 409) return 'conflict';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 422) return 'validation_error';
    return 'transient_error';
};

const parseMutationError = async (response: Response): Promise<ApiMutationError> => {
    const payload = await response.json().catch(() => ({} as UnknownRecord));
    const record = asRecord(payload) ?? {};
    const errors = Array.isArray(record.errors) && record.errors.every(error => typeof error === 'string')
        ? Object.fromEntries((record.errors as string[]).map((error, index) => [`error_${index}`, error]))
        : undefined;
    const message = typeof record.error === 'string' && record.error
        ? record.error
        : errors
            ? Object.values(errors).join(', ')
            : response.statusText;
    const failure = parseMutationFailure(record.failure);
    return new ApiMutationError(mutationStatusForHttp(response.status), message, response.status, errors, failure);
};

const parseMutationFailure = (value: unknown): MutationFailure | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as UnknownRecord;
    const kind = record.kind;
    if (typeof kind !== 'string') return undefined;
    const role = record.resource_role;
    const remoteAvailability = record.remote_availability;
    return {
        kind: kind as MutationFailure['kind'],
        ...(role === 'target' || role === 'reference' || role === 'relation' || role === 'scope' ? { resourceRole: role } : {}),
        ...(typeof record.resource_type === 'string' ? { resourceType: record.resource_type } : {}),
        ...(record.resource_id !== undefined && record.resource_id !== null ? { resourceId: String(record.resource_id) } : {}),
        ...(remoteAvailability === 'known' || remoteAvailability === 'needs_refresh' || remoteAvailability === 'unavailable' || remoteAvailability === 'unknown' ? { remoteAvailability } : {})
    };
};

const parseMutationMetadata = (value: unknown): Pick<UpdateTaskResult, 'completeness' | 'invalidatedEntityIds' | 'deletedEntityIds' | 'failure'> => {
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
    const failure = parseMutationFailure(record?.failure);
    if (failure) metadata.failure = failure;
    return metadata;
};

const parseMutationEntity = (value: unknown): PersistedTaskState | undefined => {
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

const parseMutationTaskResult = async (response: Response): Promise<UpdateTaskResult> => {
    const data = asRecord(await response.json().catch(() => ({}))) ?? {};
    const entity = parseMutationEntity(data.entity);
    const revision = typeof data.revision === 'number' ? data.revision : entity?.lockVersion;
    const rawStatus = data.status;
    const status: MutationStatus = response.status === 409
        ? 'conflict'
        : typeof rawStatus === 'string' && ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error'].includes(rawStatus)
            ? rawStatus as MutationStatus
            : typeof rawStatus === 'string'
                ? 'protocol_error'
                : response.ok ? 'ok' : mutationStatusForHttp(response.status);
    return {
        status,
        ...parseMutationMetadata(data),
        ...(entity ? { entity } : {}),
        ...(revision !== undefined ? { revision } : {}),
        lockVersion: typeof data.lock_version === 'number' ? data.lock_version : entity?.lockVersion,
        taskId: data.task_id ? String(data.task_id) : entity?.id,
        parentId: data.parent_id === null ? undefined : (data.parent_id ? String(data.parent_id) : entity?.parentId),
        siblingPosition: data.sibling_position === 'tail' ? 'tail' : undefined,
        error: typeof data.error === 'string' ? data.error : undefined
    };
};

const parseScheduleMutationResult = async (response: Response): Promise<ScheduleMutationResult> => {
    const data = asRecord(await response.json().catch(() => ({}))) ?? {};
    const rawEntities = Array.isArray(data.entities) ? data.entities : [];
    const entities = rawEntities.map(parseMutationEntity).filter((entity): entity is PersistedTaskState => Boolean(entity));
    const rawRevisions = asRecord(data.revisions) ?? {};
    const revisions = Object.entries(rawRevisions).reduce<Record<string, number>>((result, [id, revision]) => {
        if (typeof revision === 'number') result[String(id)] = revision;
        return result;
    }, {});
    const rawStatus = data.status;
    const status: MutationStatus = response.status === 409
        ? 'conflict'
        : typeof rawStatus === 'string' && ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error'].includes(rawStatus)
            ? rawStatus as MutationStatus
            : response.ok ? 'ok' : mutationStatusForHttp(response.status);
    const errors = Array.isArray(data.errors) ? data.errors.filter((error): error is string => typeof error === 'string') : undefined;
    const rawConflict = asRecord(data.conflict);
    const conflictTaskId = rawConflict?.task_id ?? rawConflict?.taskId;
    return {
        status,
        operationId: typeof data.operation_id === 'string' ? data.operation_id : '',
        entities,
        revisions,
        ...(errors && errors.length > 0 ? { errors } : {}),
        ...(rawConflict ? {
            conflict: {
                ...(conflictTaskId !== undefined ? { taskId: String(conflictTaskId) } : {}),
                ...(typeof rawConflict.expected_revision === 'number' ? { expectedRevision: rawConflict.expected_revision } : {}),
                ...(typeof rawConflict.expectedRevision === 'number' ? { expectedRevision: rawConflict.expectedRevision } : {}),
                ...(typeof rawConflict.actual_revision === 'number' ? { actualRevision: rawConflict.actual_revision } : {}),
                ...(typeof rawConflict.actualRevision === 'number' ? { actualRevision: rawConflict.actualRevision } : {})
            }
        } : {}),
        ...parseMutationMetadata(data)
    };
};

const parseEditOption = (value: unknown): EditOption | null => {
    const record = asRecord(value);
    if (!record) return null;
    const id = record.id;
    const name = record.name;
    const position = record.position;
    if (typeof id !== 'number' || typeof name !== 'string') return null;
    return {
        id,
        name,
        position: typeof position === 'number' ? position : undefined
    };
};

const isBlankRequiredValue = (value: unknown): boolean =>
    value === null || value === undefined || value === '';

const parseRequiredPositiveNumber = (value: unknown, fieldName: string): number => {
    if (isBlankRequiredValue(value)) {
        throw new Error(`Invalid response: ${fieldName}`);
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid response: ${fieldName}`);
    }
    return parsed;
};

const parseRequiredNonNegativeInteger = (value: unknown, fieldName: string): number => {
    if (isBlankRequiredValue(value)) {
        throw new Error(`Invalid response: ${fieldName}`);
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid response: ${fieldName}`);
    }
    return parsed;
};

const parseRequiredDoneRatio = (value: unknown): number => {
    if (isBlankRequiredValue(value)) {
        throw new Error('Invalid response: done_ratio');
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        throw new Error('Invalid response: done_ratio');
    }
    return parsed;
};

const parseStatus = (value: unknown): TaskStatus | null => {
    const record = asRecord(value);
    if (!record) return null;
    const idValue = record.id;
    const nameValue = record.name;
    const isClosedValue = record.is_closed;
    if ((typeof idValue !== 'number' && typeof idValue !== 'string') || typeof nameValue !== 'string') return null;

    return {
        id: typeof idValue === 'number' ? idValue : Number(idValue),
        name: nameValue,
        isClosed: Boolean(isClosedValue)
    };
};

const parseSavedQuery = (value: unknown): SavedQuery | null => {
    const record = asRecord(value);
    if (!record) return null;

    const id = record.id;
    const name = record.name;
    const isPublic = record.is_public;
    const projectId = record.project_id;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
    if (typeof name !== 'string' || name.trim() === '') return null;
    if (typeof isPublic !== 'boolean') return null;
    if (projectId !== null && projectId !== undefined && !(typeof projectId === 'number' && Number.isInteger(projectId))) return null;

    return {
        id,
        name,
        isPublic,
        projectId: projectId ?? null
    };
};

const parseCustomFieldMeta = (value: unknown): CustomFieldMeta | null => {
    const record = asRecord(value);
    if (!record) return null;
    const id = record.id;
    const name = record.name;
    const fieldFormat = record.field_format;
    const isRequired = record.is_required;

    if (typeof id !== 'number' || typeof name !== 'string') return null;
    if (typeof fieldFormat !== 'string') return null;
    if (typeof isRequired !== 'boolean') return null;

    const regexp = typeof record.regexp === 'string' ? record.regexp : null;
    const minLength = typeof record.min_length === 'number' ? record.min_length : null;
    const maxLength = typeof record.max_length === 'number' ? record.max_length : null;

    const possibleValuesRaw = record.possible_values;
    const possibleValues =
        Array.isArray(possibleValuesRaw) && possibleValuesRaw.every(v => typeof v === 'string')
            ? possibleValuesRaw
            : null;

    return {
        id,
        name,
        fieldFormat: fieldFormat as CustomFieldMeta['fieldFormat'],
        isRequired,
        regexp,
        minLength,
        maxLength,
        possibleValues
    };
};

const parseFilterProjectOption = (value: unknown): FilterProjectOption | null => {
    const record = asRecord(value);
    if (!record) return null;
    const id = record.id;
    const name = record.name;
    if ((typeof id !== 'number' && typeof id !== 'string') || typeof name !== 'string') return null;
    return { id: String(id), name };
};

const parseFilterAssigneeOption = (value: unknown): FilterAssigneeOption | null => {
    const record = asRecord(value);
    if (!record) return null;

    const id = record.id;
    const name = record.name;
    const projectIdsRaw = Array.isArray(record.project_ids) ? record.project_ids : [];

    if (id !== null && typeof id !== 'number' && typeof id !== 'string') return null;
    if (name !== null && name !== undefined && typeof name !== 'string') return null;

    return {
        id: id === null || id === undefined ? null : Number(id),
        name: typeof name === 'string' ? name : null,
        projectIds: projectIdsRaw
            .filter((projectId): projectId is string | number => typeof projectId === 'string' || typeof projectId === 'number')
            .map((projectId) => String(projectId))
    };
};

const parseFilterTrackerOption = (value: unknown): FilterTrackerOption | null => {
    const record = asRecord(value);
    if (!record) return null;

    const id = record.id;
    const name = record.name;
    const projectIdsRaw = Array.isArray(record.project_ids) ? record.project_ids : [];
    if ((typeof id !== 'number' && typeof id !== 'string') || typeof name !== 'string') return null;

    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;

    return {
        id: numericId,
        name,
        projectIds: projectIdsRaw
            .filter((projectId): projectId is string | number => typeof projectId === 'string' || typeof projectId === 'number')
            .map((projectId) => String(projectId))
    };
};

const deriveFilterOptionsFromTasks = (tasks: Task[]): FilterOptions => {
    const projects = new Map<string, string>();
    const assignees = new Map<number | null, { name: string | null; projectIds: Set<string> }>();

    tasks.forEach((task) => {
        if (task.projectId && task.projectName) {
            projects.set(task.projectId, task.projectName);
        }

        const assigneeId = task.assignedToId ?? null;
        const entry = assignees.get(assigneeId) ?? {
            name: assigneeId === null ? null : (task.assignedToName ?? null),
            projectIds: new Set<string>()
        };
        if (assigneeId !== null && entry.name === null && task.assignedToName) {
            entry.name = task.assignedToName;
        }
        if (task.projectId) {
            entry.projectIds.add(task.projectId);
        }
        assignees.set(assigneeId, entry);
    });

    return {
        projects: Array.from(projects.entries()).map(([id, name]) => ({ id, name })),
        assignees: Array.from(assignees.entries()).map(([id, entry]) => ({
            id,
            name: entry.name,
            projectIds: Array.from(entry.projectIds)
        }))
    };
};

const parseFilterOptions = (value: unknown, tasks: Task[]): FilterOptions => {
    const fallback = deriveFilterOptionsFromTasks(tasks);
    const record = asRecord(value);
    if (!record) return fallback;

    const projectsRaw = Array.isArray(record.projects) ? record.projects : [];
    const assigneesRaw = Array.isArray(record.assignees) ? record.assignees : [];
    const hasTrackers = Object.prototype.hasOwnProperty.call(record, 'trackers');
    const trackersRaw = Array.isArray(record.trackers) ? record.trackers : [];

    const projects = projectsRaw.map(parseFilterProjectOption).filter((entry): entry is FilterProjectOption => entry !== null);
    const assignees = assigneesRaw.map(parseFilterAssigneeOption).filter((entry): entry is FilterAssigneeOption => entry !== null);
    const trackers = trackersRaw.map(parseFilterTrackerOption).filter((entry): entry is FilterTrackerOption => entry !== null);

    return {
        projects: projects.length > 0 ? projects : fallback.projects,
        assignees: assignees.length > 0 ? assignees : fallback.assignees,
        ...(hasTrackers ? { trackers } : {})
    };
};

const parseBaselineSnapshot = (value: unknown): { snapshot: BaselineSnapshot | null; warnings: string[] } => {
    const warnings: string[] = [];
    const root = asRecord(value);
    if (!root) {
        return { snapshot: null, warnings };
    }

    const snapshotIdValue = root.snapshot_id;
    const projectIdValue = root.project_id;
    const capturedAtValue = root.captured_at;
    const capturedByIdValue = root.captured_by_id;
    const capturedByNameValue = root.captured_by_name;
    const scopeValue = root.scope;
    const tasksByIssueIdValue = asRecord(root.tasks_by_issue_id);

    if (typeof snapshotIdValue !== 'string' || snapshotIdValue.trim() === '') {
        warnings.push('Baseline snapshot discarded: missing snapshot_id');
        return { snapshot: null, warnings };
    }

    if (typeof projectIdValue !== 'number' && typeof projectIdValue !== 'string') {
        warnings.push('Baseline snapshot discarded: missing project_id');
        return { snapshot: null, warnings };
    }

    if (typeof capturedAtValue !== 'string' || capturedAtValue.trim() === '') {
        warnings.push('Baseline snapshot discarded: missing captured_at');
        return { snapshot: null, warnings };
    }

    if (!tasksByIssueIdValue) {
        warnings.push('Baseline snapshot discarded: missing tasks_by_issue_id');
        return { snapshot: null, warnings };
    }

    const tasksByIssueId: Record<string, BaselineTaskState> = {};
    Object.entries(tasksByIssueIdValue).forEach(([key, entry]) => {
        const taskRecord = asRecord(entry);
        if (!taskRecord) {
            warnings.push(`Baseline task skipped: invalid payload for issue ${key}`);
            return;
        }

        const issueIdValue = taskRecord.issue_id ?? key;
        if (typeof issueIdValue !== 'number' && typeof issueIdValue !== 'string') {
            warnings.push(`Baseline task skipped: invalid issue_id for issue ${key}`);
            return;
        }

        const baselineStartDate = parseBaselineDateValue(taskRecord.baseline_start_date);
        const baselineDueDate = parseBaselineDateValue(taskRecord.baseline_due_date);

        if (taskRecord.baseline_start_date !== undefined && taskRecord.baseline_start_date !== null && baselineStartDate === null) {
            warnings.push(`Baseline task date parse failure for issue ${String(issueIdValue)} start_date`);
        }
        if (taskRecord.baseline_due_date !== undefined && taskRecord.baseline_due_date !== null && baselineDueDate === null) {
            warnings.push(`Baseline task date parse failure for issue ${String(issueIdValue)} due_date`);
        }

        tasksByIssueId[String(issueIdValue)] = {
            issueId: String(issueIdValue),
            baselineStartDate,
            baselineDueDate
        };
    });

    return {
        snapshot: {
            snapshotId: snapshotIdValue,
            projectId: String(projectIdValue),
            capturedAt: capturedAtValue,
            capturedById: typeof capturedByIdValue === 'number' && Number.isFinite(capturedByIdValue)
                ? capturedByIdValue
                : null,
            capturedByName: typeof capturedByNameValue === 'string' ? capturedByNameValue : null,
            scope: normalizeBaselineSaveScope(scopeValue),
            tasksByIssueId
        },
        warnings
    };
};

export const apiClient = {
    fetchQueries: async (): Promise<SavedQuery[]> => {
        const config = getConfig();
        const response = await sessionFetch(new URL(`${config.apiBase}/queries.json`, window.location.origin).toString(), {
            headers: buildJsonHeaders(config)
        });

        if (!response.ok) {
            throw new Error(await parseErrorMessage(response));
        }

        const payload = await response.json();
        const root = asRecord(payload);
        const queries = Array.isArray(root?.queries) ? root.queries : [];
        return queries.map(parseSavedQuery).filter((entry): entry is SavedQuery => entry !== null);
    },

    fetchData: async (params?: { query?: ResolvedQueryState; queryContext?: QueryContext; rawSearch?: string }): Promise<ApiData> => {
        const config = getConfig();

        const parseDate = parseDateOnly;

        const qs = params?.rawSearch
            ? params.rawSearch.replace(/^\?/, '')
            : buildIssueQueryParams(params?.query ?? {}, { queryContext: params?.queryContext }).toString();
        const url = new URL(`${config.apiBase}/data.json` + (qs ? `?${qs}` : ''), window.location.origin).toString();

        const response = await sessionFetch(url, {
            headers: buildJsonHeaders(config)
        });

        if (!response.ok) {
            throw new Error(await parseErrorMessage(response));
        }

        const payload = await response.json();
        const data = asRecord(payload) ?? {};
        const customFieldsRaw = Array.isArray(data.custom_fields) ? data.custom_fields : [];
        const customFields = customFieldsRaw.map(parseCustomFieldMeta).filter((v): v is CustomFieldMeta => Boolean(v));

        // Transform API tasks to internal Task model
        const tasksRaw = Array.isArray(data.tasks) ? data.tasks : [];
        const tasks: Task[] = (tasksRaw as ApiTask[]).map((t, index: number): Task => {
            const start = parseDate(typeof t.start_date === 'string' ? t.start_date : null);
            const due = parseDate(typeof t.due_date === 'string' ? t.due_date : null);
            const customFieldValuesRaw = asRecord(t.custom_field_values) ?? {};
            const customFieldValues: Record<string, string | null> = {};
            Object.entries(customFieldValuesRaw).forEach(([key, value]) => {
                if (typeof value === 'string') customFieldValues[key] = value;
                else if (value === null) customFieldValues[key] = null;
            });

            return {
                id: String(t.id),
                subject: String(t.subject ?? ''),
                projectId: t.project_id ? String(t.project_id) : undefined,
                projectName: typeof t.project_name === 'string' ? t.project_name : undefined,
                displayOrder: typeof t.display_order === 'number' ? t.display_order : index,
                startDate: start ?? undefined,
                dueDate: due ?? undefined,
                ratioDone: typeof t.ratio_done === 'number' ? t.ratio_done : 0,
                statusId: typeof t.status_id === 'number' ? t.status_id : 0,
                assignedToId: t.assigned_to_id === null ? null : (typeof t.assigned_to_id === 'number' ? t.assigned_to_id : undefined),
                assignedToName: t.assigned_to_name === null ? null : (typeof t.assigned_to_name === 'string' ? t.assigned_to_name : undefined),
                parentId: t.parent_id ? String(t.parent_id) : undefined,
                lockVersion: typeof t.lock_version === 'number' ? t.lock_version : 0,
                editable: Boolean(t.editable),
                trackerId: typeof t.tracker_id === 'number' ? t.tracker_id : undefined,
                trackerName: typeof t.tracker_name === 'string' ? t.tracker_name : undefined,
                fixedVersionId: t.fixed_version_id ? String(t.fixed_version_id) : undefined,
                priorityId: typeof t.priority_id === 'number' ? t.priority_id : undefined,
                priorityName: typeof t.priority_name === 'string' ? t.priority_name : undefined,
                priorityPosition: typeof t.priority_position === 'number' ? t.priority_position : undefined,
                authorId: typeof t.author_id === 'number' ? t.author_id : undefined,
                authorName: typeof t.author_name === 'string' ? t.author_name : undefined,
                categoryId: typeof t.category_id === 'number' ? t.category_id : undefined,
                categoryName: typeof t.category_name === 'string' ? t.category_name : undefined,
                estimatedHours: typeof t.estimated_hours === 'number' ? t.estimated_hours : undefined,
                createdOn: typeof t.created_on === 'string' ? t.created_on : undefined,
                updatedOn: typeof t.updated_on === 'string' ? t.updated_on : undefined,
                statusName: typeof t.status_name === 'string' ? t.status_name : undefined,
                spentHours: typeof t.spent_hours === 'number' ? t.spent_hours : undefined,
                fixedVersionName: typeof t.fixed_version_name === 'string' ? t.fixed_version_name : undefined,
                customFieldValues,
                rowIndex: index, // Simplify for now: default order
                hasChildren: false // Will be updated below
            };
        });

        // Compute hasChildren efficiently
        const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
        tasks.forEach(t => {
            if (parentIds.has(t.id)) {
                t.hasChildren = true;
            }
        });

        const relationsRaw = Array.isArray(data.relations) ? data.relations : [];
        const relations: Relation[] = (relationsRaw as ApiRelation[]).map((r): Relation => ({
            id: String(r.id ?? ''),
            from: String(r.from ?? r.issue_from_id ?? ''),
            to: String(r.to ?? r.issue_to_id ?? ''),
            type: String(r.type ?? r.relation_type ?? ''),
            delay: typeof r.delay === 'number' ? r.delay : undefined
        })).filter(r => r.id !== '' && r.from !== '' && r.to !== '' && r.type !== '');

        const versions: Version[] = Array.isArray(data.versions) ? (data.versions as ApiVersion[]).map((v: ApiVersion) => {
            const dateStr = typeof v.effective_date === 'string' ? v.effective_date : null;
            const effectiveDate = parseDate(dateStr) ?? undefined;

            const startStr = typeof v.start_date === 'string' ? v.start_date : null;
            const startDate = parseDate(startStr) ?? undefined;
            const ratioDone = typeof v.completed_percent === 'number' ? v.completed_percent : undefined;

            return {
                id: String(v.id),
                name: String(v.name ?? ''),
                effectiveDate,
                startDate,
                ratioDone,
                projectId: String(v.project_id),
                status: String(v.status ?? '')
            } as Version;
        }).filter((v): v is Version => v !== null) : [];

        const statuses: TaskStatus[] = Array.isArray(data.statuses)
            ? (data.statuses as unknown[]).map(parseStatus).filter((s): s is TaskStatus => s !== null)
            : [];

        const projectRecord = asRecord(data.project) ?? {};
        const permissionsRecord = asRecord(data.permissions) ?? {};
        const project: Project = {
            id: String(projectRecord.id ?? ''),
            name: typeof projectRecord.name === 'string' ? projectRecord.name : ''
        };
        if (typeof projectRecord.start_date === 'string') project.startDate = projectRecord.start_date;
        if (typeof projectRecord.due_date === 'string') project.dueDate = projectRecord.due_date;

        const permissions = {
            editable: Boolean(permissionsRecord.editable),
            viewable: Boolean(permissionsRecord.viewable),
            baselineEditable: Boolean(permissionsRecord.baseline_editable)
        };

        const warnings = Array.isArray(data.warnings)
            ? data.warnings.filter((entry): entry is string => typeof entry === 'string')
            : [];
        const filterOptions = parseFilterOptions(data.filter_options, tasks);
        const baselinePayload = parseBaselineSnapshot(data.baseline);
        const baseline = baselinePayload.snapshot;
        const mergedWarnings = [...warnings, ...baselinePayload.warnings];
        const businessCalendar = normalizeBusinessCalendarPayload(data.businessCalendar ?? data.business_calendar);

        return {
            tasks,
            relations,
            versions,
            filterOptions,
            statuses,
            customFields,
            project,
            permissions,
            baseline,
            initialState: parseResolvedQueryState(data.initial_state),
            queryContext: data.query_context === undefined ? undefined : normalizeQueryContext(data.query_context),
            warnings: mergedWarnings,
            businessCalendar
        };
    },

    saveBaseline: async (params?: { query?: ResolvedQueryState; rawSearch?: string; scope?: BaselineSaveScope }, operationId?: string): Promise<BaselineSaveResult> => {
        const config = getConfig();
        const scope = params?.scope ?? 'filtered';

        const qs = scope === 'filtered'
            ? (params?.rawSearch
                ? params.rawSearch.replace(/^\?/, '')
                : buildIssueQueryParams(params?.query ?? {}).toString())
            : '';
        const url = new URL(`${config.apiBase}/baseline.json` + (qs ? `?${qs}` : ''), window.location.origin).toString();

        const response = await sessionFetch(url, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({ scope, ...(operationId ? { client_operation_id: operationId } : {}) })
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }

        const payload = await response.json();
        const root = asRecord(payload);
        if (!root) {
            return { status: 'error', baseline: null, error: 'Invalid response' };
        }

        const baselinePayload = parseBaselineSnapshot(root.baseline ?? root);
        const warnings = Array.isArray(root.warnings)
            ? root.warnings.filter((entry): entry is string => typeof entry === 'string')
            : [];
        return {
            status: typeof root.status === 'string' ? root.status as 'ok' | 'error' : 'ok',
            ...parseMutationMetadata(root),
            baseline: baselinePayload.snapshot,
            warnings: [...warnings, ...baselinePayload.warnings]
        };
    },

    fetchEditMeta: async (taskId: string, targetProjectId?: number, targetTrackerId?: number, targetStatusId?: number, draftIntent?: Record<string, unknown>): Promise<TaskEditMeta> => {
        const config = getConfig();
        const query = new URLSearchParams(buildViewContextQuery(config));
        if (targetProjectId !== undefined) query.set('target_project_id', String(targetProjectId));
        if (targetTrackerId !== undefined) query.set('target_tracker_id', String(targetTrackerId));
        if (targetStatusId !== undefined) query.set('target_status_id', String(targetStatusId));
        const response = await sessionFetch(
            `${getGlobalApiBase(config)}/tasks/${taskId}/edit_meta${draftIntent ? '/preview' : ''}.json?${query}`,
            draftIntent
                ? {
                    method: 'POST',
                    headers: buildJsonHeaders(config, true),
                    body: JSON.stringify({ task: draftIntent })
                }
                : { headers: buildJsonHeaders(config) }
        );

        if (!response.ok) throw await parseMutationError(response);

        const payload = await response.json();
        const root = asRecord(payload);
        if (!root) throw new Error('Invalid response');

        const task = asRecord(root.task);
        const editable = asRecord(root.editable);
        const options = asRecord(root.options);
        const customFieldValuesRecord = asRecord(root.custom_field_values) ?? {};
        const draftContractRaw = asRecord(root.draft_contract);

        if (!task || !editable || !options) throw new Error('Invalid response');

        const taskIdValue = task.id;
        const subjectValue = task.subject;
        const assignedToIdValue = task.assigned_to_id;
        const statusIdValue = task.status_id;
        const doneRatioValue = task.done_ratio;
        const dueDateValue = task.due_date;
        const startDateValue = task.start_date;
        const priorityIdValue = task.priority_id;
        const categoryIdValue = task.category_id;
        const estimatedHoursValue = task.estimated_hours;
        const projectIdValue = task.project_id;
        const trackerIdValue = task.tracker_id;
        const fixedVersionIdValue = task.fixed_version_id;
        const lockVersionValue = task.lock_version;

        if (taskIdValue === undefined || subjectValue === undefined || statusIdValue === undefined || doneRatioValue === undefined || lockVersionValue === undefined) {
            throw new Error('Invalid response');
        }

        const capabilityContextRaw = asRecord(root.capability_context);
        const capabilityContext: EditMetaCapabilityContext = capabilityContextRaw
            ? {
                taskId: String(capabilityContextRaw.task_id ?? taskIdValue),
                projectId: parseRequiredPositiveNumber(capabilityContextRaw.project_id, 'capability_context.project_id'),
                trackerId: parseRequiredPositiveNumber(capabilityContextRaw.tracker_id, 'capability_context.tracker_id'),
                statusId: parseRequiredPositiveNumber(capabilityContextRaw.status_id, 'capability_context.status_id')
            }
            : {
                taskId: String(taskIdValue),
                projectId: parseRequiredPositiveNumber(projectIdValue, 'project_id'),
                trackerId: parseRequiredPositiveNumber(trackerIdValue, 'tracker_id'),
                statusId: parseRequiredPositiveNumber(statusIdValue, 'status_id')
            };

        const editableSubject = editable.subject;
        const editableAssignedToId = editable.assigned_to_id;
        const editableStatusId = editable.status_id;
        const editableDoneRatio = editable.done_ratio;
        const editableDueDate = editable.due_date;
        const editableStartDate = editable.start_date;
        const editablePriorityId = editable.priority_id;
        const editableCategoryId = editable.category_id;
        const editableEstimatedHours = editable.estimated_hours;
        const editableProjectId = editable.project_id;
        const editableTrackerId = editable.tracker_id;
        const editableFixedVersionId = editable.fixed_version_id;
        const editableCustomFieldValues = editable.custom_field_values;

        if (![editableSubject, editableAssignedToId, editableStatusId, editableDoneRatio, editableDueDate, editableStartDate, editablePriorityId, editableCategoryId, editableEstimatedHours, editableProjectId, editableTrackerId, editableFixedVersionId, editableCustomFieldValues].every(v => typeof v === 'boolean')) {
            throw new Error('Invalid response');
        }

        const statusesRaw = Array.isArray(options.statuses) ? options.statuses : [];
        const assigneesRaw = Array.isArray(options.assignees) ? options.assignees : [];
        const prioritiesRaw = Array.isArray(options.priorities) ? options.priorities : [];
        const categoriesRaw = Array.isArray(options.categories) ? options.categories : [];
        const projectsRaw = Array.isArray(options.projects) ? options.projects : [];
        const trackersRaw = Array.isArray(options.trackers) ? options.trackers : [];
        const versionsRaw = Array.isArray(options.versions) ? options.versions : [];
        const customFieldsRaw = Array.isArray(options.custom_fields) ? options.custom_fields : [];

        const statuses = statusesRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const assignees = assigneesRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const priorities = prioritiesRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const categories = categoriesRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const projects = projectsRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const trackers = trackersRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const versions = versionsRaw.map(parseEditOption).filter((v): v is EditOption => Boolean(v));
        const customFields = customFieldsRaw.map(parseCustomFieldMeta).filter((v): v is CustomFieldMeta => Boolean(v));

        const customFieldValues: Record<string, string | null> = {};
        Object.entries(customFieldValuesRecord).forEach(([key, value]) => {
            if (typeof value === 'string') customFieldValues[key] = value;
            else if (value === null) customFieldValues[key] = null;
        });

        const draftContract: DraftContract | undefined = draftContractRaw
            ? {
                baseRevision: parseRequiredNonNegativeInteger(draftContractRaw.base_revision, 'draft_contract.base_revision'),
                materialized: asRecord(draftContractRaw.materialized) ?? {},
                normalizations: Array.isArray(draftContractRaw.normalizations)
                    ? draftContractRaw.normalizations.filter((value): value is DraftContract['normalizations'][number] => Boolean(asRecord(value)))
                    : [],
                violations: Array.isArray(draftContractRaw.violations)
                    ? draftContractRaw.violations.filter((value): value is DraftContract['violations'][number] => Boolean(asRecord(value)))
                    : []
            }
            : undefined;

        return {
            capabilityContext,
            ...(draftContract ? { draftContract } : {}),
            task: {
                id: String(taskIdValue),
                subject: String(subjectValue),
                assignedToId: assignedToIdValue == null
                    ? null
                    : (Number.isFinite(Number(assignedToIdValue)) ? Number(assignedToIdValue) : null),
                statusId: parseRequiredPositiveNumber(statusIdValue, 'status_id'),
                doneRatio: parseRequiredDoneRatio(doneRatioValue),
                dueDate: typeof dueDateValue === 'string' ? dueDateValue : null,
                startDate: typeof startDateValue === 'string' ? startDateValue : null,
                priorityId: typeof priorityIdValue === 'number' ? priorityIdValue : Number(priorityIdValue || 0),
                categoryId: typeof categoryIdValue === 'number' ? categoryIdValue : (categoryIdValue ? Number(categoryIdValue) : null),
                estimatedHours: typeof estimatedHoursValue === 'number' ? estimatedHoursValue : (estimatedHoursValue ? Number(estimatedHoursValue) : null),
                projectId: parseRequiredPositiveNumber(projectIdValue, 'project_id'),
                trackerId: parseRequiredPositiveNumber(trackerIdValue, 'tracker_id'),
                fixedVersionId: typeof fixedVersionIdValue === 'number' ? fixedVersionIdValue : (fixedVersionIdValue ? Number(fixedVersionIdValue) : null),
                lockVersion: parseRequiredNonNegativeInteger(lockVersionValue, 'lock_version')
            },
            editable: {
                subject: editableSubject as boolean,
                assignedToId: editableAssignedToId as boolean,
                statusId: editableStatusId as boolean,
                doneRatio: editableDoneRatio as boolean,
                dueDate: editableDueDate as boolean,
                startDate: editableStartDate as boolean,
                priorityId: editablePriorityId as boolean,
                categoryId: editableCategoryId as boolean,
                estimatedHours: editableEstimatedHours as boolean,
                projectId: editableProjectId as boolean,
                trackerId: editableTrackerId as boolean,
                fixedVersionId: editableFixedVersionId as boolean,
                customFieldValues: editableCustomFieldValues as boolean
            },
            options: {
                statuses,
                assignees,
                priorities,
                categories,
                projects,
                trackers,
                versions,
                customFields
            },
            customFieldValues
        };
    },

    updateTask: async (task: Task, operationId?: string, fields?: Record<string, unknown>): Promise<UpdateTaskResult> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);

        const requestedFields = fields ?? {
            start_date: task.startDate,
            due_date: task.dueDate,
            parent_issue_id: task.parentId ? Number(task.parentId) : null
        };
        const taskPayload: Record<string, unknown> = { lock_version: task.lockVersion, ...requestedFields };
        if (!fields) {
            if (Object.prototype.hasOwnProperty.call(requestedFields, 'start_date')) taskPayload.start_date = formatDateOnly(task.startDate);
            if (Object.prototype.hasOwnProperty.call(requestedFields, 'due_date')) taskPayload.due_date = formatDateOnly(task.dueDate);
            if (Object.prototype.hasOwnProperty.call(requestedFields, 'parent_issue_id')) taskPayload.parent_issue_id = task.parentId ? Number(task.parentId) : null;
        }

        const response = await sessionFetch(`${getGlobalApiBase(config)}/tasks/${task.id}.json?${query}`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                task: taskPayload,
                ...(operationId ? { client_operation_id: operationId } : {})
            })
        });

        if (response.status === 409) {
            return parseMutationTaskResult(response);
        }

        if (!response.ok) {
            const error = await parseMutationError(response);
            return { status: error.status, error: error.message, failure: error.failure };
        }

        return parseMutationTaskResult(response);
    },

    updateTaskFields: async (taskId: string, fields: Record<string, unknown>, operationId?: string): Promise<UpdateTaskResult> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);

        const response = await sessionFetch(`${getGlobalApiBase(config)}/tasks/${taskId}.json?${query}`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({ task: fields, ...(operationId ? { client_operation_id: operationId } : {}) })
        });

        if (response.status === 409) {
            return parseMutationTaskResult(response);
        }

        if (!response.ok) {
            const error = await parseMutationError(response);
            return { status: error.status, error: error.message, failure: error.failure };
        }

        return parseMutationTaskResult(response);
    },

    scheduleMutation: async (changes: ScheduleMutationChange[], operationId: string): Promise<ScheduleMutationResult> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);
        const response = await sessionFetch(`${getGlobalApiBase(config)}/schedule_mutation.json?${query}`, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                operation_id: operationId,
                base_revisions: Object.fromEntries(changes.map(change => [change.taskId, change.baseRevision])),
                changes: changes.map(({ taskId, startDate, dueDate }) => ({
                    task_id: taskId,
                    ...(startDate !== undefined ? { start_date: formatDateOnly(startDate) } : {}),
                    ...(dueDate !== undefined ? { due_date: formatDateOnly(dueDate) } : {})
                }))
            })
        });
        return parseScheduleMutationResult(response);
    },

    createRelation: async (fromId: string, toId: string, type: string, delay?: number, operationId?: string): Promise<Relation & MutationMetadata & { status: 'ok' }> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);

        const response = await sessionFetch(`${getGlobalApiBase(config)}/relations.json?${query}`, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                relation: {
                    issue_from_id: fromId,
                    issue_to_id: toId,
                    relation_type: type,
                    ...(typeof delay === 'number' ? { delay } : {})
                },
                ...(operationId ? { client_operation_id: operationId } : {})
            })
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }

        const payload = await response.json();
        const relation = normalizeRelation(payload, { fromId, toId, type });

        // If we can't obtain a usable id, deletion will fail later.
        // Prefer failing fast so the UI can surface the error.
        if (!relation.id || relation.id === 'undefined' || relation.id === 'null') {
            throw new Error('Invalid relation response');
        }

        return { status: 'ok', ...relation, ...parseMutationMetadata(payload) };
    },

    updateRelation: async (relationId: string, type: string, delay?: number, operationId?: string): Promise<Relation & MutationMetadata & { status: 'ok' }> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);
        const response = await sessionFetch(`${getGlobalApiBase(config)}/relations/${relationId}.json?${query}`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                relation: {
                    relation_type: type,
                    ...(typeof delay === 'number' ? { delay } : {})
                },
                ...(operationId ? { client_operation_id: operationId } : {})
            })
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }

        const payload = await response.json();
        return { status: 'ok', ...normalizeRelation(payload, { fromId: '', toId: '', type }), ...parseMutationMetadata(payload) };
    },

    deleteRelation: async (relationId: string, operationId?: string): Promise<MutationMetadata & { status: 'ok' }> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);

        const response = await sessionFetch(`${getGlobalApiBase(config)}/relations/${relationId}.json?${query}`, {
            method: 'DELETE',
            headers: buildJsonHeaders(config, true),
            ...(operationId ? { body: JSON.stringify({ client_operation_id: operationId }) } : {})
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }
        const payload = typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
        return { status: 'ok', ...parseMutationMetadata(payload) };
    },

    getSubtaskTrackers: async (parentId: string, operationIssueIds: string[] = []): Promise<Array<{ id: number; name: string }>> => {
        const config = getConfig();
        const query = new URLSearchParams(buildViewContextQuery(config));
        query.set('parent_issue_id', parentId);
        operationIssueIds.forEach(id => query.append('operation_issue_ids[]', id));
        const response = await sessionFetch(`${getGlobalApiBase(config)}/subtasks/trackers.json?${query.toString()}`, {
            headers: buildJsonHeaders(config)
        });
        if (!response.ok) throw await parseMutationError(response);
        const payload = await response.json() as { trackers?: Array<{ id: number; name: string }> };
        return Array.isArray(payload.trackers) ? payload.trackers : [];
    },

    bulkCreateSubtasks: async (payload: { parentId: string; subjects?: string[]; subtasks?: Array<{ subject: string; tracker_id?: number }>; operationIssueIds?: string[] }, operationId?: string): Promise<BulkCreateSubtasksResult> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);
        const response = await sessionFetch(`${getGlobalApiBase(config)}/subtasks/bulk.json?${query}`, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                parent_issue_id: Number(payload.parentId),
                ...(payload.subtasks ? { subtasks: payload.subtasks } : { subjects: payload.subjects ?? [] }),
                operation_issue_ids: (payload.operationIssueIds ?? []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0),
                ...(operationId ? { client_operation_id: operationId } : {})
            })
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }

        const data = await response.json();
        const resultsRaw = Array.isArray(data.results) ? data.results : [];
        const results = resultsRaw.map((row: unknown) => {
            const record = asRecord(row) ?? {};
            const errors = Array.isArray(record.errors) && record.errors.every((e) => typeof e === 'string')
                ? record.errors as string[]
                : undefined;
            return {
                status: record.status === 'ok' ? 'ok' : 'error',
                subject: typeof record.subject === 'string' ? record.subject : '',
                issueId: record.issue_id != null ? String(record.issue_id) : undefined,
                errors
            };
        });

        return {
            status: 'ok',
            ...parseMutationMetadata(data),
            successCount: typeof data.success_count === 'number' ? data.success_count : 0,
            failCount: typeof data.fail_count === 'number' ? data.fail_count : 0,
            results
        };
    },

    deleteTask: async (taskId: string, operationId?: string): Promise<MutationMetadata & { status: 'ok' }> => {
        const config = getConfig();
        const query = buildViewContextQuery(config);

        const response = await sessionFetch(`${getGlobalApiBase(config)}/tasks/${taskId}.json?${query}`, {
            method: 'DELETE',
            headers: buildJsonHeaders(config, true),
            ...(operationId ? { body: JSON.stringify({ client_operation_id: operationId }) } : {})
        });

        if (!response.ok) {
            throw await parseMutationError(response);
        }
        const payload = typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
        return { status: 'ok', ...parseMutationMetadata(payload) };
    }
};
