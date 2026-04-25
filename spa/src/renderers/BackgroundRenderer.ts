import type { Task, Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import { designTokens } from '../styles/designTokens';
import { getCanvasLogicalSize } from '../utils/canvasDpr';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, zoomLevel: ZoomLevel, selectedTaskId: string | null, tasks: Task[]) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = getCanvasLogicalSize(this.canvas);

        // Clear
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = designTokens.appBg;
        ctx.fillRect(0, 0, width, height);

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
                    const w = (i < ticks.length - 1)
                        ? ticks[i + 1].x - tick.x
                        : (24 * 60 * 60 * 1000) * viewport.scale;

                    // Only draw if within canvas
                    if (tick.x + w > 0 && tick.x < width) {
                        ctx.fillStyle = designTokens.weekendBg;
                        ctx.fillRect(Math.floor(tick.x), 0, Math.ceil(w), height);
                    }
                }
            });
        }

        // Highlight selected row
        if (selectedTaskId) {
            const selectedTask = tasks.find(t => t.id === selectedTaskId);
            if (selectedTask) {
                const y = selectedTask.rowIndex * viewport.rowHeight - viewport.scrollY;
                if (y + viewport.rowHeight > 0 && y < height) {
                    ctx.fillStyle = designTokens.selectedRow;
                    ctx.fillRect(0, y, width, viewport.rowHeight);
                }
            }
        }

        // Grid (vertical lines)
        ctx.strokeStyle = designTokens.borderSubtle;
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
            ctx.lineTo(Math.floor(tick.x) + 0.5, height);
        });

        // Horizontal lines
        // Ensure color is correct
        ctx.strokeStyle = designTokens.borderStrong;

        let y = -viewport.scrollY % viewport.rowHeight;
        while (y < height) {
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(width, Math.floor(y) + 0.5);
            y += viewport.rowHeight;
        }

        ctx.stroke();
    }
}
