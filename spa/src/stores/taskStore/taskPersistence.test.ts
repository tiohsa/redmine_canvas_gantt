import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types';
import { saveModifiedTasks } from './taskPersistence';

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'Task',
    startDate: 1,
    dueDate: 2,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 1,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('saveModifiedTasks', () => {
    it('saves independent tasks in parallel while preserving dependency order', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B' })
        ];
        let active = 0;
        let maxActive = 0;
        const updateTask = vi.fn().mockImplementation(async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await Promise.resolve();
            active -= 1;
            return { status: 'ok' as const, lockVersion: 2 };
        });

        const failures = await saveModifiedTasks(
            tasks,
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(failures).toEqual(new Map());
        expect(maxActive).toBe(2);
    });

    it('reapplies the local value with the latest lock version after an optimistic-lock conflict', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 12, lockVersion: 2 });
        const other = buildTask({ id: 'B', lockVersion: 1 });
        let attempts = 0;
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            if (task.id === 'A') {
                attempts += 1;
                if (attempts > 1) return { status: 'ok' as const, lockVersion: 3 };
                return {
                    status: 'conflict' as const,
                    error: 'This task was updated by another user.'
                };
            }
            return { status: 'ok' as const, lockVersion: 2 };
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [remote, other] });

        const failures = await saveModifiedTasks(
            [local, other],
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            fetchData
        );

        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')).toHaveLength(2);
        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')[1][0].lockVersion).toBe(2);
        expect(failures.has('A')).toBe(false);
    });
});
