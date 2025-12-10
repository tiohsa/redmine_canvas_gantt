import type { Viewport } from '../types';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;
    private HEADER_HEIGHT = 50;

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

        const ONE_DAY = 24 * 60 * 60 * 1000;
        // Calculate visible time range
        const startOffsetTime = viewport.scrollX / viewport.scale;
        const visibleStartTime = viewport.startDate + startOffsetTime;
        const visibleEndTime = visibleStartTime + (this.canvas.width / viewport.scale);

        // Align to start of day
        let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

        // Draw Grid & Weekends
        ctx.save();
        while (currentTime <= visibleEndTime) {
            const x = (currentTime - viewport.startDate) * viewport.scale - viewport.scrollX;
            const nextX = (currentTime + ONE_DAY - viewport.startDate) * viewport.scale - viewport.scrollX;

            if (x + (nextX - x) >= 0 && x <= this.canvas.width) {
                const date = new Date(currentTime);
                const dayOfWeek = date.getDay();

                // Draw Weekend Background
                if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
                    ctx.fillStyle = '#f4f5f7'; // Jira-like grey
                    ctx.fillRect(Math.floor(x), this.HEADER_HEIGHT, Math.ceil(nextX - x), this.canvas.height - this.HEADER_HEIGHT);
                }

                // Draw Grid Line
                ctx.strokeStyle = '#dfe1e6'; // Lighter grid
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(Math.floor(x) + 0.5, this.HEADER_HEIGHT);
                ctx.lineTo(Math.floor(x) + 0.5, this.canvas.height);
                ctx.stroke();
            }
            currentTime += ONE_DAY;
        }
        ctx.restore();

        // Draw Header
        this.drawHeader(ctx, viewport, visibleStartTime, visibleEndTime);
    }

    private drawHeader(ctx: CanvasRenderingContext2D, viewport: Viewport, visibleStartTime: number, visibleEndTime: number) {
        const ONE_DAY = 24 * 60 * 60 * 1000;
        let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

        // Header Background
        ctx.fillStyle = '#f4f5f7';
        ctx.fillRect(0, 0, this.canvas.width, this.HEADER_HEIGHT);
        ctx.strokeStyle = '#dfe1e6';
        ctx.beginPath();
        ctx.moveTo(0, this.HEADER_HEIGHT);
        ctx.lineTo(this.canvas.width, this.HEADER_HEIGHT);
        ctx.stroke();

        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        while (currentTime <= visibleEndTime) {
            const x = (currentTime - viewport.startDate) * viewport.scale - viewport.scrollX;
            const nextX = (currentTime + ONE_DAY - viewport.startDate) * viewport.scale - viewport.scrollX;

            if (x + (nextX - x) >= 0 && x <= this.canvas.width) {
                const date = new Date(currentTime);

                // Draw Day Number
                ctx.fillStyle = '#172b4d';
                ctx.fillText(String(date.getDate()).padStart(2, '0'), x + (nextX - x) / 2, this.HEADER_HEIGHT * 0.75);

                // Draw Day Name
                ctx.fillStyle = '#6b778c';
                ctx.font = '10px sans-serif';
                ctx.fillText(dayNames[date.getDay()], x + (nextX - x) / 2, this.HEADER_HEIGHT * 0.35);

                // Restore font
                ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

                // Draw vertical separator in header
                ctx.strokeStyle = '#ebecf0';
                ctx.beginPath();
                ctx.moveTo(Math.floor(x) + 0.5, 0);
                ctx.lineTo(Math.floor(x) + 0.5, this.HEADER_HEIGHT);
                ctx.stroke();

                // Draw Month label if it's the 1st of the month or widely spaced
                // For simplicity, just drawing it if it's the 1st, or maybe we want a separate row?
                // Jira style often puts Month in a row above, but that takes more space.
                // Let's stick to compact: if date is 1, draw Month Name?
                // Current logic: just days. 

                // Improved Month Display: Draw Month sticky or per start of month?
                // Let's try drawing Month name if it's the 1st of month.
                if (date.getDate() === 1) {
                    ctx.save();
                    ctx.fillStyle = '#42526e';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'left';
                    // A bit hacky: draw it slightly to the right of the line
                    ctx.fillText(date.toLocaleString('default', { month: 'short' }), x + 5, 10);
                    ctx.restore();
                }
            }
            currentTime += ONE_DAY;
        }
    }
}
