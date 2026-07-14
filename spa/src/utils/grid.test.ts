import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGridScales, ZOOM_SCALES } from './grid';

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date).getTime();

const viewportFor = (startDate: number) => ({
    startDate,
    scrollX: 0,
    scrollY: 0,
    scale: ZOOM_SCALES[2],
    width: 40,
    height: 200,
    rowHeight: 36
});

describe('getGridScales', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('provides a localized short weekday as a secondary day label', () => {
        const monday = day(2025, 1, 6);
        vi.stubGlobal('RedmineCanvasGantt', { language: 'en' });

        const scales = getGridScales(viewportFor(monday), 2);
        const tick = scales.bottom.find((tick) => tick.time === monday);

        expect(tick?.label).toBe('6');
        expect(tick?.secondaryLabel).toBe('Mon');
    });

    it('uses the configured locale for weekday labels', () => {
        const monday = day(2025, 1, 6);
        vi.stubGlobal('RedmineCanvasGantt', { language: 'ja' });

        const scales = getGridScales(viewportFor(monday), 2);
        const tick = scales.bottom.find((tick) => tick.time === monday);

        expect(tick?.label).toBe('6');
        expect(tick?.secondaryLabel).toBe('月');
    });

    it('keeps month and week labels unchanged', () => {
        vi.stubGlobal('RedmineCanvasGantt', {
            language: 'en',
            yearMonthFormat: '%Y-%m'
        });

        const scales = getGridScales(viewportFor(day(2025, 1, 6)), 1);

        expect(scales.top.some((tick) => tick.label === '2025-01')).toBe(true);
        expect(scales.middle.some((tick) => tick.label === 'W2')).toBe(true);
    });
});
