import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { i18n } from '../utils/i18n';
import {
    addWorkingDays,
    diffWorkingDays,
    shiftByWorkingDays
} from '../utils/businessCalendar';

export { addWorkingDays, diffWorkingDays, shiftByWorkingDays };

export type SchedulingState = 'normal' | 'unscheduled' | 'invalid' | 'conflicted' | 'cyclic';

export interface SchedulingStateInfo {
    state: SchedulingState;
    message: string;
}

export interface SchedulingEdge {
    relationId: string;
    predecessorId: string;
    successorId: string;
    gapDays: number;
    relationType: typeof RelationType.Precedes | typeof RelationType.Follows;
}

const severityByState: Record<SchedulingState, number> = {
    normal: 0,
    unscheduled: 1,
    conflicted: 2,
    cyclic: 3,
    invalid: 4
};

const hasFiniteDate = (value: number | undefined): value is number => Number.isFinite(value);

const hasValidDateRange = (task: Pick<Task, 'startDate' | 'dueDate'>): boolean => (
    hasFiniteDate(task.startDate) &&
    hasFiniteDate(task.dueDate) &&
    task.startDate <= task.dueDate
);

const isUnscheduledTask = (task: Pick<Task, 'startDate' | 'dueDate'>): boolean => (
    !hasFiniteDate(task.startDate) && !hasFiniteDate(task.dueDate)
);

const isPartiallyScheduledTask = (task: Pick<Task, 'startDate' | 'dueDate'>): boolean => {
    const hasStart = hasFiniteDate(task.startDate);
    const hasDue = hasFiniteDate(task.dueDate);
    return (hasStart || hasDue) && !hasValidDateRange(task);
};

export const toSchedulingEdge = (relation: Relation): SchedulingEdge | null => {
    const gapDays = 1 + (relation.delay ?? 0);

    if (relation.type === RelationType.Precedes) {
        return {
            relationId: relation.id,
            predecessorId: relation.from,
            successorId: relation.to,
            gapDays,
            relationType: RelationType.Precedes
        };
    }

    if (relation.type === RelationType.Follows) {
        return {
            relationId: relation.id,
            predecessorId: relation.to,
            successorId: relation.from,
            gapDays,
            relationType: RelationType.Follows
        };
    }

    return null;
};

export const buildSchedulingEdges = (relations: Relation[]): SchedulingEdge[] => (
    relations
        .map((relation) => toSchedulingEdge(relation))
        .filter((edge): edge is SchedulingEdge => Boolean(edge))
);

/**
 * Return only nodes that belong to a directed cycle.
 *
 * Kahn's algorithm is useful for calculating a topological order, but its
 * remaining nodes are not all cycle members: a node downstream of a cycle
 * remains unprocessed as well.  Remove the acyclic prefix first, then walk
 * the residual graph iteratively so deep dependency chains do not depend on
 * the JavaScript call stack.
 */
export const detectSchedulingCycleTaskIds = (edges: SchedulingEdge[]): Set<string> => {
    const adjacency = new Map<string, string[]>();
    const taskIds = new Set<string>();

    edges.forEach((edge) => {
        taskIds.add(edge.predecessorId);
        taskIds.add(edge.successorId);
        const successors = adjacency.get(edge.predecessorId) ?? [];
        successors.push(edge.successorId);
        adjacency.set(edge.predecessorId, successors);
    });

    const indegree = new Map<string, number>([...taskIds].map((taskId) => [taskId, 0]));
    edges.forEach((edge) => {
        indegree.set(edge.successorId, (indegree.get(edge.successorId) ?? 0) + 1);
    });

    const queue = [...taskIds].filter((taskId) => indegree.get(taskId) === 0);
    const removed = new Set<string>();
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        const taskId = queue[queueIndex];
        removed.add(taskId);
        (adjacency.get(taskId) ?? []).forEach((successorId) => {
            const nextIndegree = (indegree.get(successorId) ?? 0) - 1;
            indegree.set(successorId, nextIndegree);
            if (nextIndegree === 0) queue.push(successorId);
        });
    }

    const residualTaskIds = new Set([...taskIds].filter((taskId) => !removed.has(taskId)));
    const residualAdjacency = new Map<string, string[]>();
    residualTaskIds.forEach((taskId) => {
        residualAdjacency.set(
            taskId,
            (adjacency.get(taskId) ?? []).filter((successorId) => residualTaskIds.has(successorId))
        );
    });
    const state = new Map<string, 0 | 1 | 2>();
    const cyclicTaskIds = new Set<string>();

    residualTaskIds.forEach((startTaskId) => {
        if ((state.get(startTaskId) ?? 0) !== 0) return;

        const path: string[] = [];
        const pathIndexes = new Map<string, number>();
        const frames: Array<{ taskId: string; nextSuccessorIndex: number }> = [];
        state.set(startTaskId, 1);
        path.push(startTaskId);
        pathIndexes.set(startTaskId, 0);
        frames.push({ taskId: startTaskId, nextSuccessorIndex: 0 });

        while (frames.length > 0) {
            const frame = frames[frames.length - 1];
            const successors = residualAdjacency.get(frame.taskId) ?? [];

            if (frame.nextSuccessorIndex >= successors.length) {
                state.set(frame.taskId, 2);
                frames.pop();
                const pathIndex = pathIndexes.get(frame.taskId);
                if (pathIndex !== undefined && path[path.length - 1] === frame.taskId) {
                    path.pop();
                    pathIndexes.delete(frame.taskId);
                }
                continue;
            }

            const successorId = successors[frame.nextSuccessorIndex];
            frame.nextSuccessorIndex += 1;
            const successorState = state.get(successorId) ?? 0;

            if (successorState === 0) {
                state.set(successorId, 1);
                pathIndexes.set(successorId, path.length);
                path.push(successorId);
                frames.push({ taskId: successorId, nextSuccessorIndex: 0 });
                continue;
            }

            if (successorState === 1) {
                const cycleStart = pathIndexes.get(successorId);
                if (cycleStart !== undefined) {
                    path.slice(cycleStart).forEach((taskId) => cyclicTaskIds.add(taskId));
                }
            }
        }
    });

    return cyclicTaskIds;
};

