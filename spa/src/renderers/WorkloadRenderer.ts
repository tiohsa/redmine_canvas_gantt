import type { Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import { canvasFonts, designTokens } from '../styles/designTokens';
import { getCanvasLogicalSize, snapTextPosition, snapLinePosition } from '../utils/canvasDpr';
import type { AssigneeWorkload, DailyWorkload, WorkloadData, WorkloadSeries } from '../services/WorkloadLogicService';
import { calendarWeekday } from '../utils/dateOnly';

export interface WorkloadRenderState {
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    workloadData: WorkloadData | null;
    capacityThreshold: number;
    verticalScroll: number;
    showActual?: boolean;
    hoveredAssigneeId: number | null;
    hoveredDateStr: string | null;
    focusedAssigneeId: number | null;
    focusedDateStr: string | null;
    focusedSeries?: WorkloadSeries;
    getBarLabelInfo?: (assigneeId: number, dateStr: string, series?: WorkloadSeries) => { current: number; total: number } | null;
}

export interface WorkloadHitTestState {
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    workloadData: WorkloadData | null;
    capacityThreshold: number;
    verticalScroll: number;
    showActual?: boolean;
    hoveredAssigneeId?: number | null;
    hoveredDateStr?: string | null;
    x?: number;
    y?: number;
    pointerX?: number;
    pointerY?: number;
}

export class WorkloadRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly WEEKEND_BG = designTokens.weekendBg;
    private static readonly BAR_COLOR_NORMAL = designTokens.brandPrimary;
    private static readonly BAR_COLOR_OVERLOAD = designTokens.taskDelayed;
    private static readonly MAX_EXPECTED_LOAD = 24; // For scaling the histogram
    private static readonly DAY_MS = 24 * 60 * 60 * 1000;
    private static readonly LABEL_MIN_BAR_WIDTH = 16;
    private static readonly LABEL_TOP_PADDING = 6;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    private static getSortedAssignees(workloadData: WorkloadData): AssigneeWorkload[] {
        return Array.from(workloadData.assignees.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName));
    }

    private static getDailyBarRect(params: {
        canvasWidth: number;
        capacityThreshold: number;
        viewport: Viewport;
        verticalScroll: number;
        assigneeIndex: number;
        assigneePeakLoad: number;
        daily: DailyWorkload;
        series: WorkloadSeries;
    }): { x: number; y: number; width: number; height: number } | null {
        const { canvasWidth, capacityThreshold, viewport, verticalScroll, assigneeIndex, assigneePeakLoad, daily, series } = params;
        const rowHeight = viewport.rowHeight * 2;
        const rowY = assigneeIndex * rowHeight - verticalScroll;

        const visibleStartMs = viewport.startDate + Math.max(0, viewport.scrollX) / viewport.scale;
        const visibleEndMs = visibleStartMs + canvasWidth / viewport.scale;
        if (daily.timestamp < visibleStartMs - WorkloadRenderer.DAY_MS || daily.timestamp > visibleEndMs + WorkloadRenderer.DAY_MS) {
            return null;
        }

        const maxGraphLoad = Math.max(
            capacityThreshold * 1.5,
            Math.ceil(assigneePeakLoad),
            WorkloadRenderer.MAX_EXPECTED_LOAD
        );
        const startX = (daily.timestamp - viewport.startDate) * viewport.scale - viewport.scrollX;
        const endX = (daily.timestamp + WorkloadRenderer.DAY_MS - viewport.startDate) * viewport.scale - viewport.scrollX;
        const dayWidth = endX - startX;
        const barWidth = Math.max(0.1, (dayWidth - Math.min(3, dayWidth * 0.15)) / 2);
        const load = series === 'planned' ? daily.plannedLoad : daily.actualHours;
        if (load <= 0) return null;
        const barX = startX + (series === 'actual' ? dayWidth / 2 : 0) + Math.min(1, dayWidth * 0.05);
        if (barX + barWidth <= 0 || barX >= canvasWidth) return null;

        const barHeight = (load / maxGraphLoad) * rowHeight * 0.9;
        const barY = rowY + rowHeight - barHeight;

        return {
            x: barX,
            y: Math.floor(barY),
            width: barWidth,
            height: Math.ceil(barHeight)
        };
    }

    public hitTestDailyBar(state: WorkloadHitTestState): { assigneeId: number; dateStr: string; series?: WorkloadSeries } | null {
        const { viewport, workloadData, capacityThreshold, verticalScroll } = state;
        const x = state.pointerX ?? state.x;
        const y = state.pointerY ?? state.y;
        if (!workloadData) return null;
        if (x === undefined || y === undefined) return null;

        const assignees = WorkloadRenderer.getSortedAssignees(workloadData);
        const rowHeight = viewport.rowHeight * 2;
        const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(this.canvas);

        for (const [assigneeIndex, assignee] of assignees.entries()) {
            const rowY = assigneeIndex * rowHeight - verticalScroll;
            if (rowY + rowHeight < 0 || rowY > canvasHeight) continue;

            for (const daily of assignee.dailyWorkloads.values()) {
              for (const series of ['planned', 'actual'] as const) {
                if (series === 'actual' && state.showActual === false) continue;
                const rect = WorkloadRenderer.getDailyBarRect({
                    canvasWidth,
                    capacityThreshold,
                    viewport,
                    verticalScroll,
                    assigneeIndex,
                    assigneePeakLoad: Math.max(assignee.plannedPeak, assignee.actualPeak),
                    daily,
                    series
                });
                if (!rect) continue;
                if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
                    return { assigneeId: assignee.assigneeId, dateStr: daily.dateStr, ...(series === 'actual' ? { series } : {}) };
                }
              }
            }
        }

        return null;
    }

    render(state: WorkloadRenderState) {
        const {
            viewport,
            zoomLevel,
            workloadData,
            capacityThreshold,
            verticalScroll,
            hoveredAssigneeId,
            focusedAssigneeId,
            focusedDateStr,
            getBarLabelInfo
        } = state;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        const { width: logicalWidth, height: logicalHeight } = getCanvasLogicalSize(this.canvas);

        // Clear
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        ctx.fillStyle = designTokens.appBg;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);

        const scales = getGridScales(viewport, zoomLevel);
        const rowHeight = viewport.rowHeight * 2; // Histogram rows are usually taller (e.g. 72px when row is 36px)

        // Draw weekend background
        if (zoomLevel === 2) {
            const ticks = scales.bottom;
            ticks.forEach((tick, i) => {
                const dow = calendarWeekday(tick.time);
                if (dow === 0 || dow === 6) {
                    const w = (i < ticks.length - 1)
                        ? ticks[i + 1].x - tick.x
                        : (24 * 60 * 60 * 1000) * viewport.scale;

                    if (tick.x + w > 0 && tick.x < logicalWidth) {
                        ctx.fillStyle = WorkloadRenderer.WEEKEND_BG;
                        ctx.fillRect(Math.floor(tick.x), 0, Math.ceil(w), logicalHeight);
                    }
                }
            });
        }

        // Draw grid lines
        ctx.strokeStyle = designTokens.borderSubtle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let ticks = scales.bottom;
        if (ticks.length === 0) ticks = scales.middle;
        if (ticks.length === 0) ticks = scales.top;

        ticks.forEach(tick => {
            const snappedX = snapLinePosition(tick.x);
            ctx.moveTo(snappedX, 0);
            ctx.lineTo(snappedX, logicalHeight);
        });

        // Workload rows are independent from the task list vertical scroll.
        let y = -(verticalScroll % rowHeight);
        while (y < logicalHeight) {
            const snappedY = snapLinePosition(y);
            ctx.moveTo(0, snappedY);
            ctx.lineTo(logicalWidth, snappedY);
            y += rowHeight;
        }
        ctx.stroke();

        if (!workloadData) return;

        // Get sorted assignees to match DOM sidebar
        const assignees = WorkloadRenderer.getSortedAssignees(workloadData);

        // Draw workload histograms
        assignees.forEach((assignee, index) => {
            const rowY = index * rowHeight - verticalScroll;
            
            // Skip rows outside viewport
            if (rowY + rowHeight < 0 || rowY > logicalHeight) return;

            // Highlight if hovered
            if (hoveredAssigneeId === assignee.assigneeId) {
                ctx.fillStyle = designTokens.rowHover;
                ctx.fillRect(0, rowY, logicalWidth, rowHeight);
            }

            // Draw Threshold line
            const maxGraphLoad = Math.max(capacityThreshold * 1.5, Math.ceil(Math.max(assignee.plannedPeak, assignee.actualPeak)), WorkloadRenderer.MAX_EXPECTED_LOAD);
            const thresholdY = snapLinePosition(rowY + rowHeight - (capacityThreshold / maxGraphLoad) * rowHeight * 0.9);
            
            ctx.strokeStyle = designTokens.threshold;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, thresholdY);
            ctx.lineTo(logicalWidth, thresholdY);
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // Draw bars
            // We only need to iterate over visible days
            assignee.dailyWorkloads.forEach((daily) => {
              for (const series of ['planned', 'actual'] as const) {
                if (series === 'actual' && state.showActual === false) continue;
                const rect = WorkloadRenderer.getDailyBarRect({
                    canvasWidth: logicalWidth,
                    capacityThreshold,
                    viewport,
                    verticalScroll,
                    assigneeIndex: index,
                    assigneePeakLoad: Math.max(assignee.plannedPeak, assignee.actualPeak),
                    daily,
                    series
                });
                if (rect) {
                    const overload = series === 'planned' ? daily.isPlannedOverload : daily.isActualOverload;
                    const color = overload ? WorkloadRenderer.BAR_COLOR_OVERLOAD : WorkloadRenderer.BAR_COLOR_NORMAL;
                    ctx.fillStyle = color;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    if (series === 'planned') {
                        ctx.globalAlpha = 0.2;
                        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                        ctx.globalAlpha = 1;
                        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
                    } else {
                        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                    }

                    const labelInfo = getBarLabelInfo?.(assignee.assigneeId, daily.dateStr, series) ?? null;
                    if (labelInfo && rect.width >= WorkloadRenderer.LABEL_MIN_BAR_WIDTH && rect.y > WorkloadRenderer.LABEL_TOP_PADDING + 10) {
                        ctx.fillStyle = designTokens.textSecondary;
                        ctx.font = canvasFonts.bodyStrong;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(
                            `${labelInfo.current}/${labelInfo.total}`,
                            snapTextPosition(rect.x + rect.width / 2),
                            snapTextPosition(rect.y - WorkloadRenderer.LABEL_TOP_PADDING)
                        );
                    }

                    if (focusedAssigneeId === assignee.assigneeId && focusedDateStr === daily.dateStr && (state.focusedSeries ?? 'planned') === series) {
                        ctx.strokeStyle = designTokens.focus;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([4, 2]);
                        ctx.strokeRect(rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4);
                        ctx.setLineDash([]);
                    }
                }
              }
            });
        });
    }
}
