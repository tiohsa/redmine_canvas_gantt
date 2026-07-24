import type { Task, Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import { designTokens } from '../styles/designTokens';
import { getCanvasLogicalSize } from '../utils/canvasDpr';
import { getDayInfo, timestampToBusinessDateKey } from '../utils/businessCalendar';
import type { BusinessDayInfo } from '../types/businessCalendar';

export class BackgroundRenderer {
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    render(viewport: Viewport, zoomLevel: ZoomLevel, selectedTaskId: string | null, tasks: Task[]) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = getCanvasLogicalSize(this.canvas);

        // Clear
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = designTokens.appBg;
        ctx.fillRect(0, 0, width, height);

        const scales = getGridScales(viewport, zoomLevel);
        const renderedNonWorkingDays = new Set<string>();

        // Business calendar background. Ticks use the same local-date semantics as the grid.
        if (zoomLevel === 2) {
            const ticks = scales.bottom;
            const visibleTasks = tasks.filter((task) => {
                const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                return y + viewport.rowHeight > 0 && y < height;
            });
            ticks.forEach((tick, i) => {
                const w = (i < ticks.length - 1)
                    ? ticks[i + 1].x - tick.x
                    : (24 * 60 * 60 * 1000) * viewport.scale;
                if (tick.x + w <= 0 || tick.x >= width) return;

                const colorFor = (info: BusinessDayInfo): string | null => {
                    if (info.type === 'working') return null;
                    return designTokens.weekendBg;
                };
                const x = Math.floor(tick.x);
                const fillWidth = Math.ceil(w);
                const rootProjectId = window.RedmineCanvasGantt?.projectId;
                const dayInfoByProject = new Map<string, BusinessDayInfo>();
                const infoForProject = (projectId?: string | number): BusinessDayInfo => {
                    const key = projectId == null ? '' : String(projectId);
                    const cached = dayInfoByProject.get(key);
                    if (cached) return cached;
                    const info = getDayInfo(tick.time, projectId);
                    dayInfoByProject.set(key, info);
                    return info;
                };
                const rootColor = colorFor(infoForProject(rootProjectId));

                if (rootColor) {
                    renderedNonWorkingDays.add(timestampToBusinessDateKey(tick.time));
                    ctx.fillStyle = rootColor;
                    ctx.fillRect(x, 0, fillWidth, height);
                }

                visibleTasks.forEach((task) => {
                    const taskColor = colorFor(infoForProject(task.projectId));
                    if (taskColor) renderedNonWorkingDays.add(timestampToBusinessDateKey(tick.time));
                    if (taskColor === rootColor) return;

                    const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                    ctx.fillStyle = taskColor ?? designTokens.appBg;
                    ctx.fillRect(x, y, fillWidth, viewport.rowHeight);
                });
            });
        }

        this.canvas.setAttribute(
            'data-business-calendar-non-working-days',
            [...renderedNonWorkingDays].sort().join(',')
        );

        // Highlight selected row
        if (selectedTaskId) {
            const selectedTask = tasks.find(t => t.id === selectedTaskId);
            if (selectedTask) {
                const y = selectedTask.rowIndex * viewport.rowHeight - viewport.scrollY;
                if (y + viewport.rowHeight > 0 && y < height) {
                    ctx.fillStyle = designTokens.selectedRow;
                    ctx.fillRect(0, y, width, viewport.rowHeight);
                }
            }
        }

        // Grid (vertical lines)
        ctx.strokeStyle = designTokens.borderSubtle;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Draw lines based on the finest scale available
        // If Zoom 3 (Hour), we might want hour lines?
        // If Zoom 2 (Day), day lines.
        // If Zoom 1 (Week), maybe week lines?

        let ticks = scales.bottom;
        if (ticks.length === 0) ticks = scales.middle;
        if (ticks.length === 0) ticks = scales.top;

        ticks.forEach(tick => {
            ctx.moveTo(Math.floor(tick.x) + 0.5, 0);
            ctx.lineTo(Math.floor(tick.x) + 0.5, height);
        });

        // Horizontal lines
        // Ensure color is correct
        ctx.strokeStyle = designTokens.borderStrong;

        let y = -viewport.scrollY % viewport.rowHeight;
        while (y < height) {
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(width, Math.floor(y) + 0.5);
            y += viewport.rowHeight;
        }

        ctx.stroke();
    }
}
