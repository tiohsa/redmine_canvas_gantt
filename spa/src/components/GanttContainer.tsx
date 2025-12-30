import React, { useEffect, useMemo, useRef } from 'react';
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
import { IssueIframeDialog } from './IssueIframeDialog';
import { getMaxFiniteDueDate, getMinFiniteStartDate } from '../utils/taskRange';

export const GanttContainer: React.FC = () => {
    // containerRef is the root flex container
    const containerRef = useRef<HTMLDivElement>(null);
    // scrollPaneRef provides the native scrollbar UI (we sync it with viewport.scrollX/Y)
    const scrollPaneRef = useRef<HTMLDivElement>(null);
    const viewportWrapperRef = useRef<HTMLDivElement>(null);
    // mainPaneRef is the right side (timeline) where canvases live
    const mainPaneRef = useRef<HTMLDivElement>(null);

    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const taskCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const { viewport, tasks, relations, versions, setTasks, setRelations, setVersions, setShowVersions, updateViewport, zoomLevel, rowCount, viewportFromStorage, selectedTaskId, layoutRows } = useTaskStore();
    const { showProgressLine, showVersions, sidebarWidth, setSidebarWidth, leftPaneVisible } = useUIStore();

    useEffect(() => {
        setShowVersions(showVersions);
    }, [showVersions, setShowVersions]);

    const isResizing = useRef(false);
    const isSyncingScroll = useRef(false);

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const MAX_SCROLL_AREA_PX = 10_000_000;
    const tasksMaxDue = useMemo(() => getMaxFiniteDueDate(tasks), [tasks]);
    const computeScrollContentSize = (): { width: number; height: number } => {
        const scale = viewport.scale || 0.00000001;

        const visibleMs = viewport.width / scale;
        const visibleEnd = viewport.startDate + visibleMs;

        const paddingMs = 60 * ONE_DAY_MS;
        const rangeEnd = Math.max(tasksMaxDue ?? visibleEnd, visibleEnd) + paddingMs;

        const realWidth = Math.max(viewport.width, Math.ceil((rangeEnd - viewport.startDate) * scale));
        const realHeight = Math.max(viewport.height, Math.ceil(rowCount * viewport.rowHeight));

        // Browsers have practical limits for scrollable dimensions; cap the DOM scroll area
        // and map it to the "virtual" viewport scroll offsets.
        const contentWidth = Math.max(viewport.width, Math.min(realWidth, MAX_SCROLL_AREA_PX));
        const contentHeight = Math.max(viewport.height, Math.min(realHeight, MAX_SCROLL_AREA_PX));

        return { width: contentWidth, height: contentHeight };
    };

    const scrollContentSize = computeScrollContentSize();
    const computeRealContentSize = (): { width: number; height: number } => {
        const scale = viewport.scale || 0.00000001;
        const visibleMs = viewport.width / scale;
        const visibleEnd = viewport.startDate + visibleMs;

        const paddingMs = 60 * ONE_DAY_MS;
        const rangeEnd = Math.max(tasksMaxDue ?? visibleEnd, visibleEnd) + paddingMs;

        const width = Math.max(viewport.width, Math.ceil((rangeEnd - viewport.startDate) * scale));
        const height = Math.max(viewport.height, Math.ceil(rowCount * viewport.rowHeight));
        return { width, height };
    };
    const realContentSize = computeRealContentSize();

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
        document.body.style.cursor = 'col-resize';
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
            const savedStatusIds = useTaskStore.getState().selectedStatusIds;
            apiClient.fetchData({ statusIds: savedStatusIds }).then(data => {
                setTasks(data.tasks);
                setRelations(data.relations);
                setVersions(data.versions);
                useTaskStore.getState().setTaskStatuses(data.statuses);

                if (!viewportFromStorage) {
                    // Fit timeline start to the earliest available date so tasks are visible
                    const minStart = getMinFiniteStartDate(data.tasks);
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

    // Responsive Canvas Size - Observe the viewportWrapperRef (the visible scrollport)
    useEffect(() => {
        if (!viewportWrapperRef.current) return;
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
        resizeObserver.observe(viewportWrapperRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Sync native scrollbar position -> viewport
    useEffect(() => {
        const el = scrollPaneRef.current;
        if (!el) return;

        const onScroll = () => {
            if (isSyncingScroll.current) return;

            const virtualAvailableX = Math.max(0, scrollContentSize.width - viewport.width);
            const virtualAvailableY = Math.max(0, scrollContentSize.height - viewport.height);
            const realAvailableX = Math.max(0, realContentSize.width - viewport.width);
            const realAvailableY = Math.max(0, realContentSize.height - viewport.height);

            const mappedX = virtualAvailableX === 0 || realAvailableX === 0
                ? 0
                : Math.round((el.scrollLeft / virtualAvailableX) * realAvailableX);
            const mappedY = virtualAvailableY === 0 || realAvailableY === 0
                ? 0
                : Math.round((el.scrollTop / virtualAvailableY) * realAvailableY);

            updateViewport({
                scrollX: Math.max(0, Math.min(realAvailableX, mappedX)),
                scrollY: Math.max(0, Math.min(realAvailableY, mappedY))
            });
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
        };
    }, [realContentSize.height, realContentSize.width, scrollContentSize.height, scrollContentSize.width, updateViewport, viewport.height, viewport.width]);

    // Sync viewport -> native scrollbar (wheel/drag/keys update viewport directly)
    useEffect(() => {
        const el = scrollPaneRef.current;
        if (!el) return;

        const virtualAvailableX = Math.max(0, scrollContentSize.width - viewport.width);
        const virtualAvailableY = Math.max(0, scrollContentSize.height - viewport.height);
        const realAvailableX = Math.max(0, realContentSize.width - viewport.width);
        const realAvailableY = Math.max(0, realContentSize.height - viewport.height);

        const mappedLeft = realAvailableX === 0 || virtualAvailableX === 0
            ? 0
            : Math.round((viewport.scrollX / realAvailableX) * virtualAvailableX);
        const mappedTop = realAvailableY === 0 || virtualAvailableY === 0
            ? 0
            : Math.round((viewport.scrollY / realAvailableY) * virtualAvailableY);

        isSyncingScroll.current = true;
        if (el.scrollLeft !== mappedLeft) el.scrollLeft = mappedLeft;
        if (el.scrollTop !== mappedTop) el.scrollTop = mappedTop;
        requestAnimationFrame(() => {
            isSyncingScroll.current = false;
        });
    }, [realContentSize.height, realContentSize.width, scrollContentSize.height, scrollContentSize.width, viewport.height, viewport.scrollX, viewport.scrollY, viewport.width]);

    useEffect(() => {
        // console.log('Render Loop:', { width: viewport.width, height: viewport.height, scrollX: viewport.scrollX, scrollY: viewport.scrollY, rowCount, tasks: tasks.length });
        if (engines.current.bg) engines.current.bg.render(viewport, zoomLevel, selectedTaskId, tasks);
        if (engines.current.task) engines.current.task.render(viewport, tasks, rowCount, zoomLevel, relations, layoutRows);
        if (engines.current.overlay) engines.current.overlay.render(viewport);
    }, [viewport, tasks, zoomLevel, showProgressLine, rowCount, relations, selectedTaskId, layoutRows, versions, showVersions]);

    return (
        <>
            <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
                {/* Resizable Sidebar Wrapper */}
                {leftPaneVisible && (
                    <>
                        <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
                            <UiSidebar />
                        </div>

                        {/* Resize Handle */}
                        <div
                            onMouseDown={startResize}
                            style={{
                                width: 4,
                                cursor: 'col-resize',
                                backgroundColor: '#f0f0f0',
                                borderRight: '1px solid #e0e0e0',
                                borderLeft: '1px solid #e0e0e0',
                                zIndex: 10
                            }}
                        />
                    </>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <TimelineHeader />
                    {/* Timeline Pane */}
                    <div ref={viewportWrapperRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <div
                            ref={scrollPaneRef}
                            className="rcg-scroll rcg-gantt-scroll-pane"
                            style={{ position: 'absolute', inset: 0, overflow: 'auto', display: 'grid' }}
                        >
                            {/* Spacer that defines the scrollable range */}
                            <div style={{ gridArea: '1 / 1', width: scrollContentSize.width, height: scrollContentSize.height }} />
                            {/* Sticky viewport overlay (keeps canvases fixed while scrollbars move) */}
                            <div
                                ref={mainPaneRef}
                                className="rcg-gantt-viewport"
                                style={{
                                    gridArea: '1 / 1',
                                    position: 'sticky',
                                    top: 0,
                                    left: 0,
                                    width: viewport.width,   // Explicitly set size to match viewport
                                    height: viewport.height, // preventing it from stretching to content size
                                    overflow: 'hidden'
                                }}
                            >
                                <canvas ref={bgCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
                                <canvas ref={taskCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }} />
                                <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }} />
                                <HtmlOverlay />
                                <A11yLayer />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <IssueIframeDialog />
        </>
    );
};
