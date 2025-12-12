import type { Viewport } from '../types';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid (Day lines)
        ctx.strokeStyle = '#e5e8ef';
        ctx.lineWidth = 1;
        ctx.beginPath();

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const startOffsetTime = viewport.scrollX / viewport.scale;
        const visibleStartTime = viewport.startDate + startOffsetTime;
        const visibleEndTime = visibleStartTime + (this.canvas.width / viewport.scale);

        let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - viewport.startDate) * viewport.scale - viewport.scrollX;
            if (x >= 0 && x <= this.canvas.width) {
                // Dashed line for grid
                ctx.setLineDash([2, 8]);
                ctx.moveTo(Math.floor(x) + 0.5, 0);
                ctx.lineTo(Math.floor(x) + 0.5, this.canvas.height);
            }
            currentTime += ONE_DAY;
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // Horizontal separators per row
        const { rowHeight, scrollY, height } = viewport;
        const startRow = Math.floor(scrollY / rowHeight);
        const endRow = Math.ceil((scrollY + height) / rowHeight);

        ctx.strokeStyle = '#f0f2f7';
        ctx.beginPath();
        for (let row = startRow; row <= endRow; row++) {
            const y = row * rowHeight - scrollY;
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
        }
        ctx.stroke();

        // Draw "Today" line
        const now = Date.now();
        const todayX = (now - viewport.startDate) * viewport.scale - viewport.scrollX;

        if (todayX >= 0 && todayX <= this.canvas.width) {
            ctx.strokeStyle = '#ff5252';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(todayX, 0);
            ctx.lineTo(todayX, this.canvas.height);
            ctx.stroke();

            // Tag moved to TimelineHeader
        }
    }
}
