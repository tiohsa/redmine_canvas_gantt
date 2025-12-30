import type { Task } from '../types';

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

