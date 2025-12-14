import type { Relation, Project, Task } from '../types';

type ApiTask = Record<string, unknown>;
type ApiRelation = Record<string, unknown>;
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
            authToken: string;
            apiKey: string;
        };
    }
}

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

        return { ...data, tasks, relations };
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
                    subject: task.subject,
                    status_id: task.statusId,
                    done_ratio: task.ratioDone,
                    start_date: new Date(task.startDate).toISOString().split('T')[0],
                    due_date: new Date(task.dueDate).toISOString().split('T')[0],
                    assigned_to_id: task.assignedToId,
                    lock_version: task.lockVersion
                }
            })
        });

        if (response.status === 409) {
            return { status: 'conflict', error: 'This task was updated by another user. Please reload.' };
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { status: 'error', error: errData.error || response.statusText };
        }

        const data = await response.json();
        return { status: 'ok', lockVersion: data.lock_version };
    },

    createTask: async (task: Partial<Task> & { projectId: string }): Promise<Task> => {
        const config = window.RedmineCanvasGantt;
        if (!config) {
            throw new Error("Configuration not found");
        }

        const payload: Record<string, any> = {
            project_id: task.projectId,
            subject: task.subject,
            start_date: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : undefined,
            due_date: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : undefined,
            done_ratio: task.ratioDone,
            status_id: task.statusId,
            assigned_to_id: task.assignedToId
        };
        if (task.parentId) {
            payload.parent_issue_id = task.parentId;
        }

        const response = await fetch(`${config.apiBase}/tasks.json`, {
            method: 'POST',
            headers: {
                'X-Redmine-API-Key': config.apiKey,
                'Content-Type': 'application/json',
                'X-CSRF-Token': config.authToken
            },
            body: JSON.stringify({
                task: payload
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || response.statusText);
        }

        const data = await response.json();
        const t = data.task;

        const parseDate = (value: string | null | undefined): number | null => {
            if (!value) return null;
            const ts = new Date(value).getTime();
            return Number.isFinite(ts) ? ts : null;
        };

        // Return a normalized Task
        return {
            id: String(t.id),
            subject: String(t.subject ?? ''),
            projectId: t.project_id ? String(t.project_id) : undefined,
            projectName: typeof t.project_name === 'string' ? t.project_name : undefined,
            displayOrder: 0, // Will be handled by store
            startDate: parseDate(t.start_date) || Date.now(),
            dueDate: parseDate(t.due_date) || Date.now(),
            ratioDone: typeof t.done_ratio === 'number' ? t.done_ratio : 0,
            statusId: typeof t.status_id === 'number' ? t.status_id : 0,
            assignedToId: typeof t.assigned_to_id === 'number' ? t.assigned_to_id : undefined,
            assignedToName: typeof t.assigned_to_name === 'string' ? t.assigned_to_name : undefined,
            parentId: t.parent_id ? String(t.parent_id) : undefined,
            lockVersion: typeof t.lock_version === 'number' ? t.lock_version : 0,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        };
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
    }
};
