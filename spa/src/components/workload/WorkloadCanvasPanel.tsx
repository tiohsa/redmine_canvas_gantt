import React, { useEffect, useRef, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { i18n } from '../../utils/i18n';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { WorkloadRenderer } from '../../renderers/WorkloadRenderer';
import { panViewportByPixels } from '../../engines/viewportPan';

interface WorkloadCanvasPanelProps {
    scrollTop?: number;
    onScroll?: (scrollTop: number) => void;
}

interface HistogramBarHit {
    assigneeId: number;
    dateStr: string;
}

interface DragState {
    active: boolean;
    dragging: boolean;
    startX: number;
    startY: number;
    requiresThreshold: boolean;
    pressedBarHit: HistogramBarHit | null;
}

interface HistogramScrollXOverride {
    key: string;
    scrollX: number;
}

export const WorkloadCanvasPanel: React.FC<WorkloadCanvasPanelProps> = ({
    scrollTop = 0,
    onScroll
}) => {
    const HEADER_HEIGHT = 40;
    const FOCUS_PADDING_X = 24;
    const SCROLL_SYNC_TOLERANCE_PX = 3;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const renderEngine = useRef<WorkloadRenderer | null>(null);
    const {
        workloadData,
        capacityThreshold,
        focusedHistogramBar,
        setFocusedHistogramBar,
        consumeFocusedHistogramBarVerticalScrollSuppression
    } = useWorkloadStore();
    const { viewport, zoomLevel } = useTaskStore();
    const isSidebarResizing = useUIStore((state) => state.isSidebarResizing);
    const dragStateRef = useRef<DragState>({
        active: false,
        dragging: false,
        startX: 0,
        startY: 0,
        requiresThreshold: false,
        pressedBarHit: null
    });
    const interactionStateRef = useRef({
        viewport,
        zoomLevel,
        workloadData,
        capacityThreshold,
        scrollTop
    });
    const histogramBarHoveredRef = useRef(false);
    const pointerSuppressedRef = useRef(false);
    const suppressFocusedBarScrollKeyRef = useRef<string | null>(null);
    const histogramScrollXOverrideRef = useRef<HistogramScrollXOverride | null>(null);
    const lastAutoRevealRef = useRef<{ key: string; scrollX: number } | null>(null);
    const [histogramScrollXOverride, setHistogramScrollXOverride] = useState<HistogramScrollXOverride | null>(null);
    const [isHistogramBarHovered, setIsHistogramBarHovered] = useState(false);
    const [isPointerSuppressed, setIsPointerSuppressed] = useState(false);
    const rowHeight = viewport.rowHeight * 2;
    const workloadAssigneeCount = workloadData?.assignees.size ?? 0;
    const hasAssignees = workloadAssigneeCount > 0;
    const contentHeight = hasAssignees ? workloadAssigneeCount * rowHeight : 0;
    const cursor = isHistogramBarHovered && !isPointerSuppressed && !isSidebarResizing ? 'pointer' : 'default';
    const focusedHistogramBarKey = focusedHistogramBar
        ? `${focusedHistogramBar.assigneeId}:${focusedHistogramBar.dateStr}`
        : null;
    const isHistogramScrollXOverrideActive = (
        histogramScrollXOverride !== null &&
        histogramScrollXOverride.key === focusedHistogramBarKey
    );
    const histogramViewport = useMemo(() => ({
        ...viewport,
        scrollX: isHistogramScrollXOverrideActive
            ? histogramScrollXOverride.scrollX
            : viewport.scrollX
    }), [histogramScrollXOverride, isHistogramScrollXOverrideActive, viewport]);
    const histogramViewportRef = useRef(histogramViewport);

    useEffect(() => {
        histogramViewportRef.current = histogramViewport;
        interactionStateRef.current = {
            viewport: histogramViewport,
            zoomLevel,
            workloadData,
            capacityThreshold,
            scrollTop
        };
    }, [capacityThreshold, histogramViewport, scrollTop, workloadData, zoomLevel]);

    useEffect(() => {
        histogramScrollXOverrideRef.current = histogramScrollXOverride;
    }, [histogramScrollXOverride]);

    useEffect(() => {
        if (!focusedHistogramBarKey) {
            suppressFocusedBarScrollKeyRef.current = null;
            lastAutoRevealRef.current = null;
        }
    }, [focusedHistogramBarKey]);

    const setHistogramBarHoveredState = useCallback((next: boolean) => {
        histogramBarHoveredRef.current = next;
        setIsHistogramBarHovered((prev) => (prev === next ? prev : next));
    }, []);

    const setPointerSuppressedState = useCallback((next: boolean) => {
        pointerSuppressedRef.current = next;
        setIsPointerSuppressed((prev) => (prev === next ? prev : next));
    }, []);

    const updateCanvasSize = useCallback(() => {
        if (!canvasRef.current) return;

        const viewportElement = viewportRef.current;
        const containerElement = containerRef.current;
        if (!viewportElement && !containerElement) return;

        const width = viewportElement?.clientWidth ?? containerElement?.clientWidth ?? 0;
        const height = viewportElement?.clientHeight ?? Math.max(0, (containerElement?.clientHeight ?? 0) - HEADER_HEIGHT);
        if (width > 0 && height > 0) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
        }
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;
        renderEngine.current = new WorkloadRenderer(canvasRef.current);
        
        const resizeObserver = new ResizeObserver(() => {
            updateCanvasSize();
            // Trigger render on resize
            if (renderEngine.current) {
               renderEngine.current.render({
                   viewport: histogramViewport,
                   zoomLevel,
                   workloadData,
                   capacityThreshold,
                   verticalScroll: scrollTop,
                   hoveredAssigneeId: null,
                   hoveredDateStr: null,
                   focusedAssigneeId: focusedHistogramBar?.assigneeId ?? null,
                   focusedDateStr: focusedHistogramBar?.dateStr ?? null,
                   getBarLabelInfo: useWorkloadStore.getState().getHistogramBarLabelInfo
                });
            }
        });
        
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        if (viewportRef.current) {
            resizeObserver.observe(viewportRef.current);
        }
        
        return () => resizeObserver.disconnect();
    }, [capacityThreshold, focusedHistogramBar, histogramViewport, scrollTop, updateCanvasSize, zoomLevel, workloadData]);

    useLayoutEffect(() => {
        updateCanvasSize();
    }, [updateCanvasSize]);

    useEffect(() => {
        if (renderEngine.current && canvasRef.current) {
            renderEngine.current.render({
                viewport: histogramViewport,
                zoomLevel,
                workloadData,
                capacityThreshold,
                verticalScroll: scrollTop,
                hoveredAssigneeId: null,
                hoveredDateStr: null,
                focusedAssigneeId: focusedHistogramBar?.assigneeId ?? null,
                focusedDateStr: focusedHistogramBar?.dateStr ?? null,
                getBarLabelInfo: useWorkloadStore.getState().getHistogramBarLabelInfo
            });
        }
    }, [capacityThreshold, focusedHistogramBar, histogramViewport, scrollTop, zoomLevel, workloadData]);

    useEffect(() => {
        if (!viewportRef.current) return;
        if (Math.abs(viewportRef.current.scrollTop - scrollTop) > 1) {
            viewportRef.current.scrollTop = scrollTop;
        }
    }, [scrollTop]);

    useEffect(() => {
        if (!focusedHistogramBar || !workloadData || !viewportRef.current) return;

        if (suppressFocusedBarScrollKeyRef.current === focusedHistogramBarKey) {
            return;
        }
        if (consumeFocusedHistogramBarVerticalScrollSuppression(focusedHistogramBar)) {
            return;
        }

        const assignees = Array.from(workloadData.assignees.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName));
        const assigneeIndex = assignees.findIndex((assignee) => assignee.assigneeId === focusedHistogramBar.assigneeId);
        if (assigneeIndex < 0) return;

        const daily = workloadData.assignees.get(focusedHistogramBar.assigneeId)?.dailyWorkloads.get(focusedHistogramBar.dateStr);
        if (!daily) return;

        const nextScrollTop = assigneeIndex * rowHeight;
        if (Math.abs(viewportRef.current.scrollTop - nextScrollTop) > 1) {
            viewportRef.current.scrollTop = nextScrollTop;
        }
    }, [consumeFocusedHistogramBarVerticalScrollSuppression, focusedHistogramBar, focusedHistogramBarKey, rowHeight, workloadData]);

    useEffect(() => {
        if (!focusedHistogramBar || !workloadData || !viewportRef.current) {
            lastAutoRevealRef.current = null;
            return;
        }
        const focusedBarKey = focusedHistogramBarKey;
        if (!focusedBarKey) {
            lastAutoRevealRef.current = null;
            return;
        }

        const daily = workloadData.assignees.get(focusedHistogramBar.assigneeId)?.dailyWorkloads.get(focusedHistogramBar.dateStr);
        if (!daily) {
            lastAutoRevealRef.current = null;
            return;
        }

        if (suppressFocusedBarScrollKeyRef.current === focusedBarKey) {
            lastAutoRevealRef.current = null;
            return;
        }

        const barStartX = (daily.timestamp - histogramViewport.startDate) * histogramViewport.scale;
        const barEndX = (daily.timestamp + 24 * 60 * 60 * 1000 - histogramViewport.startDate) * histogramViewport.scale;
        const viewportWidth = viewportRef.current.clientWidth;
        const visibleStartX = histogramViewport.scrollX;
        const visibleEndX = histogramViewport.scrollX + viewportWidth;
        let nextScrollX = histogramViewport.scrollX;

        if (barStartX < visibleStartX + FOCUS_PADDING_X) {
            nextScrollX = Math.max(0, barStartX - FOCUS_PADDING_X);
        } else if (barEndX > visibleEndX - FOCUS_PADDING_X) {
            nextScrollX = Math.max(0, barEndX - viewportWidth + FOCUS_PADDING_X);
        }

        const delta = Math.abs(nextScrollX - histogramViewport.scrollX);
        if (delta <= SCROLL_SYNC_TOLERANCE_PX) {
            lastAutoRevealRef.current = {
                key: focusedBarKey,
                scrollX: nextScrollX
            };
            return;
        }

        const lastAutoReveal = lastAutoRevealRef.current;
        if (
            lastAutoReveal &&
            lastAutoReveal.key === focusedBarKey &&
            Math.abs(lastAutoReveal.scrollX - nextScrollX) <= SCROLL_SYNC_TOLERANCE_PX &&
            Math.abs(histogramViewport.scrollX - lastAutoReveal.scrollX) <= SCROLL_SYNC_TOLERANCE_PX
        ) {
            return;
        }

        lastAutoRevealRef.current = {
            key: focusedBarKey,
            scrollX: nextScrollX
        };
        useTaskStore.getState().updateViewport({ scrollX: nextScrollX });
    }, [focusedHistogramBar, focusedHistogramBarKey, histogramViewport, workloadData]);

    useEffect(() => {
        if (focusedHistogramBarKey && suppressFocusedBarScrollKeyRef.current === focusedHistogramBarKey) {
            suppressFocusedBarScrollKeyRef.current = null;
        }
    }, [focusedHistogramBarKey]);

    const isScrollInteractionLocked = useCallback(() => useUIStore.getState().isSidebarResizing, []);

    const hitTestDailyBarAtClientPoint = useCallback((clientX: number, clientY: number): HistogramBarHit | null => {
        const viewportElement = viewportRef.current;
        const renderer = renderEngine.current;
        if (!viewportElement || !renderer) {
            return null;
        }

        const viewportRect = viewportElement.getBoundingClientRect();
        const interactionState = interactionStateRef.current;

        return renderer.hitTestDailyBar({
            pointerX: clientX - viewportRect.left,
            pointerY: clientY - viewportRect.top,
            viewport: interactionState.viewport,
            zoomLevel: interactionState.zoomLevel,
            workloadData: interactionState.workloadData,
            capacityThreshold: interactionState.capacityThreshold,
            verticalScroll: interactionState.scrollTop
        });
    }, []);

    const updateHoverState = useCallback((clientX: number, clientY: number) => {
        if (isScrollInteractionLocked() || dragStateRef.current.active) {
            if (histogramBarHoveredRef.current) {
                setHistogramBarHoveredState(false);
            }
            return;
        }

        const hit = hitTestDailyBarAtClientPoint(clientX, clientY);
        setHistogramBarHoveredState(Boolean(hit));
    }, [hitTestDailyBarAtClientPoint, isScrollInteractionLocked, setHistogramBarHoveredState]);

    const finishDrag = useCallback(() => {
        if (!dragStateRef.current.active) return;
        dragStateRef.current = {
            active: false,
            dragging: false,
            startX: 0,
            startY: 0,
            requiresThreshold: false,
            pressedBarHit: null
        };
        if (pointerSuppressedRef.current) {
            setPointerSuppressedState(false);
        }
    }, [setPointerSuppressedState]);

    useEffect(() => {
        if (isSidebarResizing && histogramBarHoveredRef.current) {
            const frameId = window.requestAnimationFrame(() => {
                setHistogramBarHoveredState(false);
            });
            return () => window.cancelAnimationFrame(frameId);
        }
    }, [isSidebarResizing, setHistogramBarHoveredState]);

    useEffect(() => {
        const viewportElement = viewportRef.current;
        if (!viewportElement) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0 || isScrollInteractionLocked()) return;

            const pressedBarHit = hitTestDailyBarAtClientPoint(event.clientX, event.clientY);
            dragStateRef.current = {
                active: true,
                dragging: false,
                startX: event.clientX,
                startY: event.clientY,
                requiresThreshold: Boolean(pressedBarHit),
                pressedBarHit
            };
            if (pressedBarHit) {
                setPointerSuppressedState(true);
            }
            event.preventDefault();
        };

        const handleViewportMouseMove = (event: MouseEvent) => {
            updateHoverState(event.clientX, event.clientY);
        };

        const handleViewportMouseLeave = () => {
            if (histogramBarHoveredRef.current) {
                setHistogramBarHoveredState(false);
            }
        };

        const handleMouseMove = (event: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState.active) return;

            if (isScrollInteractionLocked()) {
                if (histogramBarHoveredRef.current) {
                    setHistogramBarHoveredState(false);
                }
                finishDrag();
                return;
            }

            const deltaX = event.clientX - dragState.startX;
            if (deltaX === 0) {
                return;
            }

            if (histogramScrollXOverrideRef.current !== null) {
                setHistogramScrollXOverride(null);
            }
            panViewportByPixels(deltaX, 0);
            dragStateRef.current = {
                ...dragState,
                active: true,
                dragging: true,
                startX: event.clientX,
                startY: event.clientY
            };
            if (histogramBarHoveredRef.current) {
                setHistogramBarHoveredState(false);
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            const pointerState = dragStateRef.current;
            if (!pointerState.active) return;

            finishDrag();

            if (pointerState.dragging || isScrollInteractionLocked() || !pointerState.pressedBarHit) {
                updateHoverState(event.clientX, event.clientY);
                return;
            }

            const releasedHit = hitTestDailyBarAtClientPoint(event.clientX, event.clientY);
            if (!releasedHit ||
                releasedHit.assigneeId !== pointerState.pressedBarHit.assigneeId ||
                releasedHit.dateStr !== pointerState.pressedBarHit.dateStr) {
                updateHoverState(event.clientX, event.clientY);
                return;
            }

            const releasedHitKey = `${releasedHit.assigneeId}:${releasedHit.dateStr}`;
            setHistogramScrollXOverride({
                key: releasedHitKey,
                scrollX: histogramViewportRef.current.scrollX
            });
            suppressFocusedBarScrollKeyRef.current = releasedHitKey;
            setFocusedHistogramBar(releasedHit);

            const { taskId } = useWorkloadStore.getState().resolveNextHistogramTask(releasedHit.assigneeId, releasedHit.dateStr);
            if (!taskId) {
                updateHoverState(event.clientX, event.clientY);
                return;
            }

            const result = useTaskStore.getState().focusTask(taskId);
            if (result.status === 'filtered_out') {
                useUIStore.getState().addNotification(i18n.t('label_selected_task_is_hidden') || 'Selected task is hidden by the current filters.', 'warning');
            }

            updateHoverState(event.clientX, event.clientY);
        };

        viewportElement.addEventListener('mousedown', handleMouseDown);
        viewportElement.addEventListener('mousemove', handleViewportMouseMove);
        viewportElement.addEventListener('mouseleave', handleViewportMouseLeave);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            viewportElement.removeEventListener('mousedown', handleMouseDown);
            viewportElement.removeEventListener('mousemove', handleViewportMouseMove);
            viewportElement.removeEventListener('mouseleave', handleViewportMouseLeave);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            finishDrag();
        };
    }, [finishDrag, hitTestDailyBarAtClientPoint, isScrollInteractionLocked, setFocusedHistogramBar, setHistogramBarHoveredState, setPointerSuppressedState, updateHoverState]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderTop: '1px solid #e0e0e0', backgroundColor: '#ffffff' }}>
            <div style={{
                height: '40px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                fontWeight: 600,
                fontSize: '12px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                backgroundColor: '#fafafa'
            }}>
                <span>HISTOGRAM (DAILY WORKLOAD)</span>
            </div>
            <div
                ref={viewportRef}
                data-testid="workload-canvas-viewport"
                onScroll={(event) => onScroll?.(event.currentTarget.scrollTop)}
                style={{
                    position: 'absolute',
                    top: HEADER_HEIGHT,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflowX: 'hidden',
                    overflowY: hasAssignees ? 'auto' : 'hidden',
                    cursor
                }}
            >
                <div style={{ position: 'relative', minHeight: '100%', height: hasAssignees ? `${contentHeight}px` : '100%' }}>
                    <canvas ref={canvasRef} style={{ position: 'sticky', top: 0, display: 'block', cursor }} />
                </div>
                {!hasAssignees && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                        color: '#666',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        textAlign: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        cursor: 'default'
                    }}>
                        {i18n.t('label_no_workload_data_matches_filters') || 'No workload data matches the current filters.'}
                    </div>
                )}
            </div>
        </div>
    );
};
