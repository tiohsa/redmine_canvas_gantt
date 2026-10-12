import { describe, expect, it } from 'vitest';
import {
    addWorkingDays,
    configureBusinessCalendar,
    diffWorkingDays,
    isWorkingDay,
    normalizeWorkingDate,
    shiftByWorkingDays
} from './businessCalendar';
import { addCalendarDays, parseDateOnly, timelineToCalendarDate } from './dateOnly';

const date = (value: string): number => parseDateOnly(value)!;

const configured = (revision: string, nonWorkingWeekDays: number[], days: Record<string, { name: string; type: 'working' | 'non_working' }>) => ({
    status: 'ok',
    revision,
    default_calendar_id: 'test',
    project_calendar_ids: { '1': 'test' },
    calendars: {
        test: {
            id: 'test',
            name: 'Test',
            non_working_week_days: nonWorkingWeekDays,
            days
        }
    },
    warnings: []
});

// Retained day-by-day implementations serve as an independent behavioral oracle.
const oldAddWorkingDays = (timestamp: number, days: number, projectId?: string | number | Set<number>): number => {
    let current = timelineToCalendarDate(timestamp);
    let remaining = Math.max(0, Math.floor(days));
    while (remaining > 0) {
        current = addCalendarDays(current, 1);
        if (isWorkingDay(current, projectId)) remaining -= 1;
    }
    return current;
};

const oldShiftByWorkingDays = (timestamp: number, days: number, projectId?: string | number | Set<number>): number => {
    const normalizedDays = Math.trunc(days);
    if (normalizedDays === 0) return timelineToCalendarDate(timestamp);
    if (normalizedDays > 0) return oldAddWorkingDays(timestamp, normalizedDays, projectId);
    let current = timelineToCalendarDate(timestamp);
    let remaining = Math.abs(normalizedDays);
    while (remaining > 0) {
        current = addCalendarDays(current, -1);
        if (isWorkingDay(current, projectId)) remaining -= 1;
    }
    return current;
};

const oldDiffWorkingDays = (fromTimestamp: number, toTimestamp: number, projectId?: string | number | Set<number>): number => {
    const from = timelineToCalendarDate(fromTimestamp);
    const to = timelineToCalendarDate(toTimestamp);
    if (from === to) return 0;
    const step = from < to ? 1 : -1;
    let current = from;
    let delta = 0;
    while (current !== to) {
        current = addCalendarDays(current, step);
        if (isWorkingDay(current, projectId)) delta += step;
    }
    return delta;
};

const seededRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
};

