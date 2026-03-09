import { describe, expect, it } from 'vitest';
import { RelationType } from '../types/constraints';
import { calculateDelay, getRelationTypeLabel, toEditableRelationView, toRawRelationType } from './relationEditing';

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
    it('computes delay for precedes using logical predecessor/successor dates', () => {
        expect(calculateDelay(RelationType.Precedes, {
            startDate: 0,
            dueDate: DAY_MS
        }, {
            startDate: DAY_MS * 5,
            dueDate: DAY_MS * 7
        })).toEqual({ delay: 3 });
    });
});

describe('getRelationTypeLabel', () => {
    it('returns localized labels for editable relation types', () => {
        expect(getRelationTypeLabel(RelationType.Precedes)).toBe('Precedes');
        expect(getRelationTypeLabel(RelationType.Relates)).toBe('Relates');
        expect(getRelationTypeLabel(RelationType.Blocks)).toBe('Blocks');
    });
});
