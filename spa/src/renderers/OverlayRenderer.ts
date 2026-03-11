import type { Viewport, Task, Relation, DraftRelation, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import {
    buildRelationRenderContext,
    buildRelationRoutePoints,
    normalizeRelationForRendering,
    isRouteVisible,
    shouldRenderRelationsAtZoom
} from './relationGeometry';

export class OverlayRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly DEPENDENCY_ROW_BUFFER = 50;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { tasks, relations, draftRelation, selectedRelationId, selectedTaskId, rowCount, zoomLevel } = useTaskStore.getState();
        const totalRows = rowCount || tasks.length;
        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, totalRows);

        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);
        const bufferedTasks = LayoutEngine.sliceTasksInRowRange(
            tasks,
            Math.max(0, startRow - OverlayRenderer.DEPENDENCY_ROW_BUFFER),
            Math.min(totalRows - 1, endRow + OverlayRenderer.DEPENDENCY_ROW_BUFFER)
        );

        if (shouldRenderRelationsAtZoom(zoomLevel)) {
            this.drawDependencies(ctx, viewport, bufferedTasks, relations, draftRelation, zoomLevel, selectedRelationId);
        }

        // Draw selection highlight
        if (selectedTaskId) {
            const selectedTask = visibleTasks.find(t => t.id === selectedTaskId);
            if (selectedTask) {
                this.drawSelectionHighlight(ctx, viewport, selectedTask, zoomLevel);
            }
        }

        // Draw Inazuma line (Progress Line)
        this.drawProgressLine(ctx, viewport, visibleTasks, zoomLevel);

        // Draw "Today" line
        this.drawTodayLine(ctx, viewport);
    }

    private drawProgressLine(ctx: CanvasRenderingContext2D, viewport: Viewport, tasks: Task[], zoomLevel: ZoomLevel) {
        const { showProgressLine } = useUIStore.getState();
        if (!showProgressLine) return;

        // Tasks are already ordered by rowIndex (TaskStore layout).
        // Include tasks even if dates are missing (they will snap to Today line)
        const drawableTasks = tasks;
        if (drawableTasks.length === 0) return;

        // Calculate Today X
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const xToday = LayoutEngine.dateToX(todayStart + ONE_DAY, viewport) - viewport.scrollX;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#e53935'; // Red solid line
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Start from Today Line at Top
        ctx.moveTo(xToday, 0);

        const { taskStatuses } = useTaskStore.getState();
        const closedStatusIds = new Set(
            taskStatuses.filter(s => s.isClosed).map(s => s.id)
        );

        drawableTasks.forEach(task => {
            const isClosed = closedStatusIds.has(task.statusId);
            const hasStart = Number.isFinite(task.startDate);
            const hasDue = Number.isFinite(task.dueDate);
            const hasDates = hasStart || hasDue;
            const hasProgress = Number.isFinite(task.ratioDone);
            const snappedStart = hasStart ? LayoutEngine.snapDate(task.startDate, zoomLevel) : NaN;
            const snappedDue = hasDue ? LayoutEngine.snapDate(task.dueDate, zoomLevel) : NaN;
            const isStartToday = Number.isFinite(snappedStart) && snappedStart === todayStart;
            const isDueToday = Number.isFinite(snappedDue) && snappedDue === todayStart;


            let pointX: number;
            let pointY: number;

            if (hasDates) {
                const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
                // Use the center of the bar (or point) as the Y anchor
                pointY = bounds.y + bounds.height / 2;

                // Determine effective start and end dates for progress calculation
                let effectiveStart: number;
                let effectiveEnd: number;
                const isSingleDate = (hasStart && !hasDue) || (!hasStart && hasDue);

                if (hasStart && hasDue) {
                    effectiveStart = LayoutEngine.snapDate(task.startDate, zoomLevel);
                    // For bars, the end is inclusive, so detailed end is due + 1 day
                    effectiveEnd = Math.max(effectiveStart, LayoutEngine.snapDate(task.dueDate, zoomLevel)) + ONE_DAY;
                } else if (hasStart) {
                    // Only Start: Treat as 1 day at Start Date
                    effectiveStart = LayoutEngine.snapDate(task.startDate, zoomLevel);
                    effectiveEnd = effectiveStart + ONE_DAY;
                } else {
                    // Only Due: Treat as 1 day at Due Date
                    effectiveStart = LayoutEngine.snapDate(task.dueDate, zoomLevel);
                    effectiveEnd = effectiveStart + ONE_DAY;
                }

                // Single date task with date = today: pass through today line
                if ((hasStart && !hasDue && isStartToday) || (!hasStart && hasDue && isDueToday)) {
                    pointX = xToday;
                } else if (isDueToday) {
                    pointX = xToday;
                } else if (isClosed) {
                    pointX = xToday;
                } else if (effectiveStart > todayStart && (task.ratioDone === 0 || !hasProgress)) {
                    // Future task not started: Snap to Today line check
                    pointX = xToday;
                } else if (isSingleDate) {
                    // For single date tasks that are active (past or started), always pass through the marker position
                    // regardless of progress rate.
                    pointX = bounds.x + bounds.width / 2;
                } else {
                    const ratio = hasProgress ? Math.max(0, Math.min(100, task.ratioDone)) : 0;

                    // X coordinate corresponding to the % completion
                    // pointX = StartX + (Width * Ratio)
                    const startX = LayoutEngine.dateToX(effectiveStart, viewport) - viewport.scrollX;
                    const endX = LayoutEngine.dateToX(effectiveEnd, viewport) - viewport.scrollX;
                    const width = endX - startX;

                    pointX = startX + width * (ratio / 100);
                }
            } else {
                // No dates: Snap to Today line
                // Determine Y based on row index directly since getTaskBounds returns 0,0 for invalid dates
                const rowY = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                const barHeight = Math.max(2, Math.round(viewport.rowHeight * 0.4));
                const yOffset = Math.round((viewport.rowHeight - barHeight) / 2);
                pointY = rowY + yOffset + barHeight / 2;

                // Snap to Today line
                pointX = xToday;
            }

            ctx.lineTo(pointX, pointY);
        });

        // Removed "End at Today Line at Bottom" per user request
        // ctx.lineTo(xToday, this.canvas.height);

        ctx.stroke();
        ctx.restore();
    }

    private drawDependencies(
        ctx: CanvasRenderingContext2D,
        viewport: Viewport,
        tasks: Task[],
        relations: Relation[],
        draftRelation: DraftRelation | null,
        zoomLevel: ZoomLevel,
        selectedRelationId: string | null
    ) {
        const context = buildRelationRenderContext(tasks, viewport, zoomLevel);
        const drawableRelations = draftRelation ? [...relations, { id: '__draft__', ...draftRelation }] : relations;

        drawableRelations.forEach((relation) => {
            const normalizedRelation = normalizeRelationForRendering(relation, context);
            const points = buildRelationRoutePoints(relation, context, viewport);
            if (!points || !isRouteVisible(points, viewport)) {
                return;
            }

            const isDraft = relation.id === '__draft__';
            const isSelected = isDraft || relation.id === selectedRelationId;
            ctx.save();
            ctx.strokeStyle = isSelected ? '#2563eb' : '#888';
            ctx.lineWidth = isSelected ? 3 : 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (isDraft) {
                ctx.setLineDash([6, 4]);
            }

            ctx.beginPath();
            const first = points[0];
            ctx.moveTo(first.x - viewport.scrollX, first.y - viewport.scrollY);
            for (let i = 1; i < points.length; i += 1) {
                const point = points[i];
                ctx.lineTo(point.x - viewport.scrollX, point.y - viewport.scrollY);
            }
            ctx.stroke();
            ctx.restore();

            if (normalizedRelation.showArrow && points.length >= 2) {
                this.drawArrowHead(
                    ctx,
                    points[points.length - 2],
                    points[points.length - 1],
                    viewport,
                    isSelected ? '#2563eb' : '#888',
                    isSelected ? 7 : 6
                );
            }
        });
    }

    private drawArrowHead(
        ctx: CanvasRenderingContext2D,
        from: { x: number; y: number },
        to: { x: number; y: number },
        viewport: Viewport,
        fillStyle: string,
        size: number
    ) {
        const fromX = from.x - viewport.scrollX;
        const fromY = from.y - viewport.scrollY;
        const toX = to.x - viewport.scrollX;
        const toY = to.y - viewport.scrollY;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        const a1 = angle + Math.PI * 0.85;
        const a2 = angle - Math.PI * 0.85;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX + Math.cos(a1) * size, toY + Math.sin(a1) * size);
        ctx.lineTo(toX + Math.cos(a2) * size, toY + Math.sin(a2) * size);
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }

    private drawSelectionHighlight(ctx: CanvasRenderingContext2D, viewport: Viewport, task: Task, zoomLevel: ZoomLevel) {
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);

        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);
        ctx.setLineDash([]);
    }

    private drawTodayLine(ctx: CanvasRenderingContext2D, viewport: Viewport) {
        const today = new Date().setHours(0, 0, 0, 0);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        // Redmine standard: draw at the right edge of "today" column.
        const x = LayoutEngine.dateToX(today + ONE_DAY, viewport) - viewport.scrollX;

        if (x >= 0 && x <= this.canvas.width) {
            const COLOR = '#4285f4'; // Blue like the reference image

            ctx.save();
            ctx.strokeStyle = COLOR;
            ctx.lineWidth = 1;
            ctx.setLineDash([]); // Solid line

            // Draw Line
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();

            ctx.restore();
        }
    }

}
