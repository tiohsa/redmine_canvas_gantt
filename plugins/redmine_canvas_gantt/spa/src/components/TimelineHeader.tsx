import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { getGridScales } from '../utils/grid';

export const TimelineHeader: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { viewport, zoomLevel } = useTaskStore();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const render = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Header Background
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#e0e0e0';
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Calculate Scales
            const scales = getGridScales(viewport, zoomLevel);

            // Determine active rows
            const hasTop = scales.top.length > 0;
            const hasMiddle = scales.middle.length > 0;
            const hasBottom = scales.bottom.length > 0;

            const activeRows = [hasTop, hasMiddle, hasBottom].filter(Boolean).length;
            const rowHeight = activeRows > 0 ? canvas.height / activeRows : canvas.height;

            let currentY = 0;

            const drawRow = (ticks: typeof scales.top, bgColor: string, txtColor: string) => {
                if (ticks.length === 0) return;

                const y = currentY;
                const h = rowHeight;

                // Background
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, y, canvas.width, h);

                // Bottom border
                ctx.strokeStyle = '#dee2e6';
                ctx.beginPath();
                ctx.moveTo(0, y + h);
                ctx.lineTo(canvas.width, y + h);
                ctx.stroke();

                ctx.fillStyle = txtColor;
                ctx.font = '500 12px sans-serif';
                ctx.textAlign = 'left';

                ticks.forEach((tick, i) => {
                    // Vertical Separator
                    ctx.beginPath();
                    ctx.moveTo(Math.floor(tick.x) + 0.5, y);
                    ctx.lineTo(Math.floor(tick.x) + 0.5, y + h);
                    ctx.strokeStyle = '#dee2e6'; // Subtle separator
                    ctx.stroke();

                    // Text
                    // Determine meaningful width
                    let nextX = canvas.width;
                    if (i < ticks.length - 1) {
                        nextX = ticks[i + 1].x;
                    }



                    // Simple sticky-like label or centered?
                    // Spec seems to imply left-aligned ("Month label occupies interval", "Week W1")
                    // If dense (Day/Hour), maybe center?
                    // Let's stick to Left + Padding for Top/Middle usually, but Center for Day numbers?

                    const textX = Math.max(tick.x, 0) + 4;
                    const textY = y + h / 2 + 4; // Vertically center approx

                    if (tick.x < canvas.width && textX < nextX - 10) {
                        ctx.fillText(tick.label, textX, textY);
                    }
                });

                currentY += h;
            };

            // Customize colors per row "level" (Top/Middle/Bottom conceptually)
            // Note: If Bottom is empty, Middle becomes second row.

            if (hasTop) drawRow(scales.top, '#f1f3f5', '#495057');
            if (hasMiddle) drawRow(scales.middle, '#ffffff', '#333333');
            if (hasBottom) {
                // Special handling for Weekend BG if needed? 
                // Grid scalers don't carry weekend info easily unless I check 'tick.time'
                // Re-implement weekend BG for bottom row?

                const y = currentY;
                const h = rowHeight;

                // Background (base)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, y, canvas.width, h);

                // Weekends
                if (zoomLevel === 2) { // Day View mainly
                    scales.bottom.forEach((tick, i) => {
                        const d = new Date(tick.time);
                        if (d.getDay() === 0 || d.getDay() === 6) {
                            let w = 50; // default
                            if (i < scales.bottom.length - 1) w = scales.bottom[i + 1].x - tick.x;
                            else w = (24 * 3600 * 1000 * viewport.scale);

                            ctx.fillStyle = '#eeeeee';
                            ctx.fillRect(tick.x, y, w, h);
                        }
                    });
                }

                // Draw Ticks/Text
                ctx.fillStyle = '#333';
                ctx.font = '500 12px sans-serif';
                ctx.textAlign = 'left';

                scales.bottom.forEach(tick => {
                    ctx.beginPath();
                    ctx.moveTo(Math.floor(tick.x) + 0.5, y);
                    ctx.lineTo(Math.floor(tick.x) + 0.5, y + h);
                    ctx.strokeStyle = '#e0e0e0';
                    ctx.stroke();

                    const textX = tick.x + 4;
                    const textY = y + h / 2 + 4;

                    // For days, maybe center?
                    // "1 2 3"
                    // If zoom level 2 (Day), width is ~40px. Center implies textX + width/2.
                    // But left + 4 works cleanly too.

                    ctx.fillText(tick.label, textX, textY);
                });

                currentY += h;
            }

        };

        render();
    }, [viewport, zoomLevel]);

    // Resize Observer
    useEffect(() => {
        const parent = canvasRef.current?.parentElement;
        if (!parent) return;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (canvasRef.current) {
                canvasRef.current.width = entry.contentRect.width;
                canvasRef.current.height = 48; // Keep fixed height container
                // Trigger re-render... handled by deps
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

