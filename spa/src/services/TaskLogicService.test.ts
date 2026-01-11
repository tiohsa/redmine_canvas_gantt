import { describe, it, expect } from 'vitest';
import { TaskLogicService } from './TaskLogicService';
import type { Task, Relation } from '../types';

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task',
    subject: 'task',
    startDate: 0,
    dueDate: 86400000, // 1 day
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const DAY = 24 * 60 * 60 * 1000;

describe('TaskLogicService.checkDependencies', () => {
    describe('precedes relations', () => {
        it('should push successor forward when predecessor end exceeds successor start', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY * 3 }),
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
            ];

            // A ends at day 3, but B starts at day 2 - violation
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY * 3);

            expect(updates.has('B')).toBe(true);
            expect(updates.get('B')?.startDate).toBe(DAY * 3);
            expect(updates.get('B')?.dueDate).toBe(DAY * 5); // Duration preserved: 2 days
        });

        it('should not update when constraint is satisfied', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY }),
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 3 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
            ];

            // A ends at day 1, B starts at day 2 - no violation
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY);

            expect(updates.size).toBe(0);
        });

        it('should respect delay parameter', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY }),
                buildTask({ id: 'B', startDate: DAY, dueDate: DAY * 2 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes', delay: 2 } // 2 day delay
            ];

            // A ends at day 1, with 2 day delay, B must start at day 3
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY);

            expect(updates.has('B')).toBe(true);
            expect(updates.get('B')?.startDate).toBe(DAY * 3);
        });

        it('should cascade updates through multiple successors', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY * 3 }),
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 }),
                buildTask({ id: 'C', startDate: DAY * 3, dueDate: DAY * 5 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
                { id: 'r2', from: 'B', to: 'C', type: 'precedes' }
            ];

            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY * 3);

            expect(updates.has('B')).toBe(true);
            expect(updates.has('C')).toBe(true);
            // B pushed to day 3-5, C should be pushed to day 5-7
            expect(updates.get('C')?.startDate).toBe(DAY * 5);
        });
    });

    describe('follows relations', () => {
        it('should push predecessor backward when follower moves backward', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: DAY * 3, dueDate: DAY * 5 }), // A follows B
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'follows' }
            ];

            // A moved to start at day 2, B (predecessor) ends at day 4
            // A.start >= B.end means B.end <= 2 days
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', DAY * 2, DAY * 4);

            expect(updates.has('B')).toBe(true);
            expect(updates.get('B')?.dueDate).toBe(DAY * 2);
            expect(updates.get('B')?.startDate).toBe(0); // Duration preserved: 2 days
        });

        it('should not update when follows constraint satisfied', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: DAY * 5, dueDate: DAY * 7 }),
                buildTask({ id: 'B', startDate: DAY, dueDate: DAY * 3 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'follows' }
            ];

            // A starts at day 5, B ends at day 3 - satisfied
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', DAY * 5, DAY * 7);

            expect(updates.size).toBe(0);
        });
    });

    describe('blocks relations', () => {
        it('should handle blocks same as precedes', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY * 3 }),
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'blocks' }
            ];

            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY * 3);

            expect(updates.has('B')).toBe(true);
            expect(updates.get('B')?.startDate).toBe(DAY * 3);
        });
    });

    describe('circular dependency prevention', () => {
        it('should not infinite loop on circular dependencies', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY }),
                buildTask({ id: 'B', startDate: DAY, dueDate: DAY * 2 }),
                buildTask({ id: 'C', startDate: DAY * 2, dueDate: DAY * 3 })
            ];
            // Circular: A -> B -> C -> A
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' },
                { id: 'r2', from: 'B', to: 'C', type: 'precedes' },
                { id: 'r3', from: 'C', to: 'A', type: 'precedes' }
            ];

            // Should not throw or infinite loop - just return whatever updates it can
            expect(() => {
                TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY * 2);
            }).not.toThrow();
        });

        it('should handle self-referencing relations', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'A', type: 'precedes' }
            ];

            expect(() => {
                TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY);
            }).not.toThrow();
        });
    });
});

describe('TaskLogicService.validateDates', () => {
    it('should return error when start > due', () => {
        const task = buildTask({ startDate: DAY * 2, dueDate: DAY });
        const errors = TaskLogicService.validateDates(task);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('Start date cannot be after due date');
    });

    it('should return empty array when dates are valid', () => {
        const task = buildTask({ startDate: DAY, dueDate: DAY * 2 });
        const errors = TaskLogicService.validateDates(task);
        expect(errors.length).toBe(0);
    });
});
