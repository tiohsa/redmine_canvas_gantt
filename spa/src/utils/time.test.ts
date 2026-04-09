import { describe, expect, it } from 'vitest';
import { formatLocalDateInputValue, parseLocalDateInputValue, snapToUtcDay } from './time';

describe('snapToUtcDay', () => {
    it('UTC 00:00 にスナップする', () => {
        const base = Date.UTC(2024, 0, 1, 0, 0, 0, 0);
        expect(snapToUtcDay(base)).toBe(base);
    });

    it('UTC 11:59 は当日にスナップする', () => {
        const base = Date.UTC(2024, 0, 1, 0, 0, 0, 0);
        const input = base + 11 * 60 * 60 * 1000 + 59 * 60 * 1000;
        expect(snapToUtcDay(input)).toBe(base);
    });

    it('UTC 12:00 は翌日にスナップする', () => {
        const base = Date.UTC(2024, 0, 1, 0, 0, 0, 0);
        const input = base + 12 * 60 * 60 * 1000;
        expect(snapToUtcDay(input)).toBe(Date.UTC(2024, 0, 2, 0, 0, 0, 0));
    });
});

describe('local date input helpers', () => {
    it('formats a local-midnight timestamp without shifting the calendar day', () => {
        const timestamp = new Date(2026, 3, 7).getTime();
        expect(formatLocalDateInputValue(timestamp)).toBe('2026-04-07');
    });

    it('parses a date input value as local midnight instead of UTC midnight', () => {
        const timestamp = parseLocalDateInputValue('2026-04-07');
        expect(timestamp).toBe(new Date(2026, 3, 7).getTime());
    });

    it('round-trips a local calendar day without shifting', () => {
        const original = new Date(2026, 3, 7).getTime();
        expect(parseLocalDateInputValue(formatLocalDateInputValue(original))).toBe(original);
    });
});
