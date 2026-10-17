import type { DraftRelation, LayoutRow, Relation, Task, Viewport, ZoomLevel } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';
import type { BaselineSnapshot } from '../types/baseline';
import type { CalendarDate } from '../utils/dateOnly';

export interface GanttExportSnapshot {
    headerCanvas: HTMLCanvasElement;
    backgroundCanvas: HTMLCanvasElement;
    baselineCanvas: HTMLCanvasElement;
    taskCanvas: HTMLCanvasElement;
    overlayCanvas: HTMLCanvasElement;
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    tasks: Task[];
    relations: Relation[];
    rowCount: number;
    layoutRows: LayoutRow[];
    selectedTaskId: string | null;
    selectedRelationId: string | null;
    draftRelation: DraftRelation | null;
    showPointsOrphans: boolean;
    showTaskTitles: boolean;
    showProgressLine: boolean;
    customFields: CustomFieldMeta[];
}

export interface GanttExportHandle {
    exportPng: () => Promise<void>;
    exportFullPng: () => Promise<void>;
    exportCsv: () => Promise<void>;
}

/** A data-only view of the currently laid-out chart for full-range PNG export. */
export interface FullGanttExportSnapshot {
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    tasks: Task[];
    relations: Relation[];
    rowCount: number;
    layoutRows: LayoutRow[];
    baselineSnapshot: BaselineSnapshot | null;
    showBaseline: boolean;
    showTaskTitles: boolean;
    showTaskBarDates: boolean;
    showPointsOrphans: boolean;
    showStartDateOnly: boolean;
    showDueDateOnly: boolean;
    showProgressLine: boolean;
    pendingRelationIds?: ReadonlySet<string>;
    today: CalendarDate;
}
