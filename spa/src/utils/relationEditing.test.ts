import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelationType } from '../types/constraints';
import { calculateDelay, getRelationTypeLabel, toEditableRelationView, toRawRelationType, validateRelationDelayConsistency } from './relationEditing';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('toEditableRelationView', () => {
    it('normalizes follows into precedes with reversed endpoints', () => {
        expect(toEditableRelationView({
            id: 'r1',
            from: '10',
            to: '20',
            type: RelationType.Follows,
            delay: 2
        })).toEqual({
            uiType: RelationType.Precedes,
            direction: 'reverse',
            fromId: '20',
            toId: '10',
            delay: 2
        });
    });
});

describe('toRawRelationType', () => {
    it('restores reverse direction for normalized blocks', () => {
        expect(toRawRelationType(RelationType.Blocks, 'reverse')).toBe(RelationType.Blocked);
    });
});

describe('calculateDelay', () => {
    const originalConfig = window.RedmineCanvasGantt;

    beforeEach(() => {
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [0, 6]
        } as Window['RedmineCanvasGantt'];
    });

    afterEach(() => {
        window.RedmineCanvasGantt = originalConfig;
    });

    it('computes delay for precedes using logical predecessor/successor dates', () => {
        expect(calculateDelay(RelationType.Precedes, {
            startDate: 0,
            dueDate: DAY_MS
        }, {
            startDate: DAY_MS * 5,
            dueDate: DAY_MS * 7
        })).toEqual({ delay: 1 });
    });

    it('computes delay using working days', () => {
        const originalConfig = window.RedmineCanvasGantt;
        window.RedmineCanvasGantt = {
            ...(originalConfig || {}),
            nonWorkingWeekDays: [6, 7]
        } as Window['RedmineCanvasGantt'];

        try {
            expect(calculateDelay(RelationType.Precedes, {
                dueDate: Date.UTC(2026, 0, 2)
            }, {
                startDate: Date.UTC(2026, 0, 5)
            })).toEqual({ delay: 0 });
        } finally {
            window.RedmineCanvasGantt = originalConfig;
        }
    });
});

describe('getRelationTypeLabel', () => {
    it('returns localized labels for editable relation types', () => {
        expect(getRelationTypeLabel(RelationType.Precedes)).toBe('Precedes');
        expect(getRelationTypeLabel(RelationType.Relates)).toBe('Relates');
        expect(getRelationTypeLabel(RelationType.Blocks)).toBe('Blocks');
    });
});

describe('validateRelationDelayConsistency', () => {
    it('rejects delay that does not satisfy current task dates', () => {
        expect(validateRelationDelayConsistency(RelationType.Precedes, 3, {
            dueDate: DAY_MS
        }, {
            startDate: DAY_MS * 4
        })).toEqual({
            valid: false,
            message: 'Delay does not match the current task dates.'
        });
    });

    it('accepts missing dates without blocking save', () => {
        expect(validateRelationDelayConsistency(RelationType.Precedes, 3, {
            dueDate: DAY_MS
        }, {
            startDate: undefined
        })).toEqual({ valid: true });
    });
});
