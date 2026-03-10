import type { Viewport } from '../../types';

export const computeCenteredViewport = (viewport: Viewport, newScale: number, tasksMaxDue: number | null): { scrollX: number; startDate: number } => {
    const safeScale = viewport.scale || 0.00000001;
    const centerDate = viewport.startDate + (viewport.scrollX + viewport.width / 2) / safeScale;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const paddingMs = 60 * ONE_DAY;

    let nextScrollX = (centerDate - viewport.startDate) * newScale - viewport.width / 2;
    let nextStartDate = viewport.startDate;

    if (nextScrollX < 0) {
        const shortfallMs = -nextScrollX / newScale;
        nextStartDate = viewport.startDate - shortfallMs - 14 * ONE_DAY;
        nextScrollX = (centerDate - nextStartDate) * newScale - viewport.width / 2;
    }

    const visibleMs = viewport.width / newScale;
    const minRangeEnd = centerDate + visibleMs / 2;
    const rangeEnd = Math.max(tasksMaxDue ?? minRangeEnd, minRangeEnd) + paddingMs;
    const maxScrollX = Math.max(0, (rangeEnd - nextStartDate) * newScale - viewport.width);

    if (nextScrollX > maxScrollX) nextScrollX = maxScrollX;
    if (nextScrollX < 0) nextScrollX = 0;

    return { scrollX: nextScrollX, startDate: nextStartDate };
};
