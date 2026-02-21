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
            expect(updates.get('B')?.startDate).toBe(DAY * 4);
            expect(updates.get('B')?.dueDate).toBe(DAY * 6); // Duration preserved: 2 days
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
            expect(updates.get('B')?.startDate).toBe(DAY * 4);
        });

        it('should skip weekend when calculating minimum successor start', () => {
            const friday = Date.UTC(2026, 0, 2); // 2026-01-02 (Fri)
            const saturday = Date.UTC(2026, 0, 3); // 2026-01-03 (Sat)
            const sunday = Date.UTC(2026, 0, 4); // 2026-01-04 (Sun)
            const monday = Date.UTC(2026, 0, 5); // 2026-01-05 (Mon)

            const originalConfig = window.RedmineCanvasGantt;
            window.RedmineCanvasGantt = {
                ...(originalConfig || {}),
                nonWorkingWeekDays: [0, 6]
            } as Window['RedmineCanvasGantt'];

            try {
                const tasks = [
                    buildTask({ id: 'A', startDate: Date.UTC(2026, 0, 1), dueDate: friday }),
                    buildTask({ id: 'B', startDate: saturday, dueDate: sunday })
                ];
                const relations: Relation[] = [
                    { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
                ];

                const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', Date.UTC(2026, 0, 1), friday);
                expect(updates.has('B')).toBe(true);
                expect(updates.get('B')?.startDate).toBe(monday);
            } finally {
                window.RedmineCanvasGantt = originalConfig;
            }
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
            // B pushed to day 4-6, C should be pushed to day 7-9
            expect(updates.get('C')?.startDate).toBe(DAY * 7);
        });

        it('should push predecessor backward when successor moves backward', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: DAY * 2, dueDate: DAY * 4 }),
                buildTask({ id: 'B', startDate: DAY * 6, dueDate: DAY * 8 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
            ];

            const updates = TaskLogicService.checkDependencies(tasks, relations, 'B', DAY * 4, DAY * 6);

            expect(updates.has('A')).toBe(true);
            expect(updates.get('A')?.dueDate).toBe(DAY * 3);
            expect(updates.get('A')?.startDate).toBe(DAY);
        });

        it('should not push predecessor when weekend endpoint already satisfies successor start', () => {
            const friday = Date.UTC(2026, 2, 6); // 2026-03-06 (Fri)
            const saturday = Date.UTC(2026, 2, 7); // 2026-03-07 (Sat)
            const monday = Date.UTC(2026, 2, 9); // 2026-03-09 (Mon)

            const originalConfig = window.RedmineCanvasGantt;
            window.RedmineCanvasGantt = {
                ...(originalConfig || {}),
                nonWorkingWeekDays: [0, 6]
            } as Window['RedmineCanvasGantt'];

            try {
                const tasks = [
                    buildTask({ id: 'A', startDate: friday, dueDate: saturday }),
                    buildTask({ id: 'B', startDate: monday, dueDate: monday })
                ];
                const relations: Relation[] = [
                    { id: 'r1', from: 'A', to: 'B', type: 'precedes' }
                ];

                // A ends on Saturday. With weekend off, earliest B start is Monday.
                // If B moves but keeps Monday start, A should not be pushed to Friday.
                const updates = TaskLogicService.checkDependencies(tasks, relations, 'B', monday, monday);
                expect(updates.has('A')).toBe(false);
            } finally {
                window.RedmineCanvasGantt = originalConfig;
            }
        });
    });

    describe('follows relations', () => {
        it('should push predecessor backward when follower moves backward', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: DAY * 4, dueDate: DAY * 6 }), // A follows B
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'follows' }
            ];

            // A moved to start at day 3, B (predecessor) ends at day 4
            // A.start >= B.end + 1 day means B.end <= 2 days
            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', DAY * 3, DAY * 5);

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

        it('should push follower forward when predecessor moves forward', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: DAY * 3, dueDate: DAY * 5 }), // A follows B
                buildTask({ id: 'B', startDate: DAY, dueDate: DAY * 3 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'follows' }
            ];

            const updates = TaskLogicService.checkDependencies(tasks, relations, 'B', DAY * 4, DAY * 6);

            expect(updates.has('A')).toBe(true);
            expect(updates.get('A')?.startDate).toBe(DAY * 7);
            expect(updates.get('A')?.dueDate).toBe(DAY * 9);
        });
    });

    describe('blocks relations', () => {
        it('should ignore blocks for date constraints (Redmine-compatible)', () => {
            const tasks = [
                buildTask({ id: 'A', startDate: 0, dueDate: DAY * 3 }),
                buildTask({ id: 'B', startDate: DAY * 2, dueDate: DAY * 4 })
            ];
            const relations: Relation[] = [
                { id: 'r1', from: 'A', to: 'B', type: 'blocks' }
            ];

            const updates = TaskLogicService.checkDependencies(tasks, relations, 'A', 0, DAY * 3);

            expect(updates.has('B')).toBe(false);
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
