import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { getGridScales } from '../utils/grid';

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
            // Draw Dates
            const scales = getGridScales(viewport, viewMode);
            const headerHeight = canvas.height;
            const rowHeight = headerHeight / 3;

            // Draw Top Scale (Year-Month)
            ctx.fillStyle = '#f1f3f5';
            ctx.fillRect(0, 0, canvas.width, rowHeight);

            ctx.strokeStyle = '#dee2e6';
            ctx.beginPath();
            ctx.moveTo(0, rowHeight);
            ctx.lineTo(canvas.width, rowHeight);
            ctx.stroke();

            ctx.fillStyle = '#495057';
            ctx.font = '500 12px sans-serif';
            ctx.textAlign = 'left';

            scales.top.forEach((tick, i) => {
                ctx.beginPath();
                ctx.moveTo(Math.floor(tick.x) + 0.5, 0);
                ctx.lineTo(Math.floor(tick.x) + 0.5, rowHeight);
                ctx.stroke();

                // Sticky Label Logic
                // Find visible range for this tick
                let nextX = canvas.width;
                if (i < scales.top.length - 1) {
                    nextX = scales.top[i + 1].x;
                }

                // Draw text at max(tick.x, 0) + padding
                const textX = Math.max(tick.x, 0) + 8;

                // Only draw if it fits within the interval (before nextX)
                // Use approximate text width check if needed, or just boundary
                if (textX < nextX - 20) {
                    ctx.fillStyle = '#0066cc';
                    ctx.fillText(tick.label, textX, rowHeight - 7);
                }
            });

            // Draw Middle Scale (Week number)
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, rowHeight, canvas.width, rowHeight);

            ctx.textAlign = 'center';
            ctx.font = '500 12px sans-serif';

            scales.middle.forEach((tick, i) => {
                const x = tick.x;

                ctx.beginPath();
                ctx.moveTo(Math.floor(x) + 0.5, rowHeight);
                ctx.lineTo(Math.floor(x) + 0.5, rowHeight * 2);
                ctx.strokeStyle = '#e0e0e0';
                ctx.stroke();

                let width = 50;
                if (i < scales.middle.length - 1) {
                    width = scales.middle[i + 1].x - x;
                } else {
                    width = (1000 * 60 * 60 * 24 * viewport.scale);
                }

                const textX = x + width / 2;
                ctx.fillStyle = '#333';
                ctx.fillText(tick.label, textX, rowHeight * 2 - 7);
            });

            // Draw Bottom Scale (Day + weekday) with weekend background
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, rowHeight * 2, canvas.width, rowHeight);

            scales.bottom.forEach((tick, i) => {
                const x = tick.x;
                let width = 50;
                if (i < scales.bottom.length - 1) {
                    width = scales.bottom[i + 1].x - x;
                } else {
                    width = (1000 * 60 * 60 * 24 * viewport.scale);
                }

                // Weekend background
                const d = new Date(tick.time);
                const dow = d.getDay();
                if (dow === 0 || dow === 6) {
                    ctx.fillStyle = '#eeeeee';
                    ctx.fillRect(Math.floor(x), rowHeight * 2, Math.ceil(width), rowHeight);
                }

                ctx.beginPath();
                ctx.moveTo(Math.floor(x) + 0.5, rowHeight * 2);
                ctx.lineTo(Math.floor(x) + 0.5, headerHeight);
                ctx.strokeStyle = '#e0e0e0';
                ctx.stroke();

                const textX = x + width / 2;
                ctx.fillStyle = '#333';
                ctx.fillText(tick.label, textX, headerHeight - 7);
            });



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

