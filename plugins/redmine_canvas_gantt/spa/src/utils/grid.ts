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
    bottom: GridTick[];
}

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export function getGridScales(viewport: Viewport, viewMode: ViewMode): GridScales {
    const scales: GridScales = { top: [], bottom: [] };
    const { startDate, scrollX, scale, width } = viewport;

    const startOffsetTime = scrollX / scale;
    const visibleStartTime = startDate + startOffsetTime;
    const visibleEndTime = visibleStartTime + (width / scale);

    // Padding for smooth scrolling - increased for top scales to ensure covering interval is included
    const PAD = 10000;

    const getX = (t: number) => (t - startDate) * scale - scrollX;

    if (viewMode === 'Month') {
        // Bottom: Months
        // Top: Years

        // Generate Bottom (Months)
        {
            const start = new Date(visibleStartTime);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            let t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.bottom.push({
                        time: t,
                        x,
                        label: (d.getMonth() + 1).toString()
                    });
                }
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                t = d.getTime();
            }
        }

        // Generate Top (Years)
        {
            const start = new Date(visibleStartTime);
            start.setMonth(0, 1); // Jan 1
            start.setHours(0, 0, 0, 0);
            let t = start.getTime();

            // We might need to go back one year to ensure label is visible if start is mid-year?
            // Actually, we usually label at the start tick. 
            // If the year started before visible area, we might want to know that.
            // For now, simpler logic: iterate years.

            // Adjust start to be safe
            start.setFullYear(start.getFullYear() - 1);
            t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                // Allow wider range for top labels to appear even if tick is slightly off screen?
                // Or just standard range. 
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.top.push({
                        time: t,
                        x,
                        label: d.getFullYear().toString()
                    });
                }
                const d = new Date(t);
                d.setFullYear(d.getFullYear() + 1);
                t = d.getTime();
            }
        }

    } else if (viewMode === 'Week') {
        // Bottom: Weeks
        // Top: Months

        // Generate Bottom (Weeks)
        {
            const start = new Date(visibleStartTime);
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            start.setHours(0, 0, 0, 0);
            let t = start.getTime();

            while (t <= visibleEndTime) {
                const x = getX(t);
                if (x >= -PAD && x <= width + PAD) {
                    const d = new Date(t);
                    scales.bottom.push({
                        time: t,
                        x,
                        label: getWeekNumber(d).toString()
                    });
                }
                t += ONE_WEEK;
            }
        }

        // Generate Top (Months)
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
                        label: `${d.getFullYear()}-${d.getMonth() + 1}`
                    });
                }
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                t = d.getTime();
            }
        }

    } else {
        // Day View
        // Bottom: Days
        // Top: Months

        // Bottom (Days)
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
                        label: d.getDate().toString()
                    });
                }
                t += ONE_DAY;
            }
        }

        // Top (Months)
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
                        label: `${d.getFullYear()}-${d.getMonth() + 1}`
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
