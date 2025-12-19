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
        expect(bounds.y).toBe(13); // centered half-height bar in 40px row
        expect(bounds.height).toBe(15);
    });

    it('getTaskBounds snaps start/end to local day grid', () => {
        const task: Task = {
            id: '1',
            subject: 'Snap',
            startDate: new Date(2024, 0, 1, 12, 0, 0, 0).getTime(),
            dueDate: new Date(2024, 0, 2, 12, 0, 0, 0).getTime(),
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
    });

    it('getTaskBounds(kind=hit) uses full row height for interactions', () => {
        const task: Task = {
            id: '1',
            subject: 'Test',
            startDate: new Date('2024-01-01').getTime(),
            dueDate: new Date('2024-01-02').getTime(),
            rowIndex: 2,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport, 'hit');
        expect(bounds.y).toBe(80);
        expect(bounds.height).toBe(40);
    });

    it('sliceTasksInRowRange は rowIndex 範囲のタスクだけ返す', () => {
        const tasks: Task[] = [
            { id: 'a', subject: 'a', startDate: 0, dueDate: 1, ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false },
            { id: 'b', subject: 'b', startDate: 0, dueDate: 1, ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 2, hasChildren: false },
            { id: 'c', subject: 'c', startDate: 0, dueDate: 1, ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 5, hasChildren: false }
        ];

        expect(LayoutEngine.sliceTasksInRowRange(tasks, 0, 0).map(t => t.id)).toEqual(['a']);
        expect(LayoutEngine.sliceTasksInRowRange(tasks, 1, 4).map(t => t.id)).toEqual(['b']);
        expect(LayoutEngine.sliceTasksInRowRange(tasks, 2, 5).map(t => t.id)).toEqual(['b', 'c']);
        expect(LayoutEngine.sliceTasksInRowRange(tasks, 6, 10)).toEqual([]);
        expect(LayoutEngine.sliceTasksInRowRange(tasks, 4, 3)).toEqual([]);
    });
});
