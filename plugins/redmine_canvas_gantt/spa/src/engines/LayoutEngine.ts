import type { Task, Viewport, Bounds, ZoomLevel } from '../types';
import { snapToLocalDay, snapToLocalMonth, snapToLocalWeek } from '../utils/time';

export class LayoutEngine {
    /**
     * Converts a timestamp to an X coordinate relative to the start of the project timeline (scrollX=0).
     */
    static dateToX(date: number, viewport: Viewport): number {
        return (date - viewport.startDate) * viewport.scale;
        // Note: To get screen X, subtract viewport.scrollX
    }

    /**
     * Converts an X coordinate (relative to timeline start) back to a timestamp.
     */
    static xToDate(x: number, viewport: Viewport): number {
        return x / viewport.scale + viewport.startDate;
    }

    /**
     * Returns the screen bounding box for a task bar.
     */
    public static snapDate(timestamp: number, zoomLevel?: ZoomLevel): number {
        if (zoomLevel === 0) return snapToLocalMonth(timestamp);
        if (zoomLevel === 1) return snapToLocalWeek(timestamp);
        return snapToLocalDay(timestamp);
    }

    static getTaskBounds(task: Task, viewport: Viewport, kind: 'bar' | 'hit' = 'bar', zoomLevel?: ZoomLevel): Bounds {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const snappedStart = this.snapDate(task.startDate, zoomLevel);
        const snappedDue = Math.max(snappedStart, this.snapDate(task.dueDate, zoomLevel));
        // Add 1 day to make due date inclusive (bar ends at the END of due date, not the start)
        const snappedDueInclusive = snappedDue + ONE_DAY_MS;
        const x = this.dateToX(snappedStart, viewport) - viewport.scrollX;
        const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
        // Ensure width is at least something visible (e.g., 2px) even if duration is 0
        const width = Math.max(2, (snappedDueInclusive - snappedStart) * viewport.scale);

        if (kind === 'hit') {
            return { x, y, width, height: viewport.rowHeight };
        }

        // Calculate task bar height based on rowHeight.
        // We use 40% of rowHeight for the bar, but at least 2px.
        const height = Math.max(2, Math.round(viewport.rowHeight * 0.4));
        const yOffset = Math.round((viewport.rowHeight - height) / 2);

        return { x, y: y + yOffset, width, height };
    }

    /**
     * Returns visible row range [start, end]
     */
    static getVisibleRowRange(viewport: Viewport, totalRows: number): [number, number] {
        const startRow = Math.floor(viewport.scrollY / viewport.rowHeight);
        const endRow = Math.ceil((viewport.scrollY + viewport.height) / viewport.rowHeight);
        return [
            Math.max(0, startRow),
            Math.min(totalRows - 1, endRow)
        ];
    }

    /**
     * Returns tasks within the given row range efficiently.
     * Assumes tasks are ordered by `rowIndex` ascending (as produced by TaskStore layout).
     */
    static sliceTasksInRowRange(tasks: Task[], startRow: number, endRow: number): Task[] {
        if (tasks.length === 0) return [];
        if (endRow < startRow) return [];

        // Lower-bound search for the first task whose rowIndex >= startRow
        let lo = 0;
        let hi = tasks.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tasks[mid].rowIndex < startRow) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        const result: Task[] = [];
        for (let i = lo; i < tasks.length; i += 1) {
            const task = tasks[i];
            if (task.rowIndex > endRow) break;
            result.push(task);
        }
        return result;
    }
}
