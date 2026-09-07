import type { Task } from '../types';
import { isWorkingDay } from '../utils/businessCalendar';
import {
    parseDateOnly,
    addCalendarDays,
    calendarDateKey,
    todayCalendarDate,
    toCalendarDate
} from '../utils/dateOnly';

export type WorkloadSeries = 'planned' | 'actual';
export type ActualWorkloadStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface ActualWorkloadEntry {
    id: string;
    issueId: string;
    userId: number;
    userName: string;
    spentOn: string;
    hours: number;
}
export interface WorkloadRange { from: number; to: number }

export interface WorkloadOptions {
    capacityThreshold: number; // e.g. 8.0
    leafIssuesOnly: boolean;
    includeClosedIssues: boolean;
    todayOnwardOnly: boolean;
}

export interface DailyWorkload {
    dateStr: string; // YYYY-MM-DD
    timestamp: number;
    actualHours: number;
    actualContributions: Array<ActualWorkloadEntry & { issue: Task }>;
    isActualOverload: boolean;
    plannedLoad: number;
    isPlannedOverload: boolean;
    plannedContributions: Array<{
        task: Task;
        dailyLoad: number;
    }>;
}

export interface AssigneeWorkload {
    assigneeId: number;
    assigneeName: string;
    dailyWorkloads: Map<string, DailyWorkload>; // Keyed by YYYY-MM-DD
    plannedTotal: number;
    plannedPeak: number;
    actualTotal: number;
    actualPeak: number;
}

export interface WorkloadData {
    assignees: Map<number, AssigneeWorkload>; // Keyed by assigneeId
    plannedOverloadedAssigneeCount: number;
    plannedOverloadedDayCount: number;
    actualOverloadedAssigneeCount: number;
    actualOverloadedDayCount: number;
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
        options: WorkloadOptions,
        actualEntries: ActualWorkloadEntry[] = [],
        range?: WorkloadRange
    ): WorkloadData {
        const assignees = new Map<number, AssigneeWorkload>();
        let plannedOverloadedAssigneeCount = 0;
        let plannedOverloadedDayCount = 0;
        
        const todayMs = todayCalendarDate();

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
                if (range && (dayMs < range.from || dayMs > range.to)) return;
                if (options.todayOnwardOnly && dayMs < todayMs) return;

                const dateStr = this.formatDateStr(dayMs);
                const assigneeId = task.assignedToId!;
                const assigneeName = task.assignedToName || `Assignee #${assigneeId}`;

                if (!assignees.has(assigneeId)) {
                    assignees.set(assigneeId, {
                        assigneeId,
                        assigneeName,
                        dailyWorkloads: new Map(),
                        plannedTotal: 0,
                        actualTotal: 0,
                        actualPeak: 0,
                        plannedPeak: 0
                    });
                }

                const workload = assignees.get(assigneeId)!;
                if (!workload.dailyWorkloads.has(dateStr)) {
                    workload.dailyWorkloads.set(dateStr, {
                        dateStr,
                        timestamp: dayMs,
                        plannedLoad: 0,
                        actualHours: 0,
                        actualContributions: [],
                        isActualOverload: false,
                        isPlannedOverload: false,
                        plannedContributions: []
                    });
                }

                const daily = workload.dailyWorkloads.get(dateStr)!;
                daily.plannedLoad += dailyLoad;
                daily.plannedContributions.push({ task, dailyLoad });
                workload.plannedTotal += dailyLoad;
                
                if (daily.plannedLoad > workload.plannedPeak) {
                    workload.plannedPeak = daily.plannedLoad;
                }
            });
        });

        const taskById = new Map(tasks.map(task => [task.id, task]));
        for (const entry of actualEntries) {
            const task = taskById.get(entry.issueId);
            const dayMs = parseDateOnly(entry.spentOn);
            if (!task || dayMs === null || !Number.isFinite(entry.hours) || entry.hours <= 0) continue;
            if (options.leafIssuesOnly && task.hasChildren) continue;
            if (!options.includeClosedIssues && closedStatusIds.has(task.statusId)) continue;
            if (options.todayOnwardOnly && dayMs < todayMs) continue;
            if (range && (dayMs < range.from || dayMs > range.to)) continue;
            let assignee = assignees.get(entry.userId);
            if (!assignee) {
                assignee = { assigneeId: entry.userId, assigneeName: entry.userName,
                    dailyWorkloads: new Map(), plannedTotal: 0, plannedPeak: 0, actualTotal: 0, actualPeak: 0 };
                assignees.set(entry.userId, assignee);
            }
            let daily = assignee.dailyWorkloads.get(entry.spentOn);
            if (!daily) {
                daily = { dateStr: entry.spentOn, timestamp: dayMs, plannedLoad: 0,
                    isPlannedOverload: false, plannedContributions: [], actualHours: 0,
                    isActualOverload: false, actualContributions: [] };
                assignee.dailyWorkloads.set(entry.spentOn, daily);
            }
            daily.actualHours += entry.hours;
            daily.actualContributions.push({ ...entry, issue: task });
            assignee.actualTotal += entry.hours;
            assignee.actualPeak = Math.max(assignee.actualPeak, daily.actualHours);
        }
        let actualOverloadedAssigneeCount = 0;
        let actualOverloadedDayCount = 0;
        // Second pass: determine overloads and summarize
        assignees.forEach(workload => {
            let assigneeHasOverload = false;
            let actualHasOverload = false;
            workload.dailyWorkloads.forEach(daily => {
                daily.isActualOverload = daily.actualHours > options.capacityThreshold;
                if (daily.isActualOverload) { actualOverloadedDayCount++; actualHasOverload = true; }
                if (daily.plannedLoad > options.capacityThreshold) {
                    daily.isPlannedOverload = true;
                    plannedOverloadedDayCount++;
                    assigneeHasOverload = true;
                }
            });
            if (actualHasOverload) actualOverloadedAssigneeCount++;
            if (assigneeHasOverload) {
                plannedOverloadedAssigneeCount++;
            }
        });

        return {
            assignees,
            plannedOverloadedAssigneeCount,
            plannedOverloadedDayCount,
            actualOverloadedAssigneeCount,
            actualOverloadedDayCount
        };
    }
}
