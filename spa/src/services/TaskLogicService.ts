import type { Task, Relation } from '../types';
import { RelationType } from '../types/constraints';

export class TaskLogicService {
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
     * - blocks/blocked: Treated same as precedes for date constraints
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

        // Helper to calculate day boundary aligned timestamp
        // Redmine delay is in days, and dates typically represent "start of day"
        const dayInMs = 24 * 60 * 60 * 1000;

        // ===== 1. PRECEDES relations (A precedes B) =====
        // When A moves, check if B.start needs to be pushed forward
        // Finish-to-Start: B.start >= A.end + delay
        const precedesRelations = relations.filter(
            r => r.from === movedTaskId &&
                (r.type === RelationType.Precedes || r.type === RelationType.Blocks)
        );

        for (const rel of precedesRelations) {
            const successor = tasks.find(t => t.id === rel.to);
            if (!successor) continue;

            const delay = (rel.delay || 0) * dayInMs;
            // End of predecessor + delay = minimum start for successor
            // Note: newDue represents the END date timestamp (typically start of that day)
            const minStart = newDue + delay;

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

        // ===== 2. FOLLOWS relations (A follows B) =====
        // When A moves, check if B (predecessor of A) needs adjustment
        // This is the inverse: A.start >= B.end + delay
        // If we moved A backward, B might need to move backward too
        const followsRelations = relations.filter(
            r => r.from === movedTaskId &&
                (r.type === RelationType.Follows || r.type === RelationType.Blocked)
        );

        for (const rel of followsRelations) {
            const predecessor = tasks.find(t => t.id === rel.to);
            if (!predecessor) continue;

            const delay = (rel.delay || 0) * dayInMs;
            // A follows B means: A.start >= B.end + delay
            // So B.end <= A.start - delay (maximum end for predecessor)
            const maxEnd = newStart - delay;

            if (predecessor.dueDate !== undefined &&
                Number.isFinite(predecessor.dueDate) &&
                predecessor.dueDate > maxEnd) {

                const duration = (predecessor.startDate !== undefined && Number.isFinite(predecessor.startDate))
                    ? predecessor.dueDate - predecessor.startDate
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

