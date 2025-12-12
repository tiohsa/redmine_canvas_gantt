import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { getGridTicks } from '../utils/grid';

export const TimelineHeader: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { viewport, viewMode } = useTaskStore();

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
            const ticks = getGridTicks(viewport, viewMode);

            ctx.fillStyle = '#666';
            ctx.font = '500 12px sans-serif';
            ctx.textAlign = 'left';

            ticks.forEach(tick => {
                // Draw Tick
                ctx.beginPath();
                ctx.moveTo(Math.floor(tick.x) + 0.5, canvas.height - 10);
                ctx.lineTo(Math.floor(tick.x) + 0.5, canvas.height);
                ctx.strokeStyle = '#ccc';
                ctx.stroke();

                // Draw Text
                // Check local collision or just draw?
                // For simplicity, drawn shifted to right slightly
                const textX = tick.x + 5;
                ctx.fillText(tick.label, textX, canvas.height - 14);
            });

            // Draw "Today" Marker
            const now = Date.now();
            const todayX = (now - viewport.startDate) * viewport.scale - viewport.scrollX;

            if (todayX >= 0 && todayX <= canvas.width) {
                // Tag style
                ctx.fillStyle = '#ff5252';
                const tagWidth = 50;
                const tagHeight = 20;
                const tagX = todayX - tagWidth / 2;
                const tagY = 10;

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
    }, [viewport, viewMode]);

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


