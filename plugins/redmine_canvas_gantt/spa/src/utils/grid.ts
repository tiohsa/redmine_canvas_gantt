import type { Viewport, ZoomLevel } from '../types';

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
    3: 50 / ONE_HOUR // ~1200 / day
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
}

export interface GridScales {
    top: GridTick[];
    middle: GridTick[];
    bottom: GridTick[];
}



function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `W${weekNo}`;
}

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
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            },
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
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            },
            scales.top
        );

        // Middle: Week
        // Align to Monday
        iterate(
            (t) => {
                const d = new Date(t);
                const day = d.getDay(); // 0-6
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                d.setDate(diff);
                d.setHours(0, 0, 0, 0);
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
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                d.setMonth(d.getMonth() + 1);
                return d.getTime();
            },
            (t) => {
                const d = new Date(t);
                return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            },
            scales.top
        );

        // Middle: Week
        iterate(
            (t) => {
                const d = new Date(t);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                d.setDate(diff);
                d.setHours(0, 0, 0, 0);
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
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_DAY,
            (t) => {
                const d = new Date(t);
                // Omit rule: handled by caller or simple check
                // "1 2 3..."
                return `${d.getDate()}`;
            },
            scales.bottom
        );
    }

    // --- ZOOM LEVEL 3 (Month + Week + Day + Hour) ---
    // Spec 8.4: Top=Date, Bottom=Hour
    else if (zoomLevel === 3) {
        // Top: Day (YYYY/MM/DD)
        // We put this in "Top" or "Middle"? 
        // If we strictly follow layout rows:
        // Top: Day
        // Middle: Hour
        // Bottom: ...?
        // Or Top: Month, Middle: Day, Bottom: Hour?
        // The spec example showed 2 rows. 
        // Let's use Top and Middle for now, or Middle and Bottom?
        // Standard is Top/Middle/(Bottom).

        // Let's do:
        // Top: Day
        iterate(
            (t) => {
                const d = new Date(t);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_DAY,
            (t) => {
                const d = new Date(t);
                return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
            },
            scales.top
        );

        // Middle: Hour
        iterate(
            (t) => {
                const d = new Date(t);
                d.setMinutes(0, 0, 0);
                return d.getTime();
            },
            (t) => t + ONE_HOUR,
            (t) => {
                const d = new Date(t);
                return String(d.getHours()).padStart(2, '0');
            },
            scales.middle // Using Middle for hours so it's prominent
        );

        // Bottom: Optional 15min? Spec: "Time labels... 1h/15m/30m configurable"
        // For now, just Hour in Middle.
    }

    return scales;
}
