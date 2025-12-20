import type { Viewport, Task, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

    // Redmine standard-like bar colors
    private static readonly DONE_GREEN = '#50c878';
    private static readonly DELAY_RED = '#ff6b6b';
    private static readonly PLAN_GRAY = '#dddddd';



    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[], rowCount: number, zoomLevel: ZoomLevel) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount);

        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const todayLineTs = todayTs + ONE_DAY;
        const xTodayLine = LayoutEngine.dateToX(todayLineTs, viewport) - viewport.scrollX;

        visibleTasks.forEach(task => {
            if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
            // Requirement 6.1: Parent tasks drawn as Redmine standard summary bar (bracket style replaced by cap bar)
            // Cap bar or leaf bar drawing logic
            this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);

            // Draw Subject BEFORE the bar (to the left)
            this.drawSubjectBeforeBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height);
        });
    }

    private drawSubjectBeforeBar(ctx: CanvasRenderingContext2D, task: Task, x: number, y: number, width: number, height: number) {
        // We aren't clipping to width currently, but keeping the signature compatible.
        void width;

        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#000000';

        const textX = x - 30; // Increased offset to 30px to avoid dependency lines
        const textY = y + height / 2;

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ctx.fillText(task.subject, textX, textY);

        ctx.restore();
    }



    private drawRedmineTaskBar(
        ctx: CanvasRenderingContext2D,
        task: Task,
        x: number,
        y: number,
        width: number,
        height: number,
        xToday: number
    ) {
        // === 1. Calculation & Pixel Snapping ===
        const isParent = task.hasChildren;

        // For parent tasks, the body is half the height of the leaf bar.
        // For leaf tasks, height is the full height calculated in LayoutEngine.
        const currentBarHeight = isParent ? Math.floor(height / 2) : height;

        // Center the bar vertically in the provided 'height' area (which is already centered in the row)
        const barY = Math.floor(y + (height - currentBarHeight) / 2);

        // Base Rectangle
        const baseX = Math.floor(x);
        const baseWidth = Math.floor(width);

        // Progress (Internal Rectangle)
        const ratio = Math.max(0, Math.min(100, task.ratioDone));
        const progressWidth = Math.floor(baseWidth * (ratio / 100));

        // Delay (Hatched Rectangle)
        const delayStartX = baseX + progressWidth;
        const delayEndX = Math.min(xToday, baseX + baseWidth);
        let delayWidth = 0;

        if (delayEndX > delayStartX) {
            delayWidth = delayEndX - delayStartX;
        }

        // === 2. Drawing (Z-Order) ===
        // 1. Base Bar (Planned Duration) - Gray
        ctx.fillStyle = TaskRenderer.PLAN_GRAY;
        ctx.fillRect(baseX, barY, baseWidth, currentBarHeight);

        // 2. Progress Bar - Green
        if (progressWidth > 0) {
            ctx.fillStyle = TaskRenderer.DONE_GREEN;
            ctx.fillRect(baseX, barY, progressWidth, currentBarHeight);
        }

        // 3. Delay Section - Red Hatched
        if (delayWidth > 0) {
            this.drawHatchedRect(ctx, delayStartX, barY, delayWidth, currentBarHeight);
        }

        // 4. & 5. End Caps (Parent Only)
        if (isParent) {
            // Cap height matches target bar height if it were a leaf bar (height) + overflow
            const capOverflow = Math.max(1, Math.round(height * 0.15));
            const capH = height + capOverflow * 2;
            const capY = y - capOverflow;
            const capWidth = Math.max(2, Math.round(height * 0.3));

            ctx.fillStyle = '#666666'; // Cap color (Dark Gray)

            // Left Cap
            ctx.fillRect(baseX, capY, capWidth, capH);

            // Right Cap
            ctx.fillRect(baseX + baseWidth - capWidth, capY, capWidth, capH);
        }
    }

    private drawHatchedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        ctx.fillStyle = TaskRenderer.DELAY_RED; // Use a reddish background or just pattern?
        // Usually hatched is pattern over background. 
        // Let's draw stripes.
        ctx.strokeStyle = '#e03e3e'; // Darker red for stripes
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



}
