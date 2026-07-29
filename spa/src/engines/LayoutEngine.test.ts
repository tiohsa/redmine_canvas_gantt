import { describe, it, expect } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import type { Viewport, Task } from '../types';

describe('LayoutEngine', () => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const mockViewport: Viewport = {
        startDate: new Date(2024, 0, 1, 0, 0, 0, 0).getTime(),
        scrollX: 0,
        scrollY: 0,
        scale: 1, // 1 px per ms
        width: 800,
        height: 600,
        rowHeight: 40
    };

    it('dateToX converts date to x coordinate accurately', () => {
        const date = new Date(2024, 0, 2).getTime(); // +1 day
        // 1 day = 86400000 ms
        const expectedX = 86400000;
        expect(LayoutEngine.dateToX(date, mockViewport)).toBe(expectedX);
    });

    it('getTaskBounds returns correct geometry', () => {
        const task: Task = {
            id: '1',
            subject: 'Test',
            startDate: new Date(2024, 0, 1).getTime(),
            dueDate: new Date(2024, 0, 2).getTime(),
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 2);
        // height = Math.max(2, Math.round(40 * 0.45)) = 18
        // yOffset = Math.round((40 - 18) / 2) = 11
        expect(bounds.height).toBe(18);
        expect(bounds.y).toBe(11);
    });

    it('getTaskBounds centers single-date tasks in the day cell', () => {
        const task: Task = {
            id: '1',
            subject: 'Single Date',
            startDate: new Date(2024, 0, 1).getTime(),
            dueDate: undefined,
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 2);
        const date = new Date(task.startDate!);
        const expectedCenter = LayoutEngine.dateToX(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + ONE_DAY / 2,
            mockViewport
        );

        expect(bounds.x + bounds.width / 2).toBe(expectedCenter);
    });

    it('projects local calendar dates onto UTC timeline cell boundaries', () => {
        const task: Task = {
            id: '1',
            subject: 'Snap',
            startDate: new Date(2024, 0, 1).getTime(),
            dueDate: new Date(2024, 0, 2).getTime(),
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 2);
        const start = new Date(task.startDate!);
        const due = new Date(task.dueDate!);
        const expectedStart = LayoutEngine.dateToX(
            Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
            mockViewport
        );
        const expectedEnd = LayoutEngine.dateToX(
            Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) + ONE_DAY,
            mockViewport
        );

        expect(bounds.x).toBe(expectedStart);
        expect(bounds.x + bounds.width).toBe(expectedEnd);
    });

    it('uses exactly one UTC grid cell for a same-day task', () => {
        const calendarDate = new Date(2026, 6, 29).getTime();
        const viewport: Viewport = {
            ...mockViewport,
            startDate: Date.UTC(2026, 6, 29),
            scale: 40 / ONE_DAY
        };
        const task: Task = {
            id: 'same-day',
            subject: 'Same day',
            startDate: calendarDate,
            dueDate: calendarDate,
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', 2);

        expect(bounds.x).toBe(0);
        expect(bounds.width).toBe(40);
    });

    it.each([
        [2026, 2, 8],
        [2026, 10, 1]
    ])('keeps cell boundaries fixed across DST transition date %i-%i-%i', (year, month, day) => {
        const calendarDate = new Date(year, month, day).getTime();
        const viewport: Viewport = {
            ...mockViewport,
            startDate: Date.UTC(year, month, day),
            scale: 40 / ONE_DAY
        };
        const task: Task = {
            id: 'dst',
            subject: 'DST boundary',
            startDate: calendarDate,
            dueDate: calendarDate,
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', 2);

        expect(bounds.x).toBe(0);
        expect(bounds.width).toBe(40);
    });

    it('getTaskBounds(kind=hit) uses full row height for interactions', () => {
        const task: Task = {
            id: '1',
            subject: 'Test',
            startDate: new Date(2024, 0, 1).getTime(),
            dueDate: new Date(2024, 0, 2).getTime(),
            rowIndex: 2,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const bounds = LayoutEngine.getTaskBounds(task, mockViewport, 'hit', 2);
        expect(bounds.y).toBe(80);
        expect(bounds.height).toBe(40);
    });

    it('keeps task geometry day-accurate in week and month views', () => {
        const task: Task = {
            id: '1',
            subject: 'Cross Zoom',
            startDate: new Date(2024, 0, 3).getTime(),
            dueDate: new Date(2024, 0, 5).getTime(),
            rowIndex: 0,
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            hasChildren: false
        };

        const startDate = task.startDate!;
        const dueDate = task.dueDate!;
        const start = new Date(startDate);
        const due = new Date(dueDate);
        const expectedStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
        const expectedDueInclusive = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) + ONE_DAY;
        const expectedX = LayoutEngine.dateToX(expectedStart, mockViewport);
        const expectedWidth = expectedDueInclusive - expectedStart;

        const dayBounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 2);
        const weekBounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 1);
        const monthBounds = LayoutEngine.getTaskBounds(task, mockViewport, 'bar', 0);

        expect(dayBounds.x).toBe(expectedX);
        expect(dayBounds.width).toBe(expectedWidth);
        expect(weekBounds.x).toBe(expectedX);
        expect(weekBounds.width).toBe(expectedWidth);
        expect(monthBounds.x).toBe(expectedX);
        expect(monthBounds.width).toBe(expectedWidth);
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
