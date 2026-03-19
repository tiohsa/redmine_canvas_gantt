import type { Task, Relation } from '../types';
import { calculateLinkedDownstreamUpdates, deriveSchedulingStates, recalculateDownstreamTasks, type SchedulingStateInfo } from '../scheduling/constraintGraph';
import { calculateCriticalPath, type CriticalPathResult } from '../scheduling/criticalPath';
import { AutoScheduleMoveMode, type AutoScheduleMoveMode as AutoScheduleMoveModeValue } from '../types/constraints';

export interface DependencyCheckResult {
    updates: Map<string, Partial<Task>>;
    error?: string;
}

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

    static deriveSchedulingStates(tasks: Task[], relations: Relation[]): Record<string, SchedulingStateInfo> {
        return deriveSchedulingStates(tasks, relations);
    }

    static calculateCriticalPath(tasks: Task[], relations: Relation[]): CriticalPathResult {
        return calculateCriticalPath(tasks, relations);
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
        moveMode: AutoScheduleMoveModeValue = AutoScheduleMoveMode.ConstraintPush,
        _visitedIds: Set<string> = new Set()
    ): DependencyCheckResult {
        void _visitedIds;
        const previousTask = tasks.find((task) => task.id === movedTaskId);
        const nextTasks = tasks.map((task) => (
            task.id === movedTaskId
                ? {
                    ...task,
                    startDate: newStart,
                    dueDate: newDue
                }
                : task
        ));

        if (moveMode === AutoScheduleMoveMode.Off) {
            return { updates: new Map() };
        }

        if (moveMode === AutoScheduleMoveMode.LinkedDownstreamShift) {
            return calculateLinkedDownstreamUpdates(
                nextTasks,
                relations,
                movedTaskId,
                previousTask?.dueDate,
                newDue
            );
        }

        return { updates: recalculateDownstreamTasks(nextTasks, relations, movedTaskId) };
    }
}
