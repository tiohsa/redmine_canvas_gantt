import { describe, expect, it } from 'vitest';
import {
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

    it('treats an unknown non-mutation result as successful queue work', () => {
        expect(classifyMutationResult({ value: 1 })).toEqual({ kind: 'success' });
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
