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

type Entity = { id: string; subject: string; startDate?: number; dueDate?: number; lockVersion: number };

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

const beginLocalEdit = (machine: TransitionMachine, operationId: string, fields: Partial<Entity>) => {
    machine.patches.push({
        entityId: '1',
        fields,
        generation: Number(operationId.replace(/\D/g, '')) || 1,
        operationId
    });
    machine.dirtyEntityIds.add('1');
    machine.queuedOperationIds.add(operationId);
};

const syncDirtyFromPatches = (machine: TransitionMachine, entityId: string) => {
    if (machine.patches.some((patch) => patch.entityId === entityId)) {
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
        machine.patches = machine.patches.filter((patch) => patch.entityId !== entityId);
        machine.snapshot = removeEntityFromSnapshot(machine.snapshot, entityId);
        machine.tombstones.add(entityId);
        machine.conflicts.delete(entityId);
    } else if (input.rollbackTerminal) {
        machine.patches = commitOperationPatches(machine.patches, operationId);
        machine.conflicts.delete(entityId);
    }

    syncDirtyFromPatches(machine, entityId);
};

describe('state lifecycle reference model', () => {
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
            label: 'not_found',
            response: { status: 'not_found', error: 'gone' },
            rollbackTerminal: false,
            remoteMatchesLocal: false,
            expected: { committed: false, rollback: false, tombstone: true, conflict: false, retry: false, dirty: false }
        },
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
                        fields: { subject: `local-${seed}-${step}` },
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
