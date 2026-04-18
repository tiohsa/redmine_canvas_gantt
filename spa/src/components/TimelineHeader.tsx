import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { getGridScales } from '../utils/grid';
import { canvasFonts, designTokens } from '../styles/designTokens';

export interface TimelineHeaderHandle {
    getCanvas: () => HTMLCanvasElement | null;
}

export const TimelineHeader = React.forwardRef<TimelineHeaderHandle>((_, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { viewport, zoomLevel } = useTaskStore();

    const renderHeader = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Header Background
        ctx.fillStyle = designTokens.surfaceSubtle;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = designTokens.borderSubtle;
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

        const drawRow = (ticks: typeof scales.top, bgColor: string, txtColor: string, align: 'left' | 'center' = 'left') => {
            if (ticks.length === 0) return;

            const y = currentY;
            const h = rowHeight;

            // Background
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, y, canvas.width, h);

            // Bottom border
            ctx.strokeStyle = designTokens.borderStrong;
            ctx.beginPath();
            ctx.moveTo(0, y + h);
            ctx.lineTo(canvas.width, y + h);
            ctx.stroke();

            ctx.fillStyle = txtColor;
            ctx.font = canvasFonts.header;
            ctx.textAlign = align;

            ticks.forEach((tick, i) => {
                // Vertical Separator
                ctx.beginPath();
                ctx.moveTo(Math.floor(tick.x) + 0.5, y);
                ctx.lineTo(Math.floor(tick.x) + 0.5, y + h);
                ctx.strokeStyle = designTokens.borderStrong;
                ctx.stroke();

                // Text
                let nextX = canvas.width;
                if (i < ticks.length - 1) {
                    nextX = ticks[i + 1].x;
                }

                const width = nextX - tick.x;
                const textY = y + h / 2 + 4; // Vertically center approx

                let textX = tick.x;
                if (align === 'center') {
                    textX = tick.x + width / 2;
                    // For center, we assume width is controlled. 
                } else {
                    // Sticky-like or Left Padding
                    textX = Math.max(tick.x, 0) + 4;
                }

                if (tick.x < canvas.width && (align === 'center' ? tick.x + width > 0 : textX < nextX - 10)) {
                    ctx.save();
                    ctx.beginPath();
                    // Snap to pixels to avoid sub-pixel misalignment with separator lines
                    const startX = Math.floor(tick.x);
                    // Ensure we don't clip partially into the next cell's separator
                    const endX = Math.floor(nextX);
                    ctx.rect(startX, y, Math.max(0, endX - startX), h);
                    ctx.clip();
                    ctx.fillText(tick.label, textX, textY);
                    ctx.restore();
                }
            });

            currentY += h;
        };

        // Customize colors per row "level"

        if (hasTop) drawRow(scales.top, designTokens.surfaceMuted, designTokens.textSecondary);

        // Middle Row
        const middleAlign: 'left' | 'center' = 'left';
        const middleBg = zoomLevel === 0 ? designTokens.surfaceMuted : designTokens.appBg;
        const middleTxt = zoomLevel === 0 ? designTokens.textSecondary : designTokens.textPrimary;
        if (hasMiddle) drawRow(scales.middle, middleBg, middleTxt, middleAlign);

        if (hasBottom) {
            const y = currentY;
            const h = rowHeight;

            // Background (base)
            ctx.fillStyle = designTokens.appBg;
            ctx.fillRect(0, y, canvas.width, h);

            // Weekends
            if (zoomLevel === 2) { // Day View mainly
                scales.bottom.forEach((tick, i) => {
                    const d = new Date(tick.time);
                    if (d.getDay() === 0 || d.getDay() === 6) {
                        let w = 50; // default
                        if (i < scales.bottom.length - 1) w = scales.bottom[i + 1].x - tick.x;
                        else w = (24 * 3600 * 1000 * viewport.scale);

                        ctx.fillStyle = designTokens.weekendBg;
                        ctx.fillRect(tick.x, y, w, h);
                    }
                });
            }

            // Draw Ticks/Text
            ctx.fillStyle = designTokens.textPrimary;
            ctx.font = canvasFonts.header;
            ctx.textAlign = 'center'; // Always center bottom (Days)

            scales.bottom.forEach((tick, i) => {
                ctx.beginPath();
                ctx.moveTo(Math.floor(tick.x) + 0.5, y);
                ctx.lineTo(Math.floor(tick.x) + 0.5, y + h);
                ctx.strokeStyle = designTokens.borderSubtle;
                ctx.stroke();

                // Width for centering
                let nextX = canvas.width;
                if (i < scales.bottom.length - 1) nextX = scales.bottom[i + 1].x;
                const width = nextX - tick.x;

                const textX = tick.x + width / 2;
                const textY = y + h / 2 + 4;

                ctx.fillText(tick.label, textX, textY);
            });

            currentY += h;
        }
    }, [viewport, zoomLevel]);

    // Render when viewport or zoom changes
    useEffect(() => {
        renderHeader();
    }, [renderHeader]);

    // Keep header canvas width strictly aligned with the timeline viewport width.
    useEffect(() => {
        if (!canvasRef.current) return;
        const width = Math.max(0, Math.floor(viewport.width));
        if (canvasRef.current.width !== width) {
            canvasRef.current.width = width;
        }
        if (canvasRef.current.height !== 48) {
            canvasRef.current.height = 48;
        }
        renderHeader();
    }, [renderHeader, viewport.width]);

    useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current
    }), []);

    return (
        <div style={{ height: 48, backgroundColor: designTokens.surfaceSubtle, borderBottom: `1px solid ${designTokens.borderSubtle}`, overflow: 'hidden' }}>
            <canvas ref={canvasRef} height={48} style={{ display: 'block' }} />
        </div>
    );
});

TimelineHeader.displayName = 'TimelineHeader';
