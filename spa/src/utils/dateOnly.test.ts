import { describe, expect, it } from 'vitest';
import {
    addCalendarDays,
    calendarDateKey,
    calendarWeekday,
    diffCalendarDays,
    formatDateOnly,
    parseDateOnly,
    toTimelineDate
} from './dateOnly';

describe('DateOnly', () => {
    it.each([
        '2026-01-01',
        '2026-03-08',
        '2026-11-01',
        '2028-02-29'
    ])('round-trips %s independently of the process timezone', (date) => {
        const calendarDate = parseDateOnly(date);
        expect(calendarDate).not.toBeNull();
        expect(formatDateOnly(calendarDate)).toBe(date);
        expect(calendarDateKey(calendarDate!)).toBe(date);
        expect(toTimelineDate(calendarDate!)).toBe(calendarDate);
    });

    it('rejects invalid calendar dates', () => {
        expect(parseDateOnly('2026-02-30')).toBeNull();
    });

    it.each([
        ['2026-03-07', 2],
        ['2026-03-08', 1],
        ['2026-10-31', 2],
        ['2026-11-01', 1],
        ['2028-02-28', 2]
    ])('preserves calendar arithmetic from %s by %i days', (input, days) => {
        const start = parseDateOnly(input)!;
        const result = addCalendarDays(start, days);
        expect(diffCalendarDays(start, result)).toBe(days);
    });

    it('uses the CalendarDate weekday rather than a local instant weekday', () => {
        expect(calendarWeekday(parseDateOnly('2026-03-09')!)).toBe(1);
        expect(calendarWeekday(parseDateOnly('2026-03-08')!)).toBe(0);
    });
});
