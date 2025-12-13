import type { Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly WEEKEND_BG = '#eeeeee';
    private static readonly ONE_DAY = 24 * 60 * 60 * 1000;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, zoomLevel: ZoomLevel) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const scales = getGridScales(viewport, zoomLevel);

        // Weekend background
        // Logic: if zoomLevel shows days (level 2 or 3)
        // Zoom 2: Bottom is Days.
        // Zoom 3: Top is Days?
        // Let's rely on checking day-like intervals in scales.middle or scales.bottom or scales.top
        // Or simpler: iterate days if scale is small enough to see them.

        const pixelsPerDay = (24 * 60 * 60 * 1000) * viewport.scale;

        if (pixelsPerDay > 10) { // arbitrary threshold for visibility
            // Calculate visible range
            const startT = viewport.startDate + (viewport.scrollX / viewport.scale);
            const endT = startT + (viewport.width / viewport.scale);

            // Align to day
            let t = Math.floor(startT / BackgroundRenderer.ONE_DAY) * BackgroundRenderer.ONE_DAY;

            while (t < endT) {
                const d = new Date(t);
                const dow = d.getDay();

                // If weekend
                if (dow === 0 || dow === 6) {
                    const x = (t - viewport.startDate) * viewport.scale - viewport.scrollX;
                    const w = pixelsPerDay;
                    // Draw strip
                    if (x + w > 0 && x < this.canvas.width) {
                        ctx.fillStyle = BackgroundRenderer.WEEKEND_BG;
                        ctx.fillRect(Math.floor(x), 0, Math.ceil(w), this.canvas.height);
                    }
                }
                t += BackgroundRenderer.ONE_DAY;
            }
        }

        // Grid (vertical lines)
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Draw lines based on the finest scale available
        // If Zoom 3 (Hour), we might want hour lines?
        // If Zoom 2 (Day), day lines.
        // If Zoom 1 (Week), maybe week lines?

        let ticks = scales.bottom;
        if (ticks.length === 0) ticks = scales.middle;
        if (ticks.length === 0) ticks = scales.top;

        ticks.forEach(tick => {
            ctx.moveTo(Math.floor(tick.x) + 0.5, 0);
            ctx.lineTo(Math.floor(tick.x) + 0.5, this.canvas.height);
        });

        // Horizontal lines
        // Ensure color is correct
        ctx.strokeStyle = '#e0e0e0';

        let y = -viewport.scrollY % viewport.rowHeight;
        while (y < this.canvas.height) {
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
            y += viewport.rowHeight;
        }

        ctx.stroke();
    }
}
