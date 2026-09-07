import { describe, expect, it, vi } from 'vitest';
import { WorkloadLogicService } from './WorkloadLogicService';
import type { Task } from '../types';

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('WorkloadLogicService', () => {
    it('returns no assignees when every candidate task is filtered out by today-onward mode', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-10T00:00:00Z'));

        const tasks = [
            buildTask({
                id: '1',
                assignedToId: 10,
                assignedToName: 'Alice',
                estimatedHours: 8,
                startDate: Date.UTC(2026, 0, 5),
                dueDate: Date.UTC(2026, 0, 6)
            })
        ];

        const result = WorkloadLogicService.calculateWorkload(tasks, new Set<number>(), {
            capacityThreshold: 8,
            leafIssuesOnly: true,
            includeClosedIssues: false,
            todayOnwardOnly: true
        });

        expect(result.assignees.size).toBe(0);
        expect(result.plannedOverloadedAssigneeCount).toBe(0);
        expect(result.plannedOverloadedDayCount).toBe(0);

        vi.useRealTimers();
    });
});

describe('planned and actual comparison', () => {
    const monday = Date.UTC(2026, 8, 7);
    const options = { capacityThreshold: 8, leafIssuesOnly: true, includeClosedIssues: false, todayOnwardOnly: false };
    const planned = buildTask({ id: '1', assignedToId: 10, assignedToName: 'Dave', estimatedHours: 40, startDate: monday, dueDate: monday + 4 * 86400000 });
    const entry = (hours: number, overrides = {}) => ({ id: 'e1', issueId: '1', userId: 20, userName: 'John', spentOn: '2026-09-07', hours, ...overrides });

    it('preserves 40h / 5 working days and attributes actuals to the worker without adding series', () => {
        const data = WorkloadLogicService.calculateWorkload([planned], new Set(), options, [entry(3)]);
        expect(data.assignees.get(10)).toMatchObject({ plannedTotal: 40, plannedPeak: 8, actualTotal: 0 });
        expect(data.assignees.get(20)).toMatchObject({ plannedTotal: 0, plannedPeak: 0, actualTotal: 3, actualPeak: 3 });
        expect([...data.assignees.get(10)!.dailyWorkloads.values()].map(day => day.plannedLoad)).toEqual([8, 8, 8, 8, 8]);
    });

    it('sums multiple issues and entries without requiring an estimate, assignee, or scheduled working day', () => {
        const task = buildTask({ id: '2' });
        const data = WorkloadLogicService.calculateWorkload([planned, task], new Set(), options,
            [entry(2), entry(1, { id: 'e2' }), entry(2, { id: 'e3', issueId: '2' }), entry(4, { spentOn: '2026-09-05' })]);
        const john = data.assignees.get(20)!;
        expect(john.actualTotal).toBe(9);
        expect(john.dailyWorkloads.get('2026-09-07')?.actualHours).toBe(5);
        expect(john.dailyWorkloads.get('2026-09-05')?.timestamp).toBe(Date.UTC(2026, 8, 5));
    });

    it.each([8, 8.1])('uses strict greater-than capacity for actual %s', hours => {
        const data = WorkloadLogicService.calculateWorkload([planned], new Set(), options, [entry(hours)]);
        expect(data.actualOverloadedAssigneeCount).toBe(hours > 8 ? 1 : 0);
        expect(data.actualOverloadedDayCount).toBe(hours > 8 ? 1 : 0);
        expect(data.plannedOverloadedDayCount).toBe(0);
    });

    it('clips both series to the same period without changing the planned denominator', () => {
        const data = WorkloadLogicService.calculateWorkload([planned], new Set(), options,
            [entry(3), entry(4, { spentOn: '2026-09-08' })], { from: monday, to: monday });
        expect(data.assignees.get(10)?.plannedTotal).toBe(8);
        expect(data.assignees.get(20)?.actualTotal).toBe(3);
    });

    it('applies closed and leaf filters to actuals, rejects invalid dates and out-of-scope issues', () => {
        const tasks = [planned, buildTask({ id: '2', statusId: 5 }), buildTask({ id: '3', hasChildren: true })];
        const entries = [entry(1, { issueId: '2' }), entry(2, { issueId: '3' }), entry(3, { issueId: 'missing' }), entry(4, { spentOn: '2026-02-30' })];
        expect(WorkloadLogicService.calculateWorkload(tasks, new Set([5]), options, entries).assignees.has(20)).toBe(false);
        expect(WorkloadLogicService.calculateWorkload(tasks, new Set([5]), { ...options, leafIssuesOnly: false, includeClosedIssues: true }, entries).assignees.get(20)?.actualTotal).toBe(3);
    });

    it('applies today-onward to actuals as calendar dates', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 8, 12));
        const data = WorkloadLogicService.calculateWorkload([planned], new Set(), { ...options, todayOnwardOnly: true }, [entry(3), entry(4, { spentOn: '2026-09-08' })]);
        expect(data.assignees.get(20)?.actualTotal).toBe(4);
        expect(data.assignees.get(10)?.plannedTotal).toBe(32);
        vi.useRealTimers();
    });
});
