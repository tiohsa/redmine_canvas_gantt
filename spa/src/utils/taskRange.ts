import type { Task } from '../types';

export const isTaskVisibleByDate = (
    task: Task,
    settings: { showStartDateOnly: boolean; showDueDateOnly: boolean }
): boolean => {
    const hasStart = Number.isFinite(task.startDate);
    const hasDue = Number.isFinite(task.dueDate);
    if (hasStart && hasDue) return true;
    if (hasStart) return settings.showStartDateOnly;
    if (hasDue) return settings.showDueDateOnly;
    return true;
};

export const getMinFiniteStartDate = (tasks: Task[]): number | null => {
    let min: number | null = null;
    for (const task of tasks) {
        if (task.startDate !== undefined && Number.isFinite(task.startDate)) {
            min = min === null ? task.startDate : Math.min(min, task.startDate);
        }
    }
    return min;
};

export const getMaxFiniteDueDate = (tasks: Task[]): number | null => {
    let max: number | null = null;
    for (const task of tasks) {
        if (task.dueDate !== undefined && Number.isFinite(task.dueDate)) {
            max = max === null ? task.dueDate : Math.max(max, task.dueDate);
        }
    }
    return max;
};
