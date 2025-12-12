import { describe, it, expect } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import type { Viewport, Task } from '../types';

describe('LayoutEngine', () => {
    const mockViewport: Viewport = {
        startDate: new Date('2024-01-01').getTime(),
        scrollX: 0,
        scrollY: 0,
        scale: 1, // 1 px per ms
        width: 800,
        height: 600,
        rowHeight: 40
    };

    it('dateToX converts date to x coordinate accurately', () => {
        const date = new Date('2024-01-02').getTime(); // +1 day
        // 1 day = 86400000 ms
        const expectedX = 86400000;
        expect(LayoutEngine.dateToX(date, mockViewport)).toBe(expectedX);
    });

    it('getTaskBounds returns correct geometry', () => {
        const task: Task = {
            id: '1',
            subject: 'Test',
            startDate: new Date('2024-01-01').getTime(),
            dueDate: new Date('2024-01-02').getTime(),
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport);
        expect(bounds.x).toBe(0);
        expect(bounds.width).toBe(86400000);
        expect(bounds.y).toBe(5); // rowHeight * 0 + 5 padding
    });
});
