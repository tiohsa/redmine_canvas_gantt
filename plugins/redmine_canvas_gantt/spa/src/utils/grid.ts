import type { ViewMode, Viewport } from '../types';

export const SCALES = {
    Day: 50 / (24 * 60 * 60 * 1000),   // 50px per day
    Week: 20 / (24 * 60 * 60 * 1000),  // 20px per day (~140px per week)
    Month: 2 / (24 * 60 * 60 * 1000)   // 2px per day (~60px per month)
};

export interface GridTick {
    time: number;
    x: number;
    label: string;
}

export interface GridScales {
    top: GridTick[];
    middle: GridTick[];
    bottom: GridTick[];
}

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;
const JP_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export function getGridScales(viewport: Viewport, viewMode: ViewMode): GridScales {
    const scales: GridScales = { top: [], middle: [], bottom: [] };
    const { startDate, scrollX, scale, width } = viewport;

    const startOffsetTime = scrollX / scale;
    const visibleStartTime = startDate + startOffsetTime;
    const visibleEndTime = visibleStartTime + (width / scale);

    // Padding for smooth scrolling - increased for top scales to ensure covering interval is included
    const PAD = 10000;

    const getX = (t: number) => (t - startDate) * scale - scrollX;

    // Helper: Monday 00:00 of the week containing the given timestamp
    const startOfWeekMonday = (time: number) => {
        const d = new Date(time);
        const day = d.getDay(); // 0(Sun) - 6(Sat)
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };

    if (viewMode === 'Month') {
        // Bottom: Days (if visible enough) or Weeks; Middle: Weeks; Top: Year-Month

        // Top (Year-Month)
        {
            const start = new Date(visibleStartTime);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            start.setMonth(start.getMonth() - 1);
            let t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.top.push({
                        time: t,
                        x,
                        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    });
                }
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                t = d.getTime();
            }
        }

        // Middle (Weeks)
        {
            let t = startOfWeekMonday(visibleStartTime) - ONE_WEEK;

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.middle.push({
                        time: t,
                        x,
                        label: getWeekNumber(d).toString()
                    });
                }
                t += ONE_WEEK;
            }
        }

        // Bottom (Days) - only if 1 day is wide enough to label
        {
            const dayWidth = ONE_DAY * scale;
            if (dayWidth >= 10) {
                const startT = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;
                let t = startT;
                while (t <= visibleEndTime) {
                    const x = getX(t);
                    if (x >= -PAD && x <= width + PAD) {
                        const d = new Date(t);
                        scales.bottom.push({
                            time: t,
                            x,
                            label: `${d.getDate()} ${JP_WEEKDAYS[d.getDay()]}`
                        });
                    }
                    t += ONE_DAY;
                }
            }
        }

    } else if (viewMode === 'Week') {
        // Top: Year-Month, Middle: Weeks, Bottom: Days (if visible enough)

        // Middle (Weeks)
        {
            let t = startOfWeekMonday(visibleStartTime) - ONE_WEEK;

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.middle.push({
                        time: t,
                        x,
                        label: getWeekNumber(d).toString()
                    });
                }
                t += ONE_WEEK;
            }
        }

        // Top (Year-Month)
        {
            const start = new Date(visibleStartTime);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            // Safety back one month
            start.setMonth(start.getMonth() - 1);
            let t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.top.push({
                        time: t,
                        x,
                        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    });
                }
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                t = d.getTime();
            }
        }

        // Bottom (Days) - only if 1 day is wide enough to label
        {
            const dayWidth = ONE_DAY * scale;
            if (dayWidth >= 10) {
                const startT = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;
                let t = startT;
                while (t <= visibleEndTime) {
                    const x = getX(t);
                    if (x >= -PAD && x <= width + PAD) {
                        const d = new Date(t);
                        scales.bottom.push({
                            time: t,
                            x,
                            label: `${d.getDate()} ${JP_WEEKDAYS[d.getDay()]}`
                        });
                    }
                    t += ONE_DAY;
                }
            }
        }

    } else {
        // Day View
        // Top: Year-Month, Middle: Weeks, Bottom: Day + weekday

        // Bottom (Day + weekday)
        {
            const startT = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;
            let t = startT;
            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.bottom.push({
                        time: t,
                        x,
                        label: `${d.getDate()} ${JP_WEEKDAYS[d.getDay()]}`
                    });
                }
                t += ONE_DAY;
            }
        }

        // Middle (Weeks)
        {
            let t = startOfWeekMonday(visibleStartTime) - ONE_WEEK;
            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.middle.push({
                        time: t,
                        x,
                        label: getWeekNumber(d).toString()
                    });
                }
                t += ONE_WEEK;
            }
        }

        // Top (Year-Month)
        {
            const start = new Date(visibleStartTime);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            start.setMonth(start.getMonth() - 1);
            let t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.top.push({
                        time: t,
                        x,
                        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    });
                }
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                t = d.getTime();
            }
        }
    }

    return scales;
}
