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
import { processTasksForDisplay } from '../utils/taskProcessing';
import type { Task } from '../types';

export const GanttContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainPaneRef = useRef<HTMLDivElement>(null);

    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const taskCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const { viewport, tasks, setTasks, setRelations, updateViewport, zoomLevel } = useTaskStore();
    const { showProgressLine, sidebarWidth, setSidebarWidth, groupByProject } = useUIStore();

    // Local state to hold raw loaded tasks before processing
    const [rawTasks, setRawTasks] = React.useState<Task[]>([]);

    const isResizing = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.max(200, Math.min(800, e.clientX));
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
    }, []);

    const startResize = () => {
        isResizing.current = true;
        document.body.style.cursor = 'grabbing';
    };

    const engines = useRef<{
        interaction?: InteractionEngine;
        bg?: BackgroundRenderer;
        task?: TaskRenderer;
        overlay?: OverlayRenderer;
    }>({});

    // Effect to re-process tasks when grouping changes or raw tasks change
    useEffect(() => {
        if (rawTasks.length > 0) {
            const processed = processTasksForDisplay(rawTasks, groupByProject);
            setTasks(processed);
        }
    }, [rawTasks, groupByProject]);

    useEffect(() => {
        import('../api/client').then(({ apiClient }) => {
            apiClient.fetchData().then(data => {
                setRawTasks(data.tasks); // Store raw
                setRelations(data.relations);

                const minStart = data.tasks.reduce<number | null>((acc, t) => {
                    const start = t.startDate;
                    return acc === null ? start : Math.min(acc, start);
                }, null);
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                oneYearAgo.setHours(0, 0, 0, 0);

                const startDate = Math.min(minStart ?? oneYearAgo.getTime(), oneYearAgo.getTime());

                // Calculate scroll position to center "today"
                // We use the viewport from store which might have been restored from localstorage
                // If it was restored (scale/viewMode), we respect it.
                // But start date needs to be set to project start if not set?
                // Actually, restoring viewport might overwrite this.
                // Let's rely on stored scrollX if valid, else calculate center.
                // But startDate changes based on data.

                const currentViewport = useTaskStore.getState().viewport;
                const now = new Date().setHours(0, 0, 0, 0);

                // If we have saved scrollX, we should probably try to respect the *date* it was pointing to?
                // Too complex for now. Let's just default center Today.
                const scrollX = Math.max(0, (now - startDate) * currentViewport.scale - 100);

                updateViewport({ startDate, scrollX });
            }).catch(err => console.error("Failed to load Gantt data", err));
        });
    }, []);

    useEffect(() => {
        if (!mainPaneRef.current || !bgCanvasRef.current || !taskCanvasRef.current || !overlayCanvasRef.current) return;

        engines.current.interaction = new InteractionEngine(mainPaneRef.current);
        engines.current.bg = new BackgroundRenderer(bgCanvasRef.current);
        engines.current.task = new TaskRenderer(taskCanvasRef.current);
        engines.current.overlay = new OverlayRenderer(overlayCanvasRef.current);

        return () => {
            engines.current.interaction?.detach();
        };
    }, []);

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

    useEffect(() => {
        if (engines.current.bg) engines.current.bg.render(viewport, zoomLevel);
        if (engines.current.task) engines.current.task.render(viewport, tasks);
        if (engines.current.overlay) engines.current.overlay.render(viewport);
    }, [viewport, tasks, zoomLevel, showProgressLine]);

    return (
        <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
                <UiSidebar />
            </div>

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
