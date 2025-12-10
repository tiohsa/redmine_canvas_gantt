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
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid (Day lines)
        ctx.strokeStyle = '#e0e0e0';
        ctx.beginPath();

        const ONE_DAY = 24 * 60 * 60 * 1000;
        // Calculate visible time range
        const startOffsetTime = viewport.scrollX / viewport.scale;
        const visibleStartTime = viewport.startDate + startOffsetTime;
        const visibleEndTime = visibleStartTime + (this.canvas.width / viewport.scale);

        // Align to start of day
        let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - viewport.startDate) * viewport.scale - viewport.scrollX;
            if (x >= 0 && x <= this.canvas.width) {
                ctx.moveTo(Math.floor(x) + 0.5, 0);
                ctx.lineTo(Math.floor(x) + 0.5, this.canvas.height);
            }
            currentTime += ONE_DAY;
        }
        ctx.stroke();
    }
}
