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
    it('runs lifecycle completion before releasing an entity queue slot', async () => {
        const events: string[] = [];
        let releaseFirst!: () => void;
        const first = enqueueMutationOperation(
            ['A'],
            async () => {
                events.push('first:transport');
                await new Promise<void>(resolve => { releaseFirst = resolve; });
                return 'first';
            },
            {
                onSuccess: async () => {
                    events.push('first:commit');
                }
            }
        );
        const second = enqueueMutationOperation(['A'], async () => {
            events.push('second:transport');
            return 'second';
        });

        await vi.waitFor(() => expect(events).toEqual(['first:transport']));
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
        expect(events).toEqual(['first:transport', 'first:commit', 'second:transport']);
    });

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

        const result = await saveModifiedTasks(
            tasks,
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
        expect(maxActive).toBe(2);
    });

    it('caps independent task writes at eight concurrent requests', async () => {
        const tasks = Array.from({ length: 10 }, (_, index) => buildTask({ id: `task-${index}` }));
        let active = 0;
        let maxActive = 0;
        let release!: () => void;
        const barrier = new Promise<void>((resolve) => { release = resolve; });
        const updateTask = vi.fn().mockImplementation(async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await barrier;
            active -= 1;
            return { status: 'ok' as const, lockVersion: 2 };
        });

        const save = saveModifiedTasks(
            tasks,
            [],
            new Set(tasks.map(task => task.id)),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        await vi.waitFor(() => expect(updateTask).toHaveBeenCalledTimes(8));
        expect(maxActive).toBe(8);
        release();

        const result = await save;
        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(tasks.map(task => task.id)));
        expect(maxActive).toBe(8);
    });

    it('retries a transient_error even when no other task makes progress', async () => {
        let attempts = 0;
        const updateTask = vi.fn().mockImplementation(async () => {
            attempts += 1;
            return attempts === 1
                ? { status: 'transient_error' as const, error: 'temporary failure' }
                : { status: 'ok' as const, lockVersion: 2 };
        });

        const result = await saveModifiedTasks(
            [buildTask({ id: 'A' })],
            [],
            new Set(['A']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks: [buildTask({ id: 'A' })] })
        );

        expect(updateTask).toHaveBeenCalledTimes(2);
        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A']));
        expect(result.unsentTaskIds).toEqual(new Set());
    });

    it('saves a dependency chain from predecessors to successors', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B' }),
            buildTask({ id: 'C' })
        ];
        const relations = [
            { id: 'AB', from: 'A', to: 'B', type: 'precedes' as const },
            { id: 'BC', from: 'B', to: 'C', type: 'precedes' as const }
        ];
        const savedIds: string[] = [];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            savedIds.push(task.id);
            return { status: 'ok' as const, lockVersion: 2 };
        });

        const result = await saveModifiedTasks(
            tasks,
            relations,
            new Set(['A', 'B', 'C']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B', 'C']));
        expect(savedIds).toEqual(['A', 'B', 'C']);
    });

    it('uses the shared predecessor direction for follows relations', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B' })
        ];
        const relations = [
            { id: 'BA', from: 'B', to: 'A', type: 'follows' as const }
        ];
        const savedIds: string[] = [];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            savedIds.push(task.id);
            return { status: 'ok' as const, lockVersion: 2 };
        });

        const result = await saveModifiedTasks(
            tasks,
            relations,
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
        expect(savedIds).toEqual(['A', 'B']);
    });

    it('prioritizes dependency order over parent depth', async () => {
        const tasks = [
            buildTask({ id: 'A', parentId: 'P' }),
            buildTask({ id: 'B' }),
            buildTask({ id: 'P' })
        ];
        const relations = [
            { id: 'AB', from: 'A', to: 'B', type: 'precedes' as const }
        ];
        const savedIds: string[] = [];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            savedIds.push(task.id);
            return { status: 'ok' as const, lockVersion: 2 };
        });

        const result = await saveModifiedTasks(
            tasks,
            relations,
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
        expect(savedIds).toEqual(['A', 'B']);
    });

    it('rejects a cyclic dependency batch without classifying downstream as cyclic', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B' }),
            buildTask({ id: 'C' }),
            buildTask({ id: 'D' })
        ];
        const relations = [
            { id: 'AB', from: 'A', to: 'B', type: 'precedes' as const },
            { id: 'BA', from: 'B', to: 'A', type: 'precedes' as const },
            { id: 'BC', from: 'B', to: 'C', type: 'precedes' as const }
        ];
        const updateTask = vi.fn();
        const onTaskResult = vi.fn();

        const result = await saveModifiedTasks(
            tasks,
            relations,
            new Set(['A', 'B', 'C', 'D']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks }),
            undefined,
            onTaskResult
        );

        expect(updateTask).not.toHaveBeenCalled();
        expect(onTaskResult).not.toHaveBeenCalled();
        expect(result.failures.get('A')).toContain('dependency cycle');
        expect(result.failures.get('B')).toContain('dependency cycle');
        expect(result.failures.has('C')).toBe(false);
        expect(result.failures.has('D')).toBe(false);
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['A', 'B', 'C', 'D']));
        expect(result.abortedTaskIds).toEqual(new Set());
        expect(result.batchStatus).toBe('preflight_failure');
    });

    it('does not send a successor after its predecessor has a terminal failure', async () => {
        const tasks = [buildTask({ id: 'A' }), buildTask({ id: 'B' })];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'A'
                ? { status: 'validation_error' as const, error: 'invalid date' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));

        const result = await saveModifiedTasks(
            tasks,
            [{ id: 'AB', from: 'A', to: 'B', type: 'precedes' }],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A']);
        expect(result.failures.get('A')).toBe('invalid date');
        expect(result.failures.get('B')).toContain('predecessor A');
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['B']));
        expect(result.abortedTaskIds).toEqual(new Set());
    });

    it('does not send a successor after a transient predecessor exhausts retry', async () => {
        const tasks = [buildTask({ id: 'A' }), buildTask({ id: 'B' })];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'A'
                ? { status: 'transient_error' as const, error: 'service unavailable' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));

        const result = await saveModifiedTasks(
            tasks,
            [{ id: 'AB', from: 'A', to: 'B', type: 'precedes' }],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A', 'A']);
        expect(result.failures.get('A')).toBe('service unavailable');
        expect(result.failures.get('B')).toContain('predecessor A');
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['B']));
    });

    it('waits for all predecessors before sending a task with multiple dependencies', async () => {
        const tasks = [buildTask({ id: 'A' }), buildTask({ id: 'B' }), buildTask({ id: 'C' })];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'B'
                ? { status: 'forbidden' as const, error: 'not allowed' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));

        const result = await saveModifiedTasks(
            tasks,
            [
                { id: 'AC', from: 'A', to: 'C', type: 'precedes' },
                { id: 'BC', from: 'B', to: 'C', type: 'precedes' }
            ],
            new Set(['A', 'B', 'C']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A', 'B']);
        expect(result.failures.get('B')).toBe('not allowed');
        expect(result.failures.get('C')).toContain('predecessor B');
        expect(result.savedTaskIds).toEqual(new Set(['A']));
        expect(result.unsentTaskIds).toEqual(new Set(['C']));
    });

    it('stops unsent dependency batches after a terminal bar-operation failure', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B', parentId: 'A' })
        ];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'A'
                ? { status: 'validation_error' as const, error: 'invalid date' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));
        let terminalFailure = false;

        const result = await saveModifiedTasks(
            tasks,
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks }),
            undefined,
            (_taskId, result) => {
                if (result.status === 'validation_error') terminalFailure = true;
            },
            undefined,
            () => terminalFailure
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A']);
        expect(result.failures.has('A')).toBe(true);
        expect(result.failures.has('B')).toBe(true);
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.batchStatus).toBe('partial_failure');
    });

    it('aborts only the pending tasks selected by the ownership policy', async () => {
        const tasks = [
            buildTask({ id: 'A' }),
            buildTask({ id: 'B', parentId: 'A' }),
            buildTask({ id: 'C', parentId: 'A' })
        ];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'A'
                ? { status: 'validation_error' as const, error: 'invalid date' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));

        const result = await saveModifiedTasks(
            tasks,
            [],
            new Set(['A', 'B', 'C']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks }),
            undefined,
            undefined,
            undefined,
            (taskId) => taskId === 'B'
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A', 'C']);
        expect(result.failures.has('A')).toBe(true);
        expect(result.failures.has('B')).toBe(true);
        expect(result.failures.has('C')).toBe(false);
        expect(result.savedTaskIds).toEqual(new Set(['C']));
        expect(result.abortedTaskIds).toEqual(new Set(['B']));
        expect(result.unsentTaskIds).toEqual(new Set(['B']));
        expect(result.batchStatus).toBe('partial_failure');
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

        const result = await saveModifiedTasks(
            [local, other],
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            fetchData
        );

        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')).toHaveLength(2);
        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')[1][0].lockVersion).toBe(2);
        expect(result.failures.has('A')).toBe(false);
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
    });

    it('stops conflict retries after two sends for one task', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 12, lockVersion: 2 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'conflict'
        });

        const result = await saveModifiedTasks(
            [local],
            [],
            new Set(['A']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks: [remote] })
        );

        expect(updateTask).toHaveBeenCalledTimes(2);
        expect(result.failures.get('A')).toBe('conflict');
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.batchStatus).toBe('partial_failure');
    });

    it('keeps a conflict terminal when resync fails', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock'
        });
        const fetchData = vi.fn().mockRejectedValue(new Error('resync unavailable'));
        const onConflict = vi.fn();

        const result = await saveModifiedTasks(
            [local],
            [],
            new Set(['A']),
            [1],
            updateTask,
            fetchData,
            undefined,
            undefined,
            onConflict
        );

        expect(updateTask).toHaveBeenCalledTimes(1);
        expect(fetchData).toHaveBeenCalledWith({ query: { selectedStatusIds: [1] } });
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toBe('resync unavailable');
        expect(onConflict).toHaveBeenCalledWith('A', 'resync unavailable');
    });

    it('does not treat a conflict response outside the current scope as success', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock'
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [] });
        const onConflict = vi.fn();

        const result = await saveModifiedTasks(
            [local],
            [],
            new Set(['A']),
            [],
            updateTask,
            fetchData,
            undefined,
            undefined,
            onConflict
        );

        expect(updateTask).toHaveBeenCalledTimes(2);
        expect(fetchData).toHaveBeenCalledTimes(2);
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toBe('stale lock');
        expect(onConflict).toHaveBeenCalledWith('A', 'stale lock');
    });

    it('resolves multiple conflicts in one resync without mixing their lock versions', async () => {
        const localA = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const localB = buildTask({ id: 'B', dueDate: 20, lockVersion: 3 });
        const remoteA = buildTask({ id: 'A', dueDate: 11, lockVersion: 2 });
        const remoteB = buildTask({ id: 'B', dueDate: 21, lockVersion: 4 });
        let attemptsA = 0;
        let attemptsB = 0;
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            if (task.id === 'A') {
                attemptsA += 1;
                return attemptsA === 1
                    ? { status: 'conflict' as const, error: 'A stale lock' }
                    : { status: 'ok' as const, lockVersion: 5 };
            }
            attemptsB += 1;
            return attemptsB === 1
                ? { status: 'conflict' as const, error: 'B stale lock' }
                : { status: 'ok' as const, lockVersion: 6 };
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [remoteA, remoteB] });

        const result = await saveModifiedTasks(
            [localA, localB],
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            fetchData
        );

        expect(fetchData).toHaveBeenCalledTimes(1);
        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')[1][0].lockVersion).toBe(2);
        expect(updateTask.mock.calls.filter(([task]) => task.id === 'B')[1][0].lockVersion).toBe(4);
        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
    });

    it('blocks a successor after a not-found predecessor', async () => {
        const tasks = [buildTask({ id: 'A' }), buildTask({ id: 'B' })];
        const updateTask = vi.fn().mockImplementation(async (task: Task) => (
            task.id === 'A'
                ? { status: 'not_found' as const, error: 'Task no longer exists' }
                : { status: 'ok' as const, lockVersion: 2 }
        ));

        const result = await saveModifiedTasks(
            tasks,
            [{ id: 'AB', from: 'A', to: 'B', type: 'precedes' }],
            new Set(['A', 'B']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks })
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A']);
        expect(result.failures.get('A')).toBe('Task no longer exists');
        expect(result.failures.get('B')).toContain('predecessor A');
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['B']));
    });
});
