import { describe, expect, it } from 'vitest';
import {
    applyLocalPatches,
    canApplyReadResponse,
    commitOperationPatches,
    createReadContext,
    createServerSnapshot,
    mergeServerEntity,
    replaceServerSnapshot,
    type LocalPatch
} from './stateContract';

type Entity = { id: string; subject: string; startDate?: number; lockVersion: number };

const nextRandom = (seed: number): [number, number] => {
    const next = (seed * 1664525 + 1013904223) >>> 0;
    return [next, next / 0x1_0000_0000];
};

describe('state lifecycle reference model', () => {
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
