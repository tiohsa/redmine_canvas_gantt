import type { Viewport, Task, Relation, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { routeDependencyFS, type Point, type Rect, type RouteParams } from './dependencyRouting';

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
        const totalRows = rowCount || tasks.length;
        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, totalRows);

        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);
        const bufferedTasks = LayoutEngine.sliceTasksInRowRange(
            tasks,
            Math.max(0, startRow - OverlayRenderer.DEPENDENCY_ROW_BUFFER),
            Math.min(totalRows - 1, endRow + OverlayRenderer.DEPENDENCY_ROW_BUFFER)
        );

        // Draw dependency lines
        this.drawDependencies(ctx, viewport, bufferedTasks, relations, zoomLevel);

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
        const drawableTasks = tasks.filter(t => Number.isFinite(t.startDate) && Number.isFinite(t.dueDate) && Number.isFinite(t.ratioDone));
        if (drawableTasks.length === 0) return;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#e53935'; // Red solid line
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        let firstPoint = true;

        drawableTasks.forEach(task => {
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);

            // X position based on progress
            // bounds.x is start, bounds.width is total width
            const ratio = Math.max(0, Math.min(100, task.ratioDone));
            const pointX = bounds.x + bounds.width * (ratio / 100);

            // Y position: vertically centered in the task row
            const pointY = bounds.y + bounds.height / 2;

            if (firstPoint) {
                ctx.moveTo(pointX, pointY);
                firstPoint = false;
            } else {
                ctx.lineTo(pointX, pointY);
            }
        });

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

            const fromRect = rectById.get(rel.from);
            const toRect = rectById.get(rel.to);
            if (!fromRect || !toRect) continue;

            const cacheKey = buildCacheKey(fromRect, toRect, OverlayRenderer.DEPENDENCY_ROUTE_PARAMS);
            const cached = this.dependencyCache.get(rel.id);
            let points = cached?.key === cacheKey ? cached.points : undefined;

            if (!points) {
                const obstacles: Rect[] = [];
                for (const rectEntry of allRects) {
                    if (rectEntry.id === rel.from || rectEntry.id === rel.to) continue;
                    obstacles.push(rectEntry.rect);
                }
                points = routeDependencyFS(
                    fromRect,
                    toRect,
                    obstacles,
                    { scrollY: viewport.scrollY, height: viewport.height },
                    OverlayRenderer.DEPENDENCY_ROUTE_PARAMS
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
            ctx.strokeStyle = '#e53935';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);
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
