import type { Viewport } from '../../types';
import { BOTTOM_PADDING_PX, ONE_DAY_MS } from '../../constants';

type FocusedViewportParams = {
    viewport: Viewport;
    rowCount: number;
    targetTimestamp: number;
    targetRowIndex: number;
};

export const getMaxViewportScrollY = (viewport: Viewport, rowCount: number): number => (
    Math.max(0, rowCount * viewport.rowHeight + BOTTOM_PADDING_PX - viewport.height)
);

export const clampViewportScrollY = (
    scrollY: number,
    viewport: Viewport,
    rowCount: number
): number => Math.max(0, Math.min(getMaxViewportScrollY(viewport, rowCount), scrollY));

export const computeFocusedViewport = ({
    viewport,
    rowCount,
    targetTimestamp,
    targetRowIndex
}: FocusedViewportParams): Viewport => {
    let startDate = viewport.startDate;

    if (targetTimestamp < startDate) {
        startDate = targetTimestamp - 7 * ONE_DAY_MS;
    }

    const taskX = (targetTimestamp - startDate) * viewport.scale;
    const scrollX = Math.max(0, taskX - viewport.width / 2);
    const rawScrollY = targetRowIndex * viewport.rowHeight
        - (viewport.height - viewport.rowHeight) / 2;

    return {
        ...viewport,
        startDate,
        scrollX,
        scrollY: clampViewportScrollY(rawScrollY, viewport, rowCount)
    };
};

export const computeCenteredViewport = (viewport: Viewport, newScale: number, tasksMaxDue: number | null): { scrollX: number; startDate: number } => {
    const safeScale = viewport.scale || 0.00000001;
    const centerDate = viewport.startDate + (viewport.scrollX + viewport.width / 2) / safeScale;
    const paddingMs = 60 * ONE_DAY_MS;

    let nextScrollX = (centerDate - viewport.startDate) * newScale - viewport.width / 2;
    let nextStartDate = viewport.startDate;

    if (nextScrollX < 0) {
        const shortfallMs = -nextScrollX / newScale;
        nextStartDate = viewport.startDate - shortfallMs - 14 * ONE_DAY_MS;
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
