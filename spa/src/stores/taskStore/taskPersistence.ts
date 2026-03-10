import type { Task } from '../../types';
import type { MoveTaskAsChildResult } from '../../types';
import type { TaskLayoutSnapshot } from './types';

type UpdateTaskFieldsResult = {
    status: 'ok' | 'error' | 'conflict';
    error?: string;
    lockVersion?: number;
    parentId?: string;
};

type FetchDataResult = {
    tasks: Task[];
};

export const createTaskLayoutSnapshot = (state: TaskLayoutSnapshot): TaskLayoutSnapshot => ({
    allTasks: state.allTasks.map((task) => ({ ...task })),
    tasks: state.tasks.map((task) => ({ ...task })),
    layoutRows: state.layoutRows.map((row) => ({ ...row })),
    rowCount: state.rowCount
});

export const buildMoveTaskResult = (
    status: MoveTaskAsChildResult['status'],
    options: {
        error?: string;
        lockVersion?: number;
        parentId?: string;
    } = {}
): MoveTaskAsChildResult => ({
    status,
    error: options.error,
    lockVersion: options.lockVersion,
    parentId: options.parentId,
    siblingPosition: status === 'ok' ? 'tail' : undefined
});

export const restoreTaskSnapshot = (
    setState: (snapshot: TaskLayoutSnapshot) => void,
    snapshot: TaskLayoutSnapshot
) => {
    setState(snapshot);
};

export const saveModifiedTasks = async (
    tasks: Task[],
    modifiedTaskIds: Set<string>,
    selectedStatusIds: number[],
    updateTask: (task: Task) => Promise<UpdateTaskFieldsResult>,
    fetchData: (params: { statusIds: number[] }) => Promise<FetchDataResult>
) => {
    const mutableTaskById = new Map(tasks.map(task => [task.id, { ...task }]));
    const hasSamePersistedFields = (local: Task, remote: Task): boolean => {
        const sameStartDate = local.startDate === remote.startDate;
        const sameDueDate = local.dueDate === remote.dueDate;
        const sameParentId = (local.parentId ?? null) === (remote.parentId ?? null);
        return sameStartDate && sameDueDate && sameParentId;
    };
    const depthCache = new Map<string, number>();
    const calcDepth = (taskId: string): number => {
        if (depthCache.has(taskId)) return depthCache.get(taskId)!;
        let depth = 0;
        let current = mutableTaskById.get(taskId);
        const seen = new Set<string>([taskId]);
        while (current?.parentId) {
            if (seen.has(current.parentId)) break;
            seen.add(current.parentId);
            depth += 1;
            current = mutableTaskById.get(current.parentId);
        }
        depthCache.set(taskId, depth);
        return depth;
    };

    const tasksToUpdate = tasks
        .filter(t => modifiedTaskIds.has(t.id))
        .sort((a, b) => calcDepth(a.id) - calcDepth(b.id));

    const failures = new Map<string, string>();
    let pending = tasksToUpdate.map(task => task.id);
    const maxPasses = Math.max(1, pending.length);

    for (let pass = 0; pass < maxPasses && pending.length > 0; pass += 1) {
        let progress = false;
        const nextPending: string[] = [];
        const conflictTaskIds: string[] = [];

        for (const taskId of pending) {
            const task = mutableTaskById.get(taskId);
            if (!task) continue;
            const result = await updateTask(task);

            if (result.status === 'ok') {
                progress = true;
                failures.delete(taskId);
                if (typeof result.lockVersion === 'number') {
                    mutableTaskById.set(taskId, { ...task, lockVersion: result.lockVersion });
                }
                continue;
            }

            if (result.status === 'conflict') {
                conflictTaskIds.push(taskId);
            }
            failures.set(taskId, result.error || 'Unknown error');
            nextPending.push(taskId);
        }

        if (conflictTaskIds.length > 0) {
            const latest = await fetchData({ statusIds: selectedStatusIds });
            const latestTaskById = new Map(latest.tasks.map(task => [task.id, task]));
            const refreshedPending: string[] = [];

            for (const taskId of nextPending) {
                const localTask = mutableTaskById.get(taskId);
                const latestTask = latestTaskById.get(taskId);
                if (!localTask || !latestTask) {
                    refreshedPending.push(taskId);
                    continue;
                }

                mutableTaskById.set(taskId, { ...localTask, lockVersion: latestTask.lockVersion });

                if (hasSamePersistedFields(localTask, latestTask)) {
                    failures.delete(taskId);
                    progress = true;
                    continue;
                }

                refreshedPending.push(taskId);
            }

            pending = refreshedPending;
        } else {
            pending = nextPending;
        }

        if (!progress) break;
    }

    return failures;
};
