import { GANTT_HEADER_HEIGHT } from '../constants';
import { LayoutEngine } from '../engines/LayoutEngine';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { BaselineRenderer } from '../renderers/BaselineRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { TaskRenderer } from '../renderers/TaskRenderer';
import {
    getTaskDateLabels,
    getTaskSubjectLabel,
    measureTaskTextLabel,
    TASK_BAR_DATE_GAP,
    TASK_LABEL_FONT,
    TASK_START_POINT_DATE_GAP,
    type TaskTextLabel
} from '../renderers/taskLabels';
import { renderTimelineHeader } from '../renderers/TimelineHeaderRenderer';
import { i18n } from '../utils/i18n';
import { buildExportFilename, canvasToBlob, downloadBlob } from './download';
import type { FullGanttExportSnapshot } from './types';
import type { Viewport } from '../types';

const FULL_EXPORT_PADDING = 32;
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_AREA = 16_777_216;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface FullExportGeometry {
    viewport: Viewport;
    width: number;
    chartHeight: number;
    totalHeight: number;
}

const finiteDateStart = (timestamp: number | undefined): number | null => {
    if (!Number.isFinite(timestamp)) return null;
    const calendarDate = LayoutEngine.snapDate(timestamp);
    return Number.isFinite(calendarDate) ? LayoutEngine.calendarDateToTimeline(calendarDate, 'start') : null;
};

const finiteDateEnd = (timestamp: number | undefined): number | null => {
    if (!Number.isFinite(timestamp)) return null;
    const calendarDate = LayoutEngine.snapDate(timestamp);
    return Number.isFinite(calendarDate) ? LayoutEngine.calendarDateToTimeline(calendarDate, 'end') : null;
};

const rangeForSingleDate = (timestamp: number | null | undefined): [number, number] | null => {
    if (!Number.isFinite(timestamp)) return null;
    const start = finiteDateStart(timestamp as number);
    const end = finiteDateEnd(timestamp as number);
    return start === null || end === null ? null : [start, end];
};

const drawableTaskRange = (snapshot: FullGanttExportSnapshot, task: FullGanttExportSnapshot['tasks'][number]) => {
    const startFinite = Number.isFinite(task.startDate);
    const dueFinite = Number.isFinite(task.dueDate);
    if (startFinite && dueFinite) {
        const start = finiteDateStart(task.startDate);
        const end = finiteDateEnd(task.dueDate);
        return start === null || end === null
            ? null
            : [start, Math.max(start + ONE_DAY_MS, end)] as [number, number];
    }
    if (startFinite && snapshot.showStartDateOnly) return rangeForSingleDate(task.startDate);
    if (dueFinite && snapshot.showDueDateOnly) return rangeForSingleDate(task.dueDate);
    return null;
};

const collectDateRange = (snapshot: FullGanttExportSnapshot): [number, number] | null => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const include = (range: [number, number] | null) => {
        if (!range) return;
        min = Math.min(min, range[0]);
        max = Math.max(max, range[1]);
    };

    snapshot.tasks.forEach((task) => {
        if (task.rowIndex < 0 || task.rowIndex >= Math.max(1, snapshot.rowCount)) return;
        include(drawableTaskRange(snapshot, task));
    });
    snapshot.layoutRows.forEach((row) => {
        if (row.rowIndex < 0 || row.rowIndex >= Math.max(1, snapshot.rowCount)) return;
        if (row.type !== 'header' && row.type !== 'version') return;
        const start = finiteDateStart(row.startDate);
        const dueEnd = finiteDateEnd(row.dueDate);
        if (start === null || dueEnd === null) return;
        include([Math.min(start, dueEnd), Math.max(start, dueEnd)]);
    });

    if (snapshot.showBaseline && snapshot.baselineSnapshot) {
        snapshot.tasks.forEach((task) => {
            if (task.rowIndex < 0 || task.rowIndex >= Math.max(1, snapshot.rowCount)) return;
            const baselineTask = snapshot.baselineSnapshot?.tasksByIssueId[task.id];
            if (!baselineTask) return;
            include(rangeForSingleDate(baselineTask.baselineStartDate));
            include(rangeForSingleDate(baselineTask.baselineDueDate));
        });
    }

    return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
};

const tooLargeError = () => new Error(
    i18n.t('label_export_png_too_large') ||
    i18n.t('label_export_failed') ||
    'The Gantt chart is too large to export as a PNG.'
);

