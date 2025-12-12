import type { Relation, Project, Task } from '../types';

interface ApiData {
    tasks: any[];
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
        const tasks: Task[] = data.tasks.map((t: any, index: number): Task => {
            const start = parseDate(t.start_date);
            const due = parseDate(t.due_date);

            // Fallbacks to keep rendering even when dates are missing/invalid
            const safeStart = start ?? due ?? new Date().setHours(0, 0, 0, 0);
            const safeDue = due ?? start ?? safeStart;
            const normalizedDue = safeDue < safeStart ? safeStart : safeDue;

            return {
                id: String(t.id),
                subject: t.subject,
                startDate: safeStart,
                dueDate: normalizedDue,
                ratioDone: t.ratio_done ?? 0,
                statusId: t.status_id,
                assignedToId: t.assigned_to_id,
                assignedToName: t.assigned_to_name,
                parentId: t.parent_id ? String(t.parent_id) : undefined,
                lockVersion: t.lock_version,
                editable: t.editable,
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

        return { ...data, tasks };
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
            const errData = await response.json().catch(() => ({}));
            return { status: 'error', error: errData.error || response.statusText };
        }

        const data = await response.json();
        return { status: 'ok', lockVersion: data.lock_version };
    }
};
