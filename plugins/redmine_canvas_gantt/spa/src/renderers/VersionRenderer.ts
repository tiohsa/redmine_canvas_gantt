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

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();

        versions.forEach((version: Version) => {
            const date = version.effectiveDate;
            if (!Number.isFinite(date)) return;
            if (date < visibleStart || date > visibleEnd) return;

            const x = LayoutEngine.dateToX(date, viewport) - viewport.scrollX;
            if (x < -1 || x > this.canvas.width + 1) return;

            const crispX = Math.floor(x) + 0.5;
            ctx.moveTo(crispX, 0);
            ctx.lineTo(crispX, this.canvas.height);
        });

        ctx.stroke();
    }
}
