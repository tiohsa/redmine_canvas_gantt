import { LayoutEngine } from '../engines/LayoutEngine';
import { routeDependencyFS, type Point, type Rect, type RouteParams } from '../renderers/dependencyRouting';
import type { LayoutRow, Relation, Task, Version, Viewport, ZoomLevel } from '../types';
import { getGridScales } from '../utils/grid';
import { i18n } from '../utils/i18n';

const HEADER_HEIGHT = 48;
const FOOTER_HEIGHT = 32;
const ROWS_PER_PAGE = 500;
const FONT_FAMILY = 'Arial, sans-serif';
const FONT_SIZE = 12;
const CELL_PADDING = 8;
const SUBJECT_INDENT = 16;
const DELAY_PATTERN_ID = 'delay-hatch';
const ARROW_MARKER_ID = 'dependency-arrow';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEPENDENCY_ROUTE_PARAMS: RouteParams = {
    outset: 20,
    inset: 12,
    step: 24,
    maxShift: 8
};

type ExportColumnKey = 'id' | 'subject' | 'assignee' | 'startDate' | 'dueDate' | 'ratioDone';

interface ExportColumn {
    key: ExportColumnKey;
    title: string;
    width: number;
    align?: 'start' | 'end' | 'center';
}

interface SvgExportMeta {
    projectLabel: string;
    generatedAt: string;
    dateRangeLabel: string;
    zoomLabel: string;
    filterSummary: string;
}

interface SvgExportOptions {
    tasks: Task[];
    layoutRows: LayoutRow[];
    relations: Relation[];
    versions: Version[];
    viewport: Viewport;
    zoomLevel: ZoomLevel;
    columnWidths: Record<string, number>;
    visibleColumns: string[];
    sidebarWidth: number;
    meta: SvgExportMeta;
}

export interface SvgExportPage {
    fileName: string;
    svg: string;
}

const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const formatDate = (timestamp?: number): string => {
    if (timestamp === undefined || !Number.isFinite(timestamp)) return '-';
    return new Date(timestamp).toLocaleDateString();
};

const estimateCharWidth = (fontSize: number) => fontSize * 0.6;

const truncateText = (text: string, maxWidth: number, fontSize: number): string => {
    if (maxWidth <= 0) return '';
    const maxChars = Math.max(1, Math.floor(maxWidth / estimateCharWidth(fontSize)));
    if (text.length <= maxChars) return text;
    if (maxChars <= 1) return '…';
    return `${text.slice(0, maxChars - 1)}…`;
};

const buildColumns = (columnWidths: Record<string, number>, visibleColumns: string[]): ExportColumn[] => {
    const exportable: ExportColumn[] = [
        { key: 'id', title: 'ID', width: columnWidths['id'] ?? 72, align: 'start' },
        { key: 'subject', title: i18n.t('field_subject') || 'Task Name', width: columnWidths['subject'] ?? 280, align: 'start' },
        { key: 'assignee', title: i18n.t('field_assigned_to') || 'Assignee', width: columnWidths['assignee'] ?? 80, align: 'start' },
        { key: 'startDate', title: i18n.t('field_start_date') || 'Start Date', width: columnWidths['startDate'] ?? 90, align: 'start' },
        { key: 'dueDate', title: i18n.t('field_due_date') || 'Due Date', width: columnWidths['dueDate'] ?? 90, align: 'start' },
        { key: 'ratioDone', title: i18n.t('field_done_ratio') || 'Progress', width: columnWidths['ratioDone'] ?? 80, align: 'start' }
    ];

    return exportable.filter((column) => column.key === 'subject' || visibleColumns.includes(column.key));
};

const getRowCount = (layoutRows: LayoutRow[]): number => {
    if (layoutRows.length === 0) return 0;
    return layoutRows.reduce((max, row) => Math.max(max, row.rowIndex), 0) + 1;
};

const buildTaskValue = (task: Task, columnKey: ExportColumnKey): string => {
    if (columnKey === 'id') return task.id;
    if (columnKey === 'subject') return task.subject;
    if (columnKey === 'assignee') return task.assignedToName || '-';
    if (columnKey === 'startDate') return formatDate(task.startDate);
    if (columnKey === 'dueDate') return formatDate(task.dueDate);
    if (columnKey === 'ratioDone') return `${task.ratioDone}%`;
    return '';
};

