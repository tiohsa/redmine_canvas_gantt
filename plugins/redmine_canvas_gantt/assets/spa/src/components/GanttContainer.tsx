import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { InteractionEngine } from '../engines/InteractionEngine';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { A11yLayer } from './A11yLayer';
import { HtmlOverlay } from './HtmlOverlay';

export const GanttContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const taskCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const { viewport, tasks, setTasks, setRelations } = useTaskStore();

    // Refs for engines to persist across renders
    const engines = useRef<{
        interaction?: InteractionEngine;
        bg?: BackgroundRenderer;
        task?: TaskRenderer;
        overlay?: OverlayRenderer;
    }>({});

    useEffect(() => {
        // Initial fetch
        import('../api/client').then(({ apiClient }) => {
            apiClient.fetchData().then(data => {
                setTasks(data.tasks);
                setRelations(data.relations);
                // Maybe fit viewport to project duration
            }).catch(err => console.error("Failed to load Gantt data", err));
        });
    }, []);

    useEffect(() => {
        if (!containerRef.current || !bgCanvasRef.current || !taskCanvasRef.current || !overlayCanvasRef.current) return;

        // Initialize Engines
        engines.current.interaction = new InteractionEngine(overlayCanvasRef.current); // Interaction on top layer
        engines.current.bg = new BackgroundRenderer(bgCanvasRef.current);
        engines.current.task = new TaskRenderer(taskCanvasRef.current);
        engines.current.overlay = new OverlayRenderer(overlayCanvasRef.current);

        return () => {
            engines.current.interaction?.detach();
        };
    }, []);

    // Responsive Canvas Size
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                [bgCanvasRef.current, taskCanvasRef.current, overlayCanvasRef.current].forEach(canvas => {
                    if (canvas) {
                        canvas.width = width;
                        canvas.height = height;
                    }
                });
                useTaskStore.getState().updateViewport({ width, height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Render Loop (Reactively triggered by viewport/tasks change for now)
    // Optimization: In Transient Updates, we might subscribe manually or use requestAnimationFrame
    useEffect(() => {
        if (engines.current.bg) engines.current.bg.render(viewport);
        if (engines.current.task) engines.current.task.render(viewport, tasks);
        if (engines.current.overlay) engines.current.overlay.render(viewport);
    }, [viewport, tasks]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <canvas ref={bgCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
            <canvas ref={taskCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }} />
            <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }} />
            <HtmlOverlay />
            <A11yLayer />
        </div>
    );
};
