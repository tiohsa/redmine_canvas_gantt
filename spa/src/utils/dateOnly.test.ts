import { describe, expect, it } from 'vitest';
import { formatDateOnly, parseDateOnly } from './dateOnly';

describe('DateOnly', () => {
    it('round-trips a calendar date without UTC conversion', () => {
        const timestamp = parseDateOnly('2026-07-27');
        expect(timestamp).not.toBeNull();
        expect(formatDateOnly(timestamp)).toBe('2026-07-27');
    });

    it('rejects invalid calendar dates', () => {
        expect(parseDateOnly('2026-02-30')).toBeNull();
    });
});
