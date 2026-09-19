import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelationType } from '../types/constraints';
import { parseDateOnly } from './dateOnly';
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

    describe.each([RelationType.Precedes, RelationType.Follows])('%s scheduling boundary', (relationType) => {
        const successor = { startDate: parseDateOnly('2026-09-16')! };
        const predecessorStart = parseDateOnly('2026-09-10')!;

        it.each([
            { name: 'due date takes priority', dueDate: parseDateOnly('2026-09-12')!, delay: 2 },
            { name: 'missing due date falls back to start', dueDate: undefined, delay: 3 },
            { name: 'NaN due date falls back to start', dueDate: NaN, delay: 3 },
            { name: 'infinite due date falls back to start', dueDate: Infinity, delay: 3 }
        ])('$name in calculation and validation', ({ dueDate, delay }) => {
            const predecessor = { startDate: predecessorStart, dueDate };
            const [from, to] = relationType === RelationType.Precedes
                ? [predecessor, successor] : [successor, predecessor];

            expect(calculateDelay(relationType, from, to)).toEqual({ delay });
            expect(validateRelationDelayConsistency(relationType, delay, from, to)).toEqual({ valid: true });
            expect(validateRelationDelayConsistency(relationType, delay + 1, from, to)).toEqual({
                valid: false,
                message: 'Delay does not match the current task dates.'
            });
        });

        it.each([
            { name: 'undated predecessor', predecessor: {}, next: successor },
            { name: 'non-finite predecessor', predecessor: { startDate: NaN, dueDate: Infinity }, next: successor },
            { name: 'absent predecessor', predecessor: undefined, next: successor },
            { name: 'due-only successor', predecessor: { dueDate: predecessorStart }, next: { dueDate: successor.startDate } },
            { name: 'non-finite successor start', predecessor: { startDate: predecessorStart }, next: { startDate: NaN, dueDate: successor.startDate } }
        ])('keeps auto delay unavailable for $name', ({ predecessor, next }) => {
            const [from, to] = relationType === RelationType.Precedes
                ? [predecessor, next] : [next, predecessor];

            expect(calculateDelay(relationType, from, to)).toEqual({ message: 'No auto calculation due to missing dates.' });
            expect(validateRelationDelayConsistency(relationType, 3, from, to)).toEqual({ valid: true });
        });
    });

    it('uses working days for a start-only predecessor from Friday to Monday', () => {
        const predecessor = { startDate: parseDateOnly('2026-09-11')! };
        const successor = { startDate: parseDateOnly('2026-09-14')! };
        expect(calculateDelay(RelationType.Precedes, predecessor, successor)).toEqual({ delay: 0 });
        expect(validateRelationDelayConsistency(RelationType.Precedes, 0, predecessor, successor)).toEqual({ valid: true });
        expect(validateRelationDelayConsistency(RelationType.Precedes, 1, predecessor, successor).valid).toBe(false);
    });

    it('rejects a successor starting before the first working day after the fallback boundary', () => {
        const predecessor = { startDate: parseDateOnly('2026-09-11')! };
        const successor = { startDate: parseDateOnly('2026-09-13')! };
        expect(calculateDelay(RelationType.Precedes, predecessor, successor)).toEqual({ message: 'No auto calculation due to missing dates.' });
        expect(validateRelationDelayConsistency(RelationType.Precedes, 0, predecessor, successor).valid).toBe(false);
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
