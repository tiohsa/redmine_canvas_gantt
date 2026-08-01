import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types';
import { enqueueMutationOperation, getMutationOperationRecords, getPendingMutationQueueSize, saveModifiedTasks } from './taskPersistence';

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
    it('serializes overlapping multi-entity operations and cleans the queue', async () => {
        const events: string[] = [];
        const operationIds: string[] = [];
        let releaseFirst!: () => void;
        const first = enqueueMutationOperation(['B', 'A'], async (context) => {
            operationIds.push(context!.operationId);
            events.push('first:start');
            await new Promise<void>(resolve => { releaseFirst = resolve; });
            events.push('first:end');
            return 'first';
        });
        const second = enqueueMutationOperation(['A', 'B'], async (context) => {
            operationIds.push(context!.operationId);
            events.push('second:start');
            return 'second';
        });

        await vi.waitFor(() => expect(events).toEqual(['first:start']));
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
        expect(events).toEqual(['first:start', 'first:end', 'second:start']);
        expect(operationIds).toHaveLength(2);
        expect(new Set(operationIds).size).toBe(2);

        await expect(enqueueMutationOperation(['A'], async (context) => context!.operationId)).resolves.toMatch(/^mutation:/);
        expect(getPendingMutationQueueSize()).toBe(0);
        const records = getMutationOperationRecords().filter(record => operationIds.includes(record.operationId));
        expect(records.map(record => record.status)).toEqual(['succeeded', 'succeeded']);
        expect(records.every(record => record.entityIds.join(',') === 'A,B')).toBe(true);
    });

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

    it('stops conflict retries after two sends for one task', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 12, lockVersion: 2 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'conflict'
        });

        const failures = await saveModifiedTasks(
            [local],
            [],
            new Set(['A']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks: [remote] })
        );

        expect(updateTask).toHaveBeenCalledTimes(2);
        expect(failures.get('A')).toBe('conflict');
    });
});
