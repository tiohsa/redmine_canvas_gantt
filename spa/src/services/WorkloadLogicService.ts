import type { Task } from '../types';
import { isWorkingDay } from '../utils/businessCalendar';
import {
    addCalendarDays,
    calendarDateKey,
    fromLocalDate,
    toCalendarDate
} from '../utils/dateOnly';

export interface WorkloadOptions {
    capacityThreshold: number; // e.g. 8.0
    leafIssuesOnly: boolean;
    includeClosedIssues: boolean;
    todayOnwardOnly: boolean;
}

export interface DailyWorkload {
    dateStr: string; // YYYY-MM-DD
    timestamp: number;
    totalLoad: number;
    isOverload: boolean;
    contributingTasks: Array<{
        task: Task;
        dailyLoad: number;
    }>;
}

export interface AssigneeWorkload {
    assigneeId: number;
    assigneeName: string;
    dailyWorkloads: Map<string, DailyWorkload>; // Keyed by YYYY-MM-DD
    totalLoad: number;
    peakLoad: number;
}

export interface WorkloadData {
    assignees: Map<number, AssigneeWorkload>; // Keyed by assigneeId
    overloadedAssigneeCount: number;
    overloadedDayCount: number;
}

export class WorkloadLogicService {
    static normalizeDate(timestamp: number): number {
        return toCalendarDate(timestamp);
    }

    static formatDateStr(timestamp: number): string {
        return calendarDateKey(timestamp);
    }

    static isBusinessDay(timestamp: number, projectId?: string): boolean {
        return isWorkingDay(timestamp, projectId);
    }

    static getBusinessDaysInRange(startMs: number, endMs: number, projectId?: string): number[] {
        const days: number[] = [];
        let current = this.normalizeDate(startMs);
        const end = this.normalizeDate(endMs);

        while (current <= end) {
            if (this.isBusinessDay(current, projectId)) {
                days.push(current);
            }
            current = addCalendarDays(current, 1);
        }

        return days;
    }

    static calculateWorkload(
        tasks: Task[],
        closedStatusIds: Set<number>,
        options: WorkloadOptions
    ): WorkloadData {
        const assignees = new Map<number, AssigneeWorkload>();
        let overloadedAssigneeCount = 0;
        let overloadedDayCount = 0;
        
        const todayMs = fromLocalDate(new Date());

        tasks.forEach(task => {
            // 1. the issue has an assignee
            if (task.assignedToId === undefined || task.assignedToId === null) return;
            // 2. estimated_hours > 0
            if (!task.estimatedHours || task.estimatedHours <= 0) return;
            // 3. valid working range (start_date <= due_date)
            if (!task.startDate || !task.dueDate || task.startDate > task.dueDate) return;
            // 4. leaf-only option
            if (options.leafIssuesOnly && task.hasChildren) return;
            // 5. closed issues option
            if (!options.includeClosedIssues && closedStatusIds.has(task.statusId)) return;

            const businessDays = this.getBusinessDaysInRange(task.startDate, task.dueDate, task.projectId);
            if (businessDays.length === 0) return; // No business days in range

            const dailyLoad = task.estimatedHours / businessDays.length;

            businessDays.forEach(dayMs => {
                if (options.todayOnwardOnly && dayMs < todayMs) return;

                const dateStr = this.formatDateStr(dayMs);
                const assigneeId = task.assignedToId!;
                const assigneeName = task.assignedToName || `Assignee #${assigneeId}`;

                if (!assignees.has(assigneeId)) {
                    assignees.set(assigneeId, {
                        assigneeId,
                        assigneeName,
                        dailyWorkloads: new Map(),
                        totalLoad: 0,
                        peakLoad: 0
                    });
                }

                const workload = assignees.get(assigneeId)!;
                if (!workload.dailyWorkloads.has(dateStr)) {
                    workload.dailyWorkloads.set(dateStr, {
                        dateStr,
                        timestamp: dayMs,
                        totalLoad: 0,
                        isOverload: false,
                        contributingTasks: []
                    });
                }

                const daily = workload.dailyWorkloads.get(dateStr)!;
                daily.totalLoad += dailyLoad;
                daily.contributingTasks.push({ task, dailyLoad });
                workload.totalLoad += dailyLoad;
                
                if (daily.totalLoad > workload.peakLoad) {
                    workload.peakLoad = daily.totalLoad;
                }
            });
        });

        // Second pass: determine overloads and summarize
        assignees.forEach(workload => {
            let assigneeHasOverload = false;
            workload.dailyWorkloads.forEach(daily => {
                if (daily.totalLoad > options.capacityThreshold) {
                    daily.isOverload = true;
                    overloadedDayCount++;
                    assigneeHasOverload = true;
                }
            });
            if (assigneeHasOverload) {
                overloadedAssigneeCount++;
            }
        });

        return {
            assignees,
            overloadedAssigneeCount,
            overloadedDayCount
        };
    }
}
