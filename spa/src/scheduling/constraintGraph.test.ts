import { describe, expect, it } from 'vitest';
import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import {
    buildSchedulingEdges,
    deriveSchedulingStates,
    detectConstraintCycleTaskIds,
    recalculateDownstreamTasks,
    toSchedulingEdge
} from './constraintGraph';

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = Date.UTC(2026, 0, 5);
const TUESDAY = Date.UTC(2026, 0, 6);
const WEDNESDAY = Date.UTC(2026, 0, 7);
const THURSDAY = Date.UTC(2026, 0, 8);
const FRIDAY = Date.UTC(2026, 0, 9);

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: 0,
    dueDate: DAY,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

describe('constraintGraph', () => {
    it('normalizes follows into canonical predecessor/successor edges', () => {
        expect(toSchedulingEdge({
            id: 'r1',
            from: 'B',
            to: 'A',
            type: RelationType.Follows,
            delay: 2
        })).toEqual({
            relationId: 'r1',
            predecessorId: 'A',
            successorId: 'B',
            gapDays: 3,
            relationType: RelationType.Follows
        });
    });

    it('excludes non-scheduling relations from scheduling edges', () => {
        const edges = buildSchedulingEdges([
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Relates },
            { id: 'r2', from: 'A', to: 'B', type: RelationType.Blocks },
            { id: 'r3', from: 'A', to: 'B', type: RelationType.Precedes }
        ]);

        expect(edges).toHaveLength(1);
        expect(edges[0].relationType).toBe(RelationType.Precedes);
    });

    it('detects cycles on the normalized constraint graph', () => {
        const cyclicTaskIds = detectConstraintCycleTaskIds([
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'C', to: 'B', type: RelationType.Follows },
            { id: 'r3', from: 'C', to: 'A', type: RelationType.Precedes }
        ]);

        expect([...cyclicTaskIds].sort()).toEqual(['A', 'B', 'C']);
    });

    it('derives unscheduled, conflicted, and cyclic task states', () => {
        const tasks = [
            buildTask({ id: 'A', dueDate: DAY * 2 }),
            buildTask({ id: 'B', startDate: DAY, dueDate: DAY * 2 }),
            buildTask({ id: 'C', startDate: undefined, dueDate: undefined }),
            buildTask({ id: 'D', startDate: DAY * 5, dueDate: DAY * 4 })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'B', to: 'A', type: RelationType.Precedes }
        ];

        const states = deriveSchedulingStates(tasks, relations);

        expect(states.C.state).toBe('unscheduled');
        expect(states.D.state).toBe('invalid');
        expect(states.A.state).toBe('cyclic');
        expect(states.B.state).toBe('cyclic');
    });

    it('recalculates only downstream tasks', () => {
        const tasks = [
            buildTask({ id: 'A', startDate: MONDAY, dueDate: MONDAY }),
            buildTask({ id: 'B', startDate: MONDAY, dueDate: TUESDAY }),
            buildTask({ id: 'C', startDate: TUESDAY, dueDate: WEDNESDAY })
        ];
        const relations: Relation[] = [
            { id: 'r1', from: 'A', to: 'B', type: RelationType.Precedes },
            { id: 'r2', from: 'B', to: 'C', type: RelationType.Precedes }
        ];

        const updates = recalculateDownstreamTasks(tasks, relations, 'A');

        expect(updates.get('B')).toEqual({ startDate: TUESDAY, dueDate: WEDNESDAY });
        expect(updates.get('C')).toEqual({ startDate: THURSDAY, dueDate: FRIDAY });
        expect(updates.has('A')).toBe(false);
    });
});
