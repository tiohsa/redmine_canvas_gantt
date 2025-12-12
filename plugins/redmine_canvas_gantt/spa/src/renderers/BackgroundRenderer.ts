import type { Viewport, ViewMode } from '../types';
import { getGridTicks } from '../utils/grid';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, viewMode: ViewMode) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid (Day lines)
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();

        const ticks = getGridTicks(viewport, viewMode);

        ticks.forEach(tick => {
            // For Week view, maybe we want lines for days too? 
            // Requirement says: "Day is day unit display".
            // If viewMode is Week, getGridTicks returns ticks for start of week.
            // If we strictly follow the requested logic in previous step, Week mode showed lines every week.
            // Let's stick to drawing lines at ticks returned by getGridTicks.

            ctx.moveTo(Math.floor(tick.x) + 0.5, 0);
            ctx.lineTo(Math.floor(tick.x) + 0.5, this.canvas.height);
        });

        // Horizontal lines
        let y = -viewport.scrollY % viewport.rowHeight;
        while (y < this.canvas.height) {
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
            y += viewport.rowHeight;
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
