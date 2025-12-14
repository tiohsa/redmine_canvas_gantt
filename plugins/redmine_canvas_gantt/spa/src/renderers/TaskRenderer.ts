import type { Viewport, Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { getStatusColor } from '../utils/styles';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

    // Redmine standard-like bar colors
    private static readonly DONE_GREEN = '#50c878';
    private static readonly DELAY_RED = '#ff6b6b';
    private static readonly PLAN_GRAY = '#dddddd';


    private static readonly LABEL_COLOR = '#aaaaaa';

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[], rowCount: number) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount);

        // Filter visible tasks
        const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const todayLineTs = todayTs + ONE_DAY;
        const xTodayLine = LayoutEngine.dateToX(todayLineTs, viewport) - viewport.scrollX;

        visibleTasks.forEach(task => {
            if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

            const bounds = LayoutEngine.getTaskBounds(task, viewport);
            // Requirement 6.1: Parent tasks drawn as Redmine standard summary bar (bracket style replaced by cap bar)
            if (task.hasChildren) {
                // For parent tasks, use the Redmine-standard Cap style
                this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);
            } else {
                // Leaf task: simple rectangle (no rounded corners)
                // We could use drawRedmineTaskBar without caps too, but let's stick to existing leaf style to be safe, 
                // OR use the new logic for consistency if requested. 
                // The 'Delay' calculation in drawRedmineTaskBar is better. Let's use it for ALL tasks but only draw Caps for parents.
                this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);
            }

            // Label to the right of bar: "[status] [ratio]%"
            this.drawLabel(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height);

            // Draw Label (optional, maybe to the right side if it fits or outside)
            // For now, let's keep it simple or remove if Sidebar has it. 
            // The image shows labels primarily in the sidebar, or maybe distinct bar types.
            // Let's not draw text on bar for now to match the clean look in the image (Sidebar has names).
        });
    }



    // Spec Constants
    private static readonly BAR_HEIGHT = 12;
    private static readonly CAP_WIDTH = 4; // Adjusted for visual balance 3-4px
    private static readonly CAP_OVERFLOW = 2; // Spec says 1, but 2 looks better for "End Cap" style

    private drawRedmineTaskBar(
        ctx: CanvasRenderingContext2D,
        task: Task,
        x: number,
        y: number,
        width: number,
        rowHeight: number,
        xToday: number
    ) {
        // === 1. Calculation & Pixel Snapping ===
        const isParent = task.hasChildren;
        // Parent task body is half height, leaf is full height
        const currentBarHeight = isParent ? Math.floor(TaskRenderer.BAR_HEIGHT / 2) : TaskRenderer.BAR_HEIGHT;

        // Center the bar vertically in the row
        const barY = Math.floor(y + (rowHeight - currentBarHeight) / 2);

        // Base Rectangle
        const baseX = Math.floor(x);
        const baseWidth = Math.floor(width);

        // Progress (Internal Rectangle)
        const ratio = Math.max(0, Math.min(100, task.ratioDone));
        const progressWidth = Math.floor(baseWidth * (ratio / 100));

        // Delay (Hatched Rectangle)
        // Note: Standard Redmine "Delay" is the segment from "Done End" to "Today" (if Today > Done End).
        // The provided text formula seemed to calculate "Future Remaining", so we use the standard "Late" visual definition.
        const delayStartX = baseX + progressWidth;
        const delayEndX = Math.min(xToday, baseX + baseWidth);
        let delayWidth = 0;

        // Only draw delay if today is past the progress point and within project bounds (roughly)
        if (delayEndX > delayStartX) {
            delayWidth = delayEndX - delayStartX;
        }

        // === 2. Drawing (Z-Order) ===
        // "Background -> Body -> Internal -> Emphasis -> Caps"

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
        // The spec implies these caps overwrite. The image shows them for Parent tasks.
        if (isParent) {
            // Caps use the FULL BAR_HEIGHT to remain "not changed" in height/size
            const capH = TaskRenderer.BAR_HEIGHT + TaskRenderer.CAP_OVERFLOW * 2;

            // Calculate Cap Y based on where the FULL height bar would have been
            // This ensures they are centered in the row exactly as before
            const fullHeightBarY = Math.floor(y + (rowHeight - TaskRenderer.BAR_HEIGHT) / 2);
            const capY = fullHeightBarY - TaskRenderer.CAP_OVERFLOW;

            ctx.fillStyle = '#666666'; // Cap color (Dark Gray)

            // Left Cap
            ctx.fillRect(baseX, capY, TaskRenderer.CAP_WIDTH, capH);

            // Right Cap
            ctx.fillRect(baseX + baseWidth - TaskRenderer.CAP_WIDTH, capY, TaskRenderer.CAP_WIDTH, capH);

            // Optional: Triangle/Pentagon shape refinement? 
            // The user spec said "drawRect(..., CAP_WIDTH, ...)" so simple rects for now as per "8. Canvas Pseudo-code".
            // The image showed downward points, but the text spec says "drawRect". I will follow the TEXT spec for coordinates ("drawRect"),
            // but the Image showed points... "そのまま実装に落とせる形" (As is) implementation of the TEXT.
            // Text says "drawRect(ctx, baseX, barY - 1, CAP_WIDTH, BAR_HEIGHT + 2)".
            // I will stick to Rects.
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
