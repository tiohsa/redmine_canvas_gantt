import { describe, expect, it } from 'vitest';
import { classifyMutationResult } from '../../api/mutationOutcome';
import {
    applyLocalPatches,
    canApplyReadResponse,
    commitOperationPatches,
    createReadContext,
    createServerSnapshot,
    mergeServerEntity,
    replaceServerSnapshot,
    type LocalPatch,
    type ServerSnapshot
} from './stateContract';

type Entity = {
    id: string;
    subject: string;
    projectId?: string;
    trackerId?: number;
    statusId?: number;
    startDate?: number;
    dueDate?: number;
    lockVersion: number;
};

type TransitionMachine = {
    snapshot: ServerSnapshot<Entity>;
    patches: Array<LocalPatch<Entity>>;
    tombstones: Set<string>;
    conflicts: Set<string>;
    dirtyEntityIds: Set<string>;
    queuedOperationIds: Set<string>;
    retryCounts: Map<string, number>;
    completedOperationIds: Set<string>;
};

type TransitionInput = {
    operationId: string;
    entityId: string;
    response: unknown;
    rollbackTerminal?: boolean;
    remoteMatchesLocal?: boolean;
};

type CalendarRecoveryPhase =
    | 'idle'
    | 'requesting'
    | 'conflicted'
    | 'refreshing'
    | 'retrying'
    | 'settled'
    | 'superseded'
    | 'failed';

type CalendarRecoveryEvent =
    | 'request_started'
    | 'calendar_conflict'
    | 'refresh_started'
    | 'refresh_applied'
    | 'refresh_superseded'
    | 'retry_succeeded'
    | 'retry_conflicted'
    | 'became_stale';

type CalendarRecoveryMachine = {
    phase: CalendarRecoveryPhase;
    refreshCount: number;
    retryCount: number;
    authoritativeWrites: number;
    ownedContextKeys: Set<'initial' | 'effective'>;
};

const createCalendarRecoveryMachine = (): CalendarRecoveryMachine => ({
    phase: 'idle',
    refreshCount: 0,
    retryCount: 0,
    authoritativeWrites: 0,
    ownedContextKeys: new Set()
});

const applyCalendarRecoveryEvent = (
    machine: CalendarRecoveryMachine,
    event: CalendarRecoveryEvent
): CalendarRecoveryMachine => {
    const next = { ...machine, ownedContextKeys: new Set(machine.ownedContextKeys) };
    if (event === 'became_stale') {
        next.phase = 'superseded';
        next.ownedContextKeys.clear();
        return next;
    }
    if (machine.phase === 'idle' && event === 'request_started') {
        next.phase = 'requesting';
        next.ownedContextKeys.add('initial');
    } else if (machine.phase === 'requesting' && event === 'calendar_conflict') {
        next.phase = 'conflicted';
    } else if (machine.phase === 'conflicted' && event === 'refresh_started') {
        next.phase = 'refreshing';
        next.refreshCount += 1;
    } else if (machine.phase === 'refreshing' && event === 'refresh_applied') {
        next.phase = 'retrying';
        next.retryCount += 1;
        next.ownedContextKeys.add('effective');
    } else if (machine.phase === 'refreshing' && event === 'refresh_superseded') {
        next.phase = 'superseded';
        next.ownedContextKeys.clear();
    } else if (machine.phase === 'retrying' && event === 'retry_succeeded') {
        next.phase = 'settled';
        next.authoritativeWrites += 1;
        next.ownedContextKeys.clear();
    } else if (machine.phase === 'retrying' && event === 'retry_conflicted') {
        next.phase = 'failed';
        next.ownedContextKeys.clear();
    }
    return next;
};

const runCalendarRecovery = (events: CalendarRecoveryEvent[]): CalendarRecoveryMachine => (
    events.reduce(applyCalendarRecoveryEvent, createCalendarRecoveryMachine())
);

const nextRandom = (seed: number): [number, number] => {
    const next = (seed * 1664525 + 1013904223) >>> 0;
    return [next, next / 0x1_0000_0000];
};

