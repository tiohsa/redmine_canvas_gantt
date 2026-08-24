/**
 * Shared state-lifecycle primitives.  The Store may expose compatibility
 * arrays, but freshness, revisions, patches, and operation ownership live in
 * these explicit contracts.
 */

export type ReadPurpose = 'initial_load' | 'refresh' | 'saved_query' | 'mutation_resync' | 'edit_meta' | 'saved_queries' | 'subtask_trackers';

export type ReadContext = {
    contextId: string;
    generation: number;
    projectId: string | null;
    queryIdentity: string;
    scopeIdentity: string;
    scope: unknown;
    purpose: ReadPurpose;
    startedAt: number;
    mergePolicy: 'preserve_dirty' | 'replace' | 'merge';
};

export type ReadApplyOutcome =
    | { status: 'applied'; context: ReadContext }
    | { status: 'superseded'; context: ReadContext };

export type ServerSnapshot<T extends { id: string }> = {
    entitiesById: Record<string, T>;
    revisions: Record<string, number>;
    context: ReadContext | null;
};

export type LocalPatch<T extends { id: string }> = {
    entityId: string;
    projection: Partial<T>;
    mutationIntent: Partial<T>;
    generation: number;
    operationId: string;
};

export const hasLocalPatchOwnership = <T extends { id: string }>(
    patches: Array<LocalPatch<T>> | undefined,
    taskId: string,
    generation: number,
    operationId?: string
): boolean => (patches ?? []).some((patch) => (
    patch.entityId === taskId &&
    patch.generation === generation &&
    (operationId === undefined || patch.operationId === operationId)
));

export const hasMutationIntent = <T extends { id: string }>(patch: LocalPatch<T>): boolean => (
    Object.keys(patch.mutationIntent).length > 0
);

export const hasLocalMutationIntent = <T extends { id: string }>(patches: Array<LocalPatch<T>> | undefined): boolean => (
    (patches ?? []).some(hasMutationIntent)
);

export type EntityTombstone = {
    entityId: string;
    deletedAt: number;
    source: 'server' | 'local';
    operationId?: string;
};

export type ResponseCompleteness = 'complete' | 'partial';

export type MutationResult<T extends { id: string }> = {
    status: 'ok' | 'validation_error' | 'conflict' | 'forbidden' | 'not_found' | 'transient_error';
    entity?: T;
    completeness?: ResponseCompleteness;
    revision?: number;
    invalidatedEntityIds?: string[];
    errors?: Record<string, string>;
};

export type MutationOperation<T extends { id: string }> = {
    operationId: string;
    operationType: string;
    contextId: string;
    generation: number;
    entityIds: string[];
    patches: Array<LocalPatch<T>>;
    rollbackPatch: Array<LocalPatch<T>>;
    retryCount: number;
    startedAt: number;
    status: 'pending' | 'succeeded' | 'failed' | 'conflict' | 'cancelled';
};

export type DerivedInvalidation = 'none' | 'layout' | 'schedule' | 'critical_path';

const stableIdentity = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableIdentity).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableIdentity((value as Record<string, unknown>)[key])}`).join(',')}}`;
};

export const createReadContext = (input: {
    generation: number;
    projectId: string | null;
    query: unknown;
    scope: unknown;
    purpose: ReadPurpose;
    mergePolicy?: ReadContext['mergePolicy'];
    startedAt?: number;
}): ReadContext => {
    const queryIdentity = stableIdentity(input.query);
    const scopeIdentity = stableIdentity(input.scope);
    return {
        contextId: `${input.generation}:${input.purpose}:${input.projectId ?? 'global'}:${queryIdentity}:${scopeIdentity}`,
        generation: input.generation,
        projectId: input.projectId,
        queryIdentity,
        scopeIdentity,
        scope: input.scope,
        purpose: input.purpose,
        startedAt: input.startedAt ?? Date.now(),
        mergePolicy: input.mergePolicy ?? 'preserve_dirty'
    };
};

export const canApplyReadResponse = (active: ReadContext | null, response: ReadContext): boolean => (
    active !== null &&
    response.contextId === active.contextId &&
    response.generation === active.generation &&
    response.projectId === active.projectId &&
    response.queryIdentity === active.queryIdentity &&
    response.scopeIdentity === active.scopeIdentity
);

