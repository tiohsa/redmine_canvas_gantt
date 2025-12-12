import type { Viewport, Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { getStatusColor } from '../utils/styles';

export class TaskRenderer {
    private canvas: HTMLCanvasElement;

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

        visibleTasks.forEach(task => {
            const bounds = LayoutEngine.getTaskBounds(task, viewport);
            const style = getStatusColor(task.statusId);

            // Draw Bar Background (lighter or main color)
            // Use pill shape (radius = height / 2)
            const radius = bounds.height / 2;
            this.drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, radius, style.bar);

            // Draw Progress
            if (task.ratioDone > 0) {
                const progressWidth = (bounds.width * task.ratioDone) / 100;
                // Clip progress to rounded rect
                ctx.save();
                this.clipRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, radius);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Darken overlay
                ctx.fillRect(bounds.x, bounds.y, progressWidth, bounds.height);
                ctx.restore();
            }

            // Draw Label (optional, maybe to the right side if it fits or outside)
            // For now, let's keep it simple or remove if Sidebar has it. 
            // The image shows labels primarily in the sidebar, or maybe distinct bar types.
            // Let's not draw text on bar for now to match the clean look in the image (Sidebar has names).
        });
    }

    private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fillStyle: string) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }

    private clipRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
    }
}
