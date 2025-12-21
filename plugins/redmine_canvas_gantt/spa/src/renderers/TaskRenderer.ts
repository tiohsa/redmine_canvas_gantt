import type { Viewport, Task, ZoomLevel, Relation } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { buildDependencySummary } from './dependencyIndicators';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

    // Redmine standard-like bar colors
    private static readonly DONE_GREEN = '#50c878';
    private static readonly DELAY_RED = '#ff6b6b';
    private static readonly PLAN_GRAY = '#dddddd';
    private static readonly DEPENDENCY_COLOR = '#9ca3af';



    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[], rowCount: number, zoomLevel: ZoomLevel, relations: Relation[], layoutRows: any[] = []) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount);

        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const todayLineTs = todayTs + ONE_DAY;
        const xTodayLine = LayoutEngine.dateToX(todayLineTs, viewport) - viewport.scrollX;

        const showDependencyIndicators = zoomLevel === 0 || zoomLevel === 1;
        const dependencySummary = showDependencyIndicators ? buildDependencySummary(tasks, relations) : null;

        // Draw Project Summaries (Headers) and Version Headers
        layoutRows.forEach(row => {
            if (row.rowIndex >= startRow && row.rowIndex <= endRow) {
                if (row.type === 'header') {
                    if (row.startDate !== undefined && row.dueDate !== undefined) {
                        const x1 = LayoutEngine.dateToX(row.startDate, viewport) - viewport.scrollX;
                        const x2 = LayoutEngine.dateToX(row.dueDate + ONE_DAY, viewport) - viewport.scrollX;
                        const y = row.rowIndex * viewport.rowHeight - viewport.scrollY;
                        this.drawProjectSummaryBar(ctx, x1, x2, y, viewport.rowHeight);
                    }
                } else if (row.type === 'version') {
                    if (row.startDate !== undefined && row.dueDate !== undefined) {
                        const x1 = LayoutEngine.dateToX(row.startDate, viewport) - viewport.scrollX;
                        const x2 = LayoutEngine.dateToX(row.dueDate + ONE_DAY, viewport) - viewport.scrollX;
                        const y = row.rowIndex * viewport.rowHeight - viewport.scrollY;
                        this.drawVersionSummaryBar(ctx, x1, x2, y, viewport.rowHeight, row.ratioDone ?? 0);
                        // Draw Name
                        this.drawSubjectBeforeBar(ctx, { subject: row.name } as Task, x1, y, x2 - x1, viewport.rowHeight);
                    }
                }
            }
        });

        visibleTasks.forEach(task => {
            if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'bar', zoomLevel);
            // Requirement 6.1: Parent tasks drawn as Redmine standard summary bar (bracket style replaced by cap bar)
            // Cap bar or leaf bar drawing logic
            const barBounds = this.drawRedmineTaskBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height, xTodayLine);

            if (showDependencyIndicators && dependencySummary) {
                const summary = dependencySummary.get(task.id);
                if (summary) {
                    const showIncoming = summary.incoming > 0;
                    const showOutgoing = summary.outgoing > 0;
                    const incomingVisible = zoomLevel === 1 ? showIncoming : false;
                    const outgoingVisible = showOutgoing;
                    this.drawDependencyIndicators(ctx, barBounds, incomingVisible, outgoingVisible);
                }
            }

            // Draw Subject BEFORE the bar (to the left)
            this.drawSubjectBeforeBar(ctx, task, bounds.x, bounds.y, bounds.width, bounds.height);
        });
    }

    private drawProjectSummaryBar(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, rowHeight: number) {
        if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;

        const centerY = Math.floor(y + rowHeight / 2);
        const diamondSize = 8; // Size of the diamond

        ctx.save();

        // Use a semi-transparent theme blue for the diamonds
        ctx.fillStyle = 'rgba(26, 115, 232, 0.8)';
        ctx.strokeStyle = '#1a73e8';
        ctx.lineWidth = 1;

        // Draw Diamond at Start
        this.drawDiamond(ctx, x1, centerY, diamondSize);

        // Draw Diamond at End
        this.drawDiamond(ctx, x2, centerY, diamondSize);

        // Draw Dotted Line between diamonds
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.lineTo(x2, centerY);
        ctx.stroke();

        ctx.restore();
    }

    private drawVersionSummaryBar(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, rowHeight: number, ratioDone: number) {
        if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;

        const centerY = Math.floor(y + rowHeight / 2);
        const diamondSize = 8;
        const width = x2 - x1;
        const progressWidth = width * (Math.max(0, Math.min(100, ratioDone)) / 100);

        ctx.save();

        // Diamonds Color (Greenish for Version/Milestone?) or same Blue?
        // Let's use darker gray or teal to distinguish from Project
        ctx.fillStyle = '#009688';
        ctx.strokeStyle = '#00695c';
        ctx.lineWidth = 1;

        // Draw Diamond at Start
        this.drawDiamond(ctx, x1, centerY, diamondSize);

        // Draw Diamond at End
        this.drawDiamond(ctx, x2, centerY, diamondSize);

        // Draw Dotted Line (Background)
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = '#bdbdbd';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.lineTo(x2, centerY);
        ctx.stroke();

        // Draw Progress (Solid Line)
        if (progressWidth > 0) {
            ctx.setLineDash([]);
            ctx.strokeStyle = '#4db6ac'; // Light teal
            ctx.lineWidth = 3; // Thicker to be visible
            ctx.beginPath();
            ctx.moveTo(x1, centerY);
            ctx.lineTo(x1 + progressWidth, centerY);
            ctx.stroke();
        }

        ctx.restore();
    }

    private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
        ctx.beginPath();
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size / 2, y);
        ctx.lineTo(x, y + size / 2);
        ctx.lineTo(x - size / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
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

        return {
            x: baseX,
            y: barY,
            width: baseWidth,
            height: currentBarHeight
        };
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

    private drawDependencyIndicators(
        ctx: CanvasRenderingContext2D,
        bar: { x: number; y: number; width: number; height: number },
        hasIncoming: boolean,
        hasOutgoing: boolean
    ) {
        const indicatorSize = Math.max(4, Math.round(bar.height * 0.35));
        const centerY = bar.y + bar.height / 2;

        ctx.save();
        ctx.fillStyle = TaskRenderer.DEPENDENCY_COLOR;

        if (hasIncoming) {
            const leftX = bar.x;
            ctx.beginPath();
            ctx.moveTo(leftX, centerY);
            ctx.lineTo(leftX + indicatorSize, centerY - indicatorSize / 2);
            ctx.lineTo(leftX + indicatorSize, centerY + indicatorSize / 2);
            ctx.closePath();
            ctx.fill();
        }

        if (hasOutgoing) {
            const rightX = bar.x + bar.width;
            ctx.beginPath();
            ctx.moveTo(rightX, centerY);
            ctx.lineTo(rightX - indicatorSize, centerY - indicatorSize / 2);
            ctx.lineTo(rightX - indicatorSize, centerY + indicatorSize / 2);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

}
