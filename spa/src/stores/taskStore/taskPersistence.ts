import type { Relation, Task } from '../../types';
import type { MoveTaskAsChildResult } from '../../types';
import { i18n } from '../../utils/i18n';
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

type FetchDataParams = {
    query?: {
        selectedStatusIds?: number[];
    };
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
    relations: Relation[],
    modifiedTaskIds: Set<string>,
    selectedStatusIds: number[],
    updateTask: (task: Task) => Promise<UpdateTaskFieldsResult>,
    fetchData: (params: FetchDataParams) => Promise<FetchDataResult>
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
    const modifiedIdSet = new Set(Array.from(modifiedTaskIds));
    const dependencyOrderCache = new Map<string, number>();
    const incomingHardDependencies = new Map<string, string[]>();

    relations.forEach((relation) => {
        if (relation.type !== 'precedes' && relation.type !== 'follows') return;

        const predecessorId = relation.type === 'follows' ? relation.to : relation.from;
        const successorId = relation.type === 'follows' ? relation.from : relation.to;
        if (!modifiedIdSet.has(predecessorId) || !modifiedIdSet.has(successorId)) return;

        const predecessors = incomingHardDependencies.get(successorId) ?? [];
        predecessors.push(predecessorId);
        incomingHardDependencies.set(successorId, predecessors);
    });
    const calcDependencyOrder = (taskId: string, visiting: Set<string> = new Set()): number => {
        if (dependencyOrderCache.has(taskId)) return dependencyOrderCache.get(taskId)!;
        if (visiting.has(taskId)) return 0;

        visiting.add(taskId);
        const predecessors = incomingHardDependencies.get(taskId) ?? [];
        const order = predecessors.length === 0
            ? 0
            : 1 + Math.max(...predecessors.map((predecessorId) => calcDependencyOrder(predecessorId, visiting)));
        visiting.delete(taskId);
        dependencyOrderCache.set(taskId, order);
        return order;
    };

    const tasksToUpdate = tasks
        .filter(t => modifiedTaskIds.has(t.id))
        .sort((a, b) => {
            const depthDelta = calcDepth(a.id) - calcDepth(b.id);
            if (depthDelta !== 0) return depthDelta;

            const dependencyDelta = calcDependencyOrder(b.id) - calcDependencyOrder(a.id);
            if (dependencyDelta !== 0) return dependencyDelta;

            return 0;
        });

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
            failures.set(taskId, result.error || (i18n.t('label_unknown_error') || 'Unknown error'));
            nextPending.push(taskId);
        }

        if (conflictTaskIds.length > 0) {
            const latest = await fetchData({ query: { selectedStatusIds } });
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
