import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task, Viewport, ZoomLevel } from '../types';
import type { BaselineSnapshot, BaselineTaskState } from '../types/baseline';
import { designTokens } from '../styles/designTokens';

type BaselineRenderState = {
    viewport: Viewport;
    tasks: Task[];
    rowCount: number;
    zoomLevel: ZoomLevel;
    showBaseline: boolean;
    snapshot: BaselineSnapshot | null;
};

export class BaselineRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render({ viewport, tasks, rowCount, zoomLevel, showBaseline, snapshot }: BaselineRenderState) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!showBaseline || !snapshot) return;

        const totalRows = rowCount || tasks.length;
        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, totalRows);
        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

        visibleTasks.forEach((task) => {
            const baselineTask = snapshot.tasksByIssueId[task.id];
            if (!baselineTask) return;

            this.drawBaselineTask(ctx, task, baselineTask, viewport, zoomLevel);
        });
    }

    private drawBaselineTask(
        ctx: CanvasRenderingContext2D,
        task: Task,
        baselineTask: BaselineTaskState,
        viewport: Viewport,
        zoomLevel: ZoomLevel
    ) {
        const baselineLikeTask = {
            ...task,
            startDate: baselineTask.baselineStartDate ?? undefined,
            dueDate: baselineTask.baselineDueDate ?? undefined
        } as Task;
        const bounds = LayoutEngine.getTaskBounds(baselineLikeTask, viewport, 'bar', zoomLevel);
        const hasStart = Number.isFinite(baselineTask.baselineStartDate ?? NaN);
        const hasDue = Number.isFinite(baselineTask.baselineDueDate ?? NaN);

        if (!hasStart && !hasDue) return;

        if (hasStart && hasDue) {
            this.drawGhostBar(ctx, bounds.x, bounds.y, bounds.width, bounds.height);
            return;
        }

        if (hasStart || hasDue) {
            const centerY = bounds.y + bounds.height / 2;
            const pointX = bounds.x + bounds.width / 2;
            if (hasStart) {
                this.drawTriangle(ctx, pointX, centerY, 12, true);
                return;
            }

            this.drawDiamond(ctx, pointX, centerY, 12);
        }
    }

    private drawGhostBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
            return;
        }

        ctx.save();
        ctx.fillStyle = designTokens.baselineFill;
        ctx.strokeStyle = designTokens.baselineStroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
        ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.max(0, Math.floor(width) - 1), Math.max(0, Math.floor(height) - 1));
        ctx.restore();
    }

    private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
        ctx.save();
        ctx.fillStyle = designTokens.baselineFill;
        ctx.strokeStyle = designTokens.baselineStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size / 2, y);
        ctx.lineTo(x, y + size / 2);
        ctx.lineTo(x - size / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    private drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pointRight: boolean) {
        ctx.save();
        ctx.fillStyle = designTokens.baselineFill;
        ctx.strokeStyle = designTokens.baselineStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (pointRight) {
            ctx.moveTo(x - size / 2, y - size / 2);
            ctx.lineTo(x + size / 2, y);
            ctx.lineTo(x - size / 2, y + size / 2);
        } else {
            ctx.moveTo(x + size / 2, y - size / 2);
            ctx.lineTo(x - size / 2, y);
            ctx.lineTo(x + size / 2, y + size / 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
