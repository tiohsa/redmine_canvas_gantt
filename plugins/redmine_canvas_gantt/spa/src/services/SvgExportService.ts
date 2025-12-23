import C2S from 'canvas2svg';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { getGridScales } from '../utils/grid';
import { i18n } from '../utils/i18n';
import type { Task, Viewport, ZoomLevel } from '../types';

export class SvgExportService {
    private static readonly ROWS_PER_PAGE = 500;
    private static readonly HEADER_HEIGHT = 48; // TimelineHeader height

    static async export() {
        const { tasks, layoutRows, relations, rowCount, viewport, zoomLevel } = useTaskStore.getState();
        const { visibleColumns, columnWidths } = useUIStore.getState();

        // 1. Determine total rows and pages
        const totalRows = rowCount || tasks.length;
        if (totalRows === 0) {
            alert(i18n.t('no_data') || 'No data to export');
            return;
        }

        const totalPages = Math.ceil(totalRows / this.ROWS_PER_PAGE);

        // 2. Prepare dummy canvas elements for renderers
        const dummyCanvas = document.createElement('canvas');
        const taskRenderer = new TaskRenderer(dummyCanvas);
        const backgroundRenderer = new BackgroundRenderer(dummyCanvas);
        const overlayRenderer = new OverlayRenderer(dummyCanvas);

        // 3. Loop per page
        for (let page = 0; page < totalPages; page++) {
            const startRow = page * this.ROWS_PER_PAGE;
            const endRow = Math.min((page + 1) * this.ROWS_PER_PAGE - 1, totalRows - 1);
            const numRowsOnPage = endRow - startRow + 1;

            // 4. Calculate dimensions
            // Left Pane Width
            const leftPaneWidth = this.calculateLeftPaneWidth(visibleColumns, columnWidths);
            // Right Pane Width: match viewport width
            const rightPaneWidth = viewport.width;

            const totalWidth = leftPaneWidth + rightPaneWidth;
            const contentHeight = numRowsOnPage * viewport.rowHeight;
            const totalHeight = this.HEADER_HEIGHT + contentHeight + 40; // +40 for footer/margin

            // 5. Initialize C2S
            const ctx = new C2S(totalWidth, totalHeight);

            // 7. Draw Left Pane Header
            this.drawLeftPaneHeader(ctx, visibleColumns, columnWidths);

            // 8. Draw Right Pane Header (Timeline)
            ctx.save();
            ctx.translate(leftPaneWidth, 0);
            this.drawTimelineHeader(ctx, viewport, zoomLevel, rightPaneWidth, this.HEADER_HEIGHT);
            ctx.restore();

            // 9. Draw Rows Background & Grid (Right Pane)
            // Create a viewport for this page
            // scrollY = startRow * rowHeight ensures that the renderers (which do y - scrollY)
            // will draw the first row at y=0 relative to the translated context.
            const pageViewport: Viewport = {
                ...viewport,
                scrollY: startRow * viewport.rowHeight,
                height: contentHeight
            };

            const contentY = this.HEADER_HEIGHT;

            ctx.save();
            ctx.translate(leftPaneWidth, contentY);

            // Background & Grid
            backgroundRenderer.render(pageViewport, zoomLevel, null, [], ctx, { width: rightPaneWidth, height: contentHeight });

            // 10. Draw Left Pane Content
            ctx.restore(); // Back to (0,0)
            ctx.save();
            ctx.translate(0, contentY);

            // Map taskId to Task object for easy access
            const taskMap = new Map(tasks.map(t => [t.id, t]));

            // layoutRows contains all rows (tasks, headers, versions). We verify we have them.
            // If layoutRows is empty (e.g. data not fully loaded in store?), we might need to rely on tasks?
            // But layoutRows is what determines the order.
            const pageLayoutRows = layoutRows.filter(r => r.rowIndex >= startRow && r.rowIndex <= endRow);

            this.drawLeftPaneRows(ctx, pageLayoutRows, taskMap, visibleColumns, columnWidths, viewport.rowHeight, pageViewport.scrollY);

            ctx.restore();

            // 11. Draw Right Pane Content (Tasks & Overlay)
            ctx.save();
            ctx.translate(leftPaneWidth, contentY);

            // TaskRenderer expects "tasks" list. It internally slices based on viewport.
            taskRenderer.render(pageViewport, tasks, rowCount, zoomLevel, relations, layoutRows, ctx, { width: rightPaneWidth, height: contentHeight });

            // OverlayRenderer (Dependencies)
            overlayRenderer.render(pageViewport, ctx, { width: rightPaneWidth, height: contentHeight }, { selectedTaskId: null });

            ctx.restore();

            // 12. Draw Footer (Page Number)
            this.drawFooter(ctx, page + 1, totalPages, totalWidth, totalHeight);

            // 13. Save SVG
            const svgString = ctx.getSerializedSvg(true);
            this.downloadSvg(svgString, `gantt_export_p${page + 1}.svg`);
        }
    }

