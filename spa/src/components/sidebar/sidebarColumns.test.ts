import { describe, expect, it } from 'vitest';
import { formatHoursMinutes } from './sidebarColumns';

describe('formatHoursMinutes ([h]:mm)', () => {
    it.each([
        [0, '0:00'],
        [1.5, '1:30'],
        [8.75, '8:45'],
        [1.999, '2:00'],
        [100.25, '100:15']
    ])('formats %s hours as %s', (hours, expected) => {
        expect(formatHoursMinutes(hours)).toBe(expected);
    });
});
