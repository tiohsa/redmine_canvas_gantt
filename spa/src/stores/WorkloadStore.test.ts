import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from './TaskStore';
import { useWorkloadStore } from './WorkloadStore';
import type { Task } from '../types';

const START = Date.UTC(2026, 0, 5, 12);

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: START,
    dueDate: START,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const buildWorkloadData = (entries: Array<{
    assigneeId: number;
    assigneeName: string;
    dateStr: string;
    tasks: Task[];
}> ) => ({
    assignees: new Map(entries.map((entry) => [
        entry.assigneeId,
        {
            assigneeId: entry.assigneeId,
            assigneeName: entry.assigneeName,
            totalLoad: entry.tasks.length,
            peakLoad: entry.tasks.length,
            dailyWorkloads: new Map([
                [entry.dateStr, {
                    dateStr: entry.dateStr,
                    timestamp: START,
                    totalLoad: entry.tasks.length,
                    isOverload: false,
                    contributingTasks: entry.tasks.map((task) => ({ task, dailyLoad: 1 }))
                }]
            ])
        }
    ])),
    overloadedAssigneeCount: 0,
    overloadedDayCount: 0
});

const buildOverloadWorkloadData = () => ({
    assignees: new Map([
        [1, {
            assigneeId: 1,
            assigneeName: 'Alice',
            totalLoad: 24,
            peakLoad: 12,
            dailyWorkloads: new Map([
                ['2026-01-05', {
                    dateStr: '2026-01-05',
                    timestamp: START + 4 * 24 * 60 * 60 * 1000,
                    totalLoad: 12,
                    isOverload: true,
                    contributingTasks: [
                        { task: buildTask({ id: 'late', assignedToId: 1, assignedToName: 'Alice', estimatedHours: 12 }), dailyLoad: 12 }
                    ]
                }],
                ['2026-01-02', {
                    dateStr: '2026-01-02',
                    timestamp: START + 1 * 24 * 60 * 60 * 1000,
                    totalLoad: 9,
                    isOverload: true,
                    contributingTasks: [
                        { task: buildTask({ id: 'early', assignedToId: 1, assignedToName: 'Alice', estimatedHours: 9 }), dailyLoad: 9 }
                    ]
                }],
                ['2026-01-04', {
                    dateStr: '2026-01-04',
                    timestamp: START + 3 * 24 * 60 * 60 * 1000,
                    totalLoad: 10,
                    isOverload: true,
                    contributingTasks: [
                        { task: buildTask({ id: 'middle', assignedToId: 1, assignedToName: 'Alice', estimatedHours: 10 }), dailyLoad: 10 }
                    ]
                }],
                ['2026-01-03', {
                    dateStr: '2026-01-03',
                    timestamp: START + 2 * 24 * 60 * 60 * 1000,
                    totalLoad: 2,
                    isOverload: false,
                    contributingTasks: [
                        { task: buildTask({ id: 'normal', assignedToId: 1, assignedToName: 'Alice', estimatedHours: 2 }), dailyLoad: 2 }
                    ]
                }]
            ])
        }]
    ]),
    overloadedAssigneeCount: 1,
    overloadedDayCount: 3
});

describe('WorkloadStore histogram selection', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useWorkloadStore.setState(useWorkloadStore.getInitialState());
    });

    it('returns tasks in estimated-hours order and restarts when switching bars', () => {
        const tasks = [
            buildTask({ id: '1', estimatedHours: 2, assignedToId: 1, assignedToName: 'Alice' }),
            buildTask({ id: '10', estimatedHours: 8, assignedToId: 1, assignedToName: 'Alice' }),
            buildTask({ id: '2', estimatedHours: 8, assignedToId: 1, assignedToName: 'Alice' }),
            buildTask({ id: 'x', estimatedHours: 5, assignedToId: 2, assignedToName: 'Bob' })
        ];

        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData([
                {
                    assigneeId: 1,
                    assigneeName: 'Alice',
                    dateStr: '2026-01-05',
                    tasks: tasks.slice(0, 3)
                },
                {
                    assigneeId: 2,
                    assigneeName: 'Bob',
                    dateStr: '2026-01-05',
                    tasks: [tasks[3]]
                }
            ])
        });

        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('2');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('10');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('1');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(2, '2026-01-05').taskId).toBe('x');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('2');
    });

    it('resets the click cycle when resetHistogramSelectionCycle is called', () => {
        const tasks = [
            buildTask({ id: 'a', estimatedHours: 4, assignedToId: 1, assignedToName: 'Alice' }),
            buildTask({ id: 'b', estimatedHours: 1, assignedToId: 1, assignedToName: 'Alice' })
        ];

        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData([
                {
                    assigneeId: 1,
                    assigneeName: 'Alice',
                    dateStr: '2026-01-05',
                    tasks
                }
            ])
        });

        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('a');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('b');

        useWorkloadStore.getState().resetHistogramSelectionCycle();

        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('a');
    });

    it('resets the click cycle when workload data is recalculated', () => {
        const tasks = [
            buildTask({ id: 'high', estimatedHours: 8, assignedToId: 1, assignedToName: 'Alice' }),
            buildTask({ id: 'low', estimatedHours: 2, assignedToId: 1, assignedToName: 'Alice' })
        ];

        useTaskStore.getState().setTasks(tasks);

        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildWorkloadData([
                {
                    assigneeId: 1,
                    assigneeName: 'Alice',
                    dateStr: '2026-01-05',
                    tasks
                }
            ])
        });

        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('high');
        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('low');

        useWorkloadStore.getState().calculateWorkloadData();

        expect(useWorkloadStore.getState().resolveNextHistogramTask(1, '2026-01-05').taskId).toBe('high');
    });

    it('cycles overload bars in ascending date order and stores the focused bar', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildOverloadWorkloadData()
        });

        expect(useWorkloadStore.getState().resolveNextOverloadBar(1)).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });
        expect(useWorkloadStore.getState().resolveNextOverloadBar(1)).toEqual({ assigneeId: 1, dateStr: '2026-01-04' });
        expect(useWorkloadStore.getState().resolveNextOverloadBar(1)).toEqual({ assigneeId: 1, dateStr: '2026-01-05' });
        expect(useWorkloadStore.getState().resolveNextOverloadBar(1)).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });
    });

    it('clears overload focus when workload data is recalculated', () => {
        useWorkloadStore.setState({
            ...useWorkloadStore.getState(),
            workloadData: buildOverloadWorkloadData()
        });

        useWorkloadStore.getState().resolveNextOverloadBar(1);
        expect(useWorkloadStore.getState().focusedHistogramBar).toEqual({ assigneeId: 1, dateStr: '2026-01-02' });

        useWorkloadStore.getState().calculateWorkloadData();

        expect(useWorkloadStore.getState().focusedHistogramBar).toBeNull();
    });
});
