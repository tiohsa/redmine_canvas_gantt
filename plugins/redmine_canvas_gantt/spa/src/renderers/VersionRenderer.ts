import type { Viewport, Version } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';

export class VersionRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { showVersions } = useUIStore.getState();
        if (!showVersions) return;

        const { versions } = useTaskStore.getState();
        if (versions.length === 0) return;

        const scale = viewport.scale || 0.00000001;
        const visibleStart = viewport.startDate + viewport.scrollX / scale;
        const visibleEnd = viewport.startDate + (viewport.scrollX + viewport.width) / scale;

        const barCenterY = 14;
        const diamondSize = 6;

        versions.forEach((version: Version) => {
            const startDate = version.startDate ?? version.dueDate;
            const endDate = version.dueDate;
            if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return;
            if (endDate < visibleStart || startDate > visibleEnd) return;

            const xStart = LayoutEngine.dateToX(Math.min(startDate, endDate), viewport) - viewport.scrollX;
            const xEnd = LayoutEngine.dateToX(Math.max(startDate, endDate), viewport) - viewport.scrollX;
            if (xEnd < -1 || xStart > this.canvas.width + 1) return;

            this.drawSummaryBar(ctx, xStart, xEnd, barCenterY, diamondSize);

            const progress = Math.max(0, Math.min(100, version.completedPercent ?? 0));
            if (progress > 0) {
                const progressX = xStart + (xEnd - xStart) * (progress / 100);
                this.drawProgressLine(ctx, xStart, progressX, barCenterY);
            }
        });
    }

    private drawSummaryBar(ctx: CanvasRenderingContext2D, x1: number, x2: number, centerY: number, size: number) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.lineTo(x2, centerY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(26, 115, 232, 0.8)';
        ctx.strokeStyle = '#1a73e8';
        ctx.lineWidth = 1;
        this.drawDiamond(ctx, x1, centerY, size);
        this.drawDiamond(ctx, x2, centerY, size);
        ctx.restore();
    }

    private drawProgressLine(ctx: CanvasRenderingContext2D, x1: number, x2: number, centerY: number) {
        ctx.save();
        ctx.strokeStyle = '#50c878';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.lineTo(x2, centerY);
        ctx.stroke();
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
}
