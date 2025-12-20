import { describe, expect, it } from 'vitest';
import { useTaskStore } from './TaskStore';
import { ZOOM_SCALES } from '../utils/grid';

describe('TaskStore viewport clamping', () => {
    it('updateViewport は scrollY を rowCount に合わせてクランプする', () => {
        useTaskStore.setState({
            rowCount: 10,
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 64,
                rowHeight: 32
            }
        });

        // totalHeight=320, maxScrollY=256
        useTaskStore.getState().updateViewport({ scrollY: 9999 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(256);

        useTaskStore.getState().updateViewport({ scrollY: -10 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(0);
    });
});

describe('TaskStore zoom behavior', () => {
    it('setZoomLevel は表示範囲の左端を維持する', () => {
        useTaskStore.setState({
            zoomLevel: 1,
            viewport: {
                startDate: 0,
                scrollX: 500,
                scrollY: 0,
                scale: ZOOM_SCALES[1],
                width: 800,
                height: 600,
                rowHeight: 32
            }
        });

        useTaskStore.getState().setZoomLevel(2);

        const { viewport, zoomLevel } = useTaskStore.getState();
        const expectedScrollX = 500 * (ZOOM_SCALES[2] / ZOOM_SCALES[1]);
        expect(zoomLevel).toBe(2);
        expect(viewport.scrollX).toBeCloseTo(expectedScrollX, 6);
    });

    it('setViewMode は表示範囲の左端を維持する', () => {
        useTaskStore.setState({
            zoomLevel: 2,
            viewMode: 'Day',
            viewport: {
                startDate: 1000,
                scrollX: 300,
                scrollY: 0,
                scale: ZOOM_SCALES[2],
                width: 800,
                height: 600,
                rowHeight: 32
            }
        });

        useTaskStore.getState().setViewMode('Month');

        const { viewport, zoomLevel, viewMode } = useTaskStore.getState();
        const expectedScrollX = 300 * (ZOOM_SCALES[0] / ZOOM_SCALES[2]);
        expect(viewMode).toBe('Month');
        expect(zoomLevel).toBe(0);
        expect(viewport.scrollX).toBeCloseTo(expectedScrollX, 6);
    });
});
