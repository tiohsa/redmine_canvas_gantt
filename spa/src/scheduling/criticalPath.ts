import type { Relation, Task } from '../types';
import {
    addWorkingDays,
    buildSchedulingEdges,
    detectConstraintCycleTaskIds,
    diffWorkingDays,
    shiftByWorkingDays,
    type SchedulingEdge
} from './constraintGraph';

export interface CriticalPathTaskMetrics {
    taskId: string;
    durationDays: number;
    es: number;
    ef: number;
    ls: number;
    lf: number;
    totalSlackDays: number;
    critical: boolean;
}

export interface CriticalPathResult {
    metricsByTaskId: Record<string, CriticalPathTaskMetrics>;
    projectFinish?: number;
    orderedTaskIds: string[];
    excludedTaskIds: string[];
    cyclicTaskIds: string[];
}

interface IncludedTask {
    id: string;
    startDate: number;
    dueDate: number;
    inputOrder: number;
}

const hasFiniteDate = (value: number | undefined): value is number => Number.isFinite(value);

const hasValidDateRange = (task: Pick<Task, 'startDate' | 'dueDate'>): task is Pick<Task, 'startDate' | 'dueDate'> & { startDate: number; dueDate: number } => (
    hasFiniteDate(task.startDate) &&
    hasFiniteDate(task.dueDate) &&
    task.startDate <= task.dueDate
);

const buildTopologicalOrder = (taskIds: string[], edges: SchedulingEdge[], inputOrder: Map<string, number>): string[] => {
    const indegree = new Map<string, number>();
    const outgoing = new Map<string, SchedulingEdge[]>();

    taskIds.forEach((taskId) => {
        indegree.set(taskId, 0);
        outgoing.set(taskId, []);
    });

    edges.forEach((edge) => {
        indegree.set(edge.successorId, (indegree.get(edge.successorId) ?? 0) + 1);
        const nextEdges = outgoing.get(edge.predecessorId) ?? [];
        nextEdges.push(edge);
        outgoing.set(edge.predecessorId, nextEdges);
    });

    const queue = [...taskIds]
        .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
        .sort((left, right) => (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0));
    const orderedTaskIds: string[] = [];

    while (queue.length > 0) {
        const taskId = queue.shift();
        if (!taskId) continue;

        orderedTaskIds.push(taskId);
        (outgoing.get(taskId) ?? []).forEach((edge) => {
            const nextIndegree = (indegree.get(edge.successorId) ?? 0) - 1;
            indegree.set(edge.successorId, nextIndegree);
            if (nextIndegree === 0) {
                queue.push(edge.successorId);
                queue.sort((left, right) => (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0));
            }
        });
    }

    return orderedTaskIds;
};

export const calculateCriticalPath = (tasks: Task[], relations: Relation[]): CriticalPathResult => {
    const cyclicTaskIds = [...detectConstraintCycleTaskIds(relations)].sort();
    const cyclicTaskIdSet = new Set(cyclicTaskIds);
    const inputOrder = new Map<string, number>();
    const includedTasks = new Map<string, IncludedTask>();
    const excludedTaskIds: string[] = [];

    tasks.forEach((task, index) => {
        inputOrder.set(task.id, index);

        if (!hasValidDateRange(task) || cyclicTaskIdSet.has(task.id)) {
            excludedTaskIds.push(task.id);
            return;
        }

        includedTasks.set(task.id, {
            id: task.id,
            startDate: task.startDate,
            dueDate: task.dueDate,
            inputOrder: index
        });
    });

    const edges = buildSchedulingEdges(relations).filter((edge) => (
        includedTasks.has(edge.predecessorId) &&
        includedTasks.has(edge.successorId)
    ));
    const taskIds = [...includedTasks.keys()].sort((left, right) => (
        (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0)
    ));
    const orderedTaskIds = buildTopologicalOrder(taskIds, edges, inputOrder);

    if (orderedTaskIds.length === 0) {
        return {
            metricsByTaskId: {},
            projectFinish: undefined,
            orderedTaskIds: [],
            excludedTaskIds,
            cyclicTaskIds
        };
    }

    const incoming = new Map<string, SchedulingEdge[]>();
    const outgoing = new Map<string, SchedulingEdge[]>();
    const metricsByTaskId = new Map<string, CriticalPathTaskMetrics>();

    orderedTaskIds.forEach((taskId) => {
        incoming.set(taskId, []);
        outgoing.set(taskId, []);
    });

    edges.forEach((edge) => {
        const predecessorEdges = outgoing.get(edge.predecessorId) ?? [];
        predecessorEdges.push(edge);
        outgoing.set(edge.predecessorId, predecessorEdges);

        const successorEdges = incoming.get(edge.successorId) ?? [];
        successorEdges.push(edge);
        incoming.set(edge.successorId, successorEdges);
    });

    orderedTaskIds.forEach((taskId) => {
        const task = includedTasks.get(taskId);
        if (!task) return;

        const durationDays = diffWorkingDays(task.startDate, task.dueDate);
        const minimumStart = (incoming.get(taskId) ?? []).reduce((latestStart, edge) => {
            const predecessor = metricsByTaskId.get(edge.predecessorId);
            if (!predecessor) return latestStart;
            return Math.max(latestStart, addWorkingDays(predecessor.ef, edge.gapDays));
        }, task.startDate);
        const es = minimumStart;
        const ef = shiftByWorkingDays(es, durationDays);

        metricsByTaskId.set(taskId, {
            taskId,
            durationDays,
            es,
            ef,
            ls: es,
            lf: ef,
            totalSlackDays: 0,
            critical: true
        });
    });

    const projectFinish = orderedTaskIds.reduce((latest, taskId) => {
        const metrics = metricsByTaskId.get(taskId);
        return metrics ? Math.max(latest, metrics.ef) : latest;
    }, Number.NEGATIVE_INFINITY);

    [...orderedTaskIds].reverse().forEach((taskId) => {
        const metrics = metricsByTaskId.get(taskId);
        if (!metrics) return;

        const successorEdges = outgoing.get(taskId) ?? [];
        const lf = successorEdges.length === 0
            ? projectFinish
            : successorEdges.reduce((earliestFinish, edge) => {
                const successor = metricsByTaskId.get(edge.successorId);
                if (!successor) return earliestFinish;
                const latestFinish = shiftByWorkingDays(successor.ls, -edge.gapDays);
                return Math.min(earliestFinish, latestFinish);
            }, projectFinish);
        const ls = shiftByWorkingDays(lf, -metrics.durationDays);
        const totalSlackDays = diffWorkingDays(metrics.ef, lf);

        metricsByTaskId.set(taskId, {
            ...metrics,
            ls,
            lf,
            totalSlackDays,
            critical: totalSlackDays === 0
        });
    });

    return {
        metricsByTaskId: Object.fromEntries(
            orderedTaskIds
                .map((taskId) => [taskId, metricsByTaskId.get(taskId)])
                .filter((entry): entry is [string, CriticalPathTaskMetrics] => Boolean(entry[1]))
        ),
        projectFinish,
        orderedTaskIds,
        excludedTaskIds,
        cyclicTaskIds
    };
};
