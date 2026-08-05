import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiMutationError, apiClient } from '../api/client';
import {
    enqueueMutationOperation,
    getMutationOperationRecords
} from '../stores/taskStore/taskPersistence';
import { taskMutationService } from './taskMutationService';

describe('taskMutationService mutation boundary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps non-bulk status results single-shot while recording the common outcome', async () => {
        const updateTaskFields = vi.spyOn(apiClient, 'updateTaskFields').mockResolvedValue({
            status: 'transient_error',
            error: 'temporary failure'
        });
        let operationId = '';
        const onSuccess = vi.fn();

        const result = await taskMutationService.updateTaskFields(
            'nonbulk-status-task',
            { subject: 'draft' },
            {
                onResult: (_value, context) => {
                    operationId = context.operationId;
                },
                onSuccess
            }
        );

        expect(result.status).toBe('transient_error');
        expect(updateTaskFields).toHaveBeenCalledTimes(1);
        expect(getMutationOperationRecords().find(record => record.operationId === operationId)?.outcome)
            .toBe('transient');
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('does not retry a thrown non-bulk mutation error', async () => {
        const error = new ApiMutationError('transient_error', 'temporary failure', 503);
        const updateTaskFields = vi.spyOn(apiClient, 'updateTaskFields').mockRejectedValue(error);

        await expect(taskMutationService.updateTaskFields('nonbulk-error-task', { subject: 'draft' }))
            .rejects.toBe(error);
        expect(updateTaskFields).toHaveBeenCalledTimes(1);
    });

    it('records permission failures from baseline mutations as terminal outcomes', async () => {
        const error = new ApiMutationError('forbidden', 'permission denied', 403);
        vi.spyOn(apiClient, 'saveBaseline').mockRejectedValue(error);

        await expect(taskMutationService.saveBaseline({ scope: 'project' })).rejects.toBe(error);

        const record = getMutationOperationRecords()
            .filter(candidate => candidate.entityIds.includes('baseline:project'))
            .at(-1);
        expect(record).toMatchObject({ status: 'failed', outcome: 'terminal' });
    });

    it('records resolved baseline responses without snapshots as failed domain operations', async () => {
        vi.spyOn(apiClient, 'saveBaseline').mockResolvedValue({
            status: 'ok',
            baseline: null
        });

        const result = await taskMutationService.saveBaseline({ scope: 'project' });

        const record = getMutationOperationRecords()
            .filter(candidate => candidate.entityIds.includes('baseline:project'))
            .at(-1);
        expect(result.baseline).toBeNull();
        expect(record).toMatchObject({ status: 'failed', outcome: 'terminal' });
    });

    it('records thrown relation conflicts as conflict operations', async () => {
        const error = new ApiMutationError('conflict', 'stale relation', 409);
        vi.spyOn(apiClient, 'createRelation').mockRejectedValue(error);

        await expect(taskMutationService.createRelation('10', '11', 'precedes')).rejects.toBe(error);

        const record = getMutationOperationRecords()
            .filter(candidate => candidate.entityIds.includes('10') && candidate.entityIds.includes('11'))
            .at(-1);
        expect(record).toMatchObject({ status: 'conflict', outcome: 'conflict' });
    });

    it('records resolved bulk subtask row failures as failed domain operations', async () => {
        vi.spyOn(apiClient, 'bulkCreateSubtasks').mockResolvedValue({
            status: 'ok',
            successCount: 0,
            failCount: 2,
            results: [
                { status: 'error', subject: 'A', errors: ['blank'] },
                { status: 'error', subject: 'B', errors: ['rolled back'] }
            ]
        });

        const result = await taskMutationService.bulkCreateSubtasks({
            parentId: '20',
            subjects: ['A', 'B']
        });

        const record = getMutationOperationRecords()
            .filter(candidate => candidate.entityIds.includes('20'))
            .at(-1);
        expect(result.failCount).toBe(2);
        expect(record).toMatchObject({ status: 'failed', outcome: 'terminal' });
    });

    it('serializes omitted and explicit filtered baseline scopes as the same entity', async () => {
        let releaseFirst!: () => void;
        const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
        let calls = 0;
        const saveBaseline = vi.spyOn(apiClient, 'saveBaseline').mockImplementation(async () => {
            calls += 1;
            if (calls === 1) await firstRequest;
            return { status: 'ok', baseline: null };
        });

        const first = taskMutationService.saveBaseline({});
        await vi.waitFor(() => expect(saveBaseline).toHaveBeenCalledTimes(1));
        const second = taskMutationService.saveBaseline({ scope: 'filtered' });

        await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
        expect(saveBaseline).toHaveBeenCalledTimes(1);
        releaseFirst();
        await Promise.all([first, second]);
        expect(saveBaseline).toHaveBeenCalledTimes(2);
    });

    it('does not make the shared queue itself retry arbitrary operations', async () => {
        let attempts = 0;
        await expect(enqueueMutationOperation(['queue-contract-task'], async () => {
            attempts += 1;
            throw new Error('transport failure');
        })).rejects.toThrow('transport failure');

        expect(attempts).toBe(1);
    });
});
