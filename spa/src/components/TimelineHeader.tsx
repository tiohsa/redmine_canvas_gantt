import React, { useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { resizeCanvasForDpr } from '../utils/canvasDpr';
import { designTokens } from '../styles/designTokens';
import { GANTT_HEADER_HEIGHT } from '../constants';
import { renderTimelineHeader } from '../renderers/TimelineHeaderRenderer';

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
        renderTimelineHeader(ctx, viewport, zoomLevel, viewport.width);
    }, [viewport, zoomLevel]);

    useLayoutEffect(() => {
        if (!canvasRef.current) return;
        const width = Math.max(0, Math.floor(viewport.width));
        const ctx = canvasRef.current.getContext('2d');
        resizeCanvasForDpr(canvasRef.current, ctx, width, GANTT_HEADER_HEIGHT);
        renderHeader();
    }, [renderHeader, viewport.width]);

    useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current
    }), []);

    return (
        <div style={{ height: GANTT_HEADER_HEIGHT, boxSizing: 'border-box', flexShrink: 0, backgroundColor: designTokens.surfaceSubtle, borderBottom: `1px solid ${designTokens.borderSubtle}`, overflow: 'hidden' }}>
            <canvas ref={canvasRef} height={GANTT_HEADER_HEIGHT} style={{ display: 'block' }} />
        </div>
    );
});

TimelineHeader.displayName = 'TimelineHeader';