    private static calculateLeftPaneWidth(visibleColumns: string[], columnWidths: Record<string, number>) {
        let width = 0;

        // Subject is special, usually always visible.
        width += (columnWidths['subject'] ?? 280);

        // Others
        const others = ['id', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone', 'project', 'tracker', 'priority', 'author', 'category', 'estimatedHours', 'createdOn', 'updatedOn', 'spentHours', 'version'];

        others.forEach(key => {
            if (visibleColumns.includes(key)) {
                // Default widths from UiSidebar
                let w = 100;
                if (key === 'id') w = 72;
                if (key === 'assignee') w = 80;
                if (key === 'startDate') w = 90;
                if (key === 'dueDate') w = 90;
                if (key === 'ratioDone') w = 80;
                if (key === 'estimatedHours') w = 80;
                if (key === 'spentHours') w = 80;
                if (key === 'priority') w = 90;
                // Use stored width if available
                if (columnWidths[key]) w = columnWidths[key];
                width += w;
            }
        });

        return width;
    }

    private static getActiveColumns(visibleColumns: string[]) {
        const allCols = [
            { key: 'id', title: 'ID', width: 72 },
            { key: 'subject', title: i18n.t('field_subject') || 'Subject', width: 280 },
            { key: 'status', title: i18n.t('field_status') || 'Status', width: 100 },
            { key: 'assignee', title: i18n.t('field_assigned_to') || 'Assignee', width: 80 },
            { key: 'startDate', title: i18n.t('field_start_date') || 'Start Date', width: 90 },
            { key: 'dueDate', title: i18n.t('field_due_date') || 'Due Date', width: 90 },
            { key: 'ratioDone', title: i18n.t('field_done_ratio') || 'Progress', width: 80 },
            { key: 'project', title: i18n.t('field_project') || 'Project', width: 120 },
            { key: 'tracker', title: i18n.t('field_tracker') || 'Tracker', width: 100 },
            { key: 'priority', title: i18n.t('field_priority') || 'Priority', width: 90 },
            { key: 'author', title: i18n.t('field_author') || 'Author', width: 100 },
            { key: 'category', title: i18n.t('field_category') || 'Category', width: 100 },
            { key: 'estimatedHours', title: i18n.t('field_estimated_hours') || 'Est. Time', width: 80 },
            { key: 'createdOn', title: i18n.t('field_created_on') || 'Created', width: 120 },
            { key: 'updatedOn', title: i18n.t('field_updated_on') || 'Updated', width: 120 },
            { key: 'spentHours', title: i18n.t('field_spent_hours') || 'Spent', width: 80 },
            { key: 'version', title: i18n.t('field_version') || 'Version', width: 120 },
        ];

        return allCols.filter(c => c.key === 'subject' || visibleColumns.includes(c.key));
    }

    private static drawLeftPaneHeader(ctx: any, visibleColumns: string[], columnWidths: Record<string, number>) {
        const columns = this.getActiveColumns(visibleColumns);
        let x = 0;
        const y = 0;
        const height = this.HEADER_HEIGHT;

        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, y, this.calculateLeftPaneWidth(visibleColumns, columnWidths), height);

        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(this.calculateLeftPaneWidth(visibleColumns, columnWidths), height);
        ctx.stroke();

        ctx.fillStyle = '#444';
        ctx.font = '600 13px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        columns.forEach(col => {
            const w = columnWidths[col.key] ?? col.width;

            // Draw Separator
            ctx.beginPath();
            ctx.moveTo(x + w, y);
            ctx.lineTo(x + w, y + height);
            ctx.stroke();

            // Text
            this.drawText(ctx, col.title, x + 8, y + height / 2, w - 16, 'left');

            x += w;
        });
    }

    private static drawLeftPaneRows(ctx: any, layoutRows: any[], taskMap: Map<string, Task>, visibleColumns: string[], columnWidths: Record<string, number>, rowHeight: number, scrollY: number) {
        const columns = this.getActiveColumns(visibleColumns);

        layoutRows.forEach(row => {
            const y = row.rowIndex * rowHeight - scrollY;

            // Row Border
            ctx.strokeStyle = '#f1f3f4';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + rowHeight);
            ctx.lineTo(this.calculateLeftPaneWidth(visibleColumns, columnWidths), y + rowHeight);
            ctx.stroke();

            if (row.type === 'header') {
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(0, y, this.calculateLeftPaneWidth(visibleColumns, columnWidths), rowHeight);
                ctx.fillStyle = '#3c4043';
                ctx.font = '600 13px sans-serif';
                ctx.textBaseline = 'middle';
                this.drawText(ctx, row.projectName || 'Project', 24, y + rowHeight / 2, 500, 'left');
                return;
            }

            if (row.type === 'version') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, y, this.calculateLeftPaneWidth(visibleColumns, columnWidths), rowHeight);
                ctx.fillStyle = '#3c4043';
                ctx.font = '600 13px sans-serif';
                ctx.textBaseline = 'middle';
                this.drawText(ctx, row.name, 32, y + rowHeight / 2, 500, 'left');
                return;
            }

            if (row.type === 'task') {
                const task = taskMap.get(row.taskId);
                if (!task) return;

                let x = 0;
                columns.forEach(col => {
                    const w = columnWidths[col.key] ?? col.width;
                    const cellX = x;

                    // Draw cell content
                    this.drawCell(ctx, col.key, task, cellX, y, w, rowHeight);

                    // Vertical Separator
                    ctx.beginPath();
                    ctx.strokeStyle = '#f9f9f9';
                    ctx.moveTo(x + w, y);
                    ctx.lineTo(x + w, y + rowHeight);
                    ctx.stroke();

                    x += w;
                });
            }
        });
    }

    private static drawCell(ctx: any, key: string, task: Task, x: number, y: number, w: number, h: number) {
        ctx.fillStyle = '#3c4043';
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'middle';

        const padding = 8;
        const textY = y + h / 2;

        if (key === 'id') {
            ctx.font = '13px monospace';
            ctx.fillStyle = '#666';
            this.drawText(ctx, task.id, x + padding, textY, w - padding * 2);
        } else if (key === 'subject') {
            // Indentation
            const indent = (task.indentLevel ?? 0) * 16;
            const textX = x + padding + indent;
            this.drawText(ctx, task.subject, textX, textY, w - padding * 2 - indent);
        } else if (key === 'status') {
            // Draw Pill?
            const txt = task.statusName || String(task.statusId);
            this.drawText(ctx, txt, x + padding, textY, w - padding * 2);
        } else if (key === 'ratioDone') {
            this.drawText(ctx, `${task.ratioDone}%`, x + padding, textY, w - padding * 2);
        } else if (key === 'startDate') {
             const txt = (task.startDate && Number.isFinite(task.startDate)) ? new Date(task.startDate).toLocaleDateString() : '-';
             this.drawText(ctx, txt, x + padding, textY, w - padding * 2);
        } else if (key === 'dueDate') {
             const txt = (task.dueDate && Number.isFinite(task.dueDate)) ? new Date(task.dueDate).toLocaleDateString() : '-';
             this.drawText(ctx, txt, x + padding, textY, w - padding * 2);
        } else if (key === 'assignee') {
            this.drawText(ctx, task.assignedToName || '-', x + padding, textY, w - padding * 2);
        } else if (key === 'project') {
             this.drawText(ctx, task.projectName || '-', x + padding, textY, w - padding * 2);
        } else if (key === 'tracker') {
             this.drawText(ctx, task.trackerName || '-', x + padding, textY, w - padding * 2);
        } else if (key === 'priority') {
             this.drawText(ctx, task.priorityName || '-', x + padding, textY, w - padding * 2);
        } else {
             // Default
             this.drawText(ctx, '-', x + padding, textY, w - padding * 2);
        }
    }

    private static drawText(ctx: any, text: string, x: number, y: number, maxWidth: number, align: 'left' | 'right' | 'center' = 'left') {
        if (!text) return;

        // Ellipsis handling
        let displayText = text;
        const metrics = ctx.measureText(displayText);
        if (metrics.width > maxWidth) {
            // simple truncation
            while (displayText.length > 0 && ctx.measureText(displayText + '...').width > maxWidth) {
                displayText = displayText.slice(0, -1);
            }
            displayText += '...';
        }

        ctx.textAlign = align;
        ctx.fillText(displayText, x, y);
    }

    private static drawTimelineHeader(ctx: any, viewport: Viewport, zoomLevel: ZoomLevel, width: number, height: number) {
        // Copied/Adapted from TimelineHeader.tsx

        // Background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#e0e0e0';
        ctx.strokeRect(0, 0, width, height);

        const scales = getGridScales(viewport, zoomLevel);
        const hasTop = scales.top.length > 0;
        const hasMiddle = scales.middle.length > 0;
        const hasBottom = scales.bottom.length > 0;
        const activeRows = [hasTop, hasMiddle, hasBottom].filter(Boolean).length;
        const rowHeight = activeRows > 0 ? height / activeRows : height;

        let currentY = 0;

        const drawRow = (ticks: any[], bgColor: string, txtColor: string, align: 'left' | 'center') => {
            if (ticks.length === 0) return;
            const h = rowHeight;

            ctx.fillStyle = bgColor;
            ctx.fillRect(0, currentY, width, h);

             // Bottom border
            ctx.strokeStyle = '#dee2e6';
            ctx.beginPath();
            ctx.moveTo(0, currentY + h);
            ctx.lineTo(width, currentY + h);
            ctx.stroke();

            ctx.fillStyle = txtColor;
            ctx.font = '500 12px sans-serif';
            ctx.textAlign = align;
            ctx.textBaseline = 'middle';

            ticks.forEach((tick: any, i: number) => {
                 // Separator
                ctx.beginPath();
                ctx.moveTo(tick.x, currentY);
                ctx.lineTo(tick.x, currentY + h);
                ctx.strokeStyle = '#dee2e6';
                ctx.stroke();

                let nextX = width;
                if (i < ticks.length - 1) nextX = ticks[i+1].x;
                const w = nextX - tick.x;

                if (tick.x < width) {
                    const textY = currentY + h / 2;
                    let textX = tick.x;
                    if (align === 'center') textX += w / 2;
                    else textX += 4;

                    ctx.fillText(tick.label, textX, textY);
                }
            });
            currentY += h;
        };

        if (hasTop) drawRow(scales.top, '#f1f3f5', '#495057', 'left');

        const middleBg = zoomLevel === 0 ? '#f1f3f5' : '#ffffff';
        const middleTxt = zoomLevel === 0 ? '#495057' : '#333333';
        if (hasMiddle) drawRow(scales.middle, middleBg, middleTxt, 'left');

        if (hasBottom) {
             const h = rowHeight;
             ctx.fillStyle = '#ffffff';
             ctx.fillRect(0, currentY, width, h);

             // Weekends
            if (zoomLevel === 2) {
                 scales.bottom.forEach((tick: any, i: number) => {
                    const d = new Date(tick.time);
                    if (d.getDay() === 0 || d.getDay() === 6) {
                        let w = 50;
                        if (i < scales.bottom.length - 1) w = scales.bottom[i+1].x - tick.x;
                        else w = (24 * 3600 * 1000 * viewport.scale);
                        if (tick.x < width) {
                             ctx.fillStyle = '#eeeeee';
                             ctx.fillRect(tick.x, currentY, w, h);
                        }
                    }
                 });
            }

            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
             scales.bottom.forEach((tick: any, i: number) => {
                ctx.beginPath();
                ctx.moveTo(tick.x, currentY);
                ctx.lineTo(tick.x, currentY + h);
                ctx.strokeStyle = '#e0e0e0';
                ctx.stroke();

                let nextX = width;
                if (i < scales.bottom.length - 1) nextX = scales.bottom[i+1].x;
                const w = nextX - tick.x;

                 if (tick.x < width) {
                     ctx.fillText(tick.label, tick.x + w / 2, currentY + h / 2);
                 }
             });
        }
    }

    private static drawFooter(ctx: any, page: number, totalPages: number, width: number, height: number) {
        ctx.save();
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Page ${page} / ${totalPages} - Generated by Redmine Canvas Gantt`, width - 10, height - 10);
        ctx.restore();
    }

    private static downloadSvg(svgString: string, filename: string) {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
