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
    isMajor: boolean;
}

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

export function getGridTicks(viewport: Viewport, viewMode: ViewMode): GridTick[] {
    const ticks: GridTick[] = [];
    const { startDate, scrollX, scale, width } = viewport;

    const startOffsetTime = scrollX / scale;
    const visibleStartTime = startDate + startOffsetTime;
    const visibleEndTime = visibleStartTime + (width / scale);

    if (viewMode === 'Month') {
        const start = new Date(visibleStartTime);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        let currentTime = start.getTime();

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - startDate) * scale - scrollX;
            // Only add if visible (with some buffer for text)
            if (x >= -100 && x <= width + 100) {
                const date = new Date(currentTime);
                const label = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); // e.g. "Dec 2025"
                ticks.push({ time: currentTime, x, label, isMajor: true });
            }

            // Advance Month
            // Use date object to correctly handle month lengths
            const d = new Date(currentTime);
            d.setMonth(d.getMonth() + 1);
            currentTime = d.getTime();
        }

    } else if (viewMode === 'Week') {
        const start = new Date(visibleStartTime);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        let currentTime = start.getTime();

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - startDate) * scale - scrollX;
            if (x >= -100 && x <= width + 100) {
                const date = new Date(currentTime);
                const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // e.g. "Dec 12"
                ticks.push({ time: currentTime, x, label, isMajor: true });
            }
            currentTime += ONE_WEEK;
        }

    } else {
        // Day View
        // Per expert review: avoid excessive Date creation if possible, but Day view needs Date for labels mostly.
        // We can optimize by calculating day #.
        let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - startDate) * scale - scrollX;
            if (x >= -100 && x <= width + 100) {
                // Optimization: Only create Date for label
                const date = new Date(currentTime);
                const label = date.getDate().toString();
                ticks.push({ time: currentTime, x, label, isMajor: false });
            }
            currentTime += ONE_DAY;
        }
    }

    return ticks;
}
