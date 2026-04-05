import type {
    FilterAssigneeOption,
    FilterOptions,
    FilterProjectOption,
    Relation,
    Project,
    SavedQuery,
    Task,
    Version,
    TaskStatus
} from '../types';
import type { TaskEditMeta, InlineEditSettings, CustomFieldMeta, EditOption } from '../types/editMeta';
import type { BaselineSaveScope, BaselineSnapshot, BaselineTaskState } from '../types/baseline';
import { buildIssueQueryParams, parseResolvedQueryState, type ResolvedQueryState } from '../utils/queryParams';
import { normalizeBaselineSaveScope, parseBaselineDateValue } from '../utils/baseline';

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
    warnings?: string[];
}

interface BaselineSaveResult {
    status: 'ok' | 'error';
    baseline: BaselineSnapshot | null;
    warnings?: string[];
    error?: string;
}

interface UpdateTaskResult {
    status: 'ok' | 'conflict' | 'error';
    lockVersion?: number;
    taskId?: string;
    parentId?: string;
    siblingPosition?: 'tail';
    error?: string;
}

export interface BulkCreateSubtasksResult {
    status: 'ok';
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
            apiKey: string;
            nonWorkingWeekDays?: number[];
            settings?: InlineEditSettings & { row_height?: string };
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

const buildJsonHeaders = (config: RedmineCanvasGanttConfig, includeCsrf: boolean = false): HeadersInit => ({
    'X-Redmine-API-Key': config.apiKey,
    'Content-Type': 'application/json',
    ...(includeCsrf ? { 'X-CSRF-Token': config.authToken } : {})
});

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

const parseEditOption = (value: unknown): EditOption | null => {
    const record = asRecord(value);
    if (!record) return null;
    const id = record.id;
    const name = record.name;
    if (typeof id !== 'number' || typeof name !== 'string') return null;
    return { id, name };
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

    const projects = projectsRaw.map(parseFilterProjectOption).filter((entry): entry is FilterProjectOption => entry !== null);
    const assignees = assigneesRaw.map(parseFilterAssigneeOption).filter((entry): entry is FilterAssigneeOption => entry !== null);

    return {
        projects: projects.length > 0 ? projects : fallback.projects,
        assignees: assignees.length > 0 ? assignees : fallback.assignees
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
        const response = await fetch(new URL(`${config.apiBase}/queries.json`, window.location.origin).toString(), {
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

    fetchData: async (params?: { query?: ResolvedQueryState; rawSearch?: string }): Promise<ApiData> => {
        const config = getConfig();

        const parseDate = (value: string | null | undefined): number | null => {
            if (!value) return null;
            const ts = new Date(value).getTime();
            return Number.isFinite(ts) ? ts : null;
        };

        const qs = params?.rawSearch
            ? params.rawSearch.replace(/^\?/, '')
            : buildIssueQueryParams(params?.query ?? {}).toString();
        const url = new URL(`${config.apiBase}/data.json` + (qs ? `?${qs}` : ''), window.location.origin).toString();

        const response = await fetch(url, {
            headers: buildJsonHeaders(config)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
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
                assignedToId: typeof t.assigned_to_id === 'number' ? t.assigned_to_id : undefined,
                assignedToName: typeof t.assigned_to_name === 'string' ? t.assigned_to_name : undefined,
                parentId: t.parent_id ? String(t.parent_id) : undefined,
                lockVersion: typeof t.lock_version === 'number' ? t.lock_version : 0,
                editable: Boolean(t.editable),
                trackerId: typeof t.tracker_id === 'number' ? t.tracker_id : undefined,
                trackerName: typeof t.tracker_name === 'string' ? t.tracker_name : undefined,
                fixedVersionId: t.fixed_version_id ? String(t.fixed_version_id) : undefined,
                priorityId: typeof t.priority_id === 'number' ? t.priority_id : undefined,
                priorityName: typeof t.priority_name === 'string' ? t.priority_name : undefined,
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
            warnings: mergedWarnings
        };
    },

    saveBaseline: async (params?: { query?: ResolvedQueryState; rawSearch?: string; scope?: BaselineSaveScope }): Promise<BaselineSaveResult> => {
        const config = getConfig();
        const scope = params?.scope ?? 'filtered';

        const qs = scope === 'filtered'
            ? (params?.rawSearch
                ? params.rawSearch.replace(/^\?/, '')
                : buildIssueQueryParams(params?.query ?? {}).toString())
            : '';
        const url = new URL(`${config.apiBase}/baseline.json` + (qs ? `?${qs}` : ''), window.location.origin).toString();

        const response = await fetch(url, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({ scope })
        });

        if (!response.ok) {
            return { status: 'error', baseline: null, error: await parseErrorMessage(response) };
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
            baseline: baselinePayload.snapshot,
            warnings: [...warnings, ...baselinePayload.warnings]
        };
    },

    fetchEditMeta: async (taskId: string): Promise<TaskEditMeta> => {
        const config = getConfig();

        const response = await fetch(`${config.apiBase}/tasks/${taskId}/edit_meta.json`, {
            headers: buildJsonHeaders(config)
        });

        if (!response.ok) {
            throw new Error(await parseErrorMessage(response));
        }

        const payload = await response.json();
        const root = asRecord(payload);
        if (!root) throw new Error('Invalid response');

        const task = asRecord(root.task);
        const editable = asRecord(root.editable);
        const options = asRecord(root.options);
        const customFieldValuesRecord = asRecord(root.custom_field_values) ?? {};

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

        return {
            task: {
                id: String(taskIdValue),
                subject: String(subjectValue),
                assignedToId: typeof assignedToIdValue === 'number' ? assignedToIdValue : null,
                statusId: typeof statusIdValue === 'number' ? statusIdValue : Number(statusIdValue),
                doneRatio: typeof doneRatioValue === 'number' ? doneRatioValue : Number(doneRatioValue),
                dueDate: typeof dueDateValue === 'string' ? dueDateValue : null,
                startDate: typeof startDateValue === 'string' ? startDateValue : null,
                priorityId: typeof priorityIdValue === 'number' ? priorityIdValue : Number(priorityIdValue),
                categoryId: typeof categoryIdValue === 'number' ? categoryIdValue : (categoryIdValue ? Number(categoryIdValue) : null),
                estimatedHours: typeof estimatedHoursValue === 'number' ? estimatedHoursValue : (estimatedHoursValue ? Number(estimatedHoursValue) : null),
                projectId: typeof projectIdValue === 'number' ? projectIdValue : Number(projectIdValue),
                trackerId: typeof trackerIdValue === 'number' ? trackerIdValue : Number(trackerIdValue),
                fixedVersionId: typeof fixedVersionIdValue === 'number' ? fixedVersionIdValue : (fixedVersionIdValue ? Number(fixedVersionIdValue) : null),
                lockVersion: typeof lockVersionValue === 'number' ? lockVersionValue : Number(lockVersionValue)
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

    updateTask: async (task: Task): Promise<UpdateTaskResult> => {
        const config = getConfig();

        const response = await fetch(`${config.apiBase}/tasks/${task.id}.json`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                task: {
                    start_date: (task.startDate && Number.isFinite(task.startDate)) ? new Date(task.startDate).toISOString().split('T')[0] : null,
                    due_date: (task.dueDate && Number.isFinite(task.dueDate)) ? new Date(task.dueDate).toISOString().split('T')[0] : null,
                    parent_issue_id: task.parentId ? Number(task.parentId) : null,
                    lock_version: task.lockVersion
                }
            })
        });

        if (response.status === 409) {
            return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
        }

        if (!response.ok) {
            return { status: 'error', error: await parseErrorMessage(response) };
        }

        const data = await response.json();
        return {
            status: 'ok',
            lockVersion: data.lock_version,
            taskId: data.task_id ? String(data.task_id) : String(task.id),
            parentId: data.parent_id ? String(data.parent_id) : undefined,
            siblingPosition: data.sibling_position === 'tail' ? 'tail' : undefined
        };
    },

    updateTaskFields: async (taskId: string, fields: Record<string, unknown>): Promise<UpdateTaskResult> => {
        const config = getConfig();

        const response = await fetch(`${config.apiBase}/tasks/${taskId}.json`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({ task: fields })
        });

        if (response.status === 409) {
            return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
        }

        if (!response.ok) {
            return { status: 'error', error: await parseErrorMessage(response) };
        }

        const data = await response.json();
        return {
            status: 'ok',
            lockVersion: data.lock_version,
            taskId: data.task_id ? String(data.task_id) : String(taskId),
            parentId: data.parent_id ? String(data.parent_id) : undefined,
            siblingPosition: data.sibling_position === 'tail' ? 'tail' : undefined
        };
    },

    createRelation: async (fromId: string, toId: string, type: string, delay?: number): Promise<Relation> => {
        const config = getConfig();

        const response = await fetch(`${config.apiBase}/relations.json`, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                relation: {
                    issue_from_id: fromId,
                    issue_to_id: toId,
                    relation_type: type,
                    ...(typeof delay === 'number' ? { delay } : {})
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || response.statusText);
        }

        const payload = await response.json();
        const relation = normalizeRelation(payload, { fromId, toId, type });

        // If we can't obtain a usable id, deletion will fail later.
        // Prefer failing fast so the UI can surface the error.
        if (!relation.id || relation.id === 'undefined' || relation.id === 'null') {
            throw new Error('Invalid relation response');
        }

        return relation;
    },

    updateRelation: async (relationId: string, type: string, delay?: number): Promise<Relation> => {
        const config = getConfig();
        const response = await fetch(`${config.apiBase}/relations/${relationId}.json`, {
            method: 'PATCH',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                relation: {
                    relation_type: type,
                    ...(typeof delay === 'number' ? { delay } : {})
                }
            })
        });

        if (!response.ok) {
            throw new Error(await parseErrorMessage(response));
        }

        const payload = await response.json();
        return normalizeRelation(payload, { fromId: '', toId: '', type });
    },

    deleteRelation: async (relationId: string): Promise<void> => {
        const config = getConfig();

        const response = await fetch(`${config.apiBase}/relations/${relationId}.json`, {
            method: 'DELETE',
            headers: buildJsonHeaders(config, true)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || response.statusText);
        }
    },

    bulkCreateSubtasks: async (payload: { parentId: string; subjects: string[] }): Promise<BulkCreateSubtasksResult> => {
        const config = getConfig();
        const response = await fetch(`${config.apiBase}/subtasks/bulk.json`, {
            method: 'POST',
            headers: buildJsonHeaders(config, true),
            body: JSON.stringify({
                parent_issue_id: Number(payload.parentId),
                subjects: payload.subjects
            })
        });

        if (!response.ok) {
            const err = await parseErrorMessage(response);
            throw new Error(err);
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
            successCount: typeof data.success_count === 'number' ? data.success_count : 0,
            failCount: typeof data.fail_count === 'number' ? data.fail_count : 0,
            results
        };
    },

    deleteTask: async (taskId: string): Promise<void> => {
        const config = getConfig();

        const redmineBase = config.redmineBase || '';
        // Redmine API DELETE /issues/:id.json
        const response = await fetch(`${redmineBase}/issues/${taskId}.json`, {
            method: 'DELETE',
            headers: buildJsonHeaders(config, true)
        });

        if (!response.ok) {
            const err = await parseErrorMessage(response);
            throw new Error(err);
        }
    }
};
