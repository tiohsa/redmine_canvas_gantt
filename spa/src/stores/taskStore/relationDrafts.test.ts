import { describe, expect, it } from 'vitest';
import type { Relation, Task } from '../../types';
import { parseDateOnly } from '../../utils/dateOnly';
import {
    getPendingRelationChange,
    normalizeRelationCreate,
    normalizeRelationDelete,
    normalizeRelationUpdate,
    projectEffectiveRelations,
    validateRelationDrafts,
    type RelationDraftMap
} from './relationDrafts';

const tasks: Task[] = [
    { id: '1', subject: 'One', projectId: '10', startDate: parseDateOnly('2026-01-05')!, dueDate: parseDateOnly('2026-01-06')!, ratioDone: 0, statusId: 1, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: false },
    { id: '2', subject: 'Two', projectId: '10', startDate: parseDateOnly('2026-01-07')!, dueDate: parseDateOnly('2026-01-08')!, ratioDone: 0, statusId: 1, lockVersion: 1, editable: true, rowIndex: 1, hasChildren: false }
];

const relation: Relation = { id: 'r1', from: '1', to: '2', type: 'precedes', delay: 0 };

describe('relation draft normalization', () => {
    it('stages creates, folds create edits, and cancels create deletion without server writes', () => {
        let changes: RelationDraftMap = {};
        changes = normalizeRelationCreate(changes, [], { from: '1', to: '2', type: 'precedes' }, 1);
        const created = Object.values(changes)[0];
        changes = normalizeRelationUpdate(changes, [], `local:${created.draftId}`, { from: '1', to: '2', type: 'follows', delay: 2 }, 2);
        expect(Object.values(changes)[0]).toMatchObject({ operation: 'create', generation: 2, desired: { type: 'follows', delay: 2 } });

        changes = normalizeRelationDelete(changes, [], `local:${created.draftId}`, 3);
        expect(changes).toEqual({});
    });

    it('normalizes updates to final values and removes an edit restored to its original value', () => {
        let changes: RelationDraftMap = {};
        changes = normalizeRelationUpdate(changes, [relation], relation.id, { from: '1', to: '2', type: 'precedes', delay: 2 }, 1);
        changes = normalizeRelationUpdate(changes, [relation], relation.id, { from: '1', to: '2', type: 'precedes', delay: 3 }, 2);
        expect(Object.values(changes)[0]).toMatchObject({ operation: 'update', generation: 2, desired: { delay: 3 } });
        changes = normalizeRelationUpdate(changes, [relation], relation.id, { from: '1', to: '2', type: 'precedes', delay: 0 }, 3);
        expect(changes).toEqual({});
    });

    it('folds update then delete, and cancels delete when the original relation is restored', () => {
        let changes: RelationDraftMap = {};
        changes = normalizeRelationUpdate(changes, [relation], relation.id, { from: '1', to: '2', type: 'precedes', delay: 2 }, 1);
        changes = normalizeRelationDelete(changes, [relation], relation.id, 2);
        expect(Object.values(changes)[0]).toMatchObject({ operation: 'delete', original: relation });
        changes = normalizeRelationCreate(changes, [relation], { from: '1', to: '2', type: 'precedes', delay: 0 }, 3);
        expect(changes).toEqual({});
    });

    it('turns delete then re-add with a changed delay into an update', () => {
        const deleted = normalizeRelationDelete({}, [relation], relation.id, 1);
        const restored = normalizeRelationCreate(deleted, [relation], { from: '1', to: '2', type: 'precedes', delay: 2 }, 2);
        expect(Object.values(restored)[0]).toMatchObject({ operation: 'update', relationId: 'r1', desired: { delay: 2 } });
    });

    it('projects drafts over server relations and keeps an unknown delete visible for reconciliation', () => {
        const deleting = normalizeRelationDelete({}, [relation], relation.id, 1);
        const draft = Object.values(deleting)[0];
        const unknown = { ...deleting, [draft.draftId]: { ...draft, status: 'unknown' as const, error: 'timeout' } };
        expect(projectEffectiveRelations([relation], deleting)).toEqual([]);
        expect(projectEffectiveRelations([], unknown)).toEqual([relation]);
        expect(getPendingRelationChange(unknown, relation.id)?.status).toBe('unknown');
    });

    it('rejects dependency cycles and date saves that require a relation removal first', () => {
        const create = normalizeRelationCreate({}, [relation], { from: '2', to: '1', type: 'precedes' }, 1);
        expect(validateRelationDrafts(tasks, [relation], create)).not.toBeNull();

        const deleted = normalizeRelationDelete({}, [relation], relation.id, 1);
        const earlierSuccessor = tasks.map(task => task.id === '2' ? { ...task, startDate: parseDateOnly('2026-01-06')! } : task);
        expect(validateRelationDrafts(earlierSuccessor, [relation], deleted, { '2': { start_date: '2026-01-06' } })).toMatchObject({ draftId: Object.keys(deleted)[0] });
    });

    it('rejects predecessor due-date extensions and dependencies with an inconsistent final interval', () => {
        const deleted = normalizeRelationDelete({}, [relation], relation.id, 1);
        const extendedPredecessor = tasks.map(task => task.id === '1' ? { ...task, dueDate: parseDateOnly('2026-01-08')! } : task);
        expect(validateRelationDrafts(extendedPredecessor, [relation], deleted, { '1': { due_date: '2026-01-08' } })).toMatchObject({ draftId: Object.keys(deleted)[0] });

        const tooEarlySuccessor = tasks.map(task => task.id === '2' ? { ...task, startDate: parseDateOnly('2026-01-06')! } : task);
        const create = normalizeRelationCreate({}, [], { from: '1', to: '2', type: 'precedes' }, 1);
        expect(validateRelationDrafts(tooEarlySuccessor, [], create)).toMatchObject({ draftId: Object.keys(create)[0] });
    });

    it('rejects canonical duplicate relations and unknown drafts before any saveable operation', () => {
        const inverse: Relation = { id: 'r2', from: '2', to: '1', type: 'follows' };
        const duplicate = normalizeRelationCreate({}, [relation], { from: '2', to: '1', type: 'follows' }, 1);
        expect(validateRelationDrafts(tasks, [relation, inverse], duplicate)).not.toBeNull();

        const create = normalizeRelationCreate({}, [], { from: '1', to: '2', type: 'precedes' }, 1);
        const [draftId, draft] = Object.entries(create)[0];
        const unknownAndPending = {
            ...create,
            [draftId]: { ...draft, status: 'unknown' as const },
            other: { ...draft, draftId: 'other', desired: { from: '2', to: '1', type: 'precedes' as const } }
        };
        expect(validateRelationDrafts(tasks, [], unknownAndPending)).toMatchObject({ draftId, error: 'label_relation_result_unknown' });
    });

    it('rejects endpoints outside the captured project scope', () => {
        const create = normalizeRelationCreate({}, [], { from: '1', to: '2', type: 'precedes' }, 1);
        expect(validateRelationDrafts(tasks, [], create, {}, new Set(['10']))).toBeNull();
        expect(validateRelationDrafts(tasks.map(task => task.id === '2' ? { ...task, projectId: '20' } : task), [], create, {}, new Set(['10']))).not.toBeNull();
    });
});
