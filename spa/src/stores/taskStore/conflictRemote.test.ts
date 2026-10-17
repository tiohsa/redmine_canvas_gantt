import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { createReadContext, createServerSnapshot } from './stateContract';
import { isValidConflictRemote, selectConflictRemote } from './conflictRemote';

const task = (id: string, lockVersion: number): Task => ({
    id, subject: id, startDate: 0, dueDate: 0, ratioDone: 0, statusId: 1, lockVersion,
    editable: true, rowIndex: 0, hasChildren: false
});

describe('conflict remote validation', () => {
    it('rejects mismatched task IDs and invalid revisions', () => {
        expect(isValidConflictRemote('42', { entity: task('99', 1), revision: 1 })).toBe(false);
        for (const revision of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
            expect(isValidConflictRemote('42', { entity: task('42', revision), revision })).toBe(false);
        }
        expect(isValidConflictRemote('42', { entity: task('42', 2), revision: 3 })).toBe(false);
        expect(isValidConflictRemote('42', {
            entity: { ...task('42', 2), lockVersion: undefined as unknown as number }, revision: 2
        })).toBe(false);
    });

    it('selects a valid known response and refuses a stale response over a newer snapshot', () => {
        const response = task('42', 2);
        const snapshotEntity = task('42', 4);
        const snapshot = createServerSnapshot([snapshotEntity]);
        const context = createReadContext({ generation: 1, projectId: 'p', query: 'q', scope: 's', purpose: 'refresh' });
        snapshot.context = context;

        expect(selectConflictRemote({ taskId: '42', remoteEntity: response, remoteRevision: 2 }, snapshot, context, 'ready'))
            .toEqual({ entity: snapshotEntity, revision: 4 });
        expect(selectConflictRemote({ taskId: '42', remoteEntity: task('99', 5), remoteRevision: 5 }, snapshot, context, 'ready'))
            .toBeUndefined();
    });

    it('validates snapshot candidates and falls back from an invalid response', () => {
        const context = createReadContext({ generation: 1, projectId: 'p', query: 'q', scope: 's', purpose: 'refresh' });
        const snapshot = createServerSnapshot([task('42', 5)], context);
        const conflict = { taskId: '42', remoteEntity: task('99', 5), remoteRevision: 5 };
        expect(selectConflictRemote(conflict, snapshot, context, 'ready')).toEqual({
            entity: snapshot.entitiesById['42'], revision: 5
        });

        snapshot.entitiesById['42'] = task('42', 4);
        snapshot.revisions['42'] = 5;
        expect(selectConflictRemote({ taskId: '42', remoteEntity: task('42', 5), remoteRevision: 5 }, snapshot, context, 'ready'))
            .toEqual({ entity: task('42', 5), revision: 5 });
        snapshot.entitiesById['42'] = task('42', 5);
        snapshot.context = createReadContext({ generation: 2, projectId: 'p', query: 'q', scope: 'old-scope', purpose: 'refresh' });
        expect(selectConflictRemote({ taskId: '42', remoteEntity: task('42', 4), remoteRevision: 4 }, snapshot, context, 'ready'))
            .toBeUndefined();
    });
});
