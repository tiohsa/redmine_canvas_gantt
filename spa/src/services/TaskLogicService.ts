import type { Task, Relation } from '../types';
import { RelationType } from '../types/constraints';

export class TaskLogicService {
    private static normalizeRelationEndpoints(rel: Relation): { predecessorId: string; successorId: string; gapDays: number } | null {
        // Redmine's precedes/follows requires at least (1 + delay) day gap.
        // Reference: IssueRelation#successor_soonest_start (add_working_days(..., 1 + delay)).
        const gapDays = 1 + (rel.delay || 0);
        if (rel.type === RelationType.Precedes) {
            return {
                predecessorId: rel.from,
                successorId: rel.to,
                gapDays
            };
        }
        if (rel.type === RelationType.Follows) {
            return {
                predecessorId: rel.to,
                successorId: rel.from,
                gapDays
            };
        }
        return null;
    }

    private static getNonWorkingWeekDays(): Set<number> {
        const fallback = new Set<number>([0, 6]); // Sunday/Saturday
        if (typeof window === 'undefined') return fallback;
        const raw = (window as Window).RedmineCanvasGantt?.nonWorkingWeekDays;
        if (!Array.isArray(raw)) return fallback;
        const normalized = raw
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
        return new Set(normalized);
    }

    private static toUtcDayStart(timestamp: number): Date {
        const date = new Date(timestamp);
        date.setUTCHours(0, 0, 0, 0);
        return date;
    }

    private static addWorkingDays(timestamp: number, days: number, nonWorkingWeekDays: Set<number>): number {
        const date = this.toUtcDayStart(timestamp);
        let remaining = Math.max(0, Math.floor(days));
        while (remaining > 0) {
            date.setUTCDate(date.getUTCDate() + 1);
            if (!nonWorkingWeekDays.has(date.getUTCDay())) {
                remaining -= 1;
            }
        }
        return date.getTime();
    }

    /**
     * Computes the latest predecessor end date that still satisfies:
     * addWorkingDays(predecessorEnd, gapDays) <= successorStart.
     *
     * This is not always equivalent to subtracting working days from successorStart
     * when predecessorEnd falls on non-working days.
     */
    private static latestPredecessorEndForSuccessorStart(
        successorStart: number,
        gapDays: number,
        nonWorkingWeekDays: Set<number>
    ): number {
        const candidate = this.toUtcDayStart(successorStart);

        while (this.addWorkingDays(candidate.getTime(), gapDays, nonWorkingWeekDays) > successorStart) {
            candidate.setUTCDate(candidate.getUTCDate() - 1);
        }

        return candidate.getTime();
    }

    /**
     * Checks if a task can be edited based on its status or properties.
     */
    static canEditTask(task: Task): boolean {
        // Requirement 6.3: Closed tickets cannot be edited.
        // Assuming 'editable' property from backend handles the logic of permissions + closed status.
        // If we need explicit status check:
        // if (task.statusId === CLOSED_STATUS_ID) return false;
        return task.editable;
    }

    /**
     * Validates task dates.
     * Requirement 6.4: Start date > Due date check.
     */
    static validateDates(task: Task): string[] {
        const errors: string[] = [];
        if (task.startDate !== undefined && task.dueDate !== undefined && Number.isFinite(task.startDate) && Number.isFinite(task.dueDate) && task.startDate! > task.dueDate!) {
            errors.push('Start date cannot be after due date');
        }
        return errors;
    }

    /**
     * Recalculates parent dates based on children.
     * Requirement 6.1: Parent start = min(children start), Parent end = max(children end).
     * Returns a map of task updates.
     */
    static recalculateParentDates(tasks: Task[], parentId: string): Map<string, Partial<Task>> {
        const updates = new Map<string, Partial<Task>>();
        const parent = tasks.find(t => t.id === parentId);
        if (!parent) return updates;

        const children = tasks.filter(t => t.parentId === parentId);
        if (children.length === 0) return updates;

        let minStart = Infinity;
        let maxDue = -Infinity;
        let validStartFound = false;
        let validDueFound = false;

        children.forEach(child => {
            // Use current state or already calculated updates if we were traversing up
            // Note: For simple single-level update, looking at current tasks is enough.
            // But if children were just updated, we should pass the updated list or map.
            // For now assuming 'tasks' contains the latest state of children.

            if (child.startDate !== undefined && Number.isFinite(child.startDate)) {
                minStart = Math.min(minStart, child.startDate);
                validStartFound = true;
            }
            if (child.dueDate !== undefined && Number.isFinite(child.dueDate)) {
                maxDue = Math.max(maxDue, child.dueDate);
                validDueFound = true;
            }
        });

        const newStart = validStartFound ? minStart : parent.startDate;
        const newDue = validDueFound ? maxDue : parent.dueDate;

        if (newStart !== parent.startDate || newDue !== parent.dueDate) {
            updates.set(parent.id, {
                startDate: newStart,
                dueDate: newDue
            });

            // If parent has a parent, recurse up
            if (parent.parentId) {
                // We need to apply the update tentatively to the parent object to calculate its parent
                const tempParent = { ...parent, startDate: newStart, dueDate: newDue };
                const tempTasks = tasks.map(t => t.id === parent.id ? tempParent : t);
                const parentUpdates = this.recalculateParentDates(tempTasks, parent.parentId);
                parentUpdates.forEach((v, k) => updates.set(k, v));
            }
        }

        return updates;
    }