describe('business calendar working-day index', () => {
    it('matches the day-by-day oracle over fixed-seed ranges and legacy weekday sets', () => {
        configureBusinessCalendar(configured('seeded', [0, 6], {
            '2026-01-01': { name: 'New year', type: 'non_working' },
            '2026-01-03': { name: 'Weekend workday', type: 'working' },
            '2027-07-14': { name: 'Summer closure', type: 'non_working' },
            '2028-02-19': { name: 'Special workday', type: 'working' },
            '2029-11-05': { name: 'Holiday', type: 'non_working' }
        }));
        const random = seededRandom(0x5eedcafe);
        const base = date('2026-01-01');
        const calendars: Array<string | Set<number>> = ['1', new Set([0, 6]), new Set([5, 6])];

        for (let index = 0; index < 500; index += 1) {
            const from = addCalendarDays(base, Math.floor(random() * 1600));
            const to = addCalendarDays(base, Math.floor(random() * 1600));
            const shifted = random() < 0.5 ? from + 12 * 60 * 60 * 1000 - 1 : from + 12 * 60 * 60 * 1000;
            const amount = Math.floor(random() * 100) - 50 + (random() < 0.5 ? 0.8 : 0.2);
            const projectId = calendars[Math.floor(random() * calendars.length)];

            expect(addWorkingDays(shifted, amount, projectId)).toBe(oldAddWorkingDays(shifted, amount, projectId));
            expect(shiftByWorkingDays(shifted, amount, projectId)).toBe(oldShiftByWorkingDays(shifted, amount, projectId));
            expect(diffWorkingDays(from, to, projectId)).toBe(oldDiffWorkingDays(from, to, projectId));
        }
    });

    it('preserves directed endpoint counting, rounding, and non-working starts', () => {
        configureBusinessCalendar(configured('directed', [0, 6], {}));
        const monday = date('2027-01-04');
        const saturday = date('2027-01-09');
        const sunday = date('2027-01-10');

        expect(diffWorkingDays(monday, saturday, '1')).toBe(4);
        expect(diffWorkingDays(saturday, monday, '1')).toBe(-5);
        expect(diffWorkingDays(saturday, sunday, '1')).toBe(0);
        expect(diffWorkingDays(sunday, saturday, '1')).toBe(0);
        expect(addWorkingDays(date('2027-01-02'), 1.9, '1')).toBe(date('2027-01-04'));
        expect(addWorkingDays(date('2027-01-04'), -2, '1')).toBe(date('2027-01-04'));
        expect(shiftByWorkingDays(date('2027-01-04'), -1.9, '1')).toBe(date('2027-01-01'));
    });

    it('clears cached indexes when contents change under the same revision', () => {
        configureBusinessCalendar(configured('same-revision', [0, 6], {}));
        expect(addWorkingDays(date('2027-01-01'), 1, '1')).toBe(date('2027-01-04'));

        configureBusinessCalendar(configured('same-revision', [0, 6], {
            '2027-01-02': { name: 'Saturday workday', type: 'working' }
        }));
        expect(addWorkingDays(date('2027-01-01'), 1, '1')).toBe(date('2027-01-02'));
    });

    it('uses the current contents of a legacy weekday Set after it is mutated', () => {
        configureBusinessCalendar(undefined);
        const nonWorkingDays = new Set([0, 6]);
        expect(addWorkingDays(date('2027-01-01'), 1, nonWorkingDays)).toBe(date('2027-01-04'));
        nonWorkingDays.delete(6);
        expect(addWorkingDays(date('2027-01-01'), 1, nonWorkingDays)).toBe(date('2027-01-02'));
    });

    it('rebuilds an evicted index after the bounded LRU fills', () => {
        const calendars: Record<string, unknown> = {};
        const projectCalendarIds: Record<string, string> = {};
        for (let index = 0; index < 13; index += 1) {
            const id = `calendar-${index}`;
            calendars[id] = {
                id,
                name: id,
                non_working_week_days: [index % 7],
                days: { '2027-01-02': { name: 'Override', type: index === 1 ? 'working' : 'non_working' } }
            };
            projectCalendarIds[String(index)] = id;
        }
        configureBusinessCalendar({
            status: 'ok',
            revision: 'thirteen-calendars',
            default_calendar_id: 'calendar-0',
            project_calendar_ids: projectCalendarIds,
            calendars,
            warnings: []
        });

        for (let index = 0; index < 12; index += 1) addWorkingDays(date('2027-01-01'), 1, String(index));
        addWorkingDays(date('2027-01-01'), 1, '0'); // Promote the oldest entry before inserting another.
        addWorkingDays(date('2027-01-01'), 1, '12');
        expect(addWorkingDays(date('2027-01-01'), 1, '1')).toBe(date('2027-01-02'));
    });

    it('falls back to the day walk outside the bounded daily index window', () => {
        configureBusinessCalendar(configured('outside-window', [0, 6], {
            '2010-12-31': { name: 'Year end closure', type: 'non_working' }
        }));
        const from = date('1999-12-31');
        const to = date('2020-01-02');
        expect(diffWorkingDays(from, to, '1')).toBe(oldDiffWorkingDays(from, to, '1'));
        expect(addWorkingDays(from, 5_000, '1')).toBe(oldAddWorkingDays(from, 5_000, '1'));
    });

    it('throws explicitly when no working date exists in the requested direction', () => {
        configureBusinessCalendar(configured('closed', [0, 1, 2, 3, 4, 5, 6], {}));
        expect(() => addWorkingDays(date('2027-01-01'), 1, '1')).toThrow(RangeError);
        expect(() => shiftByWorkingDays(date('2027-01-01'), -1, '1')).toThrow(RangeError);
        expect(() => normalizeWorkingDate(date('2027-01-01'), 'forward', '1')).toThrow(RangeError);
        expect(() => normalizeWorkingDate(date('2027-01-01'), 'backward', '1')).toThrow(RangeError);
        expect(() => addWorkingDays(date('1950-01-01'), 1, '1')).toThrow(RangeError);

        const allDaysNonWorking = new Set([0, 1, 2, 3, 4, 5, 6]);
        expect(() => addWorkingDays(date('2027-01-01'), 1, allDaysNonWorking)).toThrow(RangeError);
    });

    it('uses explicit working overrides when the weekly pattern has no working days', () => {
        configureBusinessCalendar(configured('override-only', [0, 1, 2, 3, 4, 5, 6], {
            '2027-01-03': { name: 'One day open', type: 'working' },
            '2027-01-10': { name: 'Another day open', type: 'working' }
        }));
        expect(addWorkingDays(date('2027-01-01'), 1, '1')).toBe(date('2027-01-03'));
        expect(() => addWorkingDays(date('2027-01-10'), 1, '1')).toThrow(RangeError);
    });

});

