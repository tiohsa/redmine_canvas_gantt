import type { Relation, Project } from '../types';

interface ApiData {
    tasks: any[];
    relations: Relation[];
    project: Project;
    permissions: { editable: boolean; viewable: boolean };
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
        if (!config) throw new Error("Plugin configuration not found");

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
        const tasks = data.tasks.map((t: any, index: number) => ({
            id: String(t.id),
            subject: t.subject,
            startDate: new Date(t.start_date).getTime(),
            dueDate: new Date(t.due_date).getTime(),
            ratioDone: t.ratio_done,
            statusId: t.status_id,
            assignedToId: t.assigned_to_id,
            assignedToName: t.assigned_to_name,
            parentId: t.parent_id,
            lockVersion: t.lock_version,
            editable: t.editable,
            rowIndex: index // Simplify for now: default order
        }));

        return { ...data, tasks };
    }
};
