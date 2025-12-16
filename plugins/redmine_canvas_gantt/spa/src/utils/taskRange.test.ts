import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { getMaxFiniteDueDate, getMinFiniteStartDate } from './taskRange';

const task = (overrides: Partial<Task>): Task => ({
    id: overrides.id ?? '1',
    subject: overrides.subject ?? 't',
    startDate: overrides.startDate ?? 0,
    dueDate: overrides.dueDate ?? 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('taskRange', () => {
    it('非finiteな日付を無視して min/max を返す', () => {
        const tasks: Task[] = [
            task({ id: 'a', startDate: 100, dueDate: 200 }),
            task({ id: 'b', startDate: Number.NaN, dueDate: 300 }),
            task({ id: 'c', startDate: 50, dueDate: Number.NaN }),
            task({ id: 'd', startDate: 400, dueDate: 250 })
        ];

        expect(getMinFiniteStartDate(tasks)).toBe(50);
        expect(getMaxFiniteDueDate(tasks)).toBe(300);
    });

    it('対象がなければ null を返す', () => {
        expect(getMinFiniteStartDate([task({ startDate: Number.NaN })])).toBe(null);
        expect(getMaxFiniteDueDate([task({ dueDate: Number.NaN })])).toBe(null);
    });
});

