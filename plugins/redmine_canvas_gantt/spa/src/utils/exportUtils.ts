import { saveAs } from 'file-saver';
import { utils, write } from 'xlsx';
// @ts-ignore
import C2S from 'canvas2svg';
import type { Task, Relation, Viewport, ZoomLevel } from '../types';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { getMinFiniteStartDate, getMaxFiniteDueDate } from './taskRange';
import { i18n } from './i18n';

export const exportToExcel = (tasks: Task[]) => {
    const data = tasks.map(t => ({
        [i18n.t('field_id') || 'ID']: t.id,
        [i18n.t('field_project') || 'Project']: t.projectName,
        [i18n.t('field_tracker') || 'Tracker']: t.trackerName,
        [i18n.t('field_subject') || 'Subject']: t.subject,
        [i18n.t('field_status') || 'Status']: t.statusName,
        [i18n.t('field_priority') || 'Priority']: t.priorityName,
        [i18n.t('field_assigned_to') || 'Assignee']: t.assignedToName,
        [i18n.t('field_start_date') || 'Start Date']: formatDate(t.startDate),
        [i18n.t('field_due_date') || 'Due Date']: formatDate(t.dueDate),
        [i18n.t('field_estimated_hours') || 'Estimated Hours']: t.estimatedHours,
        [i18n.t('field_done_ratio') || 'Done Ratio']: t.ratioDone,
        [i18n.t('field_version') || 'Version']: t.fixedVersionName
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Gantt");
    const wbout = write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `gantt_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

function formatDate(ts?: number): string {
    if (!ts) return '';
    return new Date(ts).toISOString().slice(0, 10);
}

export const exportToSvg = (
    tasks: Task[],
    relations: Relation[],
    layoutRows: any[],
    rowCount: number,
    currentViewport: Viewport,
    zoomLevel: ZoomLevel,
    showProgressLine: boolean
) => {
    // 1. Determine Full Bounds
    const minStart = getMinFiniteStartDate(tasks);
    const maxEnd = getMaxFiniteDueDate(tasks);

    // Default to current viewport if no tasks or invalid
    let startDate = minStart ?? currentViewport.startDate;
    const padding = 7 * 24 * 60 * 60 * 1000; // 1 week padding
    startDate -= padding;

    let endDate = maxEnd ?? (startDate + 30 * 24 * 60 * 60 * 1000);
    endDate += padding;

    // Ensure we cover the visible viewport if it's wider?
    // Usually export should just be the data range.

    const widthMs = endDate - startDate;
    const widthPx = Math.ceil(widthMs * currentViewport.scale);
    const heightPx = rowCount * currentViewport.rowHeight;

    // Sanity check limits for SVG (though SVG has no hard pixel limit, memory might be an issue)
    // We stick to what we calculated.

    const exportViewport: Viewport = {
        ...currentViewport,
        width: widthPx,
        height: heightPx,
        startDate: startDate,
        scrollX: 0,
        scrollY: 0
    };

    // 2. Create C2S Context
    const ctx = new C2S(widthPx, heightPx);

    // 3. Create Renderers (dummy canvas)
    const dummyCanvas = document.createElement('canvas');
    // We don't need to set size on dummy canvas as we pass ctx
    const bgRenderer = new BackgroundRenderer(dummyCanvas);
    const taskRenderer = new TaskRenderer(dummyCanvas);
    const overlayRenderer = new OverlayRenderer(dummyCanvas);

    // 4. Render Layers
    // Background
    bgRenderer.render(exportViewport, zoomLevel, null, tasks, ctx);

    // Tasks
    taskRenderer.render(exportViewport, tasks, rowCount, zoomLevel, relations, layoutRows, ctx);

    // Overlay (Dependencies, etc)
    overlayRenderer.render(exportViewport, {
        ctx,
        tasks,
        relations,
        selectedTaskId: null, // Don't highlight selection in export usually
        rowCount,
        zoomLevel,
        showProgressLine
    });

    // 5. Generate SVG
    const svgString = ctx.getSerializedSvg(true); // true to fix named entities?

    // 6. Download
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, `gantt_export_${new Date().toISOString().slice(0, 10)}.svg`);
};
