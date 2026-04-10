import type { DraftRelation, LayoutRow, Relation, Task, Viewport, ZoomLevel } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';

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
    exportCsv: () => Promise<void>;
}
