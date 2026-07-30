import type { Task, Viewport, Bounds, ZoomLevel } from '../types';
import { timelineToCalendarDate, toTimelineDate, type CalendarDate, type TimelineDate } from '../utils/dateOnly';

type CalendarCellPosition = 'start' | 'center' | 'end';

export class LayoutEngine {
  private static readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Converts a timestamp to an X coordinate relative to the start of the project timeline (scrollX=0).
   */
  static dateToX(date: TimelineDate, viewport: Viewport): number {
    return (date - viewport.startDate) * viewport.scale;
    // Note: To get screen X, subtract viewport.scrollX
  }

  /**
   * Converts an X coordinate (relative to timeline start) back to a timestamp.
   */
  static xToDate(x: number, viewport: Viewport): TimelineDate {
    return (x / viewport.scale + viewport.startDate) as TimelineDate;
  }

  /**
   * Projects a local calendar date onto the fixed-width UTC timeline used by the grid.
   */
  static calendarDateToTimeline(date: CalendarDate, position: CalendarCellPosition = 'start'): TimelineDate {
    if (!Number.isFinite(date)) return Number.NaN as TimelineDate;

    const cellStart = toTimelineDate(date);
    const offset = position === 'center'
      ? this.ONE_DAY_MS / 2
      : position === 'end'
        ? this.ONE_DAY_MS
        : 0;

    return (cellStart + offset) as TimelineDate;
  }

  static calendarDateToX(date: CalendarDate, viewport: Viewport, position: CalendarCellPosition = 'start'): number {
    return this.dateToX(this.calendarDateToTimeline(date, position), viewport);
  }

  /**
   * Returns the screen bounding box for a task bar.
   */
  public static snapDate(timestamp: number | undefined, _zoomLevel?: ZoomLevel): CalendarDate {
    void _zoomLevel;
    if (timestamp === undefined || !Number.isFinite(timestamp)) return Number.NaN as CalendarDate;
    return timelineToCalendarDate(timestamp);
  }

  static getTaskBounds(task: Task, viewport: Viewport, kind: 'bar' | 'hit' = 'bar', zoomLevel?: ZoomLevel): Bounds {
    const start = task.startDate;
    const due = task.dueDate;

    // Logic for single date tasks
    const POINT_SIZE = 16;

    if (!Number.isFinite(start) && !Number.isFinite(due)) {
      // Return empty bounds if both dates are missing
      return { x: 0, y: 0, width: 0, height: 0 };
    } else if (!Number.isFinite(start) || !Number.isFinite(due)) {
      // Processing for single date tasks
      const date = Number.isFinite(start) ? start! : due!;
      const snappedDate = this.snapDate(date, zoomLevel);
      // Center single-date markers in the corresponding day cell.
      const cx = this.calendarDateToX(snappedDate, viewport, 'center') - viewport.scrollX;
      const x = cx - POINT_SIZE / 2;

      if (kind === 'hit') {
        return { x, y: task.rowIndex * viewport.rowHeight - viewport.scrollY, width: POINT_SIZE, height: viewport.rowHeight };
      }

      // For rendering (not currently used by TaskRenderer for points, but good for completeness)
      const height = POINT_SIZE;
      const yOffset = Math.round((viewport.rowHeight - height) / 2);
      return { x, y: task.rowIndex * viewport.rowHeight - viewport.scrollY + yOffset, width: POINT_SIZE, height };
    }

    const snappedStart = this.snapDate(start, zoomLevel);
    const timelineStart = this.calendarDateToTimeline(snappedStart);
    const timelineDue = Math.max(timelineStart, this.calendarDateToTimeline(this.snapDate(due, zoomLevel)));
    // Add one fixed UTC timeline day to make the due date inclusive.
    const timelineEnd = timelineDue + this.ONE_DAY_MS;
    const x = this.dateToX(timelineStart, viewport) - viewport.scrollX;
    const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
    // Ensure width is at least something visible (e.g., 2px) even if duration is 0
    const width = Math.max(2, (timelineEnd - timelineStart) * viewport.scale);

    if (kind === 'hit') {
      return { x, y, width, height: viewport.rowHeight };
    }

    // Calculate task bar height based on rowHeight.
    // For leaf tasks, use 45% of rowHeight. For parent tasks, use 40% (TaskRenderer will halve this to 20%).
    const heightRatio = task.hasChildren ? 0.4 : 0.45;
    const height = Math.max(2, Math.round(viewport.rowHeight * heightRatio));
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
