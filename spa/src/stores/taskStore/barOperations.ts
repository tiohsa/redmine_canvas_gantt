import type { Task } from '../../types';
import { applyLocalPatches, hasLocalMutationIntent, type LocalPatch } from './stateContract';

export type BarOperationRecord = {
    operationId: string;
    baselineAllTasks: Task[];
    baselineGenerations: Record<string, number>;
    entityGenerations: Record<string, number>;
    completedTaskIds: string[];
};

export type BarOperationSettlement =
    | { mode: 'exact'; generation: number }
    | { mode: 'through'; generation: number }
    | { mode: 'all' };

export type BarOperationState = {
    barOperations: Record<string, BarOperationRecord>;
    activeBarOperationId: string | null;
};

type BarOperationRollbackState = BarOperationState & {
    allTasks: Task[];
    editGenerations: Record<string, number>;
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>;
    modifiedTaskIds: Set<string>;
};

type BarOperationRollbackPatch = Pick<
    BarOperationRollbackState,
    'allTasks' | 'localTaskPatches' | 'modifiedTaskIds' | 'barOperations' | 'activeBarOperationId'
>;

export const beginBarOperation = (
    operations: Record<string, BarOperationRecord>,
    tasks: Task[],
    editGenerations: Record<string, number>,
    operationId: string,
    seedTaskId?: string
): BarOperationState => {
    const seedTask = seedTaskId ? tasks.find(task => task.id === seedTaskId) : undefined;
    return {
        barOperations: {
            ...operations,
            [operationId]: {
                operationId,
                baselineAllTasks: seedTask ? [{ ...seedTask }] : [],
                baselineGenerations: seedTask ? { [seedTask.id]: editGenerations[seedTask.id] ?? 0 } : {},
                entityGenerations: {},
                completedTaskIds: []
            }
        },
        activeBarOperationId: operationId
    };
};

export const endBarOperation = (
    operations: Record<string, BarOperationRecord>,
    activeBarOperationId: string | null,
    tasks: Task[],
    editGenerations: Record<string, number>,
    operationId: string
): BarOperationState => {
    const operation = operations[operationId];
    if (!operation) return { barOperations: operations, activeBarOperationId };

    const entityGenerations = Object.fromEntries(
        tasks
            .filter(task => (editGenerations[task.id] ?? 0) > (operation.baselineGenerations[task.id] ?? 0))
            .map(task => [task.id, editGenerations[task.id]])
    ) as Record<string, number>;
    const barOperations = { ...operations };
    if (Object.keys(entityGenerations).length === 0) {
        delete barOperations[operationId];
    } else {
        barOperations[operationId] = { ...operation, entityGenerations };
    }

    return {
        barOperations,
        activeBarOperationId: activeBarOperationId === operationId ? null : activeBarOperationId
    };
};

export const settleBarOperationTaskOwnership = (
    operations: Record<string, BarOperationRecord>,
    activeBarOperationId: string | null,
    taskId: string,
    settlement: BarOperationSettlement
): BarOperationState => {
    const matchingOperations = Object.entries(operations).filter(([, operation]) => (
        (Object.prototype.hasOwnProperty.call(operation.entityGenerations, taskId) &&
            (settlement.mode === 'all' ||
                (settlement.mode === 'exact' && operation.entityGenerations[taskId] === settlement.generation) ||
                (settlement.mode === 'through' && operation.entityGenerations[taskId] <= settlement.generation))) ||
        (settlement.mode === 'all' && operation.baselineAllTasks.some(task => task.id === taskId))
    ));
    if (matchingOperations.length === 0) return { barOperations: operations, activeBarOperationId };

    const barOperations = { ...operations };
    matchingOperations.forEach(([operationId, operation]) => {
        const entityGenerations = { ...operation.entityGenerations };
        delete entityGenerations[taskId];
        const baselineGenerations = { ...operation.baselineGenerations };
        delete baselineGenerations[taskId];
        const baselineAllTasks = operation.baselineAllTasks.filter(task => task.id !== taskId);
        const completedTaskIds = operation.completedTaskIds.filter(completedTaskId => completedTaskId !== taskId);

        if (Object.keys(entityGenerations).length === 0 && baselineAllTasks.length === 0) {
            delete barOperations[operationId];
        } else {
            barOperations[operationId] = {
                ...operation,
                baselineAllTasks,
                baselineGenerations,
                entityGenerations,
                completedTaskIds
            };
        }
    });

    return {
        barOperations,
        activeBarOperationId: activeBarOperationId !== null && matchingOperations.some(([operationId]) => operationId === activeBarOperationId)
            ? null
            : activeBarOperationId
    };
};

export const captureBarOperationBaselines = (
    operations: Record<string, BarOperationRecord>,
    tasks: Task[],
    generations: Record<string, number>,
    operationId: string | null,
    entityIds: Iterable<string>
): Record<string, BarOperationRecord> => {
    const operation = operationId ? operations[operationId] : undefined;
    if (!operationId || !operation) return operations;

    const ids = new Set(entityIds);
    const taskById = new Map(tasks.map(task => [task.id, task]));
    const capturedIds = new Set(operation.baselineAllTasks.map(task => task.id));
    const baselineAllTasks = [...operation.baselineAllTasks];
    const baselineGenerations = { ...operation.baselineGenerations };
    ids.forEach((taskId) => {
        const task = taskById.get(taskId);
        if (!task || capturedIds.has(taskId)) return;
        baselineAllTasks.push({ ...task });
        baselineGenerations[taskId] = baselineGenerations[taskId] ?? (generations[taskId] ?? 0);
    });
    return { ...operations, [operationId]: { ...operation, baselineAllTasks, baselineGenerations } };
};

export const buildBarOperationRollback = (
    state: BarOperationRollbackState,
    operationId: string
): BarOperationRollbackPatch | null => {
    const operation = state.barOperations[operationId];
    if (!operation) return null;

    const baselineById = new Map(operation.baselineAllTasks.map(task => [task.id, task]));
    const rollbackIds = new Set(
        Object.entries(operation.entityGenerations)
            .filter(([taskId, generation]) => (
                (state.editGenerations[taskId] ?? 0) >= generation &&
                !operation.completedTaskIds.includes(taskId) &&
                (state.localTaskPatches[taskId] ?? []).some(patch => patch.generation === generation)
            ))
            .map(([taskId]) => taskId)
    );
    const allTasks = state.allTasks.map(task => {
        const baseline = baselineById.get(task.id);
        if (!rollbackIds.has(task.id) || !baseline) return task;
        const operationGeneration = operation.entityGenerations[task.id];
        const laterPatches = (state.localTaskPatches[task.id] ?? []).filter(
            patch => patch.generation > operationGeneration
        );
        return applyLocalPatches(baseline, laterPatches);
    });
    const localTaskPatches = { ...state.localTaskPatches };
    const modifiedTaskIds = new Set(state.modifiedTaskIds);
    rollbackIds.forEach((taskId) => {
        localTaskPatches[taskId] = (localTaskPatches[taskId] ?? []).filter(
            patch => patch.generation !== operation.entityGenerations[taskId]
        );
        if (localTaskPatches[taskId].length === 0) {
            delete localTaskPatches[taskId];
        }
        if (!hasLocalMutationIntent(localTaskPatches[taskId])) {
            modifiedTaskIds.delete(taskId);
        }
    });
    const barOperations = { ...state.barOperations };
    delete barOperations[operationId];

    return {
        allTasks,
        localTaskPatches,
        modifiedTaskIds,
        barOperations,
        activeBarOperationId: state.activeBarOperationId === operationId ? null : state.activeBarOperationId
    };
};
