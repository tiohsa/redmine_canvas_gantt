import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { parseDateOnly } from '../../utils/dateOnly';
import { summarizeActionNeeded, type ActionFilter } from './analysis';

const today = parseDateOnly('2026-09-23')!;
const yesterday = parseDateOnly('2026-09-22')!;
const filters: ActionFilter = {
    filterText: '', selectedAssigneeIds: [], selectedProjectIds: [], selectedVersionIds: [],
    selectedTrackerIds: [], showSubprojects: true, currentProjectId: '1'
};
const task = (id: string, values: Partial<Task> = {}): Task => ({
    id, subject: `Task ${id}`, statusId: 1, ratioDone: 0, lockVersion: 1,
    editable: true, rowIndex: 0, hasChildren: false, hasPhysicalChildren: false,
    assignedToId: 1, startDate: today, dueDate: today, estimatedHours: 2,
    ...values
});
const statuses = [{ id: 1, name: 'Open', isClosed: false }, { id: 2, name: 'Closed', isClosed: true }];

describe('summarizeActionNeeded', () => {
    it('deduplicates reasons and unplanned hours, and excludes parents, closed and context rows', () => {
        const tasks = [
            task('1', { startDate: undefined, assignedToId: null, estimatedHours: 3 }),
            task('2', { hasPhysicalChildren: true, startDate: undefined, estimatedHours: 10 }),
            task('3', { parentId: '2', startDate: undefined, estimatedHours: 4 }),
            task('4', { estimatedHours: undefined }),
            task('5', { estimatedHours: 0 }),
            task('6', { ratioDone: 100, dueDate: yesterday }),
            task('7', { statusId: 2, dueDate: yesterday }),
            task('8', { isContextOnly: true, dueDate: yesterday })
        ];
        const result = summarizeActionNeeded(tasks, statuses, {}, filters, today);
        expect(result.items.map(item => item.task.id)).toEqual(['6', '1', '2', '3', '4']);
        expect(result.counts).toEqual({ constraint: 0, overdue: 1, missingDates: 3, unassigned: 1, missingEstimate: 1 });
        expect(result.unplannedEstimatedHours).toBe(7);
        expect(result.missingEstimateCount).toBe(1);
    });

    it('uses today exclusively for overdue and distinguishes partial dates', () => {
        const tasks = [task('1', { startDate: undefined, dueDate: today }),
            task('2', { dueDate: undefined }), task('3', { dueDate: yesterday })];
        const result = summarizeActionNeeded(tasks, statuses, {}, filters, today);
        expect(result.counts.overdue).toBe(1);
        expect(result.counts.missingDates).toBe(2);
        expect(summarizeActionNeeded(tasks, statuses, {}, filters, parseDateOnly('2026-09-24')!).counts.overdue).toBe(2);
    });

    it('reuses filters without changing counts for layout, viewport or date bar options', () => {
        const tasks = [task('1', { subject: 'Parent', hasPhysicalChildren: true, startDate: undefined }),
            task('2', { subject: 'Match', parentId: '1', startDate: undefined, estimatedHours: 5 }),
            task('3', { subject: 'Other', startDate: undefined, estimatedHours: 9 })];
        const result = summarizeActionNeeded(tasks, statuses, {}, { ...filters, filterText: 'Match' }, today);
        expect(result.items.map(item => item.task.id)).toEqual(['2']);
        expect(result.unplannedEstimatedHours).toBe(5);
        const many = Array.from({ length: 1000 }, (_, index) => task(String(index + 10), { startDate: undefined }));
        expect(summarizeActionNeeded(many, statuses, {}, filters, today).items).toHaveLength(1000);
    });

    it('prioritizes existing scheduling problems and counts explicit zero separately', () => {
        const tasks = [task('10', { dueDate: yesterday }), task('2', { estimatedHours: 0, dueDate: yesterday }), task('3', { startDate: undefined })];
        const result = summarizeActionNeeded(tasks, statuses, { '3': { state: 'cyclic', message: 'Cycle' } }, filters, today);
        expect(result.items.map(item => item.task.id)).toEqual(['3', '2', '10']);
        expect(result.counts.constraint).toBe(1);
        expect(result.counts.missingEstimate).toBe(0);
    });
});
