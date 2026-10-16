import { describe, expect, it } from 'vitest';
import { parseMutationEntity, parseMutationTaskResult, parseScheduleMutationResult } from './mutationDecoders';
import { parseDateOnly } from '../utils/dateOnly';

describe('mutation response decoders', () => {
    it('preserves task status precedence and nullable entity field presence', () => {
        const result = parseMutationTaskResult({
            status: 'unknown_status',
            task_id: 0,
            revision: undefined,
            entity: { id: 42, lock_version: 7, start_date: undefined, due_date: null, parent_id: null }
        }, { status: 200, ok: true });

        expect(result.status).toBe('protocol_error');
        expect(result.taskId).toBe('42');
        expect(result.revision).toBe(7);
        expect(result.entity).toHaveProperty('startDate', undefined);
        expect(result.entity).toHaveProperty('dueDate', undefined);
        expect(result.entity).toHaveProperty('parentId', undefined);
        expect(result.entity).not.toHaveProperty('projectId');

        expect(parseMutationTaskResult({ status: 'ok' }, { status: 409, ok: false }).status).toBe('conflict');
    });

    it('keeps schedule fallback status behavior and date-only adjustment decoding', () => {
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

        expect(result.status).toBe('ok');
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
    });

    it('requires a non-null entity id and string date values', () => {
        expect(parseMutationEntity({ id: null, start_date: '2027-01-01' })).toBeUndefined();
        const entity = parseMutationEntity({ id: '1', start_date: 'bad-date', due_date: '2027-01-01' });
        expect(entity).toHaveProperty('startDate', undefined);
        expect(entity?.dueDate).toBe(parseDateOnly('2027-01-01'));
    });
});
