import { describe, expect, it } from 'vitest';
import {
    enqueueMutationOperation,
    getMutationOperationRecords,
    getPendingMutationQueueSize
} from './taskPersistence';

describe('lifecycle resource gates', () => {
    it('keeps completed operation history bounded under a burst of writes', async () => {
        await Promise.all(Array.from({ length: 256 }, (_, index) => (
            enqueueMutationOperation([`performance-${index % 4}`], async () => undefined)
        )));

        const records = getMutationOperationRecords();
        expect(getPendingMutationQueueSize()).toBe(0);
        expect(records.filter(record => record.status === 'queued' || record.status === 'running')).toHaveLength(0);
        expect(records.filter(record => record.status === 'succeeded' || record.status === 'failed').length).toBeLessThanOrEqual(128);
    });
});

