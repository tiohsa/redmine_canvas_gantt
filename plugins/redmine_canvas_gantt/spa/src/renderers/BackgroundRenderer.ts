import type { Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly WEEKEND_BG = '#eeeeee';

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
        // Use scales to align perfectly with the header and grid lines (Local time support)
        if (zoomLevel === 2) {
            const ticks = scales.bottom;
            ticks.forEach((tick, i) => {
                const d = new Date(tick.time);
                const dow = d.getDay();
                if (dow === 0 || dow === 6) {
                    // Calculate width to next tick or default to one day width
                    let w = (i < ticks.length - 1)
                        ? ticks[i + 1].x - tick.x
                        : (24 * 60 * 60 * 1000) * viewport.scale;

                    // Only draw if within canvas
                    if (tick.x + w > 0 && tick.x < this.canvas.width) {
                        ctx.fillStyle = BackgroundRenderer.WEEKEND_BG;
                        ctx.fillRect(Math.floor(tick.x), 0, Math.ceil(w), this.canvas.height);
                    }
                }
            });
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
