import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildDependencySummary, filterRelationsForSelected, getOverflowBadgeLabel } from './dependencyIndicators';

const buildTask = (id: string): Task => ({
    id,
    subject: id,
    startDate: 0,
    dueDate: 0,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

describe('buildDependencySummary', () => {
    it('counts incoming and outgoing relations for visible tasks', () => {
        const tasks = [buildTask('a'), buildTask('b'), buildTask('c')];
        const relations = [
            { id: 'r1', from: 'a', to: 'b', type: 'precedes' },
            { id: 'r2', from: 'c', to: 'a', type: 'precedes' }
        ];

        const summary = buildDependencySummary(tasks, relations);

        expect(summary.get('a')).toEqual({ incoming: 1, outgoing: 1 });
        expect(summary.get('b')).toEqual({ incoming: 1, outgoing: 0 });
        expect(summary.get('c')).toEqual({ incoming: 0, outgoing: 1 });
    });
});

describe('filterRelationsForSelected', () => {
    it('limits relations for the selected task', () => {
        const relations = [
            { id: 'r1', from: 'a', to: 'b', type: 'precedes' },
            { id: 'r2', from: 'c', to: 'a', type: 'precedes' },
            { id: 'r3', from: 'a', to: 'd', type: 'precedes' }
        ];

        const result = filterRelationsForSelected(relations, 'a', 2);

        expect(result.relations).toHaveLength(2);
        expect(result.overflowCount).toBe(1);
    });
});

describe('getOverflowBadgeLabel', () => {
    it('returns empty string when overflow is zero', () => {
        expect(getOverflowBadgeLabel(0)).toBe('');
    });

    it('returns +N label when overflow is positive', () => {
        expect(getOverflowBadgeLabel(3)).toBe('+3');
    });
});
