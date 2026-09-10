import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from './TaskStore';
import { useWorkloadStore } from './WorkloadStore';
import { WorkloadLogicService, type ActualWorkloadEntry } from '../services/WorkloadLogicService';
import { parseDateOnly } from '../utils/dateOnly';
import type { Task } from '../types';

const monday = parseDateOnly('2026-09-07')!;
const task: Task = {
    id: '1', subject: 'Issue', statusId: 1, ratioDone: 0, lockVersion: 0,
    editable: true, rowIndex: 0, hasChildren: false
};
const plannedTask: Task = {
    ...task, assignedToId: 1, assignedToName: 'Dave', estimatedHours: 8,
    startDate: monday, dueDate: monday
};
const entries: ActualWorkloadEntry[] = [
    { id: 'late', issueId: '1', userId: 2, userName: 'John', spentOn: '2026-09-09', hours: 3 },
    { id: 'other', issueId: '1', userId: 3, userName: 'Alice', spentOn: '2026-09-07', hours: 2 },
    { id: 'early', issueId: '1', userId: 2, userName: 'John', spentOn: '2026-09-08', hours: 1 }
];
const calculate = (tasks: Task[], actualEntries = entries) => WorkloadLogicService.calculateWorkload(
    tasks, new Set(), { capacityThreshold: 8, leafIssuesOnly: true, includeClosedIssues: true, todayOnwardOnly: false }, actualEntries
);

describe('external workload focus across series', () => {
    beforeEach(() => {
        useWorkloadStore.getState().setWorkloadPaneVisible(false);
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useWorkloadStore.setState(useWorkloadStore.getInitialState(), true);
    });

    it('focuses an actual-only issue by stable worker order and earliest day within the worker', () => {
        useWorkloadStore.setState({ workloadData: calculate([task]) });
        useTaskStore.getState().selectTask(task.id);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({
            assigneeId: 2, dateStr: '2026-09-08', series: 'actual'
        });
        useTaskStore.getState().selectTask(null);
        expect(useWorkloadStore.getState().focusedHistogramBar).toBeNull();
        useTaskStore.getState().selectTask(task.id);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({
            assigneeId: 2, dateStr: '2026-09-08', series: 'actual'
        });
    });

    it('prefers plan even when an actual worker appears earlier in the map', () => {
        const data = calculate([plannedTask]);
        data.assignees = new Map([...data.assignees].reverse());
        useWorkloadStore.setState({ workloadData: data });
        useTaskStore.getState().selectTask(task.id);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-09-07' });
    });

    it('preserves a directly clicked actual bar even when plan also exists', () => {
        useWorkloadStore.setState({ workloadData: calculate([plannedTask]) });
        const selected = useWorkloadStore.getState().resolveNextHistogramTask(2, '2026-09-09', 'actual');
        expect(selected.taskId).toBe(task.id);
        useWorkloadStore.getState().setFocusedHistogramBar({
            assigneeId: 2, dateStr: '2026-09-09', series: 'actual'
        });
        useTaskStore.getState().selectTask(selected.taskId);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({
            assigneeId: 2, dateStr: '2026-09-09', series: 'actual'
        });
    });

    it('updates series when external selection changes within the same worker and date', () => {
        const actualTask = { ...task, id: '2' };
        useWorkloadStore.setState({ workloadData: calculate([plannedTask, actualTask], [
            { ...entries[0], issueId: '2', userId: 1, userName: 'Dave', spentOn: '2026-09-07' }
        ]) });
        useTaskStore.getState().selectTask(plannedTask.id);
        useTaskStore.getState().selectTask(actualTask.id);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({
            assigneeId: 1, dateStr: '2026-09-07', series: 'actual'
        });
        useTaskStore.getState().selectTask(plannedTask.id);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-09-07' });
    });

    it('focuses an already selected actual-only issue when workload data is recalculated', () => {
        useTaskStore.setState({ allTasks: [task], selectedTaskId: task.id });
        useWorkloadStore.setState({ actualEntries: entries, todayOnwardOnly: false });
        useWorkloadStore.getState().calculateWorkloadData();
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({
            assigneeId: 2, dateStr: '2026-09-08', series: 'actual'
        });
    });
});
