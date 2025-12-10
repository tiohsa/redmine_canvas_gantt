import type { Viewport, Task } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';

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
            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

            ctx.fillStyle = '#000';
            ctx.fillText(task.subject, bounds.x + 5, bounds.y + 12);
        });
    }
}
