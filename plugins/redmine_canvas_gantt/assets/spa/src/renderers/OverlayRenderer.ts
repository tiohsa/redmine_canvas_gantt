import type { Viewport } from '../types';

export class OverlayRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport) {
        // Avoid unused var error if logic isn't ready
        if (!viewport) return;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // TODO: Render selection, dependencies
    }
}
