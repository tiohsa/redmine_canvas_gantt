import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { InteractionEngine } from '../engines/InteractionEngine';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { BaselineRenderer } from '../renderers/BaselineRenderer';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { OverlayRenderer, type OverlayRenderState } from '../renderers/OverlayRenderer';
import { A11yLayer } from './A11yLayer';
import { HtmlOverlay } from './HtmlOverlay';
import { UiSidebar } from './UiSidebar';
import { TimelineHeader } from './TimelineHeader';
import { IssueIframeDialog } from './IssueIframeDialog';
import { HelpDialog } from './HelpDialog';
import { WorkloadSidebar } from './workload/WorkloadSidebar';
import { WorkloadCanvasPanel } from './workload/WorkloadCanvasPanel';
import { useWorkloadStore } from '../stores/WorkloadStore';
import { getMaxFiniteDueDate } from '../utils/taskRange';
import { GlobalTooltip } from './GlobalTooltip';
import { computeContentSizes } from './gantt/contentSize';
import { useSidebarResize } from './gantt/useSidebarResize';
import { useInitialGanttData } from './gantt/useInitialGanttData';
import { useScrollSync } from './gantt/useScrollSync';
import { exportTasksAsCsv } from '../export/csv';
import { exportSnapshotAsPng } from '../export/png';
import type { GanttExportHandle, GanttExportSnapshot } from '../export/types';
import type { TimelineHeaderHandle } from './TimelineHeader';
import { i18n } from '../utils/i18n';
import { useBaselineStore } from '../stores/BaselineStore';
import { designTokens } from '../styles/designTokens';
import { resizeCanvasForDpr } from '../utils/canvasDpr';

import { ONE_DAY_MS, MAX_SCROLL_AREA_PX, BOTTOM_PADDING_PX, SIDEBAR_RESIZE_HANDLE_TOTAL_WIDTH, SIDEBAR_RESIZE_CURSOR } from '../constants';

