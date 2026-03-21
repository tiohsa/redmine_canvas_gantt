import type { Task } from '../../types';

export type ExpansionMaps = {
    projectExpansion: Record<string, boolean>;
    versionExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
};

const DEFAULT_PROJECT_KEY = 'default_project';
const UNASSIGNED_GROUP_KEY = 'none';
const ASSIGNEE_GROUP_PREFIX = 'assignee:';

const getProjectExpansionKey = (task: Task): string => task.projectId ?? DEFAULT_PROJECT_KEY;

const getAssigneeExpansionKey = (task: Task): string => {
    const assigneeId = task.assignedToId === undefined || task.assignedToId === null ? UNASSIGNED_GROUP_KEY : String(task.assignedToId);
    return `${ASSIGNEE_GROUP_PREFIX}${assigneeId}`;
};

export const initializeExpansionMaps = (tasks: Task[], current: ExpansionMaps): ExpansionMaps => {
    const projectExpansion = { ...current.projectExpansion };
    const versionExpansion = { ...current.versionExpansion };
    const taskExpansion = { ...current.taskExpansion };

    tasks.forEach((task) => {
        const projectKey = getProjectExpansionKey(task);
        if (projectExpansion[projectKey] === undefined) projectExpansion[projectKey] = true;

        const assigneeKey = getAssigneeExpansionKey(task);
        if (projectExpansion[assigneeKey] === undefined) projectExpansion[assigneeKey] = true;

        if (taskExpansion[task.id] === undefined) taskExpansion[task.id] = true;
        if (task.fixedVersionId && versionExpansion[task.fixedVersionId] === undefined) versionExpansion[task.fixedVersionId] = true;
    });

    return {
        projectExpansion,
        versionExpansion,
        taskExpansion
    };
};

export const buildUniformExpansionMaps = (tasks: Task[], expanded: boolean): ExpansionMaps => {
    const projectExpansion: Record<string, boolean> = {};
    const versionExpansion: Record<string, boolean> = {};
    const taskExpansion: Record<string, boolean> = {};

    tasks.forEach((task) => {
        projectExpansion[getProjectExpansionKey(task)] = expanded;
        projectExpansion[getAssigneeExpansionKey(task)] = expanded;
        taskExpansion[task.id] = expanded;
        if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = expanded;
    });

    return {
        projectExpansion,
        versionExpansion,
        taskExpansion
    };
};
