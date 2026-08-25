import { describe, expect, it } from 'vitest';
import {
    classifyMutationSourceDisposition,
    classifyMutationError,
    classifyMutationResult,
    classifyMutationStatus,
    decodeMutationFailure,
    type MutationStatusValue
} from './mutationOutcome';

describe('mutation failure decoding', () => {
    it.each([
        'ok',
        'error',
        'validation_error',
        'conflict',
        'forbidden',
        'not_found',
        'transient_error',
        'protocol_error'
    ] as const)('accepts the shared %s kind', (kind) => {
        expect(decodeMutationFailure({ kind })).toEqual({ kind });
    });

    it('normalizes raw and internal spellings to the same semantic failure', () => {
        const raw = decodeMutationFailure({
            kind: 'conflict',
            resource_role: 'scope',
            resource_type: 'business_calendar',
            resource_id: 42,
            remote_availability: 'needs_refresh',
            ignored: true
        });
        const normalized = decodeMutationFailure({
            kind: 'conflict',
            resourceRole: 'scope',
            resourceType: 'business_calendar',
            resourceId: '42',
            remoteAvailability: 'needs_refresh'
        });

        expect(raw).toEqual(normalized);
        expect(raw).toEqual({
            kind: 'conflict',
            resourceRole: 'scope',
            resourceType: 'business_calendar',
            resourceId: '42',
            remoteAvailability: 'needs_refresh'
        });
    });

    it.each([
        undefined,
        null,
        1,
        {},
        { kind: 'unexpected_kind' }
    ])('rejects malformed failure %s', (failure) => {
        expect(decodeMutationFailure(failure)).toBeUndefined();
    });

    it('drops invalid optional metadata without rejecting a known kind', () => {
        expect(decodeMutationFailure({
            kind: 'conflict',
            resource_role: 'unknown_role',
            resource_type: 1,
            resource_id: null,
            remote_availability: 'invalid'
        })).toEqual({ kind: 'conflict' });
    });

    it.each([
        'target',
        'reference',
        'relation',
        'scope'
    ] as const)('accepts the shared %s resource role', (resourceRole) => {
        expect(decodeMutationFailure({
            kind: 'not_found',
            resourceRole
        })).toEqual({ kind: 'not_found', resourceRole });
    });

    it.each([
        'known',
        'needs_refresh',
        'unavailable',
        'unknown'
    ] as const)('accepts the shared %s remote availability', (remoteAvailability) => {
        expect(decodeMutationFailure({
            kind: 'conflict',
            remote_availability: remoteAvailability
        })).toEqual({ kind: 'conflict', remoteAvailability });
    });

    it.each([
        { resourceId: 7, expected: '7' },
        { resourceId: 'R2', expected: 'R2' },
        { resourceId: null, expected: undefined },
        { resourceId: undefined, expected: undefined }
    ])('normalizes resource id $resourceId to $expected', ({ resourceId, expected }) => {
        expect(decodeMutationFailure({
            kind: 'conflict',
            resource_id: resourceId
        })?.resourceId).toBe(expected);
    });
});

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

    it('classifies raw results and normalized errors with the same failure semantics', () => {
        const raw = classifyMutationResult({
            status: 'conflict',
            failure: {
                kind: 'conflict',
                resource_role: 'scope',
                resource_type: 'business_calendar',
                resource_id: 2,
                remote_availability: 'needs_refresh'
            }
        });
        const normalized = classifyMutationError(Object.assign(new Error('changed'), {
            status: 'conflict',
            failure: {
                kind: 'conflict',
                resourceRole: 'scope',
                resourceType: 'business_calendar',
                resourceId: '2',
                remoteAvailability: 'needs_refresh'
            }
        }));

        expect(normalized.failure).toEqual(raw.failure);
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
