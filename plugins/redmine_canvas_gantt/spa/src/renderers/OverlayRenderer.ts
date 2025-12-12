import type { Viewport, Task, Relation } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { useTaskStore } from '../stores/TaskStore';

export class OverlayRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { tasks, relations, selectedTaskId } = useTaskStore.getState();

        // Draw dependency lines
        this.drawDependencies(ctx, viewport, tasks, relations);

        // Draw selection highlight
        if (selectedTaskId) {
            const selectedTask = tasks.find(t => t.id === selectedTaskId);
            if (selectedTask) {
                this.drawSelectionHighlight(ctx, viewport, selectedTask);
            }
        }

        // Draw "Today" line
        this.drawTodayLine(ctx, viewport);
    }

    private drawDependencies(
        ctx: CanvasRenderingContext2D,
        viewport: Viewport,
        tasks: Task[],
        relations: Relation[]
    ) {
        ctx.strokeStyle = '#c1c9d6';
        ctx.lineWidth = 1.5;

        for (const rel of relations) {
            const fromTask = tasks.find(t => t.id === rel.from);
            const toTask = tasks.find(t => t.id === rel.to);
            if (!fromTask || !toTask) continue;

            const fromBounds = LayoutEngine.getTaskBounds(fromTask, viewport);
            const toBounds = LayoutEngine.getTaskBounds(toTask, viewport);

            // Manhattan-style path: right edge of 'from' -> left edge of 'to'
            const startX = fromBounds.x + fromBounds.width;
            const startY = fromBounds.y + fromBounds.height / 2;
            const endX = toBounds.x;
            const endY = toBounds.y + toBounds.height / 2;

            const midX = (startX + endX) / 2;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(midX, startY);
            ctx.lineTo(midX, endY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Arrow head
            this.drawArrowHead(ctx, endX, endY, 'right');
        }
    }

    private drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'right' | 'left') {
        const size = 6;
        ctx.beginPath();
        if (direction === 'right') {
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y - size / 2);
            ctx.lineTo(x - size, y + size / 2);
        } else {
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y - size / 2);
            ctx.lineTo(x + size, y + size / 2);
        }
        ctx.closePath();
        ctx.fillStyle = '#c1c9d6';
        ctx.fill();
    }

    private drawSelectionHighlight(ctx: CanvasRenderingContext2D, viewport: Viewport, task: Task) {
        const bounds = LayoutEngine.getTaskBounds(task, viewport);

        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);
        ctx.setLineDash([]);
    }

    private drawTodayLine(ctx: CanvasRenderingContext2D, viewport: Viewport) {
        const today = new Date().setHours(0, 0, 0, 0);
        const x = LayoutEngine.dateToX(today, viewport) - viewport.scrollX;

        if (x >= 0 && x <= this.canvas.width) {
            ctx.strokeStyle = '#e53935';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }
    }
}
