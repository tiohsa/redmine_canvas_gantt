import { describe, expect, it } from 'vitest';
import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { calculateCriticalPath } from './criticalPath';

const FRIDAY = Date.UTC(2026, 0, 2);
const MONDAY = Date.UTC(2026, 0, 5);
const TUESDAY = Date.UTC(2026, 0, 6);
const WEDNESDAY = Date.UTC(2026, 0, 7);
const THURSDAY = Date.UTC(2026, 0, 8);
const FRIDAY_NEXT = Date.UTC(2026, 0, 9);
const MONDAY_NEXT = Date.UTC(2026, 0, 12);

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: MONDAY,
    dueDate: TUESDAY,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('calculateCriticalPath', () => {
    it('calculates ES/EF/LS/LF for a simple chain', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: 'C', startDate: FRIDAY_NEXT, dueDate: MONDAY_NEXT })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'B', to: 'C', type: RelationType.Precedes }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.orderedTaskIds).toEqual(['A', 'B', 'C']);
        expect(result.projectFinish).toBe(MONDAY_NEXT);
        expect(result.metricsByTaskId.A).toMatchObject({
            es: MONDAY,
            ef: TUESDAY,
            ls: MONDAY,
            lf: TUESDAY,
            totalSlackDays: 0,
            critical: true
        });
        expect(result.metricsByTaskId.B).toMatchObject({
            es: WEDNESDAY,
            ef: THURSDAY,
            ls: WEDNESDAY,
            lf: THURSDAY,
            totalSlackDays: 0,
            critical: true
        });
        expect(result.metricsByTaskId.C).toMatchObject({
            es: FRIDAY_NEXT,
            ef: MONDAY_NEXT,
            ls: FRIDAY_NEXT,
            lf: MONDAY_NEXT,
            totalSlackDays: 0,
            critical: true
        });
    });

    it('calculates slack on a non-critical branch', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: 'C', startDate: WEDNESDAY, dueDate: WEDNESDAY }),
            buildTask({ id: 'D', startDate: FRIDAY_NEXT, dueDate: MONDAY_NEXT })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'A', to: 'C', type: RelationType.Precedes },
            { id: 'r3', from: 'B', to: 'D', type: RelationType.Precedes },
            { id: 'r4', from: 'C', to: 'D', type: RelationType.Precedes }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.projectFinish).toBe(MONDAY_NEXT);
        expect(result.metricsByTaskId.A.totalSlackDays).toBe(0);
        expect(result.metricsByTaskId.B.totalSlackDays).toBe(0);
        expect(result.metricsByTaskId.D.totalSlackDays).toBe(0);
        expect(result.metricsByTaskId.C.totalSlackDays).toBe(1);
        expect(result.metricsByTaskId.C.critical).toBe(false);
        expect(result.metricsByTaskId.C.lf).toBe(THURSDAY);
    });

    it('supports multiple terminal nodes by using the latest EF as project finish', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: 'C', startDate: FRIDAY_NEXT, dueDate: FRIDAY_NEXT })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.projectFinish).toBe(FRIDAY_NEXT);
        expect(result.metricsByTaskId.C.totalSlackDays).toBe(0);
        expect(result.metricsByTaskId.B.totalSlackDays).toBe(1);
        expect(result.metricsByTaskId.A.totalSlackDays).toBe(1);
    });

    it('normalizes follows relations into the same scheduling path', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'B', to: 'A', type: RelationType.Follows }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.orderedTaskIds).toEqual(['A', 'B']);
        expect(result.metricsByTaskId.A.totalSlackDays).toBe(0);
        expect(result.metricsByTaskId.B.totalSlackDays).toBe(0);
    });

    it('applies relation delay as working-day gap', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: WEDNESDAY })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes, delay: 2 }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.metricsByTaskId.B.es).toBe(FRIDAY_NEXT);
        expect(result.metricsByTaskId.B.ef).toBe(FRIDAY_NEXT);
    });

    it('skips configured non-working days in forward and backward passes', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];

        try {
            const tasks = [
                buildTask({ id: 'A', startDate: Date.UTC(2026, 0, 1), dueDate: FRIDAY }),
                buildTask({ id: 'B', startDate: FRIDAY, dueDate: FRIDAY })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes }
            ];

            const result = calculateCriticalPath(tasks, relations);

            expect(result.metricsByTaskId.B.es).toBe(MONDAY);
            expect(result.metricsByTaskId.B.ls).toBe(MONDAY);
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
    });

    it('excludes non-scheduling relations from CPM constraints', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Relates },
            { id: 'r2', from: 'A', to: 'B', type: RelationType.Blocks }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.metricsByTaskId.A.totalSlackDays).toBe(2);
        expect(result.metricsByTaskId.B.totalSlackDays).toBe(0);
    });

    it('excludes unscheduled and invalid tasks from the result', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: undefined, dueDate: undefined }),
            buildTask({ id: 'C', startDate: THURSDAY, dueDate: WEDNESDAY })
        ];

        const result = calculateCriticalPath(tasks, []);

        expect(result.orderedTaskIds).toEqual(['A']);
        expect(result.excludedTaskIds).toEqual(['B', 'C']);
        expect(result.metricsByTaskId.B).toBeUndefined();
        expect(result.metricsByTaskId.C).toBeUndefined();
    });

    it('reports cyclic tasks and omits them from metrics', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: WEDNESDAY, dueDate: THURSDAY }),
            buildTask({ id: 'C', startDate: FRIDAY_NEXT, dueDate: FRIDAY_NEXT })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'B', to: 'C', type: RelationType.Precedes },
            { id: 'r3', from: 'C', to: 'A', type: RelationType.Precedes }
        ];

        const result = calculateCriticalPath(tasks, relations);

        expect(result.cyclicTaskIds).toEqual(['A', 'B', 'C']);
        expect(result.excludedTaskIds).toEqual(['A', 'B', 'C']);
        expect(result.orderedTaskIds).toEqual([]);
        expect(result.metricsByTaskId).toEqual({});
    });

    it('keeps disconnected valid tasks in the CPM result', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'B', startDate: FRIDAY_NEXT, dueDate: FRIDAY_NEXT })
        ];

        const result = calculateCriticalPath(tasks, []);

        expect(result.orderedTaskIds).toEqual(['A', 'B']);
        expect(result.projectFinish).toBe(FRIDAY_NEXT);
        expect(result.metricsByTaskId.A.totalSlackDays).toBe(3);
        expect(result.metricsByTaskId.B.totalSlackDays).toBe(0);
    });
});
