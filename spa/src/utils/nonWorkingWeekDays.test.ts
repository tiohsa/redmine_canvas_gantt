import { afterEach, describe, expect, it } from 'vitest';
import { getNonWorkingWeekDays } from './nonWorkingWeekDays';

const originalConfig = window.RedmineCanvasGantt;

afterEach(() => {
    window.RedmineCanvasGantt = originalConfig;
});

const setNonWorkingWeekDays = (nonWorkingWeekDays: number[]) => {
    window.RedmineCanvasGantt = {
        ...(window.RedmineCanvasGantt || {}),
        nonWorkingWeekDays
    } as Window['RedmineCanvasGantt'];
};

describe('getNonWorkingWeekDays', () => {
    it('normalizes Redmine weekdays [6, 7] as Saturday and Sunday', () => {
        setNonWorkingWeekDays([6, 7]);

        expect([...getNonWorkingWeekDays()].sort()).toEqual([0, 6]);
    });

    it('preserves already normalized internal weekdays', () => {
        setNonWorkingWeekDays([0, 6]);

        expect([...getNonWorkingWeekDays()].sort()).toEqual([0, 6]);
    });

    it('treats an explicit empty array as no non-working weekdays', () => {
        setNonWorkingWeekDays([]);

        expect([...getNonWorkingWeekDays()]).toEqual([]);
    });

    it('falls back to weekends when all provided values are invalid', () => {
        setNonWorkingWeekDays([-1, 8]);

        expect([...getNonWorkingWeekDays()].sort()).toEqual([0, 6]);
    });

    it('treats all seven Redmine weekdays as no non-working weekdays', () => {
        setNonWorkingWeekDays([1, 2, 3, 4, 5, 6, 7]);

        expect([...getNonWorkingWeekDays()]).toEqual([]);
    });
});
