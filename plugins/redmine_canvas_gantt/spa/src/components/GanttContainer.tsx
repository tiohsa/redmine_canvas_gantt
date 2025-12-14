import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { InteractionEngine } from '../engines/InteractionEngine';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { A11yLayer } from './A11yLayer';
import { HtmlOverlay } from './HtmlOverlay';
import { UiSidebar } from './UiSidebar';
import { TimelineHeader } from './TimelineHeader';

export const GanttContainer: React.FC = () => {
    // containerRef is the root flex container
    const containerRef = useRef<HTMLDivElement>(null);
    // mainPaneRef is the right side (timeline) where canvases live
    const mainPaneRef = useRef<HTMLDivElement>(null);

    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const taskCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const { viewport, tasks, relations, setTasks, setRelations, updateViewport, zoomLevel, rowCount, viewportFromStorage } = useTaskStore();
    const { showProgressLine } = useUIStore();

    const [sidebarWidth, setSidebarWidth] = React.useState(400);
    const isResizing = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            // Constrain width
            const newWidth = Math.max(200, Math.min(800, e.clientX)); // Simple clientX mapping assuming sidebar starts at 0
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [viewportFromStorage]);

    const startResize = () => {
        isResizing.current = true;
        document.body.style.cursor = 'grabbing';
    };

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

                if (!viewportFromStorage) {
                    // Fit timeline start to the earliest available date so tasks are visible
                    const minStart = data.tasks.reduce<number | null>((acc, t) => {
                        const start = t.startDate;
                        return acc === null ? start : Math.min(acc, start);
                    }, null);
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    oneYearAgo.setHours(0, 0, 0, 0);

                    const startDate = Math.min(minStart ?? oneYearAgo.getTime(), oneYearAgo.getTime());

                    // Calculate scroll position to center "today" (or start at today with some padding)
                    const currentViewport = useTaskStore.getState().viewport;
                    const now = new Date().setHours(0, 0, 0, 0);
                    const scrollX = Math.max(0, (now - startDate) * currentViewport.scale - 100);

                    updateViewport({ startDate, scrollX });
                }
            }).catch(err => console.error("Failed to load Gantt data", err));
        });
    }, []);

    useEffect(() => {
        // We attach interaction engine to the MAIN PANE (timeline), not the whole container
        // because dragging/panning is relative to timeline coordinates.
        if (!mainPaneRef.current || !bgCanvasRef.current || !taskCanvasRef.current || !overlayCanvasRef.current) return;

        // Initialize Engines
        engines.current.interaction = new InteractionEngine(mainPaneRef.current);
        engines.current.bg = new BackgroundRenderer(bgCanvasRef.current);
        engines.current.task = new TaskRenderer(taskCanvasRef.current);
        engines.current.overlay = new OverlayRenderer(overlayCanvasRef.current);

        return () => {
            engines.current.interaction?.detach();
        };
    }, []);

    // Responsive Canvas Size - Observe the mainPaneRef
    useEffect(() => {
        if (!mainPaneRef.current) return;
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
        resizeObserver.observe(mainPaneRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Render Loop
    useEffect(() => {
        if (engines.current.bg) engines.current.bg.render(viewport, zoomLevel);
        if (engines.current.task) engines.current.task.render(viewport, tasks, rowCount);
        if (engines.current.overlay) engines.current.overlay.render(viewport);
    }, [viewport, tasks, zoomLevel, showProgressLine, rowCount, relations]);

    return (
        <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* Resizable Sidebar Wrapper */}
            <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
                <UiSidebar />
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={startResize}
                style={{
                    width: 4,
                    cursor: 'grab',
                    backgroundColor: '#f0f0f0',
                    borderRight: '1px solid #e0e0e0',
                    borderLeft: '1px solid #e0e0e0',
                    zIndex: 10
                }}
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <TimelineHeader />
                {/* Timeline Pane */}
                <div ref={mainPaneRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <canvas ref={bgCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
                    <canvas ref={taskCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }} />
                    <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }} />
                    <HtmlOverlay />
                    <A11yLayer />
                </div>
            </div>
        </div>
    );
};
