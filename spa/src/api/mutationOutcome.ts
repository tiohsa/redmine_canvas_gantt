export type MutationStatusValue = 'ok' | 'error' | 'validation_error' | 'conflict' | 'forbidden' | 'not_found' | 'transient_error' | 'protocol_error';

export type MutationOutcomeKind = 'success' | 'transient' | 'conflict' | 'terminal';

export type MutationOutcome = {
    kind: MutationOutcomeKind;
    status?: MutationStatusValue | 'error' | 'protocol_error';
    message?: string;
};

const isMutationStatus = (value: string): value is MutationStatusValue | 'error' => (
    ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error', 'protocol_error'].includes(value)
);

/**
 * Map all mutation status spellings to the policy understood by callers.
 * `error` is retained as a legacy transport/server spelling and therefore
 * has the same transient meaning as `transient_error`.
 */
export const classifyMutationStatus = (status: MutationStatusValue | 'error'): MutationOutcomeKind => {
    if (status === 'ok') return 'success';
    if (status === 'transient_error' || status === 'error') return 'transient';
    if (status === 'conflict') return 'conflict';
    if (status === 'protocol_error') return 'terminal';
    return 'terminal';
};

export const classifyMutationResult = (value: unknown): MutationOutcome => {
    if (!value || typeof value !== 'object') return { kind: 'terminal', status: 'protocol_error' };
    const record = value as Record<string, unknown>;
    const status = (value as { status?: unknown }).status;
    if (typeof status !== 'string' || !isMutationStatus(status)) return { kind: 'terminal', status: 'protocol_error' };
    const message = (value as { error?: unknown }).error;
    const failCount = (value as { failCount?: unknown }).failCount;
    const baselineMissing = Object.prototype.hasOwnProperty.call(record, 'baseline') && record.baseline === null;
    if (status === 'ok' && ((typeof failCount === 'number' && failCount > 0) || baselineMissing)) {
        return {
            kind: 'terminal',
            status,
            message: typeof message === 'string' ? message : undefined
        };
    }
    return {
        kind: classifyMutationStatus(status),
        status,
        message: typeof message === 'string' ? message : undefined
    };
};

export const classifyMutationError = (error: unknown): MutationOutcome => {
    const status = error && typeof error === 'object'
        ? (error as { status?: unknown }).status
        : undefined;
    if (typeof status === 'string' && isMutationStatus(status) && status !== 'ok') {
        return {
            kind: classifyMutationStatus(status),
            status,
            message: error instanceof Error ? error.message : undefined
        };
    }

    return {
        kind: 'transient',
        status: 'error',
        message: error instanceof Error ? error.message : undefined
    };
};
