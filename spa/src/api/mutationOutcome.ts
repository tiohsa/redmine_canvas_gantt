export type MutationStatusValue = 'ok' | 'error' | 'validation_error' | 'conflict' | 'forbidden' | 'not_found' | 'transient_error' | 'protocol_error';

export type MutationOutcomeKind = 'success' | 'transient' | 'conflict' | 'terminal';

export type MutationFailureResourceRole = 'target' | 'reference' | 'relation' | 'scope';
export type MutationRemoteAvailability = 'known' | 'needs_refresh' | 'unavailable' | 'unknown';
export type MutationFailure = {
    kind: MutationStatusValue | 'error';
    resourceRole?: MutationFailureResourceRole;
    resourceType?: string;
    resourceId?: string;
    remoteAvailability?: MutationRemoteAvailability;
};

export type MutationSourceDisposition = 'target_missing' | 'reference_missing' | 'source_preserved' | 'not_applicable';

export type MutationOutcome = {
    kind: MutationOutcomeKind;
    status?: MutationStatusValue | 'error' | 'protocol_error';
    message?: string;
    failure?: MutationFailure;
};

const isMutationStatus = (value: string): value is MutationStatusValue | 'error' => (
    ['ok', 'error', 'validation_error', 'conflict', 'forbidden', 'not_found', 'transient_error', 'protocol_error'].includes(value)
);

const parseMutationFailure = (value: unknown): MutationFailure | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (typeof kind !== 'string' || !isMutationStatus(kind)) return undefined;
    const role = record.resource_role ?? record.resourceRole;
    const resourceType = record.resource_type ?? record.resourceType;
    const resourceId = record.resource_id ?? record.resourceId;
    const remoteAvailability = record.remote_availability ?? record.remoteAvailability;
    return {
        kind,
        ...(role === 'target' || role === 'reference' || role === 'relation' || role === 'scope'
            ? { resourceRole: role }
            : {}),
        ...(typeof resourceType === 'string'
            ? { resourceType }
            : {}),
        ...(resourceId !== undefined && resourceId !== null
            ? { resourceId: String(resourceId) }
            : {}),
        ...(remoteAvailability === 'known' || remoteAvailability === 'needs_refresh' || remoteAvailability === 'unavailable' || remoteAvailability === 'unknown'
            ? { remoteAvailability }
            : {})
    };
};

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
    const failure = parseMutationFailure(record.failure);
    const failCount = (value as { failCount?: unknown }).failCount;
    const baselineMissing = Object.prototype.hasOwnProperty.call(record, 'baseline') && record.baseline === null;
    if (status === 'ok' && ((typeof failCount === 'number' && failCount > 0) || baselineMissing)) {
        return {
            kind: 'terminal',
            status,
            message: typeof message === 'string' ? message : undefined,
            failure
        };
    }
    return {
        kind: classifyMutationStatus(status),
        status,
        message: typeof message === 'string' ? message : undefined,
        failure
    };
};

export const classifyMutationError = (error: unknown): MutationOutcome => {
    const status = error && typeof error === 'object'
        ? (error as { status?: unknown }).status
        : undefined;
    const failure = parseMutationFailure(error && typeof error === 'object'
        ? (error as { failure?: unknown }).failure
        : undefined);
    if (typeof status === 'string' && isMutationStatus(status) && status !== 'ok') {
        return {
            kind: classifyMutationStatus(status),
            status,
            message: error instanceof Error ? error.message : undefined,
            failure
        };
    }

    return {
        kind: 'transient',
        status: 'error',
        message: error instanceof Error ? error.message : undefined,
        failure
    };
};

export const classifyMutationSourceDisposition = (value: unknown): MutationSourceDisposition => {
    const outcome = classifyMutationResult(value);
    if (outcome.status !== 'not_found') return 'not_applicable';

    const role = outcome.failure?.resourceRole;
    if (role === 'reference') return 'reference_missing';
    if (role === 'target' || role === undefined) {
        if (outcome.failure?.resourceType === undefined || outcome.failure.resourceType === 'task') {
            return 'target_missing';
        }
    }
    return 'source_preserved';
};

export const isTargetTaskNotFound = (value: unknown): boolean => {
    return classifyMutationSourceDisposition(value) === 'target_missing';
};
