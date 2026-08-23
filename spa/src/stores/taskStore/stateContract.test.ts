import { describe, expect, it } from 'vitest';
import {
    applyLocalPatches,
    canApplyReadResponse,
    classifyDerivedInvalidation,
    commitOperationPatches,
    createReadContext,
    createServerSnapshot,
    hasLocalPatchOwnership,
    mergeServerEntity,
    replaceServerSnapshot,
    settleLocalPatchFields,
    type LocalPatch
} from './stateContract';

type Entity = { id: string; subject: string; startDate?: number; lockVersion: number };

describe('state lifecycle contract', () => {
    it('applies display projection without applying a divergent persistence intent', () => {
        const entity = { id: '1', subject: 'server', startDate: 1, lockVersion: 1 };
        const patches = [{
            entityId: '1',
            projection: { subject: 'server normalized', startDate: 2 },
            mutationIntent: { subject: 'user intended' },
            generation: 1,
            operationId: 'op-1'
        }] as LocalPatch<typeof entity>[];

        expect(applyLocalPatches(entity, patches)).toEqual({
            id: '1',
            subject: 'server normalized',
            startDate: 2,
            lockVersion: 1
        });
    });

    it('rejects a response from an older or different read context', () => {
        const first = createReadContext({ generation: 1, projectId: '1', query: { status: [1] }, scope: { subprojects: true }, purpose: 'refresh' });
        const second = createReadContext({ generation: 2, projectId: '1', query: { status: [2] }, scope: { subprojects: true }, purpose: 'refresh' });
        expect(canApplyReadResponse(second, first)).toBe(false);
        expect(canApplyReadResponse(second, second)).toBe(true);
    });

    it('preserves omitted fields for partial responses and rejects revision rollback', () => {
        const context = createReadContext({ generation: 1, projectId: null, query: {}, scope: {}, purpose: 'initial_load' });
        const initial = createServerSnapshot<Entity>([{ id: '1', subject: 'local', startDate: 10, lockVersion: 3 }], context);
        const partial = mergeServerEntity(initial, { id: '1', subject: 'remote', lockVersion: 4 }, 'partial', 4);
        expect(partial.entitiesById['1']).toEqual({ id: '1', subject: 'remote', startDate: 10, lockVersion: 4 });
        const stale = mergeServerEntity(partial, { id: '1', subject: 'stale', startDate: 1, lockVersion: 2 }, 'complete', 2);
        expect(stale).toBe(partial);
    });

    it('keeps entity revisions monotonic when replacing a complete snapshot', () => {
        const context = createReadContext({ generation: 1, projectId: null, query: {}, scope: {}, purpose: 'refresh' });
        const initial = createServerSnapshot<Entity>([{ id: '1', subject: 'new', lockVersion: 4 }], context);
        const replaced = replaceServerSnapshot(initial, [{ id: '1', subject: 'old', lockVersion: 2 }], context);
        expect(replaced.entitiesById['1'].subject).toBe('new');
        expect(replaced.revisions['1']).toBe(4);
    });

    it('commits only the completed operation and classifies derived work by fields', () => {
        const patches: Array<LocalPatch<Entity>> = [
            { entityId: '1', projection: { subject: 'a' }, mutationIntent: { subject: 'a' }, generation: 1, operationId: 'op-1' },
            { entityId: '1', projection: { startDate: 2 }, mutationIntent: { startDate: 2 }, generation: 2, operationId: 'op-2' }
        ];
        expect(commitOperationPatches(patches, 'op-1')).toHaveLength(1);
        expect(applyLocalPatches<Entity>({ id: '1', subject: 'old', lockVersion: 1 }, patches)).toMatchObject({ subject: 'a', startDate: 2 });
        expect(classifyDerivedInvalidation(['subject'])).toBe('none');
        expect(classifyDerivedInvalidation(['startDate'])).toBe('critical_path');
    });

    it('identifies ownership by task and generation without requiring the latest generation', () => {
        const patches: Array<LocalPatch<Entity>> = [
            { entityId: '1', projection: { subject: 'a' }, mutationIntent: { subject: 'a' }, generation: 1, operationId: 'edit:1:1' },
            { entityId: '1', projection: { subject: 'b' }, mutationIntent: { subject: 'b' }, generation: 2, operationId: 'edit:1:2' }
        ];

        expect(hasLocalPatchOwnership(patches, '1', 1)).toBe(true);
        expect(hasLocalPatchOwnership(patches, '1', 1, 'edit:1:1')).toBe(true);
        expect(hasLocalPatchOwnership(patches, '1', 1, 'edit:1:2')).toBe(false);
        expect(hasLocalPatchOwnership(patches, '1', 3)).toBe(false);
    });

    it('settles only fields owned by the completed operation', () => {
        const patches: Array<LocalPatch<Entity>> = [
            {
                entityId: '1',
                projection: { subject: 'subject', startDate: 2 },
                mutationIntent: { subject: 'subject', startDate: 2 },
                generation: 1,
                operationId: 'op-1'
            },
            {
                entityId: '1',
                projection: { subject: 'newer subject' },
                mutationIntent: { subject: 'newer subject' },
                generation: 2,
                operationId: 'op-2'
            }
        ];

        expect(settleLocalPatchFields(patches, 1, ['startDate'])).toEqual([
            {
                ...patches[0],
                projection: { subject: 'subject' },
                mutationIntent: { subject: 'subject' }
            },
            patches[1]
        ]);
    });
});
