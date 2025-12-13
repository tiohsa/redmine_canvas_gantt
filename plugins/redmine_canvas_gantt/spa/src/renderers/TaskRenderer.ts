import type { Viewport, Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { getStatusColor } from '../utils/styles';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

    // Redmine standard-like bar colors
    private static readonly DONE_GREEN = '#50c878';
    private static readonly DELAY_RED = '#ff6b6b';
    private static readonly PLAN_GRAY = '#dddddd';
    private static readonly SUMMARY_STROKE = '#333333';
    private static readonly LABEL_COLOR = '#aaaaaa';

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[]) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, tasks.length);

        // Filter visible tasks
        const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const todayLineTs = todayTs + ONE_DAY;
        const xTodayLine = LayoutEngine.dateToX(todayLineTs, viewport) - viewport.scrollX;

        visibleTasks.forEach(task => {
            if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

            const bounds = LayoutEngine.getTaskBounds(task, viewport);
            const { doneWidth, delayWidth, remainingWidth } = this.computeBarSegments(task, bounds.x, bounds.width, xTodayLine, todayLineTs);

            // Requirement 6.1: Parent tasks drawn as summary task (bracket style or different shape)
            if (task.hasChildren) {
                this.drawSummaryBracket(ctx, bounds.x, bounds.y, bounds.width, bounds.height);
                this.drawSummaryProgress(ctx, bounds.x, bounds.y, bounds.width, bounds.height, doneWidth);
            } else {
                // Leaf task: rectangle (no rounded corners)
                this.drawLeafBar(ctx, bounds.x, bounds.y, bounds.height, doneWidth, delayWidth, remainingWidth);
            }

            // Label to the right of bar: "[status] [ratio]%"
            this.drawLabel(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height);

            // Draw Label (optional, maybe to the right side if it fits or outside)
            // For now, let's keep it simple or remove if Sidebar has it. 
            // The image shows labels primarily in the sidebar, or maybe distinct bar types.
            // Let's not draw text on bar for now to match the clean look in the image (Sidebar has names).
        });
    }

    private computeBarSegments(
        task: Task,
        barX: number,
        totalWidth: number,
        xTodayLine: number,
        todayLineTs: number
    ): { doneWidth: number; delayWidth: number; remainingWidth: number } {
        const ratio = Math.max(0, Math.min(100, task.ratioDone)) / 100;
        const doneWidth = totalWidth * ratio;

        let expectedWidth = 0;
        if (todayLineTs > task.startDate) {
            expectedWidth = xTodayLine - barX;
        }

        expectedWidth = Math.max(0, Math.min(totalWidth, expectedWidth));

        const delayWidth = Math.max(0, expectedWidth - doneWidth);
        const remainingWidth = Math.max(0, totalWidth - doneWidth - delayWidth);

        return {
            doneWidth: Math.max(0, Math.min(totalWidth, doneWidth)),
            delayWidth: Math.max(0, Math.min(totalWidth, delayWidth)),
            remainingWidth: Math.max(0, Math.min(totalWidth, remainingWidth))
        };
    }

    private drawLeafBar(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        height: number,
        doneWidth: number,
        delayWidth: number,
        remainingWidth: number
    ) {
        // Done: solid green from left
        if (doneWidth > 0) {
            ctx.fillStyle = TaskRenderer.DONE_GREEN;
            ctx.fillRect(x, y, doneWidth, height);
        }

        // Delay: red from end of done to today line (clamped)
        if (delayWidth > 0) {
            ctx.fillStyle = TaskRenderer.DELAY_RED;
            ctx.fillRect(x + doneWidth, y, delayWidth, height);
        }

        // Planned/remaining: gray to the end
        if (remainingWidth > 0) {
            ctx.fillStyle = TaskRenderer.PLAN_GRAY;
            ctx.fillRect(x + doneWidth + delayWidth, y, remainingWidth, height);
        }
    }

    private drawSummaryBracket(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        const pad = 1;
        const topY = y + pad;
        const leftX = x + pad;
        const rightX = x + width - pad;
        const bottomY = y + height - pad;

        ctx.save();
        ctx.strokeStyle = TaskRenderer.SUMMARY_STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();

        // Left bracket
        ctx.moveTo(leftX, topY);
        ctx.lineTo(leftX, bottomY);
        ctx.lineTo(leftX + 6, bottomY);

        // Top line
        ctx.moveTo(leftX, topY);
        ctx.lineTo(rightX, topY);

        // Right bracket
        ctx.moveTo(rightX, topY);
        ctx.lineTo(rightX, bottomY);
        ctx.lineTo(rightX - 6, bottomY);

        ctx.stroke();
        ctx.restore();
    }

    private drawSummaryProgress(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, doneWidth: number) {
        const barHeight = 3;
        const barY = y + height - barHeight;

        ctx.save();
        ctx.fillStyle = TaskRenderer.PLAN_GRAY;
        ctx.fillRect(x, barY, width, barHeight);

        if (doneWidth > 0) {
            ctx.fillStyle = TaskRenderer.DONE_GREEN;
            ctx.fillRect(x, barY, Math.min(width, doneWidth), barHeight);
        }
        ctx.restore();
    }

    private drawLabel(ctx: CanvasRenderingContext2D, task: Task, x: number, y: number, width: number, height: number) {
        const label = `${getStatusColor(task.statusId).label} ${Math.max(0, Math.min(100, task.ratioDone))}%`;
        const textX = x + width + 6;
        const textY = y + height / 2 + 4;

        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.fillStyle = TaskRenderer.LABEL_COLOR;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, textX, textY);
        ctx.restore();
    }
}