const buildRowMap = (layoutRows: LayoutRow[]): Map<number, LayoutRow> =>
    new Map(layoutRows.map((row) => [row.rowIndex, row]));

const buildTaskMap = (tasks: Task[]): Map<string, Task> =>
    new Map(tasks.map((task) => [task.id, task]));

const drawDiamond = (x: number, y: number, size: number, fill: string, stroke: string) => {
    const half = size / 2;
    const points = [
        `${x},${y - half}`,
        `${x + half},${y}`,
        `${x},${y + half}`,
        `${x - half},${y}`
    ].join(' ');
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`;
};

export class GanttSvgExportService {
    static buildSvgPages(options: SvgExportOptions): SvgExportPage[] {
        const {
            tasks,
            layoutRows,
            relations,
            versions,
            viewport,
            zoomLevel,
            columnWidths,
            visibleColumns,
            sidebarWidth,
            meta
        } = options;

        const columns = buildColumns(columnWidths, visibleColumns);
        const columnsWidth = columns.reduce((sum, col) => sum + col.width, 0);
        const leftPaneWidth = Math.max(sidebarWidth, columnsWidth);
        const rightPaneWidth = viewport.width;
        const totalRows = getRowCount(layoutRows);
        const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));

        const rowMap = buildRowMap(layoutRows);
        const taskMap = buildTaskMap(tasks);

        const pages: SvgExportPage[] = [];

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
            const startRow = pageIndex * ROWS_PER_PAGE;
            const endRow = Math.min(totalRows - 1, startRow + ROWS_PER_PAGE - 1);
            const rowsInPage = endRow >= startRow ? endRow - startRow + 1 : 0;
            const bodyHeight = rowsInPage * viewport.rowHeight;
            const totalHeight = HEADER_HEIGHT + bodyHeight + FOOTER_HEIGHT;
            const totalWidth = leftPaneWidth + rightPaneWidth;

            const pageViewport: Viewport = {
                ...viewport,
                scrollY: startRow * viewport.rowHeight,
                height: bodyHeight,
                width: rightPaneWidth
            };

            const svg: string[] = [];
            svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
            svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);
            svg.push(`<defs>`);
            svg.push(`<pattern id="${DELAY_PATTERN_ID}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`);
            svg.push(`<rect width="6" height="6" fill="#ff6b6b" />`);
            svg.push(`<line x1="0" y1="0" x2="0" y2="6" stroke="#e03e3e" stroke-width="2" />`);
            svg.push(`</pattern>`);
            svg.push(`<marker id="${ARROW_MARKER_ID}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">`);
            svg.push(`<path d="M0,0 L8,4 L0,8 Z" fill="#888" />`);
            svg.push(`</marker>`);
            svg.push(`</defs>`);

            svg.push(`<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff" />`);

            svg.push(`<g id="header">`);
            svg.push(`<rect x="0" y="0" width="${totalWidth}" height="${HEADER_HEIGHT}" fill="#f8f9fa" stroke="#e0e0e0" />`);

            let columnX = 0;
            columns.forEach((column) => {
                const textX = columnX + CELL_PADDING;
                const textY = HEADER_HEIGHT / 2;
                const textWidth = Math.max(0, column.width - CELL_PADDING * 2);
                const label = truncateText(column.title, textWidth, FONT_SIZE);
                svg.push(`<text x="${textX}" y="${textY}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="600" fill="#333" dominant-baseline="middle" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(label)}</text>`);
                svg.push(`<line x1="${columnX + column.width}" y1="0" x2="${columnX + column.width}" y2="${HEADER_HEIGHT}" stroke="#e0e0e0" />`);
                columnX += column.width;
            });

            svg.push(`<line x1="${leftPaneWidth}" y1="0" x2="${leftPaneWidth}" y2="${HEADER_HEIGHT}" stroke="#e0e0e0" />`);

            const scales = getGridScales(pageViewport, zoomLevel);
            const headerRows = [scales.top, scales.middle, scales.bottom].filter((ticks) => ticks.length > 0);
            const headerRowHeight = headerRows.length > 0 ? HEADER_HEIGHT / headerRows.length : HEADER_HEIGHT;
            let headerRowY = 0;

            const drawHeaderRow = (ticks: typeof scales.top, bgColor: string, textColor: string, align: 'start' | 'center') => {
                if (ticks.length === 0) return;
                svg.push(`<rect x="${leftPaneWidth}" y="${headerRowY}" width="${rightPaneWidth}" height="${headerRowHeight}" fill="${bgColor}" />`);
                ticks.forEach((tick, index) => {
                    const nextX = index < ticks.length - 1 ? ticks[index + 1].x : rightPaneWidth;
                    const tickWidth = nextX - tick.x;
                    const textX = align === 'center' ? leftPaneWidth + tick.x + tickWidth / 2 : leftPaneWidth + Math.max(0, tick.x) + 4;
                    const textY = headerRowY + headerRowHeight / 2;
                    const textWidth = Math.max(0, tickWidth - 8);
                    if (tick.x < rightPaneWidth && tick.x + tickWidth > 0) {
                        svg.push(`<line x1="${leftPaneWidth + tick.x}" y1="${headerRowY}" x2="${leftPaneWidth + tick.x}" y2="${headerRowY + headerRowHeight}" stroke="#dee2e6" />`);
                        const label = truncateText(tick.label, textWidth, FONT_SIZE);
                        svg.push(`<text x="${textX}" y="${textY}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="500" fill="${textColor}" dominant-baseline="middle" text-anchor="${align === 'center' ? 'middle' : 'start'}" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(label)}</text>`);
                    }
                });
                svg.push(`<line x1="${leftPaneWidth}" y1="${headerRowY + headerRowHeight}" x2="${leftPaneWidth + rightPaneWidth}" y2="${headerRowY + headerRowHeight}" stroke="#dee2e6" />`);
                headerRowY += headerRowHeight;
            };

            if (scales.top.length > 0) {
                drawHeaderRow(scales.top, '#f1f3f5', '#495057', 'start');
            }
            if (scales.middle.length > 0) {
                const midBg = zoomLevel === 0 ? '#f1f3f5' : '#ffffff';
                const midTxt = zoomLevel === 0 ? '#495057' : '#333333';
                drawHeaderRow(scales.middle, midBg, midTxt, 'start');
            }
            if (scales.bottom.length > 0) {
                drawHeaderRow(scales.bottom, '#ffffff', '#333333', 'center');
            }

            svg.push(`</g>`);

            svg.push(`<g id="left-pane" transform="translate(0, ${HEADER_HEIGHT})">`);
            svg.push(`<rect x="0" y="0" width="${leftPaneWidth}" height="${bodyHeight}" fill="#ffffff" />`);

            for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
                const row = rowMap.get(rowIndex);
                if (!row) continue;
                const y = (rowIndex - startRow) * viewport.rowHeight;

                if (row.type === 'header') {
                    const label = row.projectName || i18n.t('label_project') || 'Project';
                    const labelWidth = Math.max(0, leftPaneWidth - CELL_PADDING * 2);
                    const headerLabel = truncateText(label, labelWidth, FONT_SIZE);
                    svg.push(`<rect x="0" y="${y}" width="${leftPaneWidth}" height="${viewport.rowHeight}" fill="#f8f9fa" stroke="#e0e0e0" />`);
                    svg.push(`<text x="${CELL_PADDING}" y="${y + viewport.rowHeight / 2}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="600" fill="#3c4043" dominant-baseline="middle" textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(headerLabel)}</text>`);
                    continue;
                }

                if (row.type === 'version') {
                    const labelWidth = Math.max(0, leftPaneWidth - CELL_PADDING * 2 - SUBJECT_INDENT);
                    const versionLabel = truncateText(row.name, labelWidth, FONT_SIZE);
                    svg.push(`<rect x="0" y="${y}" width="${leftPaneWidth}" height="${viewport.rowHeight}" fill="#ffffff" stroke="#e0e0e0" />`);
                    svg.push(`<text x="${CELL_PADDING + SUBJECT_INDENT}" y="${y + viewport.rowHeight / 2}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="600" fill="#3c4043" dominant-baseline="middle" textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(versionLabel)}</text>`);
                    continue;
                }

                const task = taskMap.get(row.taskId);
                if (!task) continue;

                svg.push(`<rect x="0" y="${y}" width="${leftPaneWidth}" height="${viewport.rowHeight}" fill="#ffffff" stroke="#e0e0e0" />`);

                let cellX = 0;
                columns.forEach((column) => {
                    const isSubject = column.key === 'subject';
                    const indent = isSubject ? (task.indentLevel ?? 0) * SUBJECT_INDENT : 0;
                    const textX = cellX + CELL_PADDING + indent;
                    const availableWidth = Math.max(0, column.width - CELL_PADDING * 2 - indent);
                    const value = buildTaskValue(task, column.key);
                    const label = truncateText(value, availableWidth, FONT_SIZE);
                    svg.push(`<text x="${textX}" y="${y + viewport.rowHeight / 2}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" fill="#3c4043" dominant-baseline="middle" textLength="${availableWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(label)}</text>`);
                    svg.push(`<line x1="${cellX + column.width}" y1="${y}" x2="${cellX + column.width}" y2="${y + viewport.rowHeight}" stroke="#e0e0e0" />`);
                    cellX += column.width;
                });
            }
            svg.push(`<line x1="${leftPaneWidth}" y1="0" x2="${leftPaneWidth}" y2="${bodyHeight}" stroke="#e0e0e0" />`);

            svg.push(`</g>`);

            svg.push(`<g id="right-pane" transform="translate(${leftPaneWidth}, ${HEADER_HEIGHT})">`);
            svg.push(`<rect x="0" y="0" width="${rightPaneWidth}" height="${bodyHeight}" fill="#f5f5f5" />`);

            svg.push(`<g class="grid">`);
            if (zoomLevel === 2) {
                const ticks = scales.bottom;
                ticks.forEach((tick, index) => {
                    const date = new Date(tick.time);
                    const day = date.getDay();
                    if (day === 0 || day === 6) {
                        const nextX = index < ticks.length - 1 ? ticks[index + 1].x : rightPaneWidth;
                        const width = nextX - tick.x;
                        if (tick.x < rightPaneWidth && tick.x + width > 0) {
                            svg.push(`<rect x="${tick.x}" y="0" width="${width}" height="${bodyHeight}" fill="#eeeeee" />`);
                        }
                    }
                });
            }

            const gridTicks = scales.bottom.length > 0 ? scales.bottom : (scales.middle.length > 0 ? scales.middle : scales.top);
            gridTicks.forEach((tick) => {
                if (tick.x < 0 || tick.x > rightPaneWidth) return;
                svg.push(`<line x1="${tick.x}" y1="0" x2="${tick.x}" y2="${bodyHeight}" stroke="#f0f0f0" />`);
            });

            for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
                const y = (rowIndex - startRow) * viewport.rowHeight;
                svg.push(`<line x1="0" y1="${y}" x2="${rightPaneWidth}" y2="${y}" stroke="#e0e0e0" />`);
            }
            svg.push(`</g>`);

            svg.push(`<g id="tasks">`);
            const visibleTasks = tasks.filter((task) => task.rowIndex >= startRow && task.rowIndex <= endRow);
            const today = new Date().setHours(0, 0, 0, 0) + ONE_DAY_MS;
            const xToday = LayoutEngine.dateToX(today, viewport) - viewport.scrollX;

            layoutRows.forEach((row) => {
                if (row.rowIndex < startRow || row.rowIndex > endRow) return;
                const y = (row.rowIndex - startRow) * viewport.rowHeight;

                if (row.type === 'header') {
                    if (row.startDate !== undefined && row.dueDate !== undefined) {
                        const s = LayoutEngine.snapDate(row.startDate, zoomLevel);
                        const d = Math.max(s, LayoutEngine.snapDate(row.dueDate, zoomLevel));
                        const x1 = LayoutEngine.dateToX(s, viewport) - viewport.scrollX;
                        const x2 = LayoutEngine.dateToX(d + ONE_DAY_MS, viewport) - viewport.scrollX;
                        const centerY = y + viewport.rowHeight / 2;
                        const diamondSize = 8;
                        svg.push(drawDiamond(x1 + diamondSize / 2, centerY, diamondSize, 'rgba(26, 115, 232, 0.8)', '#1a73e8'));
                        svg.push(drawDiamond(x2 - diamondSize / 2, centerY, diamondSize, 'rgba(26, 115, 232, 0.8)', '#1a73e8'));
                        svg.push(`<line x1="${x1 + diamondSize / 2}" y1="${centerY}" x2="${x2 - diamondSize / 2}" y2="${centerY}" stroke="rgba(100, 100, 100, 0.5)" stroke-width="1.5" stroke-dasharray="2 2" />`);
                    }
                    return;
                }

                if (row.type === 'version') {
                    if (row.startDate !== undefined && row.dueDate !== undefined) {
                        const s = LayoutEngine.snapDate(row.startDate, zoomLevel);
                        const d = Math.max(s, LayoutEngine.snapDate(row.dueDate, zoomLevel));
                        const x1 = LayoutEngine.dateToX(s, viewport) - viewport.scrollX;
                        const x2 = LayoutEngine.dateToX(d + ONE_DAY_MS, viewport) - viewport.scrollX;
                        const centerY = y + viewport.rowHeight / 2;
                        const diamondSize = 8;
                        const width = x2 - x1;
                        const progressWidth = width * (Math.max(0, Math.min(100, row.ratioDone ?? 0)) / 100);
                        svg.push(drawDiamond(x1 + diamondSize / 2, centerY, diamondSize, '#009688', '#00695c'));
                        svg.push(drawDiamond(x2 - diamondSize / 2, centerY, diamondSize, '#009688', '#00695c'));
                        svg.push(`<line x1="${x1 + diamondSize / 2}" y1="${centerY}" x2="${x2 - diamondSize / 2}" y2="${centerY}" stroke="#bdbdbd" stroke-width="1.5" stroke-dasharray="2 2" />`);
                        if (progressWidth > 0) {
                            svg.push(`<line x1="${x1 + diamondSize / 2}" y1="${centerY}" x2="${Math.min(x2 - diamondSize / 2, x1 + progressWidth)}" y2="${centerY}" stroke="#4db6ac" stroke-width="3" />`);
                        }
                    }
                    return;
                }

                const task = taskMap.get(row.taskId);
                if (!task || !Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) return;

                const bounds = LayoutEngine.getTaskBounds(task, pageViewport, 'bar', zoomLevel);
                const isParent = task.hasChildren;
                const barHeight = isParent ? Math.floor(bounds.height / 2) : bounds.height;
                const barY = Math.floor(bounds.y + (bounds.height - barHeight) / 2);
                const baseX = Math.floor(bounds.x);
                const baseWidth = Math.floor(bounds.width);
                const ratio = Math.max(0, Math.min(100, task.ratioDone));
                const progressWidth = Math.floor(baseWidth * (ratio / 100));
                const delayStartX = baseX + progressWidth;
                const delayEndX = Math.min(xToday, baseX + baseWidth);
                const delayWidth = delayEndX > delayStartX ? delayEndX - delayStartX : 0;

                svg.push(`<rect x="${baseX}" y="${barY}" width="${baseWidth}" height="${barHeight}" fill="#dddddd" />`);
                if (progressWidth > 0) {
                    svg.push(`<rect x="${baseX}" y="${barY}" width="${progressWidth}" height="${barHeight}" fill="#50c878" />`);
                }
                if (delayWidth > 0) {
                    svg.push(`<rect x="${delayStartX}" y="${barY}" width="${delayWidth}" height="${barHeight}" fill="url(#${DELAY_PATTERN_ID})" />`);
                }
                if (isParent) {
                    const capOverflow = Math.max(1, Math.round(bounds.height * 0.15));
                    const capHeight = bounds.height + capOverflow * 2;
                    const capY = bounds.y - capOverflow;
                    const capWidth = Math.max(2, Math.round(bounds.height * 0.3));
                    svg.push(`<rect x="${baseX}" y="${capY}" width="${capWidth}" height="${capHeight}" fill="#666666" />`);
                    svg.push(`<rect x="${baseX + baseWidth - capWidth}" y="${capY}" width="${capWidth}" height="${capHeight}" fill="#666666" />`);
                }
            });
            svg.push(`</g>`);

            svg.push(`<g id="relations">`);
            if (zoomLevel === 2) {
                const tasksInPage = visibleTasks;
                const taskById = new Map(tasksInPage.map((task) => [task.id, task]));
                const rectById = new Map<string, Rect>();
                const allRects: Array<{ id: string; rect: Rect }> = [];

                tasksInPage.forEach((task) => {
                    const bounds = LayoutEngine.getTaskBounds(task, pageViewport, 'bar', zoomLevel);
                    const rect = {
                        x: bounds.x + viewport.scrollX,
                        y: bounds.y + pageViewport.scrollY,
                        width: bounds.width,
                        height: bounds.height
                    };
                    rectById.set(task.id, rect);
                    allRects.push({ id: task.id, rect });
                });

                relations.forEach((relation) => {
                    const fromTask = taskById.get(relation.from);
                    const toTask = taskById.get(relation.to);
                    if (!fromTask || !toTask) return;

                    const fromRect = rectById.get(relation.from);
                    const toRect = rectById.get(relation.to);
                    if (!fromRect || !toRect) return;

                    const obstacles = allRects.filter((entry) => entry.id !== relation.from && entry.id !== relation.to).map((entry) => entry.rect);
                    const points = routeDependencyFS(
                        fromRect,
                        toRect,
                        obstacles,
                        { scrollY: pageViewport.scrollY, height: pageViewport.height },
                        {
                            rowHeight: pageViewport.rowHeight,
                            fromRowIndex: fromTask.rowIndex,
                            toRowIndex: toTask.rowIndex,
                            columnWidth: ONE_DAY_MS * pageViewport.scale
                        },
                        { ...DEPENDENCY_ROUTE_PARAMS, step: pageViewport.rowHeight }
                    );

                    if (!points || points.length < 2) return;
                    const path = points.map((point: Point, index: number) => {
                        const x = point.x - viewport.scrollX;
                        const y = point.y - pageViewport.scrollY;
                        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ');
                    svg.push(`<path d="${path}" fill="none" stroke="#888" stroke-width="1.5" marker-end="url(#${ARROW_MARKER_ID})" data-relation="${relation.id}" />`);
                });
            }
            svg.push(`</g>`);

            svg.push(`<g id="versions">`);
            versions.forEach((version) => {
                const x = LayoutEngine.dateToX(version.effectiveDate, viewport) - viewport.scrollX;
                if (x < 0 || x > rightPaneWidth) return;
                const labelWidth = 120;
                const label = truncateText(version.name, labelWidth, FONT_SIZE);
                svg.push(`<line x1="${x}" y1="0" x2="${x}" y2="${bodyHeight}" stroke="#009688" stroke-width="1" stroke-dasharray="4 2" />`);
                svg.push(`<text x="${x + 4}" y="${FONT_SIZE + 2}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" fill="#00695c" dominant-baseline="middle" textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(label)}</text>`);
            });
            svg.push(`</g>`);

            svg.push(`</g>`);

            const footerY = HEADER_HEIGHT + bodyHeight + FOOTER_HEIGHT / 2;
            const pageLabel = `Page ${pageIndex + 1} / ${totalPages}`;
            const metaText = [
                meta.projectLabel,
                meta.dateRangeLabel,
                meta.zoomLabel,
                meta.filterSummary,
                meta.generatedAt
            ].filter(Boolean).join(' | ');

            svg.push(`<g id="footer">`);
            svg.push(`<rect x="0" y="${HEADER_HEIGHT + bodyHeight}" width="${totalWidth}" height="${FOOTER_HEIGHT}" fill="#ffffff" stroke="#e0e0e0" />`);
            const metaWidth = Math.max(0, totalWidth - CELL_PADDING * 2 - 120);
            svg.push(`<text x="${CELL_PADDING}" y="${footerY}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" fill="#666" dominant-baseline="middle" textLength="${metaWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(truncateText(metaText, metaWidth, FONT_SIZE))}</text>`);
            svg.push(`<text x="${totalWidth - CELL_PADDING}" y="${footerY}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" fill="#666" text-anchor="end" dominant-baseline="middle" textLength="100" lengthAdjust="spacingAndGlyphs">${escapeXml(pageLabel)}</text>`);
            svg.push(`</g>`);

            svg.push(`</svg>`);

            pages.push({
                fileName: `gantt-export-${pageIndex + 1}.svg`,
                svg: svg.join('')
            });
        }

        return pages;
    }

    static downloadPages(pages: SvgExportPage[]): void {
        if (typeof document === 'undefined') return;

        pages.forEach((page) => {
            const blob = new Blob([page.svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = page.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }
}
