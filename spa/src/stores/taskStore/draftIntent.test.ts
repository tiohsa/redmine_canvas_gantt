import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import type { LocalPatch, ServerSnapshot } from './stateContract';
import { buildProjectMutationIntent, buildTaskDraftIntent, hasPendingRelationConsistencyChanges, materializedTaskUpdates } from './draftIntent';

const task = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    subject: 'Persisted',
    projectId: '1',
    trackerId: 2,
    statusId: 3,
    ratioDone: 0,
    lockVersion: 7,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const snapshot = (entity: Task): ServerSnapshot<Task> => ({
    entitiesById: { [entity.id]: entity },
    revisions: { [entity.id]: entity.lockVersion },
    context: null
});

describe('buildTaskDraftIntent', () => {
    it('builds persistence intent without promoting server projection fields', () => {
        const entity = task();
        const patches = [{
            entityId: entity.id,
            projection: {
                projectId: '9',
                trackerId: 7,
                statusId: 4,
                fixedVersionId: undefined,
                categoryId: undefined
            },
            mutationIntent: { projectId: '9' },
            generation: 1,
            operationId: 'edit:1:1'
        }] as LocalPatch<Task>[];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), patches)).toEqual({
            project_id: '9',
            lock_version: 7
        });
    });

    it('merges only explicit follow-up intent across preview generations', () => {
        const entity = task();
        const patches = [
            {
                entityId: entity.id,
                projection: { projectId: '9', trackerId: 7, statusId: 4 },
                mutationIntent: { projectId: '9' },
                generation: 1,
                operationId: 'edit:1:1'
            },
            {
                entityId: entity.id,
                projection: { trackerId: 8, statusId: 5 },
                mutationIntent: { trackerId: 8 },
                generation: 2,
                operationId: 'edit:1:2'
            }
        ] as LocalPatch<Task>[];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), patches)).toEqual({
            project_id: '9',
            tracker_id: 8,
            lock_version: 7
        });
    });

    it('keeps field presence instead of sending all effective task values', () => {
        const entity = task();
        const patches: LocalPatch<Task>[] = [{
            entityId: entity.id,
            projection: { projectId: '9' },
            mutationIntent: { projectId: '9' },
            generation: 1,
            operationId: 'edit:1:1'
        }];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), patches)).toEqual({
            project_id: '9',
            lock_version: 7
        });
    });

    it('distinguishes an omitted field from an explicitly supplied current value', () => {
        const entity = task();
        const explicitCurrent: LocalPatch<Task>[] = [{
            entityId: entity.id,
            projection: { trackerId: 2 },
            mutationIntent: { trackerId: 2 },
            generation: 1,
            operationId: 'edit:1:1'
        }];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), [])).toBeNull();
        expect(buildTaskDraftIntent(entity.id, snapshot(entity), explicitCurrent)).toEqual({
            tracker_id: 2,
            lock_version: 7
        });
    });

    it('aggregates project, tracker, and status generations into one manual-save intent', () => {
        const entity = task();
        const patches: LocalPatch<Task>[] = [
            { entityId: entity.id, projection: { projectId: '9' }, mutationIntent: { projectId: '9' }, generation: 1, operationId: 'edit:1:1' },
            { entityId: entity.id, projection: { trackerId: 7 }, mutationIntent: { trackerId: 7 }, generation: 2, operationId: 'edit:1:2' },
            { entityId: entity.id, projection: { statusId: 4 }, mutationIntent: { statusId: 4 }, generation: 3, operationId: 'edit:1:3' }
        ];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), patches)).toEqual({
            project_id: '9',
            tracker_id: 7,
            status_id: 4,
            lock_version: 7
        });
    });
});

describe('buildProjectMutationIntent', () => {
    it('keeps server policy materialization out of the project UserIntent', () => {
        expect(buildProjectMutationIntent(9)).toEqual({ project_id: 9 });
    });
});

describe('hasPendingRelationConsistencyChanges', () => {
    it('detects date and project mutation intent on either relation endpoint, including cascaded tasks', () => {
        const localTaskPatches: Record<string, LocalPatch<Task>[]> = {
            '2': [{ entityId: '2', projection: { dueDate: 2 }, mutationIntent: { dueDate: 2 }, generation: 1, operationId: 'edit:2:1' }],
            '3': [{ entityId: '3', projection: { startDate: 3 }, mutationIntent: { startDate: 3 }, generation: 1, operationId: 'edit:3:1' }],
            '4': [{ entityId: '4', projection: { projectId: '9', trackerId: 7 }, mutationIntent: { projectId: '9' }, generation: 1, operationId: 'edit:4:1' }]
        };

        expect(hasPendingRelationConsistencyChanges(localTaskPatches, ['1', '2'])).toBe(true);
        expect(hasPendingRelationConsistencyChanges(localTaskPatches, ['3', '8'])).toBe(true);
        expect(hasPendingRelationConsistencyChanges(localTaskPatches, ['8', '4'])).toBe(true);
    });

    it('ignores unrelated user intent and server-only materialized projection fields', () => {
        const localTaskPatches: Record<string, LocalPatch<Task>[]> = {
            '1': [{ entityId: '1', projection: { subject: 'Draft' }, mutationIntent: { subject: 'Draft' }, generation: 1, operationId: 'edit:1:1' }],
            '2': [{ entityId: '2', projection: { projectId: '9', trackerId: 7 }, mutationIntent: { trackerId: 7 }, generation: 1, operationId: 'edit:2:1' }]
        };

        expect(hasPendingRelationConsistencyChanges(localTaskPatches, ['1', '2'])).toBe(false);
    });
});

describe('materializedTaskUpdates', () => {
    it('maps a server materialized patch back to canonical Task fields', () => {
        expect(materializedTaskUpdates({
            project_id: 9,
            tracker_id: 7,
            status_id: 4,
            fixed_version_id: null,
            category_id: null
        })).toEqual({
            projectId: '9',
            trackerId: 7,
            statusId: 4,
            fixedVersionId: undefined,
            categoryId: undefined
        });
    });

    it('merges a sparse materialized custom field patch without dropping unchanged values', () => {
        expect(materializedTaskUpdates({
            custom_field_values: { '9': null }
        }, task({ customFieldValues: { '5': 'persisted', '9': 'old' } }))).toEqual({
            customFieldValues: { '5': 'persisted', '9': null }
        });
    });
});
