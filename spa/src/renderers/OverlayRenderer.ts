import type { Viewport, Task, Relation, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { routeDependencyFS, type Point, type Rect, type RouteParams } from './dependencyRouting';
import { filterRelationsForSelected, getOverflowBadgeLabel, MAX_SELECTED_RELATIONS } from './dependencyIndicators';

export class OverlayRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly DEPENDENCY_ROW_BUFFER = 50;
    private static readonly DEPENDENCY_ROUTE_PARAMS: RouteParams = {
        outset: 20,
        inset: 12,
        step: 24,
        maxShift: 8
    };
    private dependencyCache = new Map<string, { key: string; points: Point[] }>();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { tasks, relations, selectedTaskId, rowCount, zoomLevel } = useTaskStore.getState();

        // Clean up stale cache entries for removed relations
        this.cleanupDependencyCache(relations);
        const totalRows = rowCount || tasks.length;
        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, totalRows);

        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);
        const bufferedTasks = LayoutEngine.sliceTasksInRowRange(
            tasks,
            Math.max(0, startRow - OverlayRenderer.DEPENDENCY_ROW_BUFFER),
            Math.min(totalRows - 1, endRow + OverlayRenderer.DEPENDENCY_ROW_BUFFER)
        );

        // Draw dependency lines
        if (zoomLevel === 2) {
            this.drawDependencies(ctx, viewport, bufferedTasks, relations, zoomLevel);
        } else if (zoomLevel === 1 && selectedTaskId) {
            const { relations: limitedRelations, overflowCount } = filterRelationsForSelected(
                relations,
                selectedTaskId,
                MAX_SELECTED_RELATIONS
            );
            this.drawDependencies(ctx, viewport, bufferedTasks, limitedRelations, zoomLevel);

            if (overflowCount > 0) {
                const selectedTask = tasks.find(task => task.id === selectedTaskId);
                if (selectedTask) {
                    const bounds = LayoutEngine.getTaskBounds(selectedTask, viewport, 'bar', zoomLevel);
                    if (this.isBoundsVisible(bounds, viewport)) {
                        this.drawOverflowBadge(ctx, bounds, getOverflowBadgeLabel(overflowCount));
                    }
                }
            }
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
        zoomLevel: ZoomLevel
    ) {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;

        const taskById = new Map<string, Task>(tasks.map((t) => [t.id, t]));
        const rectById = new Map<string, Rect>();
        const allRects: Array<{ id: string; rect: Rect }> = [];

        for (const task of tasks) {
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
            const rect = {
                x: bounds.x + viewport.scrollX,
                y: bounds.y + viewport.scrollY,
                width: bounds.width,
                height: bounds.height
            };
            rectById.set(task.id, rect);
            allRects.push({ id: task.id, rect });
        }

        for (const rel of relations) {
            const fromTask = taskById.get(rel.from);
            const toTask = taskById.get(rel.to);
            if (!fromTask || !toTask) continue;

            // Skip drawing if dates are missing (prevents drawing lines from (0,0))
            if (!Number.isFinite(fromTask.startDate) || !Number.isFinite(fromTask.dueDate) ||
                !Number.isFinite(toTask.startDate) || !Number.isFinite(toTask.dueDate)) {
                continue;
            }

            const fromRect = rectById.get(rel.from);
            const toRect = rectById.get(rel.to);
            if (!fromRect || !toRect) continue;

            const routeParams: RouteParams = {
                ...OverlayRenderer.DEPENDENCY_ROUTE_PARAMS,
                step: viewport.rowHeight
            };
            const cacheKey = buildCacheKey(fromRect, toRect, routeParams);
            const cached = this.dependencyCache.get(rel.id);
            let points = cached?.key === cacheKey ? cached.points : undefined;

            if (!points) {
                const obstacles: Rect[] = [];
                for (const rectEntry of allRects) {
                    if (rectEntry.id === rel.from || rectEntry.id === rel.to) continue;
                    obstacles.push(rectEntry.rect);
                }
                const ONE_DAY_MS = 24 * 60 * 60 * 1000;
                points = routeDependencyFS(
                    fromRect,
                    toRect,
                    obstacles,
                    { scrollY: viewport.scrollY, height: viewport.height },
                    {
                        rowHeight: viewport.rowHeight,
                        fromRowIndex: fromTask.rowIndex,
                        toRowIndex: toTask.rowIndex,
                        columnWidth: ONE_DAY_MS * viewport.scale
                    },
                    routeParams
                );
                this.dependencyCache.set(rel.id, { key: cacheKey, points });
            }

            if (!points) continue;
            if (!isRouteVisible(points, viewport)) continue;

            ctx.beginPath();
            const first = points[0];
            ctx.moveTo(first.x - viewport.scrollX, first.y - viewport.scrollY);
            for (let i = 1; i < points.length; i += 1) {
                const point = points[i];
                ctx.lineTo(point.x - viewport.scrollX, point.y - viewport.scrollY);
            }
            ctx.stroke();

            this.drawArrowHead(ctx, points[points.length - 2], points[points.length - 1], viewport);
        }
    }

    private drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, viewport: Viewport) {
        const size = 6;
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
        ctx.fillStyle = '#888';
        ctx.fill();
    }

    private drawOverflowBadge(ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }, label: string) {
        if (!label) return;

        ctx.save();
        ctx.font = '11px sans-serif';
        const paddingX = 6;
        const textMetrics = ctx.measureText(label);
        const textWidth = Math.ceil(textMetrics.width);
        const badgeWidth = textWidth + paddingX * 2;
        const badgeHeight = Math.max(16, Math.round(bounds.height * 0.6));

        const badgeX = bounds.x + bounds.width + 6;
        const badgeY = bounds.y + (bounds.height - badgeHeight) / 2;
        const radius = 6;

        ctx.beginPath();
        ctx.moveTo(badgeX + radius, badgeY);
        ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
        ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + radius);
        ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
        ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - radius, badgeY + badgeHeight);
        ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
        ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - radius);
        ctx.lineTo(badgeX, badgeY + radius);
        ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
        ctx.closePath();

        ctx.fillStyle = '#e8f0fe';
        ctx.fill();
        ctx.strokeStyle = '#bcd3fb';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#1a73e8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
        ctx.restore();
    }

    private isBoundsVisible(bounds: { x: number; y: number; width: number; height: number }, viewport: Viewport): boolean {
        return !(
            bounds.x + bounds.width < 0 ||
            bounds.x > viewport.width ||
            bounds.y + bounds.height < 0 ||
            bounds.y > viewport.height
        );
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

    /**
     * Removes stale cache entries for relations that no longer exist.
     * This prevents memory leaks when relations are deleted.
     */
    private cleanupDependencyCache(currentRelations: Relation[]) {
        const activeIds = new Set(currentRelations.map(r => r.id));
        for (const cachedId of this.dependencyCache.keys()) {
            if (!activeIds.has(cachedId)) {
                this.dependencyCache.delete(cachedId);
            }
        }
    }
}

function buildCacheKey(fromRect: Rect, toRect: Rect, params: RouteParams): string {
    return [
        fromRect.x,
        fromRect.y,
        fromRect.width,
        fromRect.height,
        toRect.x,
        toRect.y,
        toRect.width,
        toRect.height,
        params.outset,
        params.inset,
        params.step,
        params.maxShift
    ].join('|');
}

function isRouteVisible(points: Point[], viewport: Viewport): boolean {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    const viewLeft = viewport.scrollX;
    const viewRight = viewport.scrollX + viewport.width;
    const viewTop = viewport.scrollY;
    const viewBottom = viewport.scrollY + viewport.height;

    return !(maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom);
}