const createMachine = (): TransitionMachine => ({
    snapshot: createServerSnapshot<Entity>([
        { id: '1', subject: 'initial', startDate: 1, dueDate: 2, lockVersion: 1 }
    ]),
    patches: [],
    tombstones: new Set(),
    conflicts: new Set(),
    dirtyEntityIds: new Set(),
    queuedOperationIds: new Set(),
    retryCounts: new Map(),
    completedOperationIds: new Set()
});

const beginLocalChange = (
    machine: TransitionMachine,
    operationId: string,
    projection: Partial<Entity>,
    mutationIntent: Partial<Entity> = projection
) => {
    machine.patches.push({
        entityId: '1',
        projection,
        mutationIntent,
        generation: Number(operationId.replace(/\D/g, '')) || 1,
        operationId
    });
    if (Object.keys(mutationIntent).length > 0) machine.dirtyEntityIds.add('1');
    machine.queuedOperationIds.add(operationId);
};

const beginLocalEdit = (machine: TransitionMachine, operationId: string, fields: Partial<Entity>) => {
    beginLocalChange(machine, operationId, fields);
};

const syncDirtyFromPatches = (machine: TransitionMachine, entityId: string) => {
    if (machine.patches.some((patch) => (
        patch.entityId === entityId && Object.keys(patch.mutationIntent).length > 0
    ))) {
        machine.dirtyEntityIds.add(entityId);
    } else {
        machine.dirtyEntityIds.delete(entityId);
    }
};

const removeEntityFromSnapshot = (snapshot: ServerSnapshot<Entity>, entityId: string): ServerSnapshot<Entity> => {
    const entitiesById = { ...snapshot.entitiesById };
    const revisions = { ...snapshot.revisions };
    delete entitiesById[entityId];
    delete revisions[entityId];
    return { ...snapshot, entitiesById, revisions };
};

const applyMutationTransition = (machine: TransitionMachine, input: TransitionInput) => {
    const { entityId, operationId } = input;
    const outcome = classifyMutationResult(input.response);
    machine.queuedOperationIds.delete(operationId);

    if (outcome.kind === 'success') {
        machine.patches = commitOperationPatches(machine.patches, operationId);
        const entity = (input.response as { entity?: Entity }).entity;
        if (entity) machine.snapshot = mergeServerEntity(machine.snapshot, entity, 'complete', entity.lockVersion);
        machine.conflicts.delete(entityId);
        machine.completedOperationIds.add(operationId);
    } else if (outcome.kind === 'conflict') {
        const local = applyLocalPatches(machine.snapshot.entitiesById[entityId], machine.patches);
        const remote = input.remoteMatchesLocal ? { ...local, lockVersion: local.lockVersion + 1 } : undefined;
        if (remote) {
            machine.patches = commitOperationPatches(machine.patches, operationId);
            machine.snapshot = mergeServerEntity(machine.snapshot, remote, 'complete', remote.lockVersion);
            machine.completedOperationIds.add(operationId);
            machine.conflicts.delete(entityId);
        } else {
            machine.conflicts.add(entityId);
        }
    } else if (outcome.kind === 'transient') {
        const retries = machine.retryCounts.get(operationId) ?? 0;
        machine.retryCounts.set(operationId, Math.min(1, retries + 1));
        if (retries < 1) machine.queuedOperationIds.add(operationId);
    } else if (outcome.status === 'not_found') {
        const resourceRole = outcome.failure?.resourceRole;
        if (resourceRole === undefined || resourceRole === 'target') {
            machine.patches = machine.patches.filter((patch) => patch.entityId !== entityId);
            machine.snapshot = removeEntityFromSnapshot(machine.snapshot, entityId);
            machine.tombstones.add(entityId);
            machine.conflicts.delete(entityId);
        }
    } else if (input.rollbackTerminal) {
        machine.patches = commitOperationPatches(machine.patches, operationId);
        machine.conflicts.delete(entityId);
    }

    syncDirtyFromPatches(machine, entityId);
};

