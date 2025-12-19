import type { Relation, Task, Viewport, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';

export class DependencyRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[], relations: Relation[], zoomLevel?: ZoomLevel) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const rel of relations) {
            const fromTask = tasks.find(t => t.id === rel.from);
            const toTask = tasks.find(t => t.id === rel.to);
            if (!fromTask || !toTask) continue;

            const fromBounds = LayoutEngine.getTaskBounds(fromTask, viewport, 'bar', zoomLevel);
            const toBounds = LayoutEngine.getTaskBounds(toTask, viewport, 'bar', zoomLevel);

            const startX = fromBounds.x + fromBounds.width;
            const startY = fromBounds.y + fromBounds.height / 2;
            const endX = toBounds.x;
            const endY = toBounds.y + toBounds.height / 2;

            // Keep connectors readable even when target is "behind"
            const dx = Math.max(24, Math.min(80, (endX - startX) / 2));
            const cp1x = startX + dx;
            const cp1y = startY;
            const cp2x = endX - dx;
            const cp2y = endY;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            ctx.stroke();

            this.drawArrowHead(ctx, endX, endY, cp2x, cp2y);
        }
    }

    private drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, fromX: number, fromY: number) {
        const angle = Math.atan2(y - fromY, x - fromX);
        const size = 6;
        const a1 = angle + Math.PI * 0.85;
        const a2 = angle - Math.PI * 0.85;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a1) * size, y + Math.sin(a1) * size);
        ctx.lineTo(x + Math.cos(a2) * size, y + Math.sin(a2) * size);
        ctx.closePath();
        ctx.fillStyle = '#9ca3af';
        ctx.fill();
    }
}
