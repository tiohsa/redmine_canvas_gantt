import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types';
import type { TaskFields } from '../../services/taskMutationService';
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

const dueDateIntent = (tasks: Task[]): Record<string, TaskFields> => Object.fromEntries(
    tasks.map(task => [task.id, { due_date: task.dueDate }])
);

describe('saveModifiedTasks', () => {
    it('fails a modified task with no explicit mutation intent before sending a request', async () => {
        const updateTask = vi.fn();
        const result = await saveModifiedTasks(
            [buildTask({ id: 'A' })],
            [],
            new Set(['A']),
            [],
            updateTask,
            vi.fn().mockResolvedValue({ tasks: [] })
        );

        expect(updateTask).not.toHaveBeenCalled();
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['A']));
        expect(result.failures.get('A')).toContain('explicit mutation intent is required');
    });

    it.each([
        { bodyStatus: 'ok' as const, recordStatus: 'succeeded' as const, outcome: 'success' as const, metric: 'completed' as const },
        { bodyStatus: 'validation_error' as const, recordStatus: 'failed' as const, outcome: 'terminal' as const, metric: 'failed' as const },
        { bodyStatus: 'forbidden' as const, recordStatus: 'failed' as const, outcome: 'terminal' as const, metric: 'failed' as const },
        { bodyStatus: 'not_found' as const, recordStatus: 'failed' as const, outcome: 'terminal' as const, metric: 'failed' as const },
        { bodyStatus: 'conflict' as const, recordStatus: 'conflict' as const, outcome: 'conflict' as const, metric: 'failed' as const },
        { bodyStatus: 'transient_error' as const, recordStatus: 'failed' as const, outcome: 'transient' as const, metric: 'failed' as const }
    ])('records resolved $bodyStatus mutations as $recordStatus, not transport success', async ({ bodyStatus, recordStatus, outcome, metric }) => {
        const onSuccess = vi.fn();
        const result = await enqueueMutationOperation(['transition-table'], async (context) => ({
            status: bodyStatus,
            operationId: context!.operationId
        }), { onSuccess });

        const record = getMutationOperationRecords().find(entry => entry.operationId === result.operationId);
        expect(record).toMatchObject({
            status: recordStatus,
            outcome
        });

        if (metric === 'completed') {
            expect(record?.status).toBe('succeeded');
            expect(onSuccess).toHaveBeenCalledTimes(1);
        } else {
            expect(record?.status).not.toBe('succeeded');
            expect(onSuccess).not.toHaveBeenCalled();
        }
    });

    it.each([
        { malformedResult: null, label: 'null result' },
        { malformedResult: 'ok', label: 'primitive result' },
        { malformedResult: {}, label: 'missing status' },
        { malformedResult: { status: 'unexpected' }, label: 'unknown status' }
    ])('records $label as a protocol failure', async ({ malformedResult }) => {
        const onSuccess = vi.fn();
        const result = await enqueueMutationOperation(['protocol-table'], async (context) => ({
            ...(malformedResult && typeof malformedResult === 'object' ? malformedResult : { value: malformedResult }),
            operationId: context!.operationId
        }), { onSuccess });

        const record = getMutationOperationRecords().find(entry => entry.operationId === result.operationId);
        expect(record).toMatchObject({
            status: 'failed',
            outcome: 'terminal'
        });
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('runs lifecycle completion before releasing an entity queue slot', async () => {
        const events: string[] = [];
        let releaseFirst!: () => void;
        const first = enqueueMutationOperation(
            ['A'],
            async () => {
                events.push('first:transport');
                await new Promise<void>(resolve => { releaseFirst = resolve; });
                return { status: 'ok' as const, value: 'first' };
            },
            {
                onSuccess: async () => {
                    events.push('first:commit');
                }
            }
        );
        const second = enqueueMutationOperation(['A'], async () => {
            events.push('second:transport');
            return { status: 'ok' as const, value: 'second' };
        });

        await vi.waitFor(() => expect(events).toEqual(['first:transport']));
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual([
            { status: 'ok', value: 'first' },
            { status: 'ok', value: 'second' }
        ]);
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
            return { status: 'ok' as const, value: 'first' };
        });
        const second = enqueueMutationOperation(['A', 'B'], async (context) => {
            operationIds.push(context!.operationId);
            events.push('second:start');
            return { status: 'ok' as const, value: 'second' };
        });

        await vi.waitFor(() => expect(events).toEqual(['first:start']));
        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual([
            { status: 'ok', value: 'first' },
            { status: 'ok', value: 'second' }
        ]);
        expect(events).toEqual(['first:start', 'first:end', 'second:start']);
        expect(operationIds).toHaveLength(2);
        expect(new Set(operationIds).size).toBe(2);

        await expect(enqueueMutationOperation(['A'], async (context) => ({ status: 'ok' as const, operationId: context!.operationId })))
            .resolves.toMatchObject({ status: 'ok', operationId: expect.stringMatching(/^mutation:/) });
        expect(getPendingMutationQueueSize()).toBe(0);
        const records = getMutationOperationRecords().filter(record => operationIds.includes(record.operationId));
        expect(records.map(record => record.status)).toEqual(['succeeded', 'succeeded']);
        expect(records.every(record => record.entityIds.join(',') === 'A,B')).toBe(true);
    });

    it('deduplicates duplicate entity ids before queueing a mutation', async () => {
        const result = await enqueueMutationOperation(['A', 'A', 'B'], async (context) => ({
            status: 'ok' as const,
            operationId: context!.operationId,
            entityIds: context!.entityIds
        }));

        expect(result.entityIds).toEqual(['A', 'B']);
        const record = getMutationOperationRecords().find(entry => entry.operationId === result.operationId);
        expect(record).toMatchObject({
            status: 'succeeded',
            entityIds: ['A', 'B']
        });
        expect(getPendingMutationQueueSize()).toBe(0);
    });

    it('serializes typed semantic resources independently from numeric entity ids', async () => {
        const relation = enqueueMutationOperation(
            ['10'],
            async context => ({ status: 'ok' as const, operationId: context!.operationId, resourceKeys: context!.resourceKeys }),
            undefined,
            ['relation:10']
        );
        const task = enqueueMutationOperation(
            ['10'],
            async context => ({ status: 'ok' as const, operationId: context!.operationId, resourceKeys: context!.resourceKeys }),
            undefined,
            ['task:10']
        );

        const relationResult = await relation;
        const taskResult = await task;
        expect(relationResult).toMatchObject({ resourceKeys: ['relation:10'] });
        expect(taskResult).toMatchObject({ resourceKeys: ['task:10'] });
        const records = getMutationOperationRecords().filter(record =>
            [relationResult, taskResult].some(result => record.operationId === result.operationId)
        );
        expect(records.map(record => record.resourceKeys)).toEqual([['relation:10'], ['task:10']]);
    });

    it.each([
        { label: 'empty', entityIds: [] as unknown as string[] },
        { label: 'null', entityIds: [null] as unknown as string[] },
        { label: 'blank', entityIds: [''] }
    ])('rejects $label mutation entity scopes without running the operation', async ({ entityIds }) => {
        const operation = vi.fn(async () => ({ status: 'ok' as const }));

        await expect(enqueueMutationOperation(entityIds, operation)).rejects.toThrow(/entity id/);

        expect(operation).not.toHaveBeenCalled();
        expect(getPendingMutationQueueSize()).toBe(0);
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks: [buildTask({ id: 'A' })] }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent([buildTask({ id: 'A' })])
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            onTaskResult,
            undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
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
            () => terminalFailure,
            {}, dueDateIntent(tasks)
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
            (taskId) => taskId === 'B',
            {}, dueDateIntent(tasks)
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

    it('treats a conflict as idempotent success only when remote persisted fields already match', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 10, parentId: undefined, lockVersion: 2 });
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
            fetchData, undefined, undefined, undefined, undefined, undefined, dueDateIntent([local, other])
        );

        expect(updateTask.mock.calls.filter(([task]) => task.id === 'A')).toHaveLength(1);
        expect(result.failures.has('A')).toBe(false);
        expect(result.savedTaskIds).toEqual(new Set(['A', 'B']));
    });

    it('settles a 409 from a complete canonical entity without a resync', async () => {
        const local = buildTask({ id: 'A', startDate: 10, dueDate: 20, parentId: undefined, lockVersion: 1 });
        const remote = buildTask({ id: 'A', startDate: 10, dueDate: 20, parentId: undefined, lockVersion: 2 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock',
            entity: remote,
            revision: 2
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [] });

        const result = await saveModifiedTasks(
            [local], [], new Set(['A']), [], updateTask, fetchData,
            undefined, undefined, undefined, undefined, undefined,
            { A: { start_date: local.startDate, due_date: local.dueDate, parent_issue_id: null } }
        );

        expect(fetchData).not.toHaveBeenCalled();
        expect(result.failures).toEqual(new Map());
        expect(result.savedTaskIds).toEqual(new Set(['A']));
    });

    it('publishes a complete canonical 409 mismatch as conflict without a resync', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, parentId: undefined, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 12, parentId: undefined, lockVersion: 2 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock',
            entity: remote,
            revision: 2
        });
        const fetchData = vi.fn();
        const onConflict = vi.fn();

        const result = await saveModifiedTasks(
            [local], [], new Set(['A']), [], updateTask, fetchData, undefined, undefined, onConflict,
            undefined, undefined, dueDateIntent([local])
        );

        expect(fetchData).not.toHaveBeenCalled();
        expect(result.savedTaskIds).toEqual(new Set());
        expect(onConflict).toHaveBeenCalledWith('A', 'stale lock', remote, 2);
    });

    it('falls back to one resync when a 409 entity omits an owned field', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, parentId: undefined, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 10, parentId: undefined, lockVersion: 2 });
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock',
            entity: { id: 'A', dueDate: 10, lockVersion: 2 },
            revision: 2
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [remote] });

        const result = await saveModifiedTasks(
            [local], [], new Set(['A']), [], updateTask, fetchData,
            undefined, undefined, undefined, undefined, undefined,
            { A: { start_date: local.startDate, due_date: local.dueDate, parent_issue_id: null } }
        );

        expect(fetchData).toHaveBeenCalledTimes(1);
        expect(result.savedTaskIds).toEqual(new Set(['A']));
    });

    it('uses the resynced entity revision as the canonical revision', async () => {
        const local = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const remote = buildTask({ id: 'A', dueDate: 10, parentId: undefined, lockVersion: 7 });
        const onTaskSaved = vi.fn();
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock',
            entity: { id: 'A' },
            revision: 2
        });

        const result = await saveModifiedTasks(
            [local], [], new Set(['A']), [], updateTask,
            vi.fn().mockResolvedValue({ tasks: [remote] }), onTaskSaved,
            undefined, undefined, undefined, undefined, dueDateIntent([local])
        );

        expect(result.savedTaskIds).toEqual(new Set(['A']));
        expect(onTaskSaved).toHaveBeenCalledWith('A', 7);
    });

    it('does not send or settle a task with only non-Bulk LocalPatch fields', async () => {
        const updateTask = vi.fn();
        const result = await saveModifiedTasks(
            [buildTask({ id: 'A' })], [], new Set(['A']), [], updateTask,
            vi.fn().mockResolvedValue({ tasks: [] }), undefined, undefined, undefined,
            undefined, { A: 1 }, { A: { subject: 'Local' } },
            new Map([['A', 'Unresolved non-bulk mutation']])
        );

        expect(updateTask).not.toHaveBeenCalled();
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toContain('Unresolved non-bulk');
    });

    it('does not classify an empty Bulk intent as semantic success', async () => {
        const updateTask = vi.fn().mockResolvedValue({ status: 'ok' as const, lockVersion: 2 });
        const result = await saveModifiedTasks(
            [buildTask({ id: 'A' })], [], new Set(['A']), [], updateTask,
            vi.fn().mockResolvedValue({ tasks: [] }), undefined, undefined, undefined,
            undefined, { A: 1 }, { A: {} }
        );

        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toContain('No saveable task changes');
    });

    it('does not automatically retry after a conflict when remote persisted fields differ', async () => {
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
            vi.fn().mockResolvedValue({ tasks: [remote] }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent([local])
        );

        expect(updateTask).toHaveBeenCalledTimes(1);
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
            onConflict,
            undefined, undefined, dueDateIntent([local])
        );

        expect(updateTask).toHaveBeenCalledTimes(1);
        expect(fetchData).toHaveBeenCalledWith({ query: { selectedStatusIds: [1] } });
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toBe('resync unavailable');
        expect(onConflict).toHaveBeenCalledWith('A', 'resync unavailable (remote unavailable)', undefined, undefined);
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
            onConflict,
            undefined, undefined, dueDateIntent([local])
        );

        expect(updateTask).toHaveBeenCalledTimes(1);
        expect(fetchData).toHaveBeenCalledTimes(1);
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.failures.get('A')).toBe('stale lock');
        expect(onConflict).toHaveBeenCalledWith('A', 'stale lock (remote unavailable)', undefined, undefined);
    });

    it('records multiple differing conflicts in one resync without retrying with newer lock versions', async () => {
        const localA = buildTask({ id: 'A', dueDate: 10, lockVersion: 1 });
        const localB = buildTask({ id: 'B', dueDate: 20, lockVersion: 3 });
        const remoteA = buildTask({ id: 'A', dueDate: 11, lockVersion: 2 });
        const remoteB = buildTask({ id: 'B', dueDate: 21, lockVersion: 4 });
        const updateTask = vi.fn().mockImplementation(async (task: Task) => {
            return task.id === 'A'
                ? { status: 'conflict' as const, error: 'A stale lock' }
                : { status: 'conflict' as const, error: 'B stale lock' };
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: [remoteA, remoteB] });
        const onConflict = vi.fn();

        const result = await saveModifiedTasks(
            [localA, localB],
            [],
            new Set(['A', 'B']),
            [],
            updateTask,
            fetchData,
            undefined,
            undefined,
            onConflict,
            undefined, undefined, dueDateIntent([localA, localB])
        );

        expect(fetchData).toHaveBeenCalledTimes(1);
        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A', 'B']);
        expect(result.failures).toEqual(new Map([
            ['A', 'A stale lock'],
            ['B', 'B stale lock']
        ]));
        expect(result.savedTaskIds).toEqual(new Set());
        expect(onConflict).toHaveBeenCalledWith('A', 'A stale lock', remoteA, 2);
        expect(onConflict).toHaveBeenCalledWith('B', 'B stale lock', remoteB, 4);
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
            vi.fn().mockResolvedValue({ tasks }),
            undefined, undefined, undefined, undefined, undefined, dueDateIntent(tasks)
        );

        expect(updateTask.mock.calls.map(([task]) => task.id)).toEqual(['A']);
        expect(result.failures.get('A')).toBe('Task no longer exists');
        expect(result.failures.get('B')).toContain('predecessor A');
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.unsentTaskIds).toEqual(new Set(['B']));
    });
});