export const detectConstraintCycleTaskIds = (relations: Relation[]): Set<string> => (
    detectSchedulingCycleTaskIds(buildSchedulingEdges(relations))
);

const applyState = (
    states: Record<string, SchedulingStateInfo>,
    taskId: string,
    nextState: SchedulingState,
    message: string
) => {
    const current = states[taskId];
    if (!current || severityByState[nextState] >= severityByState[current.state]) {
        states[taskId] = { state: nextState, message };
    }
};

export const deriveSchedulingStates = (tasks: Task[], relations: Relation[]): Record<string, SchedulingStateInfo> => {
    const states: Record<string, SchedulingStateInfo> = {};
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const edges = buildSchedulingEdges(relations);

    tasks.forEach((task) => {
        if (isUnscheduledTask(task)) {
            applyState(
                states,
                task.id,
                'unscheduled',
                i18n.t('label_scheduling_state_unscheduled') || 'This task has no dates and is excluded from auto scheduling.'
            );
            return;
        }

        if (hasFiniteDate(task.startDate) && hasFiniteDate(task.dueDate) && task.startDate > task.dueDate) {
            applyState(
                states,
                task.id,
                'invalid',
                i18n.t('label_scheduling_state_invalid') || 'Start date is after due date.'
            );
            return;
        }

        if (isPartiallyScheduledTask(task)) {
            applyState(
                states,
                task.id,
                'conflicted',
                i18n.t('label_scheduling_state_incomplete_dates') || 'This task has incomplete dates and is excluded from auto scheduling.'
            );
        }
    });

    const cyclicTaskIds = detectConstraintCycleTaskIds(relations);
    cyclicTaskIds.forEach((taskId) => {
        applyState(
            states,
            taskId,
            'cyclic',
            i18n.t('label_scheduling_state_cyclic') || 'This task participates in a dependency cycle.'
        );
    });

    edges.forEach((edge) => {
        const predecessor = taskById.get(edge.predecessorId);
        const successor = taskById.get(edge.successorId);
        if (!predecessor || !successor) return;

        if (!hasValidDateRange(predecessor) || !hasValidDateRange(successor)) return;

        const predecessorDueDate = predecessor.dueDate!;
        const successorStartDate = successor.startDate!;
        const minimumSuccessorStart = addWorkingDays(predecessorDueDate, edge.gapDays, successor.projectId);
        if (successorStartDate < minimumSuccessorStart) {
            const message = i18n.t('label_scheduling_state_conflicted') || 'This task violates a scheduling dependency.';
            applyState(states, predecessor.id, 'conflicted', message);
            applyState(states, successor.id, 'conflicted', message);
        }
    });

    return states;
};

