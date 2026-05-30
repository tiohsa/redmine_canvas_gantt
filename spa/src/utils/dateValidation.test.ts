import { describe, it, expect } from 'vitest';
import { validateDateRange } from './dateValidation';

describe('validateDateRange', () => {
    it('returns valid when both dates are correct and chronological', () => {
        const result = validateDateRange({
            currentStartDate: 1000,
            currentDueDate: 2000,
            nextStartDate: 1500,
            nextDueDate: 1800,
        });
        expect(result).toEqual({ valid: true });
    });

    it('returns valid when start date is shifted correctly below current due date', () => {
        const result = validateDateRange({
            currentStartDate: 1000,
            currentDueDate: 2000,
            nextStartDate: 1200,
        });
        expect(result).toEqual({ valid: true });
    });

    it('returns start_after_due when nextStartDate is greater than currentDueDate', () => {
        const result = validateDateRange({
            currentStartDate: 1000,
            currentDueDate: 2000,
            nextStartDate: 2500,
        });
        expect(result).toEqual({ valid: false, reason: 'start_after_due' });
    });

    it('returns due_before_start when nextDueDate is less than currentStartDate', () => {
        const result = validateDateRange({
            currentStartDate: 1000,
            currentDueDate: 2000,
            nextDueDate: 500,
        });
        expect(result).toEqual({ valid: false, reason: 'due_before_start' });
    });

    it('returns valid when one date is undefined/missing', () => {
        const result1 = validateDateRange({
            currentStartDate: 1000,
            nextStartDate: 1500,
        });
        expect(result1).toEqual({ valid: true });

        const result2 = validateDateRange({
            currentDueDate: 2000,
            nextDueDate: 1800,
        });
        expect(result2).toEqual({ valid: true });
    });

    it('returns valid when a date value is NaN', () => {
        const result = validateDateRange({
            currentStartDate: NaN,
            currentDueDate: 2000,
            nextStartDate: 1500,
        });
        expect(result).toEqual({ valid: true });
    });
});
