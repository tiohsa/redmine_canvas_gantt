import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiMutationError, apiClient } from '../api/client';
import {
    enqueueMutationOperation,
    getMutationOperationRecords
} from '../stores/taskStore/taskPersistence';
import {
    PERSISTABLE_TASK_FIELDS,
    RelationExecutionGuardError,
    hasCanonicalTaskAck,
    taskMutationAffectsScheduling,
    taskMutationFields,
    taskMutationService
} from './taskMutationService';
import { DatePlacementMode } from '../types/constraints';
import { parseDateOnly } from '../utils/dateOnly';

describe('taskMutationService mutation boundary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ['wrong entity id', { id: 'other', subject: 'Draft', lockVersion: 2 }, 2, undefined],
        ['missing canonical field', { id: 'task', lockVersion: 2 }, 2, undefined],
        ['revision disagreement', { id: 'task', subject: 'Draft', lockVersion: 3 }, 2, undefined],
        ['stale revision', { id: 'task', subject: 'Draft', lockVersion: 1 }, 1, 2],
        ['unsafe revision', { id: 'task', subject: 'Draft', lockVersion: Number.MAX_SAFE_INTEGER + 1 }, Number.MAX_SAFE_INTEGER + 1, undefined]
    ])('rejects a task acknowledgement with %s', (_reason, entity, revision, baseRevision) => {
        expect(hasCanonicalTaskAck('task', { subject: 'Draft' }, {
            status: 'ok', entity, revision, lockVersion: revision
        }, baseRevision)).toBe(false);
    });

    it('accepts present canonical fields after server normalization', () => {
        expect(hasCanonicalTaskAck('task', { subject: 'draft' }, {
            status: 'ok', entity: { id: 'task', subject: 'Draft', lockVersion: 3 }, revision: 3
        }, 2)).toBe(true);
    });

    it('serializes every persistable task field through one registry', () => {
        const fields = taskMutationFields({
            subject: 'Draft',
            startDate: Date.UTC(2026, 0, 2),
            dueDate: Date.UTC(2026, 0, 4),
            parentId: '7',
            ratioDone: 50,
            statusId: 2,
            assignedToId: null,
            priorityId: 3,
            categoryId: 4,
            estimatedHours: 2,
            projectId: '5',
            trackerId: 6,
            fixedVersionId: '8',
            customFieldValues: { '10': 'value' }
        }, PERSISTABLE_TASK_FIELDS);

        expect(fields).toMatchObject({
            subject: 'Draft',
            start_date: '2026-01-02',
            due_date: '2026-01-04',
            parent_issue_id: 7,
            done_ratio: 50,
            status_id: 2,
            assigned_to_id: '',
            priority_id: 3,
            category_id: 4,
            estimated_hours: 2,
            project_id: '5',
            tracker_id: 6,
            fixed_version_id: '8',
            custom_field_values: { '10': 'value' }
        });
        expect(fields).not.toHaveProperty('author_id');
    });

    it.each([
        { fields: ['subject'], expected: false },
        { fields: ['statusId', 'priorityId'], expected: false },
        { fields: ['dueDate'], expected: true },
        { fields: ['subject', 'startDate'], expected: true }
    ])('classifies $fields as scheduling=$expected from canonical fields', ({ fields, expected }) => {
        expect(taskMutationAffectsScheduling(fields)).toBe(expected);
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
        expect(updateTaskFields).toHaveBeenCalledTimes(2);
        expect(getMutationOperationRecords().find(record => record.operationId === operationId)?.outcome)
            .toBe('transient');
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('keeps the captured date placement mode across transient retries', async () => {
        const updateTaskFields = vi.spyOn(apiClient, 'updateTaskFields')
            .mockResolvedValueOnce({ status: 'transient_error', error: 'temporary failure' })
            .mockResolvedValueOnce({ status: 'ok', revision: 2, lockVersion: 2,
                entity: { id: 'captured-mode-task', dueDate: parseDateOnly('2026-01-10')!, lockVersion: 2 } });

        await taskMutationService.updateTaskFields(
            'captured-mode-task',
            { due_date: '2026-01-10' },
            undefined,
            DatePlacementMode.CalendarDays
        );

        expect(updateTaskFields.mock.calls).toHaveLength(2);
        expect(updateTaskFields.mock.calls.every(([, , , mode]) => mode === DatePlacementMode.CalendarDays)).toBe(true);
    });

    it('does not report an incomplete task acknowledgement as success', async () => {
        const updateTaskFields = vi.spyOn(apiClient, 'updateTaskFields').mockResolvedValue({ status: 'ok' });
        const onSuccess = vi.fn();
        const result = await taskMutationService.updateTaskFields('missing-ack-task', { subject: 'Draft' }, { onSuccess });

        expect(result.status).toBe('protocol_error');
        expect(result.entity).toBeUndefined();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(updateTaskFields).toHaveBeenCalledTimes(1);
    });

    it('sanitizes protocol-error metadata from a non-decoder mutation boundary', async () => {
        vi.spyOn(apiClient, 'updateTaskFields').mockResolvedValue({
            status: 'protocol_error', error: 'Malformed response',
            completeness: 'complete', invalidatedEntityIds: ['other'], deletedEntityIds: ['unsafe'],
            failure: { kind: 'not_found', resourceRole: 'target', resourceType: 'task', resourceId: 'unsafe' },
            entity: { id: 'unsafe', subject: 'Untrusted', lockVersion: 99 }, revision: 99,
            lockVersion: 99, taskId: 'unsafe', parentId: 'unsafe-parent', siblingPosition: 'tail'
        });

        const result = await taskMutationService.updateTaskFields('sanitized-task', { subject: 'Draft' });

        expect(result.status).toBe('protocol_error');
        expect(result.error).toBe('Malformed response');
        expect(result).toMatchObject({
            completeness: undefined, invalidatedEntityIds: undefined, deletedEntityIds: undefined, failure: undefined,
            entity: undefined, revision: undefined, lockVersion: undefined, taskId: undefined,
            parentId: undefined, siblingPosition: undefined
        });
    });

    it('forwards mixed task modes in one schedule operation without selecting a request mode', async () => {
        const scheduleMutation = vi.spyOn(apiClient, 'scheduleMutation').mockResolvedValue({
            status: 'ok', operationId: 'schedule:mixed',
            entities: [{ id: 'A', dueDate: undefined, lockVersion: 2 }, { id: 'B', dueDate: undefined, lockVersion: 4 }],
            revisions: { A: 2, B: 4 }
        });
        const changes = [
            { taskId: 'A', baseRevision: 1, dueDate: null, datePlacementMode: DatePlacementMode.CalendarDays },
            { taskId: 'B', baseRevision: 3, dueDate: null, datePlacementMode: DatePlacementMode.WorkingDays }
        ];

        await taskMutationService.scheduleMutation(changes);

        expect(scheduleMutation).toHaveBeenCalledExactlyOnceWith(changes, expect.any(String));
    });

    it('records an incomplete schedule acknowledgement as a protocol failure', async () => {
        vi.spyOn(apiClient, 'scheduleMutation').mockResolvedValue({
            status: 'ok', operationId: 'schedule:incomplete', entities: [], revisions: {}
        });
        const startedAt = Date.now();

        const result = await taskMutationService.scheduleMutation([
            { taskId: 'incomplete-schedule-ack', baseRevision: 1, dueDate: 11 }
        ]);

        expect(result.status).toBe('protocol_error');
        expect(getMutationOperationRecords().filter(record => record.startedAt >= startedAt &&
            record.entityIds.includes('incomplete-schedule-ack'))).toEqual([
            expect.objectContaining({ status: 'failed', outcome: 'terminal' })
        ]);
    });

    it('bounds retries for a thrown non-bulk mutation error', async () => {
        const error = new ApiMutationError('transient_error', 'temporary failure', 503);
        const updateTaskFields = vi.spyOn(apiClient, 'updateTaskFields').mockRejectedValue(error);

        await expect(taskMutationService.updateTaskFields('nonbulk-error-task', { subject: 'draft' }))
            .rejects.toBe(error);
        expect(updateTaskFields).toHaveBeenCalledTimes(2);
    });

    it('settles a response-loss retry as success when the fresh entity matches the intended fields', async () => {
        vi.spyOn(apiClient, 'updateTaskFields')
            .mockRejectedValueOnce(new ApiMutationError('transient_error', 'response lost', 503))
            .mockResolvedValueOnce({
                status: 'conflict',
                entity: { id: 'reconciled-task', subject: 'draft', lockVersion: 8 },
                revision: 8
            });

        const result = await taskMutationService.updateTaskFields('reconciled-task', { subject: 'draft' });

        expect(result).toMatchObject({ status: 'ok', revision: 8 });
    });

    it('does not reconcile response-loss when an intended canonical property is absent', async () => {
        vi.spyOn(apiClient, 'updateTaskFields')
            .mockRejectedValueOnce(new ApiMutationError('transient_error', 'response lost', 503))
            .mockResolvedValueOnce({
                status: 'conflict',
                entity: { id: 'absent-task', lockVersion: 8 },
                revision: 8
            });

        const result = await taskMutationService.updateTaskFields('absent-task', { due_date: null });

        expect(result.status).toBe('conflict');
    });

    it('compares response-loss dates and explicit clears semantically', async () => {
        vi.spyOn(apiClient, 'updateTaskFields')
            .mockRejectedValueOnce(new ApiMutationError('transient_error', 'response lost', 503))
            .mockResolvedValueOnce({
                status: 'conflict',
                entity: {
                    id: 'date-task',
                    startDate: Date.UTC(2026, 7, 10),
                    dueDate: undefined,
                    lockVersion: 3
                },
                revision: 3
            });

        const result = await taskMutationService.updateTaskFields('date-task', {
            start_date: '2026-08-10',
            due_date: null
        });

        expect(result.status).toBe('ok');
    });

    it('compares only intended custom field keys', async () => {
        vi.spyOn(apiClient, 'updateTaskFields')
            .mockRejectedValueOnce(new ApiMutationError('transient_error', 'response lost', 503))
            .mockResolvedValueOnce({
                status: 'conflict',
                entity: {
                    id: 'custom-task',
                    customFieldValues: { '1': 'draft', '2': 'remote-only' },
                    lockVersion: 3
                },
                revision: 3
            });

        const result = await taskMutationService.updateTaskFields('custom-task', {
            custom_field_values: { '1': 'draft' }
        });

        expect(result.status).toBe('ok');
    });

    it('compares response-loss ID clears semantically', async () => {
        vi.spyOn(apiClient, 'updateTaskFields')
            .mockRejectedValueOnce(new ApiMutationError('transient_error', 'response lost', 503))
            .mockResolvedValueOnce({
                status: 'conflict',
                entity: { id: 'id-task', parentId: undefined, fixedVersionId: undefined, categoryId: undefined, lockVersion: 3 },
                revision: 3
            });

        const result = await taskMutationService.updateTaskFields('id-task', {
            parent_issue_id: null,
            fixed_version_id: null,
            category_id: null
        });

        expect(result.status).toBe('ok');
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

    it('serializes baseline deletion with saves and keeps the project endpoint captured when queued', async () => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token'
        };
        let releaseSave!: () => void;
        const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
        const saveBaseline = vi.spyOn(apiClient, 'saveBaseline').mockImplementation(async () => {
            await saveGate;
            return { status: 'ok', baseline: null };
        });
        const deleteBaseline = vi.spyOn(apiClient, 'deleteBaseline').mockResolvedValue({
            status: 'ok', baseline: null, deletedSnapshotId: 'snapshot-1', completeness: 'complete'
        });

        const saving = taskMutationService.saveBaseline({ scope: 'project' });
        await vi.waitFor(() => expect(saveBaseline).toHaveBeenCalledTimes(1));
        const deleting = taskMutationService.deleteBaseline('snapshot-1');
        window.RedmineCanvasGantt = {
            projectId: 2,
            apiBase: '/projects/2/canvas_gantt',
            redmineBase: '',
            authToken: 'other-token'
        };

        await new Promise<void>(resolve => setTimeout(resolve, 10));
        expect(deleteBaseline).not.toHaveBeenCalled();
        releaseSave();
        await Promise.all([saving, deleting]);

        expect(deleteBaseline).toHaveBeenCalledExactlyOnceWith('snapshot-1', '/projects/1/canvas_gantt');
        const record = getMutationOperationRecords()
            .filter(candidate => candidate.entityIds.includes('baseline:1:delete'))
            .at(-1);
        expect(record).toMatchObject({ status: 'succeeded', outcome: 'success' });
    });

    it('sends a baseline DELETE once when the transport outcome is unknown', async () => {
        const deleteBaseline = vi.spyOn(apiClient, 'deleteBaseline').mockRejectedValue(new Error('connection lost'));

        await expect(taskMutationService.deleteBaseline('snapshot-1')).rejects.toThrow('connection lost');

        expect(deleteBaseline).toHaveBeenCalledTimes(1);
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

    it('passes expected relation snapshots through update and delete mutations', async () => {
        vi.spyOn(apiClient, 'updateRelation').mockResolvedValue({
            status: 'ok', id: '3', from: '10', to: '11', type: 'blocks'
        });
        vi.spyOn(apiClient, 'deleteRelation').mockResolvedValue({ status: 'ok' });
        const expected = { from: '10', to: '11', type: 'precedes', delay: 2 };

        await taskMutationService.updateRelation('3', 'blocks', undefined, ['10', '11'], expected);
        await taskMutationService.deleteRelation('3', ['10', '11'], expected);

        expect(apiClient.updateRelation).toHaveBeenCalledWith('3', 'blocks', undefined, expect.any(String), expected);
        expect(apiClient.deleteRelation).toHaveBeenCalledWith('3', expect.any(String), expected);
    });

    it('rechecks relation view scope after queued writes drain and does not send a blocked request', async () => {
        let releaseFirst!: () => void;
        const firstRequest = new Promise<void>(resolve => { releaseFirst = resolve; });
        let calls = 0;
        const updateRelation = vi.spyOn(apiClient, 'updateRelation').mockImplementation(async () => {
            calls += 1;
            if (calls === 1) await firstRequest;
            return { status: 'ok', id: '3', from: '10', to: '11', type: 'blocks' };
        });
        const expected = { from: '10', to: '11', type: 'precedes', delay: 2 };
        const first = taskMutationService.updateRelation('3', 'blocks', undefined, ['10', '11'], expected);
        await vi.waitFor(() => expect(updateRelation).toHaveBeenCalledTimes(1));

        const guard = vi.fn(() => { throw new Error('The current view changed'); });
        const second = taskMutationService.updateRelation('3', 'relates', undefined, ['10', '11'], expected, guard);
        await Promise.resolve();
        expect(guard).not.toHaveBeenCalled();

        releaseFirst();
        await first;
        const error = await second.then(() => undefined, failure => failure);
        expect(error).toBeInstanceOf(RelationExecutionGuardError);
        expect(error).toMatchObject({
            name: 'RelationExecutionGuardError',
            status: 'conflict',
            knownUnsent: true,
            message: 'The current view changed'
        });
        expect(guard).toHaveBeenCalledTimes(1);
        expect(updateRelation).toHaveBeenCalledTimes(1);
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