describe('state lifecycle reference model', () => {
    it.each([
        {
            label: 'authoritative refresh and successful retry',
            events: ['request_started', 'calendar_conflict', 'refresh_started', 'refresh_applied', 'retry_succeeded'],
            expectedPhase: 'settled',
            expectedWrites: 1
        },
        {
            label: 'superseded refresh',
            events: ['request_started', 'calendar_conflict', 'refresh_started', 'refresh_superseded', 'refresh_applied', 'retry_succeeded'],
            expectedPhase: 'superseded',
            expectedWrites: 0
        },
        {
            label: 'second calendar conflict',
            events: ['request_started', 'calendar_conflict', 'refresh_started', 'refresh_applied', 'retry_conflicted', 'refresh_started'],
            expectedPhase: 'failed',
            expectedWrites: 0
        },
        {
            label: 'stale operation during retry',
            events: ['request_started', 'calendar_conflict', 'refresh_started', 'refresh_applied', 'became_stale', 'retry_succeeded'],
            expectedPhase: 'superseded',
            expectedWrites: 0
        }
    ] as const)('keeps read/recovery invariants for $label', ({ events, expectedPhase, expectedWrites }) => {
        const machine = runCalendarRecovery([...events]);

        expect(machine.phase).toBe(expectedPhase);
        expect(machine.refreshCount).toBeLessThanOrEqual(1);
        expect(machine.retryCount).toBeLessThanOrEqual(1);
        expect(machine.authoritativeWrites).toBe(expectedWrites);
        expect(machine.ownedContextKeys.size).toBe(0);
    });

    it('owns at most the initial and effective keys while retrying', () => {
        const retrying = runCalendarRecovery([
            'request_started',
            'calendar_conflict',
            'refresh_started',
            'refresh_applied'
        ]);

        expect(retrying.phase).toBe('retrying');
        expect([...retrying.ownedContextKeys]).toEqual(['initial', 'effective']);
        expect(retrying.ownedContextKeys.size).toBeLessThanOrEqual(2);
    });

    it('does not let an old operation cleanup remove a key re-owned by a newer operation', () => {
        const registry = new Map<'initial' | 'effective', 'old' | 'new'>([
            ['initial', 'old'],
            ['effective', 'old']
        ]);
        const oldOwnedKeys = new Set<'initial' | 'effective'>(['initial', 'effective']);
        registry.set('effective', 'new');

        oldOwnedKeys.forEach((key) => {
            if (registry.get(key) === 'old') registry.delete(key);
        });

        expect(registry).toEqual(new Map([['effective', 'new']]));
    });

    it('preserves projection and persistence intent through the specified draft/save/conflict lifecycle', () => {
        const machine = createMachine();

        beginLocalChange(
            machine,
            'operation-1',
            { projectId: '2', trackerId: 7, statusId: 4 },
            { projectId: '2' }
        );
        beginLocalChange(
            machine,
            'operation-2',
            { trackerId: 8, statusId: 5 },
            { trackerId: 8 }
        );
        beginLocalChange(
            machine,
            'operation-3',
            { statusId: 6 },
            { statusId: 6 }
        );

        expect(applyLocalPatches(machine.snapshot.entitiesById['1'], machine.patches)).toMatchObject({
            projectId: '2',
            trackerId: 8,
            statusId: 6
        });
        const manualSaveIntent = machine.patches.reduce<Partial<Entity>>(
            (intent, patch) => ({ ...intent, ...patch.mutationIntent }),
            {}
        );
        expect(manualSaveIntent).toEqual({ projectId: '2', trackerId: 8, statusId: 6 });

        machine.conflicts.add('1');
        expect(machine.patches).toHaveLength(3);
        const retryIntent = machine.patches.reduce<Partial<Entity>>(
            (intent, patch) => ({ ...intent, ...patch.mutationIntent }),
            {}
        );
        expect(retryIntent).toEqual(manualSaveIntent);

        const remote = {
            ...machine.snapshot.entitiesById['1'],
            ...retryIntent,
            subject: 'remote canonical',
            lockVersion: 2
        };
        machine.snapshot = mergeServerEntity(machine.snapshot, remote, 'complete', remote.lockVersion);
        machine.patches = machine.patches.filter((patch) => patch.generation > 3);
        machine.conflicts.delete('1');
        syncDirtyFromPatches(machine, '1');
        expect(machine.dirtyEntityIds.has('1')).toBe(false);

        beginLocalEdit(machine, 'operation-4', { subject: 'later local edit' });
        expect(applyLocalPatches(machine.snapshot.entitiesById['1'], machine.patches).subject).toBe('later local edit');
        machine.patches = commitOperationPatches(machine.patches, 'operation-4');
        syncDirtyFromPatches(machine, '1');

        expect(applyLocalPatches(machine.snapshot.entitiesById['1'], machine.patches)).toEqual(remote);
        expect(machine.dirtyEntityIds.has('1')).toBe(false);
        expect(machine.conflicts.has('1')).toBe(false);
    });

    it('walks the context-changing lifecycle from Load through conflict retry and a later edit', () => {
        const machine = createMachine();
        const loadedTask = {
            id: '1',
            subject: 'initial',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            lockVersion: 1
        } satisfies Entity;
        machine.snapshot = createServerSnapshot([loadedTask]);

        let capabilityContext = {
            taskId: '1',
            projectId: 1,
            trackerId: 1,
            statusId: 1
        };
        let latestGeneration = 0;

        const expectLifecycleState = (expected: {
            snapshot: Partial<Entity>;
            projection: Partial<Entity>;
            intent: Partial<Entity>;
            capability: typeof capabilityContext;
            generation: number;
            dirty: boolean;
        }) => {
            const snapshotTask = machine.snapshot.entitiesById['1'];
            const projection = applyLocalPatches(snapshotTask, machine.patches);
            const intent = machine.patches.reduce<Partial<Entity>>(
                (fields, patch) => ({ ...fields, ...patch.mutationIntent }),
                {}
            );

            expect(snapshotTask).toMatchObject(expected.snapshot);
            expect(projection).toMatchObject(expected.projection);
            expect(intent).toEqual(expected.intent);
            expect(capabilityContext).toEqual(expected.capability);
            expect(latestGeneration).toBe(expected.generation);
            expect(machine.dirtyEntityIds.has('1')).toBe(expected.dirty);
        };

        // Load
        expectLifecycleState({
            snapshot: loadedTask,
            projection: loadedTask,
            intent: {},
            capability: capabilityContext,
            generation: 0,
            dirty: false
        });

        // Project Preview: the fallback Tracker/Status is projection-only.
        beginLocalChange(
            machine,
            'operation-1',
            { projectId: '2', trackerId: 7, statusId: 2 },
            { projectId: '2' }
        );
        latestGeneration = 1;
        capabilityContext = { taskId: '1', projectId: 2, trackerId: 7, statusId: 2 };
        expectLifecycleState({
            snapshot: loadedTask,
            projection: { projectId: '2', trackerId: 7, statusId: 2 },
            intent: { projectId: '2' },
            capability: capabilityContext,
            generation: 1,
            dirty: true
        });

        // Tracker Preview: a second server materialization remains projection-only.
        beginLocalChange(
            machine,
            'operation-2',
            { trackerId: 8, statusId: 3 },
            { trackerId: 8 }
        );
        latestGeneration = 2;
        capabilityContext = { taskId: '1', projectId: 2, trackerId: 8, statusId: 3 };
        expectLifecycleState({
            snapshot: loadedTask,
            projection: { projectId: '2', trackerId: 8, statusId: 3 },
            intent: { projectId: '2', trackerId: 8 },
            capability: capabilityContext,
            generation: 2,
            dirty: true
        });

        // Explicit Status edit is the only new intent in this generation.
        beginLocalChange(machine, 'operation-3', { statusId: 4 }, { statusId: 4 });
        latestGeneration = 3;
        capabilityContext = { taskId: '1', projectId: 2, trackerId: 8, statusId: 4 };
        expectLifecycleState({
            snapshot: loadedTask,
            projection: { projectId: '2', trackerId: 8, statusId: 4 },
            intent: { projectId: '2', trackerId: 8, statusId: 4 },
            capability: capabilityContext,
            generation: 3,
            dirty: true
        });

        // Manual Save owns all three generations but serializes explicit intent only.
        const manualSaveOperationId = 'manual-save';
        machine.patches = machine.patches.map(patch => ({ ...patch, operationId: manualSaveOperationId }));
        machine.queuedOperationIds.add(manualSaveOperationId);
        const manualSavePayload = machine.patches.reduce<Partial<Entity>>(
            (fields, patch) => ({ ...fields, ...patch.mutationIntent }),
            {}
        );
        expect(manualSavePayload).toEqual({ projectId: '2', trackerId: 8, statusId: 4 });
        expectLifecycleState({
            snapshot: loadedTask,
            projection: { projectId: '2', trackerId: 8, statusId: 4 },
            intent: manualSavePayload,
            capability: capabilityContext,
            generation: 3,
            dirty: true
        });

        // Conflict keeps the projection, intent, generation, and dirty ownership.
        applyMutationTransition(machine, {
            entityId: '1',
            operationId: manualSaveOperationId,
            response: { status: 'conflict', error: 'stale revision' }
        });
        expect(machine.conflicts.has('1')).toBe(true);
        expectLifecycleState({
            snapshot: loadedTask,
            projection: { projectId: '2', trackerId: 8, statusId: 4 },
            intent: manualSavePayload,
            capability: capabilityContext,
            generation: 3,
            dirty: true
        });

        // Keep Local adopts the fresh remote canonical baseline before retrying.
        const remoteCanonical = { ...loadedTask, subject: 'remote canonical', lockVersion: 2 };
        machine.snapshot = mergeServerEntity(machine.snapshot, remoteCanonical, 'complete', remoteCanonical.lockVersion);
        machine.conflicts.delete('1');
        const retryOperationId = 'manual-save-retry';
        machine.patches = machine.patches.map(patch => ({ ...patch, operationId: retryOperationId }));
        machine.queuedOperationIds.add(retryOperationId);
        expectLifecycleState({
            snapshot: remoteCanonical,
            projection: { subject: 'remote canonical', projectId: '2', trackerId: 8, statusId: 4 },
            intent: manualSavePayload,
            capability: capabilityContext,
            generation: 3,
            dirty: true
        });

        // Remote canonical success settles all owned generations.
        applyMutationTransition(machine, {
            entityId: '1',
            operationId: retryOperationId,
            response: {
                status: 'ok',
                entity: {
                    ...remoteCanonical,
                    ...manualSavePayload,
                    lockVersion: 3
                }
            }
        });
        expectLifecycleState({
            snapshot: { subject: 'remote canonical', projectId: '2', trackerId: 8, statusId: 4, lockVersion: 3 },
            projection: { subject: 'remote canonical', projectId: '2', trackerId: 8, statusId: 4 },
            intent: {},
            capability: capabilityContext,
            generation: 3,
            dirty: false
        });

        // A later edit starts a new generation on top of the remote canonical state.
        beginLocalEdit(machine, 'operation-4', { subject: 'later local edit' });
        latestGeneration = 4;
        expectLifecycleState({
            snapshot: { subject: 'remote canonical', projectId: '2', trackerId: 8, statusId: 4, lockVersion: 3 },
            projection: { subject: 'later local edit', projectId: '2', trackerId: 8, statusId: 4 },
            intent: { subject: 'later local edit' },
            capability: capabilityContext,
            generation: 4,
            dirty: true
        });
    });

    it('does not infer dirty ownership from a projection-only local change', () => {
        const machine = createMachine();

        beginLocalChange(machine, 'operation-1', { statusId: 4 }, {});
        syncDirtyFromPatches(machine, '1');

        expect(machine.patches).toHaveLength(1);
        expect(applyLocalPatches(machine.snapshot.entitiesById['1'], machine.patches).statusId).toBe(4);
        expect(machine.dirtyEntityIds.has('1')).toBe(false);
    });

    it.each([
        {
            label: 'ok',
            response: { status: 'ok', entity: { id: '1', subject: 'server', startDate: 3, dueDate: 4, lockVersion: 2 } },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: { committed: true, rollback: false, tombstone: false, conflict: false, retry: false, dirty: false }
        },
        {
            label: 'validation',
            response: { status: 'validation_error', error: 'invalid' },
            rollbackTerminal: true,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: true, tombstone: false, conflict: false, retry: false, dirty: false }
        },
        {
            label: 'forbidden',
            response: { status: 'forbidden', error: 'not allowed' },
            rollbackTerminal: true,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: true, tombstone: false, conflict: false, retry: false, dirty: false }
        },
        {
            label: 'legacy not_found',
            response: { status: 'not_found', error: 'gone' },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: false, tombstone: true, conflict: false, retry: false, dirty: false }
        },
        ...(['target', 'reference', 'relation', 'scope'] as const).map((resourceRole) => ({
            label: `not_found ${resourceRole}`,
            response: { status: 'not_found', error: 'gone', failure: { kind: 'not_found', resource_role: resourceRole } },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: {
                committed: false,
                rollback: false,
                tombstone: resourceRole === 'target',
                conflict: false,
                retry: false,
                dirty: resourceRole !== 'target'
            }
        })),
        {
            label: 'conflict same',
            response: { status: 'conflict', error: 'stale' },
            rollbackTerminal: false,
            remoteMatchesLocal: true,
            expected: { committed: true, rollback: false, tombstone: false, conflict: false, retry: false, dirty: false }
        },
        {
            label: 'conflict different',
            response: { status: 'conflict', error: 'stale' },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: false, tombstone: false, conflict: true, retry: false, dirty: true }
        },
        {
            label: 'transient',
            response: { status: 'transient_error', error: 'temporary' },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: false, tombstone: false, conflict: false, retry: true, dirty: true }
        },
        {
            label: 'protocol error',
            response: { value: 'missing status' },
            rollbackTerminal: true,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: true, tombstone: false, conflict: false, retry: false, dirty: false }
        }
    ])('applies the mutation transition table for $label', ({ response, rollbackTerminal, remoteMatchesLocal, expected }) => {
        const machine = createMachine();
        beginLocalEdit(machine, 'operation-1', { subject: 'local' });

        applyMutationTransition(machine, {
            entityId: '1',
            operationId: 'operation-1',
            response,
            rollbackTerminal,
            remoteMatchesLocal
        });

        expect(machine.completedOperationIds.has('operation-1')).toBe(expected.committed);
        expect(machine.tombstones.has('1')).toBe(expected.tombstone);
        expect(machine.conflicts.has('1')).toBe(expected.conflict);
        expect(machine.queuedOperationIds.has('operation-1')).toBe(expected.retry);
        expect(machine.dirtyEntityIds.has('1')).toBe(expected.dirty);
        expect(machine.patches.some((patch) => patch.operationId === 'operation-1')).toBe(
            !expected.committed && !expected.rollback && !expected.tombstone
        );
    });

    it('keeps a scope failure non-destructive when a later server snapshot contains the task again', () => {
        const machine = createMachine();
        beginLocalEdit(machine, 'operation-1', { subject: 'local' });

        applyMutationTransition(machine, {
            entityId: '1',
            operationId: 'operation-1',
            response: {
                status: 'not_found',
                error: 'outside Canvas scope',
                failure: { kind: 'not_found', resource_role: 'scope', resource_type: 'task' }
            }
        });

        expect(machine.tombstones.has('1')).toBe(false);
        expect(machine.snapshot.entitiesById['1']).toBeDefined();
        expect(machine.patches).toHaveLength(1);

        const refreshedTask = { id: '1', subject: 'server after scope', startDate: 3, dueDate: 4, lockVersion: 2 };
        machine.snapshot = replaceServerSnapshot(machine.snapshot, [refreshedTask]);

        expect(machine.tombstones.has('1')).toBe(false);
        expect(machine.snapshot.entitiesById['1']).toEqual(refreshedTask);
    });

    it('keeps retries bounded to one transient retry without committing or rolling back local patches', () => {
        const machine = createMachine();
        beginLocalEdit(machine, 'operation-1', { subject: 'local' });

        applyMutationTransition(machine, {
            entityId: '1',
            operationId: 'operation-1',
            response: { status: 'transient_error', error: 'temporary' }
        });
        applyMutationTransition(machine, {
            entityId: '1',
            operationId: 'operation-1',
            response: { status: 'transient_error', error: 'still unavailable' }
        });

        expect(machine.retryCounts.get('operation-1')).toBe(1);
        expect(machine.queuedOperationIds.has('operation-1')).toBe(false);
        expect(machine.completedOperationIds.has('operation-1')).toBe(false);
        expect(machine.dirtyEntityIds.has('1')).toBe(true);
        expect(machine.patches.some((patch) => patch.operationId === 'operation-1')).toBe(true);
    });

    it('preserves lifecycle invariants across deterministic operation sequences', () => {
        for (let seed = 1; seed <= 100; seed += 1) {
            let randomSeed = seed;
            let revision = 0;
            let snapshot = createServerSnapshot<Entity>([
                { id: '1', subject: 'initial', startDate: 1, lockVersion: 0 }
            ]);
            let patches: Array<LocalPatch<Entity>> = [];
            let activeContext = createReadContext({
                generation: 0,
                projectId: 'project-1',
                query: {},
                scope: { project: 'project-1' },
                purpose: 'initial_load'
            });

            for (let step = 0; step < 40; step += 1) {
                [randomSeed] = nextRandom(randomSeed);
                const operation = randomSeed % 6;

                if (operation === 0) {
                    revision += 1;
                    activeContext = createReadContext({
                        generation: revision,
                        projectId: 'project-1',
                        query: { step },
                        scope: { project: 'project-1' },
                        purpose: 'refresh'
                    });
                    const staleContext = createReadContext({
                        generation: revision - 1,
                        projectId: 'project-1',
                        query: { step: step - 1 },
                        scope: { project: 'project-1' },
                        purpose: 'refresh'
                    });
                    expect(canApplyReadResponse(activeContext, staleContext)).toBe(false);
                    expect(canApplyReadResponse(activeContext, activeContext)).toBe(true);
                } else if (operation === 1) {
                    const generation = step + 1;
                    patches = patches.filter((patch) => patch.entityId !== '1' || patch.generation < generation - 2);
                    patches.push({
                        entityId: '1',
                        projection: { subject: `local-${seed}-${step}` },
                        mutationIntent: { subject: `local-${seed}-${step}` },
                        generation,
                        operationId: `operation-${seed}-${step}`
                    });
                } else if (operation === 2) {
                    const incomingRevision = snapshot.revisions['1'] + 1;
                    snapshot = mergeServerEntity(
                        snapshot,
                        { id: '1', subject: `remote-${seed}-${step}`, startDate: step, lockVersion: incomingRevision },
                        'complete',
                        incomingRevision
                    );
                } else if (operation === 3) {
                    const incomingRevision = Math.max(0, snapshot.revisions['1'] - 1);
                    const previous = snapshot;
                    snapshot = replaceServerSnapshot(
                        snapshot,
                        [{ id: '1', subject: `stale-${seed}-${step}`, lockVersion: incomingRevision }],
                        activeContext
                    );
                    expect(snapshot.revisions['1']).toBeGreaterThanOrEqual(previous.revisions['1']);
                } else if (operation === 4) {
                    const operationId = patches.at(-1)?.operationId;
                    if (operationId) patches = commitOperationPatches(patches, operationId);
                } else {
                    const effective = applyLocalPatches(snapshot.entitiesById['1'], patches);
                    expect(effective.id).toBe('1');
                    expect(effective.lockVersion).toBeGreaterThanOrEqual(snapshot.revisions['1']);
                }

                const effective = applyLocalPatches(snapshot.entitiesById['1'], patches);
                expect(effective.id).toBe('1');
                expect(snapshot.revisions['1']).toBeGreaterThanOrEqual(0);
                expect(new Set([effective.id]).size).toBe(1);
            }
        }
    });
});
