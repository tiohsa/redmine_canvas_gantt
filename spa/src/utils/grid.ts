import type { Viewport, ZoomLevel } from '../types';
import { formatExplicit, getYearMonthFormat } from './dateUtils';

// Milliseconds constants
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const ONE_WEEK = 7 * ONE_DAY;

// Scale definitions (pixels per millisecond)
// Zoom 0 (Month): ~60px / month (~30 days) => 2px / day
// Zoom 1 (Week): ~140px / week => 20px / day (Current) -> Spec says Month+Week.
// Let's use the explicit constants defined in previous thought or consistent with "Unit Width".
// Zoom 0: Month Basic. 2px/day.
// Zoom 1: Month+Week. 10px/day.
// Zoom 2: Month+Week+Day. 40px/day.
// Zoom 3: Month+Week+Day+Hour. 50px/hour = 1200px/day.

export const ZOOM_SCALES: Record<ZoomLevel, number> = {
    0: 2 / ONE_DAY,
    1: 10 / ONE_DAY,
    2: 40 / ONE_DAY,

};

// Legacy SCALES for backward compatibility if needed, but we try to route through ZoomLevel
export const SCALES = {
    Day: ZOOM_SCALES[2],
    Week: ZOOM_SCALES[1],
    Month: ZOOM_SCALES[0]
};

export interface GridTick {
    time: number;
    x: number;
    label: string;
    secondaryLabel?: string;
}

export interface GridScales {
    top: GridTick[];
    middle: GridTick[];
    bottom: GridTick[];
}



function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `W${weekNo}`;
}

// Grid ticks are Redmine date-only values. Build a local Date from UTC
// components only for formatting, so date-fns cannot shift the displayed day.
const dateForGridDisplay = (timestamp: number): Date => {
    const date = new Date(timestamp);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/**
 * Calculates grid ticks based on ZoomLevel.
 * 
 * Zoom 0: Top=Year(change), Middle=Month, Bottom=Empty
 * Zoom 1: Top=Month, Middle=Week, Bottom=Empty
 * Zoom 2: Top=Month, Middle=Week, Bottom=Day
 * Zoom 3: Top=Day, Middle=Hour? (Spec says Method+Week+Day+Hour... 
 *         But visually we likely only show 2-3 levels. 
 *         Let's implement: Top=Month+Week? or Day? 
 *         Spec 8.4: Top=Date(2025/01/01), Bottom=Hour(00 01...)
 *         So: Top=Day, Middle=Hour.
 */
export function getGridScales(viewport: Viewport, zoomLevel: ZoomLevel): GridScales {
    const scales: GridScales = { top: [], middle: [], bottom: [] };
    const { startDate, scrollX, scale, width } = viewport;

    const startOffsetTime = scrollX / scale;
    const visibleStartTime = startDate + startOffsetTime;
    const visibleEndTime = visibleStartTime + (width / scale);
    const PAD = width; // Pad with 1 screen width

    const getX = (t: number) => (t - startDate) * scale - scrollX;

    // Helper to iterate time
    const iterate = (
        startAlign: (t: number) => number,
        increment: (t: number) => number,
        labelFn: (t: number) => string,
        targetArray: GridTick[]
    ) => {
        let t = startAlign(visibleStartTime - PAD / scale); // Start earlier
        const endT = visibleEndTime + PAD / scale;

        // Safety break
        let loops = 0;
        while (t <= endT && loops < 10000) {
            const x = getX(t);
            // Only push if reasonably close to visible or check inside consumer
            // But we already padded the time range.
            // We'll push all in range.
            targetArray.push({ time: t, x, label: labelFn(t) });
            t = increment(t);
            loops++;
        }
    };

    // --- ZOOM LEVEL 0 (Month View) ---
    if (zoomLevel === 0) {
        // Top: Empty/Removed
        // Middle: Month (YYYY-MM)

        iterate(
            (t) => {
                const d = new Date(t);
                d.setUTCDate(1);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setUTCMonth(d.getUTCMonth() + 1);
                return d.getTime();
            },
            (t) => formatExplicit(dateForGridDisplay(t), getYearMonthFormat()),
            scales.middle
        );
    }

    // --- ZOOM LEVEL 1 (Month + Week) ---
    else if (zoomLevel === 1) {
        // Top: Month (YYYY/MM)
        // Middle: Week (W1, W2...)

        // Top: Month
        iterate(
            (t) => {
                const d = new Date(t);
                d.setUTCDate(1);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setUTCMonth(d.getUTCMonth() + 1);
                return d.getTime();
            },
            (t) => formatExplicit(dateForGridDisplay(t), getYearMonthFormat()),
            scales.top
        );

        // Middle: Week
        // Align to Monday
        iterate(
            (t) => {
                const d = new Date(t);
                const day = d.getUTCDay(); // 0-6
                const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
                d.setUTCDate(diff);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_WEEK,
            (t) => getWeekNumber(new Date(t)),
            scales.middle
        );
    }

    // --- ZOOM LEVEL 2 (Month + Week + Day) ---
    else if (zoomLevel === 2) {
        // Top: Month (YYYY/MM)
        iterate(
            (t) => {
                const d = new Date(t);
                d.setUTCDate(1);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setUTCMonth(d.getUTCMonth() + 1);
                return d.getTime();
            },
            (t) => formatExplicit(dateForGridDisplay(t), getYearMonthFormat()),
            scales.top
        );

        // Middle: Week
        iterate(
            (t) => {
                const d = new Date(t);
                const day = d.getUTCDay();
                const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
                d.setUTCDate(diff);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_WEEK,
            (t) => getWeekNumber(new Date(t)),
            scales.middle
        );

        // Bottom: Day
        iterate(
            (t) => {
                const d = new Date(t);
                d.setUTCHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_DAY,
            (t) => formatExplicit(dateForGridDisplay(t), 'd'),
            scales.bottom
        );

        scales.bottom.forEach((tick) => {
            tick.secondaryLabel = formatExplicit(dateForGridDisplay(tick.time), 'EEE');
        });
    }



    return scales;
}
