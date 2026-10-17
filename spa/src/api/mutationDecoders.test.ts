import { describe, expect, it } from 'vitest';
import { isCompleteScheduleMutationAck, parseMutationEntity, parseMutationTaskResult, parseScheduleMutationResult } from './mutationDecoders';
import { parseDateOnly } from '../utils/dateOnly';

describe('mutation response decoders', () => {
    it('does not infer task success from HTTP 2xx or elevate HTTP failures', () => {
        expect(parseMutationTaskResult({}, { status: 200, ok: true }).status).toBe('protocol_error');
        expect(parseMutationTaskResult({ status: 'ok' }, { status: 503, ok: false }).status).toBe('transient_error');
        expect(parseScheduleMutationResult({ status: 'ok' }, { status: 503, ok: false }).status).toBe('transient_error');
    });
    it('preserves task status precedence and nullable entity field presence', () => {
        const result = parseMutationTaskResult({
            status: 'unknown_status',
            task_id: 0,
            revision: undefined,
            entity: { id: 42, lock_version: 7, start_date: undefined, due_date: null, parent_id: null }
        }, { status: 200, ok: true });

        expect(result.status).toBe('protocol_error');
        expect(result.taskId).toBeUndefined();
        expect(result.revision).toBeUndefined();
        expect(result.entity).toBeUndefined();

        expect(parseMutationTaskResult({ status: 'ok' }, { status: 409, ok: false }).status).toBe('conflict');
    });

    it('rejects unknown schedule statuses and decodes date-only adjustments', () => {
        const result = parseScheduleMutationResult({
            status: 'unknown_status',
            operation_id: 'schedule:1',
            entities: [{ id: 42, start_date: '2027-01-08' }],
            revisions: { 42: 4, 43: '5' },
            adjustments: [
                { task_id: 42, before_start_date: '2027-01-06', before_due_date: null,
                    start_date: '2027-01-08', due_date: null },
                { task_id: 'invalid', start_date: 'bad-date', due_date: '2027-01-09' },
                { task_id: 'missing-date', start_date: '2027-01-09' }
            ],
            resolution_context: {
                token: 'token', task_ids: [42],
                relations: [{ id: 9, from: 42, to: 43, type: 'precedes' }]
            }
        }, { status: 200, ok: true });

        expect(result.status).toBe('protocol_error');
        expect(result.revisions).toEqual({ 42: 4 });
        expect(result.entities[0]?.startDate).toBe(parseDateOnly('2027-01-08'));
        expect(result.adjustments).toEqual([{
            taskId: '42', beforeStartDate: parseDateOnly('2027-01-06'), beforeDueDate: null,
            startDate: parseDateOnly('2027-01-08'), dueDate: null
        }, {
            taskId: 'invalid', beforeStartDate: undefined, beforeDueDate: undefined,
            startDate: null, dueDate: parseDateOnly('2027-01-09')
        }]);
        expect(result.resolutionContext).toEqual({ token: 'token', taskIds: ['42'], relations: [
            { id: '9', from: '42', to: '43', type: 'precedes', delay: 0 }
        ] });
        expect(parseScheduleMutationResult({}, { status: 409, ok: false }).status).toBe('conflict');
        expect(parseScheduleMutationResult({}, { status: 200, ok: true }).status).toBe('protocol_error');
        expect(parseScheduleMutationResult({ status: 'new_status' }, { status: 200, ok: true }).status).toBe('protocol_error');
        expect(parseScheduleMutationResult({ status: 'ok', entities: [{ id: 42, due_date: 'bad-date' }] },
            { status: 200, ok: true }).status).toBe('protocol_error');
    });

    it('requires a non-null entity id and string date values', () => {
        expect(parseMutationEntity({ id: null, start_date: '2027-01-01' })).toBeUndefined();
        const entity = parseMutationEntity({ id: '1', start_date: 'bad-date', due_date: '2027-01-01' });
        expect(entity).toHaveProperty('startDate', undefined);
        expect(entity?.dueDate).toBe(parseDateOnly('2027-01-01'));
    });

    it('rejects invalid dates in a successful canonical task acknowledgement', () => {
        for (const field of ['start_date', 'due_date']) {
            const result = parseMutationTaskResult({ status: 'ok', entity: { id: '1', [field]: 'bad-date' }, revision: 99 },
                { status: 200, ok: true });
            expect(result.status).toBe('protocol_error');
            expect(result.entity).toBeUndefined();
            expect(result.revision).toBeUndefined();
        }
        expect(parseMutationTaskResult({ status: 'ok', entity: { id: '1', start_date: null, due_date: '2027-01-01' } },
            { status: 200, ok: true }).status).toBe('ok');
    });

    it.each([
        ['missing entity', { entities: [], revisions: {} }],
        ['missing owned date', { entities: [{ id: '1', lockVersion: 2 }], revisions: { '1': 2 } }],
        ['missing revision', { entities: [{ id: '1', dueDate: 2 }], revisions: {} }],
        ['mismatched revision', { entities: [{ id: '1', dueDate: 2, lockVersion: 2 }], revisions: { '1': 3 } }]
    ])('rejects schedule acknowledgement with %s', (_reason, result) => {
        expect(isCompleteScheduleMutationAck(result, [
            { taskId: '1', baseRevision: 1, fields: { due_date: 2 } }
        ])).toBe(false);
    });
});
