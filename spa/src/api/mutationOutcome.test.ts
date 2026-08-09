import { describe, expect, it } from 'vitest';
import {
    classifyMutationSourceDisposition,
    classifyMutationError,
    classifyMutationResult,
    classifyMutationStatus,
    type MutationStatusValue
} from './mutationOutcome';

describe('mutation outcome classification', () => {
    it.each([
        ['ok', 'success'],
        ['error', 'transient'],
        ['transient_error', 'transient'],
        ['conflict', 'conflict'],
        ['validation_error', 'terminal'],
        ['forbidden', 'terminal'],
        ['not_found', 'terminal']
    ] as const)('maps %s status to the shared %s outcome', (status, expected) => {
        expect(classifyMutationStatus(status)).toBe(expected);
    });

    it('preserves result status and error message for lifecycle records', () => {
        expect(classifyMutationResult({ status: 'conflict', error: 'stale task' })).toEqual({
            kind: 'conflict',
            status: 'conflict',
            message: 'stale task'
        });
    });

    it('preserves semantic target/reference failure metadata', () => {
        expect(classifyMutationResult({
            status: 'not_found',
            error: 'Parent task not found',
            failure: {
                kind: 'not_found',
                resource_role: 'reference',
                resource_type: 'parent_task'
            }
        })).toMatchObject({
            kind: 'terminal',
            status: 'not_found',
            failure: {
                kind: 'not_found',
                resourceRole: 'reference',
                resourceType: 'parent_task'
            }
        });
    });

    it.each([
        { label: 'legacy role-less task', response: { status: 'not_found' }, expected: 'target_missing' },
        { label: 'target task', response: { status: 'not_found', failure: { kind: 'not_found', resource_role: 'target', resource_type: 'task' } }, expected: 'target_missing' },
        { label: 'reference', response: { status: 'not_found', failure: { kind: 'not_found', resource_role: 'reference', resource_type: 'parent_task' } }, expected: 'reference_missing' },
        { label: 'relation', response: { status: 'not_found', failure: { kind: 'not_found', resource_role: 'relation', resource_type: 'relation' } }, expected: 'source_preserved' },
        { label: 'scope', response: { status: 'not_found', failure: { kind: 'not_found', resource_role: 'scope', resource_type: 'task' } }, expected: 'source_preserved' }
    ] as const)('classifies $label source disposition without relying on HTTP status alone', ({ response, expected }) => {
        expect(classifyMutationSourceDisposition(response)).toBe(expected);
    });

    it('accepts normalized camelCase failure metadata from the API client', () => {
        expect(classifyMutationSourceDisposition({
            status: 'not_found',
            failure: { kind: 'not_found', resourceRole: 'reference', resourceType: 'parent_task' }
        })).toBe('reference_missing');
    });

    it('treats resolved mutation results with failed rows as terminal domain failures', () => {
        expect(classifyMutationResult({
            status: 'ok',
            successCount: 0,
            failCount: 2,
            results: [
                { status: 'error', subject: 'A', errors: ['blank'] },
                { status: 'error', subject: 'B', errors: ['rolled back'] }
            ]
        })).toEqual({
            kind: 'terminal',
            status: 'ok'
        });
    });

    it('treats a resolved baseline save without a snapshot as a terminal domain failure', () => {
        expect(classifyMutationResult({
            status: 'ok',
            baseline: null
        })).toEqual({
            kind: 'terminal',
            status: 'ok'
        });
    });

    it.each([
        undefined,
        null,
        1,
        { value: 1 },
        { status: 'surprise' }
    ])('treats malformed mutation result %s as a protocol error', (value) => {
        expect(classifyMutationResult(value)).toEqual({
            kind: 'terminal',
            status: 'protocol_error'
        });
    });

    it('classifies typed mutation errors without losing their message', () => {
        const error = Object.assign(new Error('permission denied'), {
            status: 'forbidden' as MutationStatusValue
        });

        expect(classifyMutationError(error)).toEqual({
            kind: 'terminal',
            status: 'forbidden',
            message: 'permission denied'
        });
    });

    it('classifies ordinary transport errors as transient', () => {
        expect(classifyMutationError(new Error('network down'))).toEqual({
            kind: 'transient',
            status: 'error',
            message: 'network down'
        });
    });
});
