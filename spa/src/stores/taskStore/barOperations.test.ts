import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import {
    beginBarOperation,
    buildBarOperationRollback,
    captureBarOperationBaselines,
    endBarOperation,
    settleBarOperationTaskOwnership,
    type BarOperationRecord
} from './barOperations';

const task = (id: string, subject: string): Task => ({
    id,
    subject,
    startDate: 1,
    dueDate: 2,
    lockVersion: 1
} as Task);

describe('bar operation lifecycle', () => {
    it('captures the seed and cascading task baselines before edits', () => {
        const first = task('1', 'first');
        const second = task('2', 'second');
        const started = beginBarOperation({}, [first, second], { '1': 3, '2': 5 }, 'bar:1', '1');

        const captured = captureBarOperationBaselines(
            started.barOperations,
            [first, second],
            { '1': 3, '2': 5 },
            started.activeBarOperationId,
            ['1', '2']
        );

        expect(captured['bar:1']).toMatchObject({
            baselineAllTasks: [first, second],
            baselineGenerations: { '1': 3, '2': 5 }
        });
        expect(captured['bar:1'].baselineAllTasks[0]).not.toBe(first);
    });

    it('records only generations changed after the baseline', () => {
        const first = task('1', 'first');
        const second = task('2', 'second');
        const started = beginBarOperation({}, [first, second], { '1': 3 }, 'bar:1', '1');
        const ended = endBarOperation(
            started.barOperations,
            started.activeBarOperationId,
            [first, second],
            { '1': 4, '2': 1 },
            'bar:1'
        );

        expect(ended.activeBarOperationId).toBeNull();
        expect(ended.barOperations['bar:1'].entityGenerations).toEqual({ '1': 4, '2': 1 });
    });

    it('removes an operation that made no edits', () => {
        const first = task('1', 'first');
        const started = beginBarOperation({}, [first], { '1': 3 }, 'bar:1', '1');

        const ended = endBarOperation(
            started.barOperations,
            started.activeBarOperationId,
            [first],
            { '1': 3 },
            'bar:1'
        );

        expect(ended).toEqual({ barOperations: {}, activeBarOperationId: null });
    });

    it('settles exact and older ownership without releasing newer edits', () => {
        const operations: Record<string, BarOperationRecord> = {
            older: {
                operationId: 'older',
                baselineAllTasks: [task('1', 'baseline')],
                baselineGenerations: { '1': 0 },
                entityGenerations: { '1': 1 },
                completedTaskIds: []
            },
            newer: {
                operationId: 'newer',
                baselineAllTasks: [task('1', 'after older')],
                baselineGenerations: { '1': 1 },
                entityGenerations: { '1': 2 },
                completedTaskIds: []
            }
        };

        const exact = settleBarOperationTaskOwnership(operations, null, '1', { mode: 'exact', generation: 1 });
        expect(Object.keys(exact.barOperations)).toEqual(['newer']);

        const through = settleBarOperationTaskOwnership(operations, null, '1', { mode: 'through', generation: 1 });
        expect(Object.keys(through.barOperations)).toEqual(['newer']);
    });

    it('rolls back owned fields while preserving later patches', () => {
        const baseline = task('1', 'baseline');
        const operations: Record<string, BarOperationRecord> = {
            'bar:1': {
                operationId: 'bar:1',
                baselineAllTasks: [baseline],
                baselineGenerations: { '1': 0 },
                entityGenerations: { '1': 1 },
                completedTaskIds: []
            }
        };

        const rollback = buildBarOperationRollback({
            allTasks: [{ ...baseline, subject: 'later edit', dueDate: 5 }],
            editGenerations: { '1': 2 },
            localTaskPatches: {
                '1': [
                    { entityId: '1', operationId: 'edit:1:1', generation: 1, fields: { dueDate: 5 } },
                    { entityId: '1', operationId: 'edit:1:2', generation: 2, fields: { subject: 'later edit' } }
                ]
            },
            modifiedTaskIds: new Set(['1']),
            barOperations: operations,
            activeBarOperationId: 'bar:1'
        }, 'bar:1');

        expect(rollback?.allTasks[0]).toMatchObject({ subject: 'later edit', dueDate: 2 });
        expect(rollback?.localTaskPatches['1']).toHaveLength(1);
        expect(rollback?.modifiedTaskIds.has('1')).toBe(true);
        expect(rollback?.barOperations).toEqual({});
        expect(rollback?.activeBarOperationId).toBeNull();
    });
});
