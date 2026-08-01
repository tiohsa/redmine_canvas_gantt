import { describe, expect, it } from 'vitest';
import {
    enqueueMutationOperation,
    getMutationOperationRecords,
    mutationLifecycleMetrics,
    resetMutationLifecycleMetrics
} from './taskPersistence';

describe('async lifecycle performance counters', () => {
    it('tracks bounded concurrent writes and completed history', async () => {
        resetMutationLifecycleMetrics();

        await Promise.all(Array.from({ length: 32 }, (_, index) => enqueueMutationOperation(
            [`metric-task-${index % 4}`],
            async () => index
        )));

        expect(mutationLifecycleMetrics.started).toBe(32);
        expect(mutationLifecycleMetrics.completed).toBe(32);
        expect(mutationLifecycleMetrics.failed).toBe(0);
        expect(mutationLifecycleMetrics.active).toBe(0);
        expect(mutationLifecycleMetrics.maxActive).toBeLessThanOrEqual(4);
        expect(getMutationOperationRecords().length).toBeLessThanOrEqual(128);
    });
});
