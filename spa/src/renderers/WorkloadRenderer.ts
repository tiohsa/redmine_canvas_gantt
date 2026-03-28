import type { Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import type { WorkloadData } from '../services/WorkloadLogicService';

export interface WorkloadRenderState {
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    workloadData: WorkloadData | null;
    capacityThreshold: number;
    verticalScroll: number;
    hoveredAssigneeId: number | null;
    hoveredDateStr: string | null;
}

export class WorkloadRenderer {
    private canvas: HTMLCanvasElement;
    private static readonly WEEKEND_BG = '#fcfcfc';
    private static readonly BAR_COLOR_NORMAL = '#4285f4'; // Blue
    private static readonly BAR_COLOR_OVERLOAD = '#ea4335'; // Red
    private static readonly MAX_EXPECTED_LOAD = 24; // For scaling the histogram

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(state: WorkloadRenderState) {
        const { viewport, zoomLevel, workloadData, capacityThreshold, verticalScroll, hoveredAssigneeId } = state;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const scales = getGridScales(viewport, zoomLevel);
        const rowHeight = viewport.rowHeight * 2; // Histogram rows are usually taller (e.g. 72px when row is 36px)

        // Draw weekend background
        if (zoomLevel === 2) {
            const ticks = scales.bottom;
            ticks.forEach((tick, i) => {
                const d = new Date(tick.time);
                const dow = d.getDay();
                if (dow === 0 || dow === 6) {
                    const w = (i < ticks.length - 1)
                        ? ticks[i + 1].x - tick.x
                        : (24 * 60 * 60 * 1000) * viewport.scale;

                    if (tick.x + w > 0 && tick.x < this.canvas.width) {
                        ctx.fillStyle = WorkloadRenderer.WEEKEND_BG;
                        ctx.fillRect(Math.floor(tick.x), 0, Math.ceil(w), this.canvas.height);
                    }
                }
            });
        }

        // Draw grid lines
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let ticks = scales.bottom;
        if (ticks.length === 0) ticks = scales.middle;
        if (ticks.length === 0) ticks = scales.top;

        ticks.forEach(tick => {
            ctx.moveTo(Math.floor(tick.x) + 0.5, 0);
            ctx.lineTo(Math.floor(tick.x) + 0.5, this.canvas.height);
        });

        // Workload rows are independent from the task list vertical scroll.
        let y = -(verticalScroll % rowHeight);
        while (y < this.canvas.height) {
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(this.canvas.width, Math.floor(y) + 0.5);
            y += rowHeight;
        }
        ctx.stroke();

        if (!workloadData) return;

        // Get sorted assignees to match DOM sidebar
        const assignees = Array.from(workloadData.assignees.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName));

        // Draw workload histograms
        assignees.forEach((assignee, index) => {
            const rowY = index * rowHeight - verticalScroll;
            
            // Skip rows outside viewport
            if (rowY + rowHeight < 0 || rowY > this.canvas.height) return;

            // Highlight if hovered
            if (hoveredAssigneeId === assignee.assigneeId) {
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(0, rowY, this.canvas.width, rowHeight);
            }

            // Draw Threshold line
            const maxGraphLoad = Math.max(capacityThreshold * 1.5, Math.ceil(assignee.peakLoad), WorkloadRenderer.MAX_EXPECTED_LOAD);
            const thresholdY = rowY + rowHeight - (capacityThreshold / maxGraphLoad) * rowHeight;
            
            ctx.strokeStyle = '#fad2cf'; // Light red dashed line for threshold
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, Math.floor(thresholdY) + 0.5);
            ctx.lineTo(this.canvas.width, Math.floor(thresholdY) + 0.5);
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // Draw bars
            // We only need to iterate over visible days
            // Calculate visible date range
            const visibleStartMs = viewport.startDate + Math.max(0, viewport.scrollX) / viewport.scale;
            const visibleEndMs = visibleStartMs + this.canvas.width / viewport.scale;

            assignee.dailyWorkloads.forEach((daily) => {
                if (daily.timestamp < visibleStartMs - 86400000 || daily.timestamp > visibleEndMs + 86400000) return;

                const startX = (daily.timestamp - viewport.startDate) * viewport.scale - viewport.scrollX;
                const endX = (daily.timestamp + 86400000 - viewport.startDate) * viewport.scale - viewport.scrollX;
                const barWidth = endX - startX - 2; // -2 for margin

                const barHeight = (daily.totalLoad / maxGraphLoad) * rowHeight * 0.9; // 90% max height
                const barY = rowY + rowHeight - barHeight;

                if (startX + barWidth > 0 && startX < this.canvas.width) {
                    ctx.fillStyle = daily.isOverload ? WorkloadRenderer.BAR_COLOR_OVERLOAD : WorkloadRenderer.BAR_COLOR_NORMAL;
                    ctx.fillRect(Math.floor(startX + 1), Math.floor(barY), Math.max(1, Math.floor(barWidth)), Math.ceil(barHeight));
                }
            });
        });
    }
}
