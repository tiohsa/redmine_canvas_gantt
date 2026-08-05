import { describe, expect, it, vi } from 'vitest';
import {
    enqueueMutationOperation,
    getMutationOperationRecords,
    getPendingMutationQueueSize,
    mutationLifecycleMetrics,
    resetMutationLifecycleMetrics,
    saveModifiedTasks
} from './taskPersistence';
import type { Task } from '../../types';

const buildTask = (id: string, dueDate: number, lockVersion = 1): Task => ({
    id,
    subject: `Task ${id}`,
    startDate: dueDate - 1,
    dueDate,
    ratioDone: 0,
    statusId: 1,
    lockVersion,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

describe('lifecycle resource gates', () => {
    it('keeps queues and completed operation history bounded under a 1,000 mutation burst', async () => {
        resetMutationLifecycleMetrics();

        await Promise.all(Array.from({ length: 1000 }, (_, index) => (
            enqueueMutationOperation([`performance-${index % 8}`], async () => ({ status: 'ok' as const }))
        )));

        const records = getMutationOperationRecords();
        expect(getPendingMutationQueueSize()).toBe(0);
        expect(records.filter(record => record.status === 'queued' || record.status === 'running')).toHaveLength(0);
        expect(records.filter(record => record.status === 'succeeded' || record.status === 'failed' || record.status === 'conflict').length).toBeLessThanOrEqual(128);
        expect(mutationLifecycleMetrics.started).toBe(1000);
        expect(mutationLifecycleMetrics.completed).toBe(1000);
        expect(mutationLifecycleMetrics.failed).toBe(0);
        expect(mutationLifecycleMetrics.active).toBe(0);
        expect(mutationLifecycleMetrics.maxActive).toBeLessThanOrEqual(8);
    });

    it('does not retry or leak queue state under a 1,000 conflict burst', async () => {
        resetMutationLifecycleMetrics();

        const localTasks = Array.from({ length: 1000 }, (_, index) => buildTask(`conflict-${index}`, index + 10, 1));
        const remoteTasks = localTasks.map((task, index) => buildTask(task.id, index + 10_000, 2));
        const updateTask = vi.fn().mockResolvedValue({
            status: 'conflict' as const,
            error: 'stale lock'
        });
        const fetchData = vi.fn().mockResolvedValue({ tasks: remoteTasks });

        const result = await saveModifiedTasks(
            localTasks,
            [],
            new Set(localTasks.map((task) => task.id)),
            [],
            updateTask,
            fetchData
        );

        expect(updateTask).toHaveBeenCalledTimes(1000);
        expect(fetchData).toHaveBeenCalled();
        expect(result.savedTaskIds).toEqual(new Set());
        expect(result.failures.size).toBe(1000);
        expect(result.batchStatus).toBe('partial_failure');
        expect(getPendingMutationQueueSize()).toBe(0);
        expect(getMutationOperationRecords()).toHaveLength(128);
        expect(mutationLifecycleMetrics.started).toBe(1000);
        expect(mutationLifecycleMetrics.completed).toBe(0);
        expect(mutationLifecycleMetrics.failed).toBe(1000);
        expect(mutationLifecycleMetrics.active).toBe(0);
        expect(mutationLifecycleMetrics.maxActive).toBeLessThanOrEqual(8);
    });
});
