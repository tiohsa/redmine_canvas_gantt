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

        // Grid
        ctx.strokeStyle = '#ddd';
        ctx.beginPath();
        for (let i = 0; i < this.canvas.width; i += 100) {
            ctx.moveTo(i - (viewport.scrollX % 100), 0);
            ctx.lineTo(i - (viewport.scrollX % 100), this.canvas.height);
        }
        ctx.stroke();
    }
}
