import { describe, expect, it } from 'vitest';
import { computeContentSizes, mapDomScrollToViewport, mapViewportToDomScroll } from './contentSize';
import type { Viewport } from '../../types';

const baseViewport: Viewport = {
    startDate: new Date('2025-01-01').getTime(),
    scrollX: 0,
    scrollY: 0,
    scale: 0.001,
    width: 1000,
    height: 600,
    rowHeight: 36
};

describe('computeContentSizes', () => {
    it('tasksMaxDue がない場合でも可視領域に基づいてサイズを計算する', () => {
        const result = computeContentSizes({
            viewport: baseViewport,
            rowCount: 10,
            tasksMaxDue: null,
            oneDayMs: 24 * 60 * 60 * 1000,
            bottomPaddingPx: 40,
            maxScrollAreaPx: 10_000
        });

        expect(result.realContentSize.width).toBeGreaterThanOrEqual(baseViewport.width);
        expect(result.realContentSize.height).toBe(Math.max(baseViewport.height, 10 * baseViewport.rowHeight + 40));
    });

    it('scroll サイズは MAX_SCROLL_AREA_PX の上限でクランプされる', () => {
        const hugeDue = baseViewport.startDate + (3650 * 24 * 60 * 60 * 1000);
        const result = computeContentSizes({
            viewport: baseViewport,
            rowCount: 1_000_000,
            tasksMaxDue: hugeDue,
            oneDayMs: 24 * 60 * 60 * 1000,
            bottomPaddingPx: 40,
            maxScrollAreaPx: 5000
        });

        expect(result.realContentSize.width).toBeGreaterThan(5000);
        expect(result.realContentSize.height).toBeGreaterThan(5000);
        expect(result.scrollContentSize.width).toBe(5000);
        expect(result.scrollContentSize.height).toBe(5000);
    });
});

describe('scroll mapping', () => {
    const params = {
        viewportWidth: 1000,
        viewportHeight: 600,
        realContentSize: { width: 10_000, height: 5000 },
        scrollContentSize: { width: 5000, height: 2500 }
    };

    it('可動領域ゼロの場合は 0 を返す', () => {
        const mapped = mapDomScrollToViewport(100, 200, {
            viewportWidth: 1000,
            viewportHeight: 600,
            realContentSize: { width: 1000, height: 600 },
            scrollContentSize: { width: 1000, height: 600 }
        });
        expect(mapped).toEqual({ x: 0, y: 0 });

        const reverse = mapViewportToDomScroll(100, 200, {
            viewportWidth: 1000,
            viewportHeight: 600,
            realContentSize: { width: 1000, height: 600 },
            scrollContentSize: { width: 1000, height: 600 }
        });
        expect(reverse).toEqual({ left: 0, top: 0 });
    });

    it('viewport -> dom -> viewport で概ね往復一致する', () => {
        const dom = mapViewportToDomScroll(3200, 1500, params);
        const viewport = mapDomScrollToViewport(dom.left, dom.top, params);

        expect(Math.abs(viewport.x - 3200)).toBeLessThanOrEqual(2);
        expect(Math.abs(viewport.y - 1500)).toBeLessThanOrEqual(2);
    });
});
