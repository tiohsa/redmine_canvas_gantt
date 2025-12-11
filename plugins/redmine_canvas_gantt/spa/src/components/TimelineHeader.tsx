import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';

export const TimelineHeader: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewport = useTaskStore(state => state.viewport);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const render = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Header Background
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(0, canvas.height - 0.5);
            ctx.lineTo(canvas.width, canvas.height - 0.5);
            ctx.stroke();

            // Draw Dates
            // Logic similar to BackgroundRenderer but drawing texts
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const startOffsetTime = viewport.scrollX / viewport.scale;
            const visibleStartTime = viewport.startDate + startOffsetTime;
            const visibleEndTime = visibleStartTime + (canvas.width / viewport.scale);

            let currentTime = Math.floor(visibleStartTime / ONE_DAY) * ONE_DAY;

            ctx.fillStyle = '#666';
            ctx.font = '500 12px sans-serif';
            ctx.textAlign = 'center';

            while (currentTime <= visibleEndTime) {
                const x = (currentTime - viewport.startDate) * viewport.scale - viewport.scrollX;

                // Center of the day cell
                // Assuming cell width is 1 day * scale? 
                // Actually LayoutEngine doesn't enforce cell width, but background draws lines at day boundaries.
                // So we label the day in the middle of the interval [x, x + dayWidth]?
                // Or typically Gantt charts label the start of the interval.

                // Let's verify scale. viewport.scale is px/ms.
                const dayWidth = ONE_DAY * viewport.scale;

                if (x + dayWidth >= 0 && x <= canvas.width) {
                    // Draw tick
                    ctx.beginPath();
                    ctx.moveTo(Math.floor(x) + 0.5, canvas.height - 10);
                    ctx.lineTo(Math.floor(x) + 0.5, canvas.height);
                    ctx.strokeStyle = '#ccc';
                    ctx.stroke();

                    // Draw Text (e.g., "12 Mon")
                    const date = new Date(currentTime);
                    const dayStr = date.getDate().toString();
                    // const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon"

                    // If zoomed out, maybe only show day number or less texts. 
                    // For now assume standard zoom.

                    if (dayWidth > 30) {
                        const centerX = x + dayWidth / 2;
                        ctx.fillText(dayStr, centerX, canvas.height - 14);
                    }
                }
                currentTime += ONE_DAY;
            }

            // Draw "Today" Marker
            const now = Date.now();
            const todayX = (now - viewport.startDate) * viewport.scale - viewport.scrollX;

            if (todayX >= 0 && todayX <= canvas.width) {
                // Tag style
                ctx.fillStyle = '#ff5252';
                const tagWidth = 50;
                const tagHeight = 20;
                const tagX = todayX - tagWidth / 2;
                const tagY = 10; // Vertically centered roughly

                ctx.beginPath();
                ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 4);
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Today', todayX, tagY + 14);
            }
        };

        render();
    }, [viewport]);

    // Resize Observer to match width
    useEffect(() => {
        const parent = canvasRef.current?.parentElement;
        if (!parent) return;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (canvasRef.current) {
                canvasRef.current.width = entry.contentRect.width;
                canvasRef.current.height = 48; // Fixed height
                // Trigger re-render by updating state? or just call helper?
                // The viewport dependency above will handle redraw if viewport update triggers it.
                // But changing width might not trigger viewport update immediately if not synced.
                // However, GanttContainer manages viewport width.
            }
        });
        observer.observe(parent);
        return () => observer.disconnect();
    }, []);

    return (
        <div style={{ height: 48, backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <canvas ref={canvasRef} height={48} style={{ display: 'block' }} />
        </div>
    );
};