export const createServerSnapshot = <T extends { id: string }>(entities: T[], context: ReadContext | null = null): ServerSnapshot<T> => ({
    entitiesById: Object.fromEntries(entities.map(entity => [entity.id, entity])),
    revisions: Object.fromEntries(entities.map(entity => [entity.id, revisionOf(entity)])),
    context
});

export const replaceServerSnapshot = <T extends { id: string }>(
    previous: ServerSnapshot<T>,
    entities: T[],
    context: ReadContext | null = null
): ServerSnapshot<T> => {
    const entitiesById: Record<string, T> = {};
    const revisions: Record<string, number> = {};
    entities.forEach((entity) => {
        const incomingRevision = revisionOf(entity);
        const previousRevision = previous.revisions[entity.id] ?? 0;
        if (incomingRevision < previousRevision && previous.entitiesById[entity.id]) {
            entitiesById[entity.id] = previous.entitiesById[entity.id];
            revisions[entity.id] = previousRevision;
            return;
        }
        entitiesById[entity.id] = entity;
        revisions[entity.id] = Math.max(previousRevision, incomingRevision);
    });
    return { entitiesById, revisions, context };
};

const revisionOf = <T extends { id: string }>(entity: T): number => {
    const candidate = (entity as T & { lockVersion?: number }).lockVersion;
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
};

export const mergeServerEntity = <T extends { id: string }>(
    snapshot: ServerSnapshot<T>,
    entity: T,
    completeness: ResponseCompleteness = 'complete',
    revision = revisionOf(entity)
): ServerSnapshot<T> => {
    const currentRevision = snapshot.revisions[entity.id] ?? 0;
    if (revision < currentRevision) return snapshot;
    const current = snapshot.entitiesById[entity.id];
    const merged = completeness === 'partial' && current ? { ...current, ...entity } : entity;
    return {
        ...snapshot,
        entitiesById: { ...snapshot.entitiesById, [entity.id]: merged },
        revisions: { ...snapshot.revisions, [entity.id]: Math.max(currentRevision, revision) }
    };
};

export const applyLocalPatches = <T extends { id: string }>(
    entity: T,
    patches: Array<LocalPatch<T>>
): T => patches.reduce((current, patch) => ({ ...current, ...patch.projection }), entity);

export const settleLocalPatchFields = <T extends { id: string }>(
    patches: Array<LocalPatch<T>>,
    settledGeneration: number,
    settledFields: Iterable<string>
): Array<LocalPatch<T>> => {
    const settled = new Set(settledFields);
    if (settled.size === 0) return patches;

    return patches.reduce<Array<LocalPatch<T>>>((remaining, patch) => {
        if (patch.generation > settledGeneration) {
            remaining.push(patch);
            return remaining;
        }

        const mutationFields = new Set(Object.keys(patch.mutationIntent));
        const mutationIntent = Object.fromEntries(
            Object.entries(patch.mutationIntent).filter(([field]) => !settled.has(field))
        ) as Partial<T>;
        const projection = Object.fromEntries(
            Object.entries(patch.projection).filter(([field]) => (
                mutationFields.has(field) && !settled.has(field)
            ))
        ) as Partial<T>;
        if (Object.keys(projection).length > 0 || Object.keys(mutationIntent).length > 0) {
            remaining.push({ ...patch, projection, mutationIntent });
        }
        return remaining;
    }, []);
};

export const mergeSnapshotWithPatches = <T extends { id: string }>(
    snapshot: ServerSnapshot<T>,
    patches: Array<LocalPatch<T>>
): T[] => Object.values(snapshot.entitiesById).map(entity => applyLocalPatches(
    entity,
    patches.filter(patch => patch.entityId === entity.id)
));

export const commitOperationPatches = <T extends { id: string }>(
    patches: Array<LocalPatch<T>>,
    operationId: string
): Array<LocalPatch<T>> => patches.filter(patch => patch.operationId !== operationId);

export const classifyDerivedInvalidation = (fields: Iterable<string>): DerivedInvalidation => {
    const changed = new Set(fields);
    if (changed.has('startDate') || changed.has('dueDate') || changed.has('parentId') || changed.has('displayOrder')) {
        return 'critical_path';
    }
    if (changed.has('relation') || changed.has('relations')) return 'critical_path';
    if (changed.has('projectId') || changed.has('assignedToId') || changed.has('fixedVersionId')) return 'layout';
    return 'none';
};