    /**
     * Checks if moving a task violates dependency constraints.
     * Requirement 6.2: Precedes/follows.
     * Returns a map of updates for affected tasks.
     * 
     * Supported relation types:
     * - precedes: Finish-to-Start, successor.start >= predecessor.end + delay
     * - follows: Inverse of precedes, predecessor.end <= successor.start - delay
     * 
     * @param visitedIds - Set of already visited task IDs to prevent infinite loops in circular dependencies
     */
    static checkDependencies(
        tasks: Task[],
        relations: Relation[],
        movedTaskId: string,
        newStart: number,
        newDue: number,
        visitedIds: Set<string> = new Set()
    ): Map<string, Partial<Task>> {
        const updates = new Map<string, Partial<Task>>();

        // Circular dependency prevention: skip if already visited
        if (visitedIds.has(movedTaskId)) {
            return updates;
        }
        visitedIds.add(movedTaskId);
        const nonWorkingWeekDays = this.getNonWorkingWeekDays();

        // ===== 1. Moved task acts as predecessor =====
        // Constraint: successor.start >= predecessor.end + delay
        const movedAsPredecessor = relations
            .map((rel) => this.normalizeRelationEndpoints(rel))
            .filter((entry): entry is { predecessorId: string; successorId: string; gapDays: number } => Boolean(entry))
            .filter((entry) => entry.predecessorId === movedTaskId);

        for (const relation of movedAsPredecessor) {
            const successor = tasks.find(t => t.id === relation.successorId);
            if (!successor) continue;

            // End of predecessor + gapDays = minimum start for successor.
            // Note: newDue represents the END date timestamp (typically start of that day)
            const minStart = this.addWorkingDays(newDue, relation.gapDays, nonWorkingWeekDays);

            if (successor.startDate !== undefined &&
                Number.isFinite(successor.startDate) &&
                successor.startDate < minStart) {

                const duration = (successor.dueDate !== undefined && Number.isFinite(successor.dueDate))
                    ? successor.dueDate - successor.startDate
                    : 0;
                const newSuccessorStart = minStart;
                const newSuccessorDue = newSuccessorStart + duration;

                updates.set(successor.id, {
                    startDate: newSuccessorStart,
                    dueDate: newSuccessorDue
                });

                // Cascade: check this successor's dependencies
                const tempSuccessor = { ...successor, startDate: newSuccessorStart, dueDate: newSuccessorDue };
                const tempTasks = tasks.map(t => t.id === successor.id ? tempSuccessor : t);

                const cascadingUpdates = this.checkDependencies(
                    tempTasks, relations, successor.id, newSuccessorStart, newSuccessorDue, visitedIds
                );
                cascadingUpdates.forEach((v, k) => updates.set(k, v));
            }
        }

        // ===== 2. Moved task acts as successor =====
        // Constraint: successor.start >= predecessor.end + delay
        // If successor moves backward, predecessor may need to move backward as well.
        if (Number.isFinite(newStart)) {
            const movedAsSuccessor = relations
                .map((rel) => this.normalizeRelationEndpoints(rel))
                .filter((entry): entry is { predecessorId: string; successorId: string; gapDays: number } => Boolean(entry))
                .filter((entry) => entry.successorId === movedTaskId);

            for (const relation of movedAsSuccessor) {
                const predecessor = tasks.find(t => t.id === relation.predecessorId);
                if (!predecessor) continue;

                const predecessorEnd = predecessor.dueDate;
                if (predecessorEnd === undefined || !Number.isFinite(predecessorEnd)) continue;

                // Validate with Redmine-equivalent forward rule:
                // successor.start >= addWorkingDays(predecessor.end, gapDays)
                const requiredSuccessorStart = this.addWorkingDays(predecessorEnd, relation.gapDays, nonWorkingWeekDays);
                if (requiredSuccessorStart <= newStart) continue;

                const maxEnd = this.latestPredecessorEndForSuccessorStart(newStart, relation.gapDays, nonWorkingWeekDays);

                const duration = (predecessor.startDate !== undefined && Number.isFinite(predecessor.startDate))
                    ? predecessorEnd - predecessor.startDate
                    : 0;
                const newPredecessorDue = maxEnd;
                const newPredecessorStart = newPredecessorDue - duration;

                // Don't push start date into negative
                if (newPredecessorStart >= 0) {
                    updates.set(predecessor.id, {
                        startDate: newPredecessorStart,
                        dueDate: newPredecessorDue
                    });

                    // Cascade: check this predecessor's dependencies
                    const tempPredecessor = { ...predecessor, startDate: newPredecessorStart, dueDate: newPredecessorDue };
                    const tempTasks = tasks.map(t => t.id === predecessor.id ? tempPredecessor : t);

                    const cascadingUpdates = this.checkDependencies(
                        tempTasks, relations, predecessor.id, newPredecessorStart, newPredecessorDue, visitedIds
                    );
                    cascadingUpdates.forEach((v, k) => updates.set(k, v));
                }
            }
        }

        return updates;
    }
}
