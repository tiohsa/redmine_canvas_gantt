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
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;

        for (const rel of relations) {
            const fromTask = tasks.find(t => t.id === rel.from);
            const toTask = tasks.find(t => t.id === rel.to);
            if (!fromTask || !toTask) continue;

            const fromBounds = LayoutEngine.getTaskBounds(fromTask, viewport);
            const toBounds = LayoutEngine.getTaskBounds(toTask, viewport);

            // Manhattan path (Orthogonal)
            const startX = fromBounds.x + fromBounds.width;
            const startY = fromBounds.y + fromBounds.height / 2;
            const endX = toBounds.x;
            const endY = toBounds.y + toBounds.height / 2;

            ctx.beginPath();
            ctx.moveTo(startX, startY);

            const midX = startX + 20; // First segment to the right

            // Logic for orthogonal path
            if (endX > startX + 20) {
                // Simple case: Right then Up/Down then Right
                const midX2 = startX + (endX - startX) / 2; // Or strictly 20px if we want to stay close
                // Actually usually we want to go out a bit, then vertical, then into target.
                // Standard: Right 10px, Vertical to target Y, Right to target.
                // But we must respect 'midX' to avoid going through the task if possible (though task is to the left)

                // Let's use 2 corners
                ctx.lineTo(midX2, startY);
                ctx.lineTo(midX2, endY);
                ctx.lineTo(endX, endY);
            } else {
                // Complex case: Target is behind or close.
                // Go Right, Go Down/Up, Go Left, Go Down/Up to target Y, Go Right
                // 1. Right 20px
                ctx.lineTo(midX, startY);

                // 2. Vertical to clear the source task or target task
                // We need to decide whether to go above or below.
                // Usually below.
                // const verticalClearance = 10; // Clearance below/above
                // const yClearance = (endY > startY) ? fromBounds.y + fromBounds.height + verticalClearance : fromBounds.y - verticalClearance;
                // Actually simplified:
                // Right 20, Down to target Y (if possible) or Down/Up to clear, Left to target X - 20, Up/Down to target Y, Right.

                // Let's implement a standard 3-segment if valid, or 5-segment.
                // 5-segment wrap around
                // const midY1 = (endY > startY) ? Math.max(startY, endY) + 20 : Math.min(startY, endY) - 20;
                // Actually let's just use a simple step-down pattern regardless of overlap for now to keep it cleanish

                const turnX1 = startX + 20;
                const turnX2 = endX - 20;

                ctx.lineTo(turnX1, startY);

                // We need to go vertical. If turnX2 < turnX1, we have to go "around".
                // Simple "around":
                // 1. Right to turnX1
                // 2. Down to some Y that is safe (e.g. max(startY, endY) + rowHeight?)
                // Since we don't know row layout easily here without iterating all, let's just go down 1 row height if needed.

                const safeY = endY + 20; // Just random guess

                ctx.lineTo(turnX1, safeY);
                ctx.lineTo(turnX2, safeY);
                ctx.lineTo(turnX2, endY);
                ctx.lineTo(endX, endY);
            }

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
        ctx.fillStyle = '#888';
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
