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
     * Returns true if valid, false if invalid (or handled).
     * In this implementation, we will return a list of affected tasks if we want to "snap" them.
     */
    static checkDependencies(
        tasks: Task[],
        relations: Relation[],
        movedTaskId: string,
        _newStart: number,
        newDue: number
    ): Map<string, Partial<Task>> {
        const updates = new Map<string, Partial<Task>>();

        // Find relations where movedTask is the predecessor (source)
        // If A precedes B, and we moved A.
        // We need to check if B.start < A.end.
        // If so, we might need to push B.

        const outgoingRelations = relations.filter(r => r.from === movedTaskId && r.type === RelationType.Precedes);

        outgoingRelations.forEach(rel => {
            const successor = tasks.find(t => t.id === rel.to);
            if (!successor) return;

            // Simple "Finish to Start" assumption for 'precedes'
            // successor.start must be >= newDue + delay
            // (Note: Redmine 'precedes' usually means Finish-to-Start)

            const delay = (rel.delay || 0) * 24 * 60 * 60 * 1000;
            const minStart = newDue + delay; // Assuming newDue is end of day or similar? Timestamps usually exact.

            // If successor starts before the required minimum start
            if (successor.startDate !== undefined && Number.isFinite(successor.startDate) && successor.startDate! < minStart) {
                // We need to move the successor
                const duration = (successor.dueDate !== undefined && Number.isFinite(successor.dueDate)) ? successor.dueDate! - successor.startDate! : 0;
                const newSuccessorStart = minStart;
                const newSuccessorDue = newSuccessorStart + duration;

                updates.set(successor.id, {
                    startDate: newSuccessorStart,
                    dueDate: newSuccessorDue
                });

                // Recursively check dependencies for the successor
                // We need to merge updates
                // Construct a temporary task list with the update
                const tempSuccessor = { ...successor, startDate: newSuccessorStart, dueDate: newSuccessorDue };
                const tempTasks = tasks.map(t => t.id === successor.id ? tempSuccessor : t);

                const cascadingUpdates = this.checkDependencies(tempTasks, relations, successor.id, newSuccessorStart, newSuccessorDue);
                cascadingUpdates.forEach((v, k) => updates.set(k, v));
            }
        });

        return updates;
    }

    /**
     * Handles the "blocks" constraint.
     * If A blocks B, B cannot be started/completed until A is done.
     * This is more of a state constraint than date constraint usually, but can be treated as date constraint (End-to-Start or End-to-End).
     * Redmine 'blocks' usually implies B is blocked by A. A must be closed before B can be closed.
     * For Gantt, we might treat it as A.end <= B.start?
     * Requirement says: "blocks: If blocker is incomplete, blocked cannot start/finish".
     * This might be just a visual warning or status check.
     *
     * For "precedes" (most common in Gantt):
     * "Successor start date >= Predecessor end date"
     */
}
