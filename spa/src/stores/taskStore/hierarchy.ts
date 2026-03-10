import type { Task } from '../../types';

export const isDescendantTask = (taskById: Map<string, Task>, ancestorTaskId: string, targetTaskId: string): boolean => {
    let current = taskById.get(targetTaskId);
    const seen = new Set<string>();
    while (current?.parentId) {
        if (seen.has(current.parentId)) break;
        if (current.parentId === ancestorTaskId) return true;
        seen.add(current.parentId);
        current = taskById.get(current.parentId);
    }
    return false;
};

export const tailDisplayOrderForParent = (allTasks: Task[], parentTaskId: string, movingTaskId: string): number => {
    const siblingOrders = allTasks
        .filter((task) => task.id !== movingTaskId && task.parentId === parentTaskId)
        .map((task) => task.displayOrder ?? 0);
    const base = siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders);
    return base + 1;
};

export const tailDisplayOrderForRoot = (allTasks: Task[], movingTask: Task): number => {
    const siblingOrders = allTasks
        .filter((task) => (
            task.id !== movingTask.id &&
            !task.parentId &&
            task.projectId === movingTask.projectId
        ))
        .map((task) => task.displayOrder ?? 0);
    const base = siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders);
    return base + 1;
};
