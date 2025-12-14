import type { Viewport, Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { getStatusColor } from '../utils/styles';
import { useTaskStore } from '../stores/TaskStore';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

    private static readonly DONE_GREEN = '#50c878';
    private static readonly DELAY_RED = '#ff6b6b';
    private static readonly PLAN_GRAY = '#dddddd';
    private static readonly LABEL_COLOR = '#aaaaaa';

    // Adjusted for smaller row height (30px)
    private static readonly BAR_HEIGHT = 14;
    private static readonly CAP_WIDTH = 4;
    private static readonly CAP_OVERFLOW = 2;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[]) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        // Ensure canvas scaling is correct (dpr) if we were doing that, but sticking to 1:1 for now
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, tasks.length);
        const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const todayLineTs = todayTs + ONE_DAY;
        const xTodayLine = LayoutEngine.dateToX(todayLineTs, viewport) - viewport.scrollX;

        const hoveredTaskId = useTaskStore.getState().hoveredTaskId;

        visibleTasks.forEach(task => {
            // Group Headers - Skip drawing bar, maybe just a background?
            // Sidebar handles text. We might want a faint background line across?
            if (task.isGroupHeader) {
                // Optional: Draw row background
                const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                ctx.fillStyle = '#f9f9f9';
                ctx.fillRect(0, y, this.canvas.width, viewport.rowHeight);
                return;
            }

            if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

            const bounds = LayoutEngine.getTaskBounds(task, viewport);

            if (task.hasChildren) {
                this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);
            } else {
                this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);
            }

            // Draw Dependency Handles if hovered
            if (task.id === hoveredTaskId && task.editable) {
                this.drawDependencyHandles(ctx, bounds);
            }

            // Label to the right (if needed, but Sidebar has it)
            // this.drawLabel(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height);
        });
    }

    private drawRedmineTaskBar(
        ctx: CanvasRenderingContext2D,
        task: Task,
        x: number,
        y: number,
        width: number,
        rowHeight: number,
        xToday: number
    ) {
        const isParent = task.hasChildren;
        const currentBarHeight = isParent ? Math.floor(TaskRenderer.BAR_HEIGHT / 2) : TaskRenderer.BAR_HEIGHT;
        const barY = Math.floor(y + (rowHeight - currentBarHeight) / 2); // Vertically centered

        const baseX = Math.floor(x);
        const baseWidth = Math.floor(width);
        const ratio = Math.max(0, Math.min(100, task.ratioDone));
        const progressWidth = Math.floor(baseWidth * (ratio / 100));

        const delayStartX = baseX + progressWidth;
        const delayEndX = Math.min(xToday, baseX + baseWidth);
        let delayWidth = 0;
        if (delayEndX > delayStartX) {
            delayWidth = delayEndX - delayStartX;
        }

        // 1. Base
        ctx.fillStyle = TaskRenderer.PLAN_GRAY;
        ctx.fillRect(baseX, barY, baseWidth, currentBarHeight);

        // 2. Progress
        if (progressWidth > 0) {
            ctx.fillStyle = TaskRenderer.DONE_GREEN;
            ctx.fillRect(baseX, barY, progressWidth, currentBarHeight);
        }

        // 3. Delay
        if (delayWidth > 0) {
            this.drawHatchedRect(ctx, delayStartX, barY, delayWidth, currentBarHeight);
        }

        // 4. Caps (Parent)
        if (isParent) {
            const capH = TaskRenderer.BAR_HEIGHT + TaskRenderer.CAP_OVERFLOW * 2;
            const fullHeightBarY = Math.floor(y + (rowHeight - TaskRenderer.BAR_HEIGHT) / 2);
            const capY = fullHeightBarY - TaskRenderer.CAP_OVERFLOW;

            ctx.fillStyle = '#666666';
            ctx.fillRect(baseX, capY, TaskRenderer.CAP_WIDTH, capH);
            ctx.fillRect(baseX + baseWidth - TaskRenderer.CAP_WIDTH, capY, TaskRenderer.CAP_WIDTH, capH);
        }
    }

    private drawHatchedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        ctx.strokeStyle = '#e03e3e';
        ctx.lineWidth = 1;

        const step = 4;
        for (let i = -height; i < width; i += step) {
            ctx.beginPath();
            ctx.moveTo(x + i, y + height);
            ctx.lineTo(x + i + height, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Requirement 4: Draw circular handles
    private drawDependencyHandles(ctx: CanvasRenderingContext2D, bounds: { x: number, y: number, width: number, height: number }) {
        const radius = 5;
        const cy = bounds.y + bounds.height / 2;

        ctx.fillStyle = '#2196f3'; // Blue handles
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;

        // Start Handle (Left)
        ctx.beginPath();
        ctx.arc(bounds.x - 2, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // End Handle (Right)
        ctx.beginPath();
        ctx.arc(bounds.x + bounds.width + 2, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}
