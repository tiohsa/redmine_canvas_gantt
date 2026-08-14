import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import type { LocalPatch, ServerSnapshot } from './stateContract';
import { buildTaskDraftIntent, materializedTaskUpdates } from './draftIntent';

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
    it('keeps field presence instead of sending all effective task values', () => {
        const entity = task();
        const patches: LocalPatch<Task>[] = [{
            entityId: entity.id,
            fields: { projectId: '9' },
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
            fields: { trackerId: 2 },
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
            { entityId: entity.id, fields: { projectId: '9' }, generation: 1, operationId: 'edit:1:1' },
            { entityId: entity.id, fields: { trackerId: 7 }, generation: 2, operationId: 'edit:1:2' },
            { entityId: entity.id, fields: { statusId: 4 }, generation: 3, operationId: 'edit:1:3' }
        ];

        expect(buildTaskDraftIntent(entity.id, snapshot(entity), patches)).toEqual({
            project_id: '9',
            tracker_id: 7,
            status_id: 4,
            lock_version: 7
        });
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
