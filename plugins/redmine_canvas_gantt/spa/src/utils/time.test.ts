import { describe, expect, it } from 'vitest';
import { snapToUtcDay } from './time';

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

