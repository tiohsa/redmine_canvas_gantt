import type { Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import { canvasFonts, designTokens } from '../styles/designTokens';
import { snapTextPosition, snapLinePosition } from '../utils/canvasDpr';
import { getDayInfo } from '../utils/businessCalendar';
import { GANTT_HEADER_HEIGHT } from '../constants';

/** Draws the timeline header in CSS-pixel coordinates. */
export const renderTimelineHeader = (
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    zoomLevel: ZoomLevel,
    width: number
) => {
    const cssWidth = Math.max(0, Math.floor(width));
    const cssHeight = GANTT_HEADER_HEIGHT;

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = designTokens.surfaceSubtle;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = designTokens.borderSubtle;
    ctx.strokeRect(0, 0, cssWidth, cssHeight);

    const scales = getGridScales(viewport, zoomLevel);
    const hasTop = scales.top.length > 0;
    const hasMiddle = scales.middle.length > 0;
    const hasBottom = scales.bottom.length > 0;
    const activeRows = [hasTop, hasMiddle, hasBottom].filter(Boolean).length;
    const rowHeight = activeRows > 0 ? cssHeight / activeRows : cssHeight;
    const dayHeaderExtraHeight = hasMiddle && hasBottom ? 2 : 0;
    let currentY = 0;

    const drawRow = (
        ticks: typeof scales.top,
        bgColor: string,
        txtColor: string,
        align: 'left' | 'center' = 'left',
        height = rowHeight
    ) => {
        if (ticks.length === 0) return;

        const y = currentY;
        const h = height;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, y, cssWidth, h);

        ctx.strokeStyle = designTokens.borderStrong;
        ctx.beginPath();
        ctx.moveTo(0, snapLinePosition(y + h));
        ctx.lineTo(cssWidth, snapLinePosition(y + h));
        ctx.stroke();

        ctx.fillStyle = txtColor;
        ctx.font = canvasFonts.header;
        ctx.textAlign = align;

        ticks.forEach((tick, i) => {
            const snappedX = snapLinePosition(tick.x);
            ctx.beginPath();
            ctx.moveTo(snappedX, y);
            ctx.lineTo(snappedX, y + h);
            ctx.strokeStyle = designTokens.borderStrong;
            ctx.stroke();

            const nextX = i < ticks.length - 1 ? ticks[i + 1].x : cssWidth;
            const tickWidth = nextX - tick.x;
            const textY = y + h / 2 + 4;
            let textX = tick.x;
            if (align === 'center') {
                textX = tick.x + tickWidth / 2;
            } else {
                textX = Math.max(tick.x, 0) + 4;
            }

            if (tick.x < cssWidth && (align === 'center' ? tick.x + tickWidth > 0 : textX < nextX - 10)) {
                ctx.save();
                ctx.beginPath();
                const startX = Math.floor(tick.x);
                const endX = Math.floor(nextX);
                ctx.rect(startX, y, Math.max(0, endX - startX), h);
                ctx.clip();
                ctx.fillText(tick.label, snapTextPosition(textX), snapTextPosition(textY));
                ctx.restore();
            }
        });

        currentY += h;
    };

    if (hasTop) drawRow(scales.top, designTokens.surfaceMuted, designTokens.textSecondary);

    const middleBg = zoomLevel === 0 ? designTokens.surfaceMuted : designTokens.appBg;
    const middleTxt = zoomLevel === 0 ? designTokens.textSecondary : designTokens.textPrimary;
    if (hasMiddle) drawRow(scales.middle, middleBg, middleTxt, 'left', rowHeight - dayHeaderExtraHeight);

    if (hasBottom) {
        const y = currentY;
        const h = rowHeight + dayHeaderExtraHeight;
        ctx.fillStyle = designTokens.appBg;
        ctx.fillRect(0, y, cssWidth, h);

        if (zoomLevel === 2) {
            scales.bottom.forEach((tick, i) => {
                const dayInfo = getDayInfo(tick.time, window.RedmineCanvasGantt?.projectId);
                if (dayInfo.type === 'non_working') {
                    const width = i < scales.bottom.length - 1
                        ? scales.bottom[i + 1].x - tick.x
                        : (24 * 3600 * 1000 * viewport.scale);
                    ctx.fillStyle = designTokens.weekendBg;
                    ctx.fillRect(tick.x, y, width, h);
                }
            });
        }

        ctx.fillStyle = designTokens.textPrimary;
        ctx.textAlign = 'center';
        scales.bottom.forEach((tick, i) => {
            const snappedX = snapLinePosition(tick.x);
            ctx.beginPath();
            ctx.moveTo(snappedX, y);
            ctx.lineTo(snappedX, y + h);
            ctx.strokeStyle = designTokens.borderSubtle;
            ctx.stroke();

            const nextX = i < scales.bottom.length - 1 ? scales.bottom[i + 1].x : cssWidth;
            const textX = tick.x + (nextX - tick.x) / 2;
            const textY = tick.secondaryLabel ? y + 10 : y + h / 2 + 4;
            ctx.font = canvasFonts.header;
            ctx.fillText(tick.label, snapTextPosition(textX), snapTextPosition(textY));
            if (tick.secondaryLabel) {
                ctx.font = canvasFonts.header.replace('11px', '10px');
                ctx.fillStyle = designTokens.textSecondary;
                ctx.fillText(tick.secondaryLabel, snapTextPosition(textX), snapTextPosition(y + h - 3));
                ctx.fillStyle = designTokens.textPrimary;
            }
        });
    }
};