export const GanttContainer = React.forwardRef<GanttExportHandle>((_, ref) => {
    const WORKLOAD_DEFAULT_RATIO = 0.4;
    const WORKLOAD_MIN_PANE_PX = 160;
    const WORKLOAD_SPLIT_HANDLE_HEIGHT = 8;
    const WORKLOAD_SPLIT_CURSOR = 's-resize';
    const WORKLOAD_RESIZE_OVERLAY_Z_INDEX = 1000;
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollPaneRef = useRef<HTMLDivElement>(null);
    const viewportWrapperRef = useRef<HTMLDivElement>(null);
    const mainPaneRef = useRef<HTMLDivElement>(null);
    const timelineHeaderRef = useRef<TimelineHeaderHandle>(null);

    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const baselineCanvasRef = useRef<HTMLCanvasElement>(null);
    const taskCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const isSyncingScroll = useRef(false);
    const workloadResizeStateRef = useRef<{
        paneRect: DOMRect;
        previousCursor: string;
        previousUserSelect: string;
    } | null>(null);

    const { viewport, tasks, relations, selectedTaskId, selectedRelationId, draftRelation, rowCount, zoomLevel, viewportFromStorage, layoutRows, showVersions, updateViewport, customFields } = useTaskStore();
    const {
        sidebarWidth,
        setSidebarWidth,
        leftPaneVisible,
        rightPaneVisible,
        showProgressLine,
        showTaskTitles,
        showPointsOrphans,
        isSidebarResizing,
        setSidebarResizing
    } = useUIStore();
    const { workloadPaneVisible } = useWorkloadStore();
    const baselineSnapshot = useBaselineStore(state => state.snapshot);
    const showBaseline = useUIStore(state => state.showBaseline);
    const isSplitView = leftPaneVisible && rightPaneVisible;
    const [workloadPaneRatio, setWorkloadPaneRatio] = useState(WORKLOAD_DEFAULT_RATIO);
    const [workloadScrollTop, setWorkloadScrollTop] = useState(0);
    const [isWorkloadResizing, setIsWorkloadResizing] = useState(false);

    const tasksMaxDue = useMemo(() => getMaxFiniteDueDate(tasks), [tasks]);
    const workloadTopWeight = Math.max(1, Math.round((1 - workloadPaneRatio) * 100));
    const workloadBottomWeight = Math.max(1, Math.round(workloadPaneRatio * 100));

    const { realContentSize, scrollContentSize } = useMemo(() => computeContentSizes({
        viewport,
        rowCount,
        tasksMaxDue,
        oneDayMs: ONE_DAY_MS,
        bottomPaddingPx: BOTTOM_PADDING_PX,
        maxScrollAreaPx: MAX_SCROLL_AREA_PX
    }), [rowCount, tasksMaxDue, viewport]);

    const { startResize } = useSidebarResize({
        containerRef,
        leftPaneVisible: isSplitView,
        sidebarWidth,
        setSidebarWidth,
        setSidebarResizing
    });

    useInitialGanttData({
        viewportFromStorage,
        updateViewport
    });

    useScrollSync({
        scrollPaneRef,
        isSyncingScrollRef: isSyncingScroll,
        isSidebarResizing,
        viewport,
        scrollContentSize,
        realContentSize,
        updateViewport
    });

    const updateWorkloadRatio = useCallback((clientY: number) => {
        const resizeState = workloadResizeStateRef.current;
        if (!resizeState) return;

        const paneHeight = resizeState.paneRect.height - WORKLOAD_SPLIT_HANDLE_HEIGHT;
        const maxTopHeight = paneHeight - WORKLOAD_MIN_PANE_PX;
        const topHeight = Math.min(
            Math.max(clientY - resizeState.paneRect.top, WORKLOAD_MIN_PANE_PX),
            maxTopHeight
        );
        const bottomHeight = paneHeight - topHeight;
        setWorkloadPaneRatio(bottomHeight / paneHeight);
    }, []);

    const startWorkloadResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const paneElement = event.currentTarget.parentElement;
        if (!paneElement) return;

        workloadResizeStateRef.current = {
            paneRect: paneElement.getBoundingClientRect(),
            previousCursor: document.body.style.cursor,
            previousUserSelect: document.body.style.userSelect
        };

        setIsWorkloadResizing(true);
        document.body.style.cursor = WORKLOAD_SPLIT_CURSOR;
        document.body.style.userSelect = 'none';
        updateWorkloadRatio(event.clientY);
        event.preventDefault();
    }, [updateWorkloadRatio]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (!workloadResizeStateRef.current) return;
            updateWorkloadRatio(event.clientY);
        };

        const handleMouseUp = () => {
            const resizeState = workloadResizeStateRef.current;
            if (!resizeState) return;
            setIsWorkloadResizing(false);
            document.body.style.cursor = resizeState.previousCursor;
            document.body.style.userSelect = resizeState.previousUserSelect;
            workloadResizeStateRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            setIsWorkloadResizing(false);
            if (workloadResizeStateRef.current) {
                document.body.style.cursor = workloadResizeStateRef.current.previousCursor;
                document.body.style.userSelect = workloadResizeStateRef.current.previousUserSelect;
                workloadResizeStateRef.current = null;
            }
        };
    }, [updateWorkloadRatio]);

    const engines = useRef<{
        interaction?: InteractionEngine;
        bg?: BackgroundRenderer;
        baseline?: BaselineRenderer;
        task?: TaskRenderer;
        overlay?: OverlayRenderer;
    }>({});

    const overlayRenderState = useMemo<OverlayRenderState>(() => ({
        viewport,
        tasks,
        relations,
        rowCount,
        zoomLevel,
        selectedTaskId,
        selectedRelationId,
        draftRelation
    }), [
        draftRelation,
        relations,
        rowCount,
        selectedRelationId,
        selectedTaskId,
        tasks,
        viewport,
        zoomLevel
    ]);

    useEffect(() => {
        if (!mainPaneRef.current || !bgCanvasRef.current || !baselineCanvasRef.current || !taskCanvasRef.current || !overlayCanvasRef.current) return;

        const interaction = new InteractionEngine(mainPaneRef.current);
        engines.current.interaction = interaction;
        engines.current.bg = new BackgroundRenderer(bgCanvasRef.current);
        engines.current.baseline = new BaselineRenderer(baselineCanvasRef.current);
        engines.current.task = new TaskRenderer(taskCanvasRef.current);
        engines.current.overlay = new OverlayRenderer(overlayCanvasRef.current);

        return () => {
            interaction.detach();
        };
    }, []);

    useEffect(() => {
        if (!viewportWrapperRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const fallbackWidth = entry.contentRect.width;
                const fallbackHeight = entry.contentRect.height;
                const scrollPane = scrollPaneRef.current;
                const width = scrollPane?.clientWidth ?? fallbackWidth;
                const height = scrollPane?.clientHeight ?? fallbackHeight;
                if (width <= 0 || height <= 0) {
                    continue;
                }

                [bgCanvasRef.current, baselineCanvasRef.current, taskCanvasRef.current, overlayCanvasRef.current].forEach(canvas => {
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        resizeCanvasForDpr(canvas, ctx, width, height);
                    }
                });
                updateViewport({ width, height });
            }
        });
        resizeObserver.observe(viewportWrapperRef.current);
        return () => resizeObserver.disconnect();
    }, [updateViewport]);

    const drawCanvases = useCallback(() => {
        if (engines.current.bg) {
            engines.current.bg.render(viewport, zoomLevel, selectedTaskId, tasks);
        }
        if (engines.current.baseline) {
            engines.current.baseline.render({
                viewport,
                tasks,
                rowCount,
                zoomLevel,
                showBaseline,
                snapshot: baselineSnapshot
            });
        }
        if (engines.current.task) {
            engines.current.task.render(viewport, tasks, rowCount, zoomLevel, relations, layoutRows, showTaskTitles, showPointsOrphans, baselineSnapshot, showBaseline);
        }
        if (engines.current.overlay) {
            engines.current.overlay.render(overlayRenderState);
        }
    }, [
        layoutRows,
        selectedTaskId,
        showTaskTitles,
        showPointsOrphans,
        tasks,
        viewport,
        zoomLevel,
        baselineSnapshot,
        showBaseline,
        overlayRenderState,
        relations,
        rowCount
    ]);

    useLayoutEffect(() => {
        drawCanvases();
    }, [drawCanvases, showProgressLine, showVersions]);

    const captureSnapshot = useCallback((): GanttExportSnapshot => {
        const headerCanvas = timelineHeaderRef.current?.getCanvas();
        if (!rightPaneVisible || !headerCanvas || !bgCanvasRef.current || !baselineCanvasRef.current || !taskCanvasRef.current || !overlayCanvasRef.current) {
            throw new Error(i18n.t('label_export_unavailable') || 'Export is unavailable in the current layout');
        }

        return {
            headerCanvas,
            backgroundCanvas: bgCanvasRef.current,
            baselineCanvas: baselineCanvasRef.current,
            taskCanvas: taskCanvasRef.current,
            overlayCanvas: overlayCanvasRef.current,
            viewport,
            zoomLevel,
            tasks,
            relations,
            rowCount,
            layoutRows,
            selectedTaskId,
            selectedRelationId,
            draftRelation,
            showTaskTitles,
            showPointsOrphans,
            showProgressLine,
            customFields
        };
    }, [customFields, draftRelation, layoutRows, relations, rightPaneVisible, rowCount, selectedRelationId, selectedTaskId, showTaskTitles, showPointsOrphans, showProgressLine, tasks, viewport, zoomLevel]);

    useImperativeHandle(ref, () => ({
        exportPng: async () => {
            await exportSnapshotAsPng(captureSnapshot());
        },
        exportCsv: async () => {
            exportTasksAsCsv(tasks, relations, customFields);
        }
    }), [captureSnapshot, customFields, relations, tasks]);

    const workloadSplitRows = `minmax(${WORKLOAD_MIN_PANE_PX}px, ${workloadTopWeight}fr) ${WORKLOAD_SPLIT_HANDLE_HEIGHT}px minmax(${WORKLOAD_MIN_PANE_PX}px, ${workloadBottomWeight}fr)`;
    const collapsedSplitRows = 'minmax(0, 1fr) 0px 0px';

    return (
        <>
            <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
                {leftPaneVisible && (
                    <>
                        <div
                            data-testid="left-pane"
                            style={isSplitView
                                ? { width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
                                : { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                        >
                            <div
                                data-testid="workload-split-layout-left"
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    display: 'grid',
                                    gridTemplateRows: workloadPaneVisible ? workloadSplitRows : collapsedSplitRows
                                }}
                            >
                                <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex' }}>
                                    <UiSidebar />
                                </div>
                                <div
                                    data-testid="workload-split-handle-left"
                                    onMouseDown={workloadPaneVisible ? startWorkloadResize : undefined}
                                    style={{
                                        cursor: workloadPaneVisible ? WORKLOAD_SPLIT_CURSOR : 'default',
                                        backgroundColor: designTokens.surfaceMuted,
                                        borderTop: workloadPaneVisible ? `1px solid ${designTokens.controlBorder}` : 'none',
                                        borderBottom: workloadPaneVisible ? `1px solid ${designTokens.controlBorder}` : 'none',
                                        pointerEvents: workloadPaneVisible ? 'auto' : 'none'
                                    }}
                                />
                                <div
                                    style={{
                                        minHeight: 0,
                                        display: 'flex',
                                        width: '100%',
                                        overflow: 'hidden',
                                        visibility: workloadPaneVisible ? 'visible' : 'hidden',
                                        pointerEvents: workloadPaneVisible ? 'auto' : 'none'
                                    }}
                                >
                                    <WorkloadSidebar scrollTop={workloadScrollTop} onScroll={setWorkloadScrollTop} />
                                </div>
                            </div>
                        </div>

                        {isSplitView && (
                            <div
                                data-testid="sidebar-resize-handle"
                                onMouseDown={startResize}
                                style={{
                                    width: SIDEBAR_RESIZE_HANDLE_TOTAL_WIDTH,
                                    boxSizing: 'border-box',
                                    cursor: SIDEBAR_RESIZE_CURSOR,
                                    backgroundColor: designTokens.surfaceMuted,
                                    borderRight: `1px solid ${designTokens.controlBorder}`,
                                    borderLeft: `1px solid ${designTokens.controlBorder}`,
                                    zIndex: 10
                                }}
                            />
                        )}
                    </>
                )}

                <div
                    data-testid="right-pane"
                    style={{
                        flex: 1,
                        display: rightPaneVisible ? 'flex' : 'none',
                        flexDirection: 'column',
                        minWidth: 0
                    }}
                >
                    <div
                        data-testid="workload-split-layout-right"
                        style={{
                            flex: 1,
                            minHeight: 0,
                            display: 'grid',
                            gridTemplateRows: workloadPaneVisible ? workloadSplitRows : collapsedSplitRows
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <TimelineHeader ref={timelineHeaderRef} />
                            <div ref={viewportWrapperRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <div
                                    ref={scrollPaneRef}
                                    className="rcg-scroll rcg-gantt-scroll-pane"
                                    style={{ position: 'absolute', inset: 0, overflow: 'auto', display: 'grid' }}
                                >
                                    <div style={{ gridArea: '1 / 1', width: scrollContentSize.width, height: scrollContentSize.height }} />
                                    <div
                                        ref={mainPaneRef}
                                        className="rcg-gantt-viewport"
                                        data-testid="gantt-viewport"
                                        style={{
                                            gridArea: '1 / 1',
                                            position: 'sticky',
                                            top: 0,
                                            left: 0,
                                            width: viewport.width,
                                            height: viewport.height,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <canvas ref={bgCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
                                        <canvas ref={baselineCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 2 }} />
                                        <canvas ref={taskCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }} />
                                        <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 4 }} />
                                        <HtmlOverlay />
                                        <A11yLayer />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div
                            data-testid="workload-split-handle-right"
                            onMouseDown={workloadPaneVisible ? startWorkloadResize : undefined}
                            style={{
                                cursor: workloadPaneVisible ? WORKLOAD_SPLIT_CURSOR : 'default',
                                backgroundColor: designTokens.surfaceMuted,
                                borderTop: workloadPaneVisible ? `1px solid ${designTokens.controlBorder}` : 'none',
                                borderBottom: workloadPaneVisible ? `1px solid ${designTokens.controlBorder}` : 'none',
                                pointerEvents: workloadPaneVisible ? 'auto' : 'none'
                            }}
                        />
                        <div
                            style={{
                                minHeight: 0,
                                display: 'flex',
                                width: '100%',
                                overflow: 'hidden',
                                visibility: workloadPaneVisible ? 'visible' : 'hidden',
                                pointerEvents: workloadPaneVisible ? 'auto' : 'none'
                            }}
                        >
                            <WorkloadCanvasPanel scrollTop={workloadScrollTop} onScroll={setWorkloadScrollTop} />
                        </div>
                    </div>
                </div>
            </div>
            {isWorkloadResizing && (
                <div
                    data-testid="workload-resize-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        cursor: WORKLOAD_SPLIT_CURSOR,
                        background: 'transparent',
                        zIndex: WORKLOAD_RESIZE_OVERLAY_Z_INDEX
                    }}
                />
            )}
            <IssueIframeDialog />
            <GlobalTooltip />
            <HelpDialog />
        </>
    );
});

GanttContainer.displayName = 'GanttContainer';
