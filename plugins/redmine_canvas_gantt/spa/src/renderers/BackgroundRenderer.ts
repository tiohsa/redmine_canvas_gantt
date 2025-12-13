import type { Viewport, ViewMode } from '../types';
import { getGridScales } from '../utils/grid';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly WEEKEND_BG = '#eeeeee';
    private static readonly ONE_DAY = 24 * 60 * 60 * 1000;

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

        const scales = getGridScales(viewport, viewMode);

        // Weekend background (when bottom ticks represent day boundaries)
        const looksLikeDays =
            scales.bottom.length >= 2 &&
            Math.abs(scales.bottom[1].time - scales.bottom[0].time - BackgroundRenderer.ONE_DAY) < 60 * 60 * 1000;

        if (looksLikeDays) {
            for (let i = 0; i < scales.bottom.length; i++) {
                const tick = scales.bottom[i];
                const nextX = i < scales.bottom.length - 1 ? scales.bottom[i + 1].x : tick.x + (BackgroundRenderer.ONE_DAY * viewport.scale);
                const d = new Date(tick.time);
                const dow = d.getDay(); // 0 Sun, 6 Sat
                if (dow === 0 || dow === 6) {
                    const x = Math.floor(tick.x);
                    const w = Math.ceil(nextX - tick.x);
                    if (w > 0) {
                        ctx.fillStyle = BackgroundRenderer.WEEKEND_BG;
                        ctx.fillRect(x, 0, w, this.canvas.height);
                    }
                }
            }
        }

        // Grid (vertical lines)
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();

        scales.bottom.forEach(tick => {
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


    }
}
