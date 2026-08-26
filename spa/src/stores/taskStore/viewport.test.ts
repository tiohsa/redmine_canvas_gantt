import { describe, expect, it } from 'vitest';
import { BOTTOM_PADDING_PX, ONE_DAY_MS } from '../../constants';
import type { Viewport } from '../../types';
import {
    clampViewportScrollY,
    computeFocusedViewport,
    getMaxViewportScrollY
} from './viewport';

const viewport: Viewport = {
    startDate: Date.UTC(2026, 0, 10),
    scrollX: 0,
    scrollY: 0,
    scale: 10 / ONE_DAY_MS,
    width: 100,
    height: 100,
    rowHeight: 20
};

describe('taskStore viewport calculations', () => {
    it('computes the vertical scroll range from rows and shared bottom padding', () => {
        expect(getMaxViewportScrollY(viewport, 3)).toBe(0);
        expect(getMaxViewportScrollY(viewport, 10)).toBe(
            10 * viewport.rowHeight + BOTTOM_PADDING_PX - viewport.height
        );
    });

    it('clamps vertical scroll to the content range', () => {
        expect(clampViewportScrollY(-10, viewport, 10)).toBe(0);
        expect(clampViewportScrollY(50, viewport, 10)).toBe(50);
        expect(clampViewportScrollY(999, viewport, 10)).toBe(140);
    });

    it('centers a focused row without scrolling beyond the content bottom', () => {
        const focused = computeFocusedViewport({
            viewport,
            rowCount: 10,
            targetTimestamp: Date.UTC(2026, 0, 20),
            targetRowIndex: 9
        });

        expect(focused.startDate).toBe(viewport.startDate);
        expect(focused.scrollX).toBe(50);
        expect(focused.scrollY).toBe(140);
    });

    it('extends the timeline one week before an earlier focused task', () => {
        const targetTimestamp = Date.UTC(2026, 0, 1);

        const focused = computeFocusedViewport({
            viewport,
            rowCount: 3,
            targetTimestamp,
            targetRowIndex: 0
        });

        expect(focused.startDate).toBe(targetTimestamp - 7 * ONE_DAY_MS);
        expect(focused.scrollX).toBe(20);
        expect(focused.scrollY).toBe(0);
    });
});
