import type { Relation, Task, Viewport, ZoomLevel } from '../types';
import { LayoutEngine } from '../engines/LayoutEngine';

export class DependencyRenderer {
    private canvas: HTMLCanvasElement;

    private static readonly HORIZONTAL_OFFSET = 12;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, tasks: Task[], relations: Relation[], zoomLevel?: ZoomLevel) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const rel of relations) {
            const fromTask = tasks.find(t => t.id === rel.from);
            const toTask = tasks.find(t => t.id === rel.to);
            if (!fromTask || !toTask) continue;

            const fromBounds = LayoutEngine.getTaskBounds(fromTask, viewport, 'bar', zoomLevel);
            const toBounds = LayoutEngine.getTaskBounds(toTask, viewport, 'bar', zoomLevel);

            const startX = fromBounds.x + fromBounds.width;
            const startY = fromBounds.y + fromBounds.height / 2;
            const endX = toBounds.x;
            const endY = toBounds.y + toBounds.height / 2;

            const waypoints = this.calculateOrthogonalPath(startX, startY, endX, endY, viewport);

            ctx.beginPath();
            ctx.moveTo(waypoints[0].x, waypoints[0].y);
            for (let i = 1; i < waypoints.length; i++) {
                ctx.lineTo(waypoints[i].x, waypoints[i].y);
            }
            ctx.stroke();

            // Draw arrowhead at the last segment
            if (waypoints.length >= 2) {
                const lastPoint = waypoints[waypoints.length - 1];
                const prevPoint = waypoints[waypoints.length - 2];
                this.drawArrowHead(ctx, lastPoint.x, lastPoint.y, prevPoint.x, prevPoint.y);
            }
        }
    }

    private calculateOrthogonalPath(
        startX: number, startY: number,
        endX: number, endY: number,
        viewport: Viewport
    ): Array<{ x: number; y: number }> {
        const offset = DependencyRenderer.HORIZONTAL_OFFSET;

        // If target is significantly to the right of source (normal case)
        if (endX > startX + offset * 2) {
            // Find a suitable vertical drop X.
            // Requirement: "Center of the column"
            // We calculate the center of the day column that is closest to the target but to its left.
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            const colWidth = ONE_DAY_MS * viewport.scale;

            // Calculate absolute X coordinate in the timeline
            const absoluteEndX = endX + viewport.scrollX;

            // Determine the column index for the target's start position
            const colIndex = Math.floor(absoluteEndX / colWidth);

            // Calculate the center of that column (absolute)
            let dropAbsoluteX = colIndex * colWidth + colWidth / 2;

            // If the column center is to the right of the target start (e.g. task starts early in the day),
            // move to the previous column's center to ensuring dropping "before" the task.
            // Also ensure we don't drop too close to the text (allow some gap).
            if (dropAbsoluteX > absoluteEndX - offset) {
                dropAbsoluteX -= colWidth;
            }

            let midX = dropAbsoluteX - viewport.scrollX;

            // Constrain midX: must be between startX + offset and endX - offset
            // If the calculated column center is invalid (too far left), fallback to a safe position relative to target.
            if (midX < startX + offset) {
                midX = endX - offset; // Fallback: just before target

                // If still invalid (source and target too close), fallback to geometric center
                if (midX < startX + offset) {
                    midX = (startX + endX) / 2;
                }
            }

            return [
                { x: startX, y: startY },
                { x: midX, y: startY },
                { x: midX, y: endY },
                { x: endX, y: endY }
            ];
        } else {
            // Target is behind or overlapping source - route around
            const rightOffset = startX + offset;
            const leftOffset = endX - offset;

            const goDown = startY <= endY;
            const verticalOffset = goDown
                ? Math.max(startY, endY) + 20
                : Math.min(startY, endY) - 20;

            return [
                { x: startX, y: startY },
                { x: rightOffset, y: startY },
                { x: rightOffset, y: verticalOffset },
                { x: leftOffset, y: verticalOffset },
                { x: leftOffset, y: endY },
                { x: endX, y: endY }
            ];
        }
    }

    private drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, fromX: number, fromY: number) {
        const angle = Math.atan2(y - fromY, x - fromX);
        const size = 6;
        const a1 = angle + Math.PI * 0.85;
        const a2 = angle - Math.PI * 0.85;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a1) * size, y + Math.sin(a1) * size);
        ctx.lineTo(x + Math.cos(a2) * size, y + Math.sin(a2) * size);
        ctx.closePath();
        ctx.fillStyle = '#9ca3af';
        ctx.fill();
    }
}
