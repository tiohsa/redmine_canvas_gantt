import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { i18n } from '../utils/i18n';

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

const FALLBACK_NON_WORKING_WEEK_DAYS = new Set<number>([0, 6]);

const severityByState: Record<SchedulingState, number> = {
    normal: 0,
    unscheduled: 1,
    conflicted: 2,
    cyclic: 3,
    invalid: 4
};

const getNonWorkingWeekDays = (): Set<number> => {
    if (typeof window === 'undefined') return FALLBACK_NON_WORKING_WEEK_DAYS;

    const raw = window.RedmineCanvasGantt?.nonWorkingWeekDays;
    if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_NON_WORKING_WEEK_DAYS;

    const normalized = raw
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    return normalized.length > 0 ? new Set(normalized) : FALLBACK_NON_WORKING_WEEK_DAYS;
};

const toUtcDayStart = (timestamp: number): Date => {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

export const addWorkingDays = (timestamp: number, days: number, nonWorkingWeekDays: Set<number> = getNonWorkingWeekDays()): number => {
    const date = toUtcDayStart(timestamp);
    let remaining = Math.max(0, Math.floor(days));

    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (!nonWorkingWeekDays.has(date.getUTCDay())) {
            remaining -= 1;
        }
    }

    return date.getTime();
};

export const shiftByWorkingDays = (timestamp: number, days: number, nonWorkingWeekDays: Set<number> = getNonWorkingWeekDays()): number => {
    const normalizedDays = Math.trunc(days);
    if (normalizedDays === 0) return toUtcDayStart(timestamp).getTime();
    if (normalizedDays > 0) return addWorkingDays(timestamp, normalizedDays, nonWorkingWeekDays);

    const date = toUtcDayStart(timestamp);
    let remaining = Math.abs(normalizedDays);

    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() - 1);
        if (!nonWorkingWeekDays.has(date.getUTCDay())) {
            remaining -= 1;
        }
    }

    return date.getTime();
};

export const diffWorkingDays = (fromTimestamp: number, toTimestamp: number, nonWorkingWeekDays: Set<number> = getNonWorkingWeekDays()): number => {
    const from = toUtcDayStart(fromTimestamp);
    const to = toUtcDayStart(toTimestamp);
    const fromTime = from.getTime();
    const toTime = to.getTime();

    if (fromTime === toTime) return 0;

    const step = fromTime < toTime ? 1 : -1;
    let current = from;
    let delta = 0;

    while (current.getTime() !== toTime) {
        current = new Date(current.getTime());
        current.setUTCDate(current.getUTCDate() + step);
        if (!nonWorkingWeekDays.has(current.getUTCDay())) {
            delta += step;
        }
    }

    return delta;
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

export const detectConstraintCycleTaskIds = (relations: Relation[]): Set<string> => {
    const edges = buildSchedulingEdges(relations);
    const adjacency = new Map<string, string[]>();
    const taskIds = new Set<string>();

    edges.forEach((edge) => {
        taskIds.add(edge.predecessorId);
        taskIds.add(edge.successorId);
        const successors = adjacency.get(edge.predecessorId) ?? [];
        successors.push(edge.successorId);
        adjacency.set(edge.predecessorId, successors);
    });

    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const cyclicTaskIds = new Set<string>();

    const visit = (taskId: string) => {
        const currentState = state.get(taskId) ?? 0;
        if (currentState === 1) {
            const cycleStart = stack.lastIndexOf(taskId);
            const cycleSlice = cycleStart >= 0 ? stack.slice(cycleStart) : [taskId];
            cycleSlice.forEach((value) => cyclicTaskIds.add(value));
            cyclicTaskIds.add(taskId);
            return;
        }

        if (currentState === 2) return;

        state.set(taskId, 1);
        stack.push(taskId);

        (adjacency.get(taskId) ?? []).forEach((successorId) => visit(successorId));

        stack.pop();
        state.set(taskId, 2);
    };

    taskIds.forEach((taskId) => visit(taskId));
    return cyclicTaskIds;
};

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

    const nonWorkingWeekDays = getNonWorkingWeekDays();
    edges.forEach((edge) => {
        const predecessor = taskById.get(edge.predecessorId);
        const successor = taskById.get(edge.successorId);
        if (!predecessor || !successor) return;

        if (!hasValidDateRange(predecessor) || !hasValidDateRange(successor)) return;

        const predecessorDueDate = predecessor.dueDate!;
        const successorStartDate = successor.startDate!;
        const minimumSuccessorStart = addWorkingDays(predecessorDueDate, edge.gapDays, nonWorkingWeekDays);
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
    const nonWorkingWeekDays = getNonWorkingWeekDays();
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
            const minimumSuccessorStart = addWorkingDays(predecessorDueDate, edge.gapDays, nonWorkingWeekDays);
            if (successorStartDate >= minimumSuccessorStart) return;

            const duration = Math.max(0, successorDueDate - successorStartDate);
            const nextStartDate = minimumSuccessorStart;
            const nextDueDate = nextStartDate + duration;
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

    const nonWorkingWeekDays = getNonWorkingWeekDays();
    const workingDayDelta = diffWorkingDays(previousDueDate, nextDueDate, nonWorkingWeekDays);
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
            startDate: shiftByWorkingDays(task.startDate!, workingDayDelta, nonWorkingWeekDays),
            dueDate: shiftByWorkingDays(task.dueDate!, workingDayDelta, nonWorkingWeekDays)
        });
    });

    for (const edge of edges) {
        if (!clusterTaskIds.has(edge.successorId) || clusterTaskIds.has(edge.predecessorId)) continue;

        const predecessor = taskById.get(edge.predecessorId);
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

        const minimumSuccessorStart = addWorkingDays(predecessor.dueDate!, edge.gapDays, nonWorkingWeekDays);
        if (shiftedStartDate < minimumSuccessorStart) {
            return {
                updates: new Map(),
                error: i18n.t('label_auto_schedule_external_conflict') || 'Moving linked tasks would violate an external dependency.'
            };
        }
    }

    return { updates };
};
