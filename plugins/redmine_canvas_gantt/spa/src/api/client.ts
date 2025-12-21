import type { Relation, Project, Task, Version } from '../types';
import type { TaskEditMeta, InlineEditSettings, CustomFieldMeta, EditOption } from '../types/editMeta';

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
    const fromValue = rel.issue_id ?? rel.issue_from_id ?? rel.from ?? fallback.fromId;
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
    project: Project;
    permissions: { editable: boolean; viewable: boolean };
}

interface UpdateTaskResult {
    status: 'ok' | 'conflict' | 'error';
    lockVersion?: number;
    error?: string;
}

declare global {
    interface Window {
        RedmineCanvasGantt?: {
            projectId: number;
            apiBase: string;
            redmineBase: string;
            authToken: string;
            apiKey: string;
            settings?: InlineEditSettings;
            i18n?: Record<string, string>;
        };
    }
}

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

export const apiClient = {
    fetchData: async (): Promise<ApiData> => {
        const config = window.RedmineCanvasGantt;

        if (!config) {
            throw new Error("Configuration not found");
        }

        const parseDate = (value: string | null | undefined): number | null => {
            if (!value) return null;
            const ts = new Date(value).getTime();
            return Number.isFinite(ts) ? ts : null;
        };

        const response = await fetch(`${config.apiBase}/data.json`, {
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform API tasks to internal Task model
        const tasks: Task[] = (data.tasks as ApiTask[]).map((t, index: number): Task => {
            const start = parseDate(typeof t.start_date === 'string' ? t.start_date : null);
            const due = parseDate(typeof t.due_date === 'string' ? t.due_date : null);

            // Fallbacks to keep rendering even when dates are missing/invalid
            const safeStart = start ?? due ?? new Date().setHours(0, 0, 0, 0);
            const safeDue = due ?? start ?? safeStart;
            const normalizedDue = safeDue < safeStart ? safeStart : safeDue;

            return {
                id: String(t.id),
                subject: String(t.subject ?? ''),
                projectId: t.project_id ? String(t.project_id) : undefined,
                projectName: typeof t.project_name === 'string' ? t.project_name : undefined,
                displayOrder: typeof t.display_order === 'number' ? t.display_order : index,
                startDate: safeStart,
                dueDate: normalizedDue,
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

        const relations: Relation[] = (data.relations as ApiRelation[]).map((r): Relation => ({
            id: String(r.id ?? ''),
            from: String(r.from ?? r.issue_from_id ?? ''),
            to: String(r.to ?? r.issue_to_id ?? ''),
            type: String(r.type ?? r.relation_type ?? ''),
            delay: typeof r.delay === 'number' ? r.delay : undefined
        })).filter(r => r.id !== '' && r.from !== '' && r.to !== '' && r.type !== '');

        const versions: Version[] = Array.isArray(data.versions) ? (data.versions as ApiVersion[]).map(v => {
            const dateStr = typeof v.effective_date === 'string' ? v.effective_date : null;
            const effectiveDate = parseDate(dateStr);
            if (!effectiveDate) return null;

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

        return { ...data, tasks, relations, versions };
    },

    fetchEditMeta: async (taskId: string): Promise<TaskEditMeta> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const response = await fetch(`${config.apiBase}/tasks/${taskId}/edit_meta.json`, {
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json'
            }
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
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const response = await fetch(`${config.apiBase}/tasks/${task.id}.json`, {
            method: 'PATCH',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            },
            body: JSON.stringify({
                task: {
                    start_date: new Date(task.startDate).toISOString().split('T')[0],
                    due_date: new Date(task.dueDate).toISOString().split('T')[0],
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
        return { status: 'ok', lockVersion: data.lock_version };
    },

    updateTaskFields: async (taskId: string, fields: Record<string, unknown>): Promise<UpdateTaskResult> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const response = await fetch(`${config.apiBase}/tasks/${taskId}.json`, {
            method: 'PATCH',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            },
            body: JSON.stringify({ task: fields })
        });

        if (response.status === 409) {
            return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
        }

        if (!response.ok) {
            return { status: 'error', error: await parseErrorMessage(response) };
        }

        const data = await response.json();
        return { status: 'ok', lockVersion: data.lock_version };
    },

    createRelation: async (fromId: string, toId: string, type: string): Promise<Relation> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const response = await fetch(`/issues/${fromId}/relations.json`, {
            method: 'POST',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            },
            body: JSON.stringify({
                relation: {
                    issue_to_id: toId,
                    relation_type: type
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

    deleteRelation: async (relationId: string): Promise<void> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const response = await fetch(`${config.apiBase}/relations/${relationId}.json`, {
            method: 'DELETE',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            }
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || response.statusText);
        }
    },

    createTask: async (task: Partial<Task>): Promise<Task> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const body: Record<string, any> = {
            subject: task.subject,
            project_id: task.projectId ? Number(task.projectId) : config.projectId,
            tracker_id: task.trackerId,
            status_id: task.statusId,
            assigned_to_id: task.assignedToId,
            done_ratio: task.ratioDone,
            parent_issue_id: task.parentId,
            start_date: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : undefined,
            due_date: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : undefined,
        };

        const redmineBase = config.redmineBase || '';
        const response = await fetch(`${redmineBase}/issues.json`, {
            method: 'POST',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            },
            body: JSON.stringify({ issue: body })
        });

        if (!response.ok) {
            const err = await parseErrorMessage(response);
            throw new Error(err);
        }

        const data = await response.json();
        const t = data.issue;

        // Return a partial Task object sufficient for UI update or reload
        return {
            id: String(t.id),
            subject: t.subject,
            projectId: String(t.project.id),
            startDate: new Date(t.start_date).getTime(),
            dueDate: new Date(t.due_date).getTime(),
            ratioDone: t.done_ratio,
            statusId: t.status.id,
            assignedToId: t.assigned_to?.id,
            assignedToName: t.assigned_to?.name,
            parentId: t.parent?.id ? String(t.parent.id) : undefined,
            lockVersion: 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        } as Task;
    },

    deleteTask: async (taskId: string): Promise<void> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const redmineBase = config.redmineBase || '';
        // Redmine API DELETE /issues/:id.json
        const response = await fetch(`${redmineBase}/issues/${taskId}.json`, {
            method: 'DELETE',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            }
        });

        if (!response.ok) {
            const err = await parseErrorMessage(response);
            throw new Error(err);
        }
    }
};