export const recalculateDownstreamTasks = (
    tasks: Task[],
    relations: Relation[],
    originTaskId: string
): Map<string, Partial<Task>> => {
    const taskById = new Map(tasks.map((task) => [task.id, { ...task }]));
    const outgoing = new Map<string, SchedulingEdge[]>();
    const updates = new Map<string, Partial<Task>>();

    buildSchedulingEdges(relations).forEach((edge) => {
        const edges = outgoing.get(edge.predecessorId) ?? [];
        edges.push(edge);
        outgoing.set(edge.predecessorId, edges);
    });

    const queue = [originTaskId];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const predecessorId = queue.shift();
        if (!predecessorId || visited.has(predecessorId)) continue;
        visited.add(predecessorId);

        const predecessor = taskById.get(predecessorId);
        if (!predecessor || !hasValidDateRange(predecessor)) continue;
        const predecessorDueDate = predecessor.dueDate!;

        (outgoing.get(predecessorId) ?? []).forEach((edge) => {
            const successor = taskById.get(edge.successorId);
            if (!successor || !hasValidDateRange(successor)) return;
            const successorStartDate = successor.startDate!;
            const successorDueDate = successor.dueDate!;
            const minimumSuccessorStart = addWorkingDays(predecessorDueDate, edge.gapDays, successor.projectId);
            if (successorStartDate >= minimumSuccessorStart) return;

            const duration = diffWorkingDays(
                successorStartDate,
                successorDueDate,
                successor.projectId
            );
            const nextStartDate = minimumSuccessorStart;
            const nextDueDate = shiftByWorkingDays(
                nextStartDate,
                duration,
                successor.projectId
            );
            const nextSuccessor = {
                ...successor,
                startDate: nextStartDate,
                dueDate: nextDueDate
            };

            taskById.set(successor.id, nextSuccessor);
            updates.set(successor.id, {
                startDate: nextStartDate,
                dueDate: nextDueDate
            });
            queue.push(successor.id);
        });
    }

    return updates;
};

export const calculateLinkedDownstreamUpdates = (
    tasks: Task[],
    relations: Relation[],
    originTaskId: string,
    previousDueDate: number | undefined,
    nextDueDate: number | undefined
): { updates: Map<string, Partial<Task>>; error?: string } => {
    if (!hasFiniteDate(previousDueDate) || !hasFiniteDate(nextDueDate)) {
        return { updates: new Map() };
    }

    const originProjectId = tasks.find((task) => task.id === originTaskId)?.projectId;
    const previousDownstreamAnchor = addWorkingDays(previousDueDate, 1, originProjectId);
    const nextDownstreamAnchor = addWorkingDays(nextDueDate, 1, originProjectId);
    const workingDayDelta = diffWorkingDays(previousDownstreamAnchor, nextDownstreamAnchor, originProjectId);
    if (workingDayDelta === 0) {
        return { updates: new Map() };
    }

    const taskById = new Map(tasks.map((task) => [task.id, { ...task }]));
    const outgoing = new Map<string, SchedulingEdge[]>();
    const edges = buildSchedulingEdges(relations);

    edges.forEach((edge) => {
        const nextEdges = outgoing.get(edge.predecessorId) ?? [];
        nextEdges.push(edge);
        outgoing.set(edge.predecessorId, nextEdges);
    });

    const clusterTaskIds = new Set<string>();
    const queue = [originTaskId];

    while (queue.length > 0) {
        const predecessorId = queue.shift();
        if (!predecessorId) continue;

        (outgoing.get(predecessorId) ?? []).forEach((edge) => {
            const successor = taskById.get(edge.successorId);
            if (!successor || !hasValidDateRange(successor) || clusterTaskIds.has(successor.id)) return;

            clusterTaskIds.add(successor.id);
            queue.push(successor.id);
        });
    }

    const updates = new Map<string, Partial<Task>>();
    clusterTaskIds.forEach((taskId) => {
        const task = taskById.get(taskId);
        if (!task || !hasValidDateRange(task)) return;

        updates.set(taskId, {
            startDate: shiftByWorkingDays(task.startDate!, workingDayDelta, task.projectId),
            dueDate: shiftByWorkingDays(task.dueDate!, workingDayDelta, task.projectId)
        });
    });

    for (const edge of edges) {
        if (!clusterTaskIds.has(edge.successorId)) continue;

        const predecessorTask = taskById.get(edge.predecessorId);
        const predecessor = predecessorTask && updates.has(edge.predecessorId)
            ? { ...predecessorTask, ...updates.get(edge.predecessorId) }
            : predecessorTask;
        const successor = taskById.get(edge.successorId);
        const shiftedSuccessor = updates.get(edge.successorId);
        if (!predecessor || !successor || !shiftedSuccessor) continue;
        if (!hasValidDateRange(predecessor)) continue;

        const shiftedStartDate = shiftedSuccessor.startDate;
        const shiftedDueDate = shiftedSuccessor.dueDate;
        if (!hasFiniteDate(shiftedStartDate) || !hasFiniteDate(shiftedDueDate) || shiftedStartDate > shiftedDueDate) {
            return {
                updates: new Map(),
                error: i18n.t('label_auto_schedule_external_conflict') || 'Moving linked tasks would violate an external dependency.'
            };
        }

        const minimumSuccessorStart = addWorkingDays(predecessor.dueDate!, edge.gapDays, successor.projectId);
        if (shiftedStartDate < minimumSuccessorStart) {
            return {
                updates: new Map(),
                error: i18n.t('label_auto_schedule_external_conflict') || 'Moving linked tasks would violate an external dependency.'
            };
        }
    }

    return { updates };
};