const collectExportTaskLabels = (snapshot: FullGanttExportSnapshot, viewport: Viewport) => {
    const labels: TaskTextLabel[] = [];
    const rowCount = Number.isFinite(snapshot.rowCount) && snapshot.rowCount > 0
        ? Math.floor(snapshot.rowCount)
        : 1;

    snapshot.tasks.forEach((task) => {
        if (task.rowIndex < 0 || task.rowIndex >= rowCount) return;
        const hasStart = Number.isFinite(task.startDate);
        const hasDue = Number.isFinite(task.dueDate);
        if (!hasStart && !hasDue) return;

        if (hasStart && hasDue) {
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', snapshot.zoomLevel);
            if (snapshot.showTaskTitles) {
                labels.push(getTaskSubjectLabel(task.subject, bounds.x, bounds.y + bounds.height / 2, snapshot.showTaskBarDates));
            }
            if (snapshot.showTaskBarDates) {
                labels.push(...getTaskDateLabels(task, {
                    x: Math.floor(bounds.x),
                    y: bounds.y,
                    width: Math.floor(bounds.width),
                    height: bounds.height
                }));
            }
            return;
        }

        const isStartOnly = hasStart && snapshot.showStartDateOnly;
        const isDueOnly = hasDue && snapshot.showDueDateOnly;
        if (!isStartOnly && !isDueOnly) return;
        const timestamp = (hasStart ? task.startDate : task.dueDate) as number;
        const pointX = LayoutEngine.calendarDateToX(LayoutEngine.snapDate(timestamp, snapshot.zoomLevel), viewport, 'center');
        const pointY = task.rowIndex * viewport.rowHeight - viewport.scrollY + viewport.rowHeight / 2;
        const pointBar = { x: pointX, y: pointY - 6, width: 0, height: 12 };

        if (snapshot.showTaskTitles) {
            labels.push(getTaskSubjectLabel(task.subject, pointX, pointY, snapshot.showTaskBarDates));
        }
        if (snapshot.showTaskBarDates) {
            labels.push(...getTaskDateLabels(task, pointBar, isStartOnly ? TASK_START_POINT_DATE_GAP : TASK_BAR_DATE_GAP));
        }
    });

    if (snapshot.showTaskTitles) {
        snapshot.layoutRows.forEach((row) => {
            if (row.type !== 'version' || row.rowIndex < 0 || row.rowIndex >= rowCount) return;
            if (!Number.isFinite(row.startDate) || !Number.isFinite(row.dueDate)) return;
            const start = LayoutEngine.snapDate(row.startDate as number, snapshot.zoomLevel);
            const x1 = LayoutEngine.calendarDateToX(start, viewport, 'start');
            const y = row.rowIndex * viewport.rowHeight - viewport.scrollY;
            labels.push(getTaskSubjectLabel(row.name, x1, y + viewport.rowHeight / 2, false));
        });
    }

    return labels;
};

export const getFullExportGeometry = (
    snapshot: FullGanttExportSnapshot,
    measurementContext: CanvasRenderingContext2D
): FullExportGeometry => {
    const scale = snapshot.viewport.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(i18n.t('label_export_failed') || 'Failed to export PNG');
    }

    const dateRange = collectDateRange(snapshot);
    const visibleStart = snapshot.viewport.startDate + snapshot.viewport.scrollX / scale;
    const rangeStart = dateRange?.[0] ?? visibleStart;
    const rangeEnd = dateRange?.[1] ?? (visibleStart + snapshot.viewport.width / scale);
    const labelViewport: Viewport = {
        ...snapshot.viewport,
        startDate: rangeStart,
        scrollX: 0,
        scrollY: 0,
        width: 0,
        height: 0
    };
    const labels = collectExportTaskLabels(snapshot, labelViewport);
    let minLabelX = Number.POSITIVE_INFINITY;
    let maxLabelX = Number.NEGATIVE_INFINITY;
    labels.forEach((label) => {
        const [left, right] = measureTaskTextLabel(measurementContext, label);
        minLabelX = Math.min(minLabelX, left);
        maxLabelX = Math.max(maxLabelX, right);
    });
    const dateRangeWidth = Math.max(0, rangeEnd - rangeStart) * scale;
    const hasLabels = labels.length > 0;
    const roundingAllowance = hasLabels ? 1 : 0;
    const leftPadding = FULL_EXPORT_PADDING + Math.max(0, -minLabelX) + roundingAllowance;
    const rightPadding = FULL_EXPORT_PADDING + Math.max(0, maxLabelX - dateRangeWidth) + roundingAllowance;
    const startDate = rangeStart - leftPadding / scale;
    const width = Math.ceil(dateRangeWidth + leftPadding + rightPadding);
    const rowCount = Number.isFinite(snapshot.rowCount) && snapshot.rowCount > 0
        ? Math.floor(snapshot.rowCount)
        : 1;
    if (!Number.isFinite(snapshot.viewport.rowHeight) || snapshot.viewport.rowHeight <= 0) {
        throw new Error(i18n.t('label_export_failed') || 'Failed to export PNG');
    }
    const chartHeight = Math.ceil(rowCount * snapshot.viewport.rowHeight);
    const totalHeight = GANTT_HEADER_HEIGHT + chartHeight;

    if (
        !Number.isFinite(width) || !Number.isFinite(totalHeight) ||
        width <= 0 || totalHeight <= 0 ||
        width > MAX_CANVAS_SIDE || totalHeight > MAX_CANVAS_SIDE ||
        width * totalHeight > MAX_CANVAS_AREA
    ) {
        throw tooLargeError();
    }

    return {
        viewport: {
            ...snapshot.viewport,
            startDate,
            scrollX: 0,
            scrollY: 0,
            width,
            height: chartHeight
        },
        width,
        chartHeight,
        totalHeight
    };
};

