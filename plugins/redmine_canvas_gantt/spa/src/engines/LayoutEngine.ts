import type { Task, Viewport, Bounds } from '../types';

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
    static getTaskBounds(task: Task, viewport: Viewport, kind: 'bar' | 'hit' = 'bar'): Bounds {
        const x = this.dateToX(task.startDate, viewport) - viewport.scrollX;
        const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
        // Ensure width is at least something visible (e.g., 2px) even if duration is 0
        const width = Math.max(2, (task.dueDate - task.startDate) * viewport.scale);

        if (kind === 'hit') {
            return { x, y, width, height: viewport.rowHeight };
        }

        // Half-height task bar (visually) while keeping rowHeight unchanged.
        // Old: height = rowHeight - 10 (padding 5 top/bottom).
        const height = Math.max(2, Math.round((viewport.rowHeight - 10) / 2));
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
}