const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
};

const releaseCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
};

export const exportFullRangePng = async (snapshot: FullGanttExportSnapshot) => {
    let finalCanvas: HTMLCanvasElement | null = null;
    let scratchCanvas: HTMLCanvasElement | null = null;
    let blob: Blob;

    try {
        scratchCanvas = document.createElement('canvas');
        resizeCanvas(scratchCanvas, 1, 1);
        const scratchContext = scratchCanvas.getContext('2d');
        if (!scratchContext) {
            throw new Error(i18n.t('label_export_canvas_failed') || i18n.t('label_export_failed') || 'Failed to initialize export canvas');
        }

        const dateRange = collectDateRange(snapshot);
        const visibleStart = snapshot.viewport.startDate + snapshot.viewport.scrollX / snapshot.viewport.scale;
        const labelViewport: Viewport = {
            ...snapshot.viewport,
            startDate: dateRange?.[0] ?? visibleStart,
            scrollX: 0,
            scrollY: 0,
            width: 0,
            height: 0
        };
        const labels = collectExportTaskLabels(snapshot, labelViewport);
        if (typeof document.fonts?.load === 'function') {
            const glyphs = new Set<string>();
            labels.forEach(label => Array.from(label.text).forEach(glyph => glyphs.add(glyph)));
            await document.fonts.load(TASK_LABEL_FONT, glyphs.size > 0 ? Array.from(glyphs).join('') : ' ');
        }

        const geometry = getFullExportGeometry(snapshot, scratchContext);
        finalCanvas = document.createElement('canvas');
        resizeCanvas(finalCanvas, geometry.width, geometry.totalHeight);
        resizeCanvas(scratchCanvas, geometry.width, geometry.chartHeight);

        const finalContext = finalCanvas.getContext('2d');
        if (!finalContext) {
            throw new Error(i18n.t('label_export_canvas_failed') || i18n.t('label_export_failed') || 'Failed to initialize export canvas');
        }

        finalContext.fillStyle = '#ffffff';
        finalContext.fillRect(0, 0, geometry.width, geometry.totalHeight);
        finalContext.save();
        try {
            renderTimelineHeader(finalContext, geometry.viewport, snapshot.zoomLevel, geometry.width);
        } finally {
            finalContext.restore();
        }

        const renderAndComposite = (render: () => void) => {
            scratchContext.clearRect(0, 0, geometry.width, geometry.chartHeight);
            scratchContext.save();
            try {
                render();
            } finally {
                scratchContext.restore();
            }
            finalContext.drawImage(scratchCanvas as HTMLCanvasElement, 0, GANTT_HEADER_HEIGHT);
        };

        renderAndComposite(() => {
            new BackgroundRenderer(scratchCanvas as HTMLCanvasElement).render(geometry.viewport, snapshot.zoomLevel, null, snapshot.tasks);
        });
        renderAndComposite(() => {
            new BaselineRenderer(scratchCanvas as HTMLCanvasElement).render({
                viewport: geometry.viewport,
                tasks: snapshot.tasks,
                rowCount: Math.max(1, snapshot.rowCount),
                zoomLevel: snapshot.zoomLevel,
                showBaseline: snapshot.showBaseline,
                snapshot: snapshot.baselineSnapshot
            });
        });
        renderAndComposite(() => {
            new TaskRenderer(scratchCanvas as HTMLCanvasElement).render(
                geometry.viewport,
                snapshot.tasks,
                Math.max(1, snapshot.rowCount),
                snapshot.zoomLevel,
                snapshot.relations,
                snapshot.layoutRows,
                snapshot.showTaskTitles,
                snapshot.showTaskBarDates,
                snapshot.showPointsOrphans,
                snapshot.baselineSnapshot,
                snapshot.showBaseline,
                snapshot.showStartDateOnly,
                snapshot.showDueDateOnly,
                snapshot.today
            );
        });
        renderAndComposite(() => {
            new OverlayRenderer(scratchCanvas as HTMLCanvasElement).render({
                viewport: geometry.viewport,
                tasks: snapshot.tasks,
                relations: snapshot.relations,
                rowCount: Math.max(1, snapshot.rowCount),
                zoomLevel: snapshot.zoomLevel,
                selectedTaskId: null,
                selectedRelationId: null,
                draftRelation: null,
                pendingRelationIds: snapshot.pendingRelationIds,
                showStartDateOnly: snapshot.showStartDateOnly,
                showDueDateOnly: snapshot.showDueDateOnly,
                showProgressLine: snapshot.showProgressLine,
                today: snapshot.today
            });
        });
        blob = await canvasToBlob(finalCanvas);
    } finally {
        releaseCanvas(scratchCanvas);
        releaseCanvas(finalCanvas);
    }

    downloadBlob(blob!, buildExportFilename('png'));
};

