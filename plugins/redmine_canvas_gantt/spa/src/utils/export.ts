import type { Task } from '../types';

export type ExportColumn = {
    key: string;
    label: string;
    value: (task: Task) => string;
};

const formatDate = (timestamp?: number): string => {
    if (!Number.isFinite(timestamp)) return '-';
    return new Date(timestamp as number).toLocaleDateString();
};

const formatDateTime = (value?: string): string => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
};

const formatHours = (hours?: number): string => {
    if (hours === undefined) return '-';
    return `${hours}h`;
};

const formatPercent = (ratio?: number): string => {
    if (!Number.isFinite(ratio)) return '-';
    return `${ratio}%`;
};

const formatAssignee = (task: Task): string => {
    if (task.assignedToName) return task.assignedToName;
    if (task.assignedToId !== undefined && task.assignedToId !== null) return `#${task.assignedToId}`;
    return '-';
};

const formatSubject = (task: Task): string => {
    const indent = task.indentLevel ?? 0;
    const prefix = indent > 0 ? '  '.repeat(indent) : '';
    return `${prefix}${task.subject}`;
};

const escapeHtml = (value: string): string => (
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
);

const escapeXmlAttribute = (value: string): string => (
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
);

export const buildTaskExportColumns = (
    visibleColumns: string[],
    t: (key: string) => string | undefined
): ExportColumn[] => {
    const definitions: ExportColumn[] = [
        { key: 'id', label: 'ID', value: (task) => task.id },
        { key: 'subject', label: t('field_subject') || 'Task Name', value: formatSubject },
        { key: 'project', label: t('field_project') || 'Project', value: (task) => task.projectName || '-' },
        { key: 'tracker', label: t('field_tracker') || 'Tracker', value: (task) => task.trackerName || '-' },
        { key: 'status', label: t('field_status') || 'Status', value: (task) => task.statusName || '-' },
        { key: 'priority', label: t('field_priority') || 'Priority', value: (task) => task.priorityName || '-' },
        { key: 'assignee', label: t('field_assigned_to') || 'Assignee', value: formatAssignee },
        { key: 'author', label: t('field_author') || 'Author', value: (task) => task.authorName || '-' },
        { key: 'startDate', label: t('field_start_date') || 'Start Date', value: (task) => formatDate(task.startDate) },
        { key: 'dueDate', label: t('field_due_date') || 'Due Date', value: (task) => formatDate(task.dueDate) },
        { key: 'estimatedHours', label: t('field_estimated_hours') || 'Estimated Time', value: (task) => formatHours(task.estimatedHours) },
        { key: 'ratioDone', label: t('field_done_ratio') || 'Progress', value: (task) => formatPercent(task.ratioDone) },
        { key: 'spentHours', label: t('field_spent_hours') || 'Spent Time', value: (task) => formatHours(task.spentHours) },
        { key: 'version', label: t('field_version') || 'Target Version', value: (task) => task.fixedVersionName || '-' },
        { key: 'category', label: t('field_category') || 'Category', value: (task) => task.categoryName || '-' },
        { key: 'createdOn', label: t('field_created_on') || 'Created', value: (task) => formatDateTime(task.createdOn) },
        { key: 'updatedOn', label: t('field_updated_on') || 'Updated', value: (task) => formatDateTime(task.updatedOn) }
    ];

    return definitions.filter((column) => column.key === 'subject' || visibleColumns.includes(column.key));
};

export const createExcelHtml = (columns: ExportColumn[], tasks: Task[]): string => {
    const headerCells = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const rows = tasks.map((task) => {
        const cells = columns
            .map((column) => `<td>${escapeHtml(column.value(task))}</td>`)
            .join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<title>Gantt Export</title>',
        '</head>',
        '<body>',
        '<table border="1">',
        `<thead><tr>${headerCells}</tr></thead>`,
        `<tbody>${rows}</tbody>`,
        '</table>',
        '</body>',
        '</html>'
    ].join('');
};

export const createSvgMarkup = (imageHref: string, width: number, height: number): string => (
    [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<image href="${escapeXmlAttribute(imageHref)}" width="${width}" height="${height}" />`,
        '</svg>'
    ].join('')
);

const mergeCanvases = (canvases: HTMLCanvasElement[]): HTMLCanvasElement | null => {
    const base = canvases[0];
    if (!base) return null;

    const composite = document.createElement('canvas');
    composite.width = base.width;
    composite.height = base.height;
    const context = composite.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, composite.width, composite.height);

    canvases.forEach((canvas) => {
        if (canvas.width === 0 || canvas.height === 0) return;
        context.drawImage(canvas, 0, 0);
    });

    return composite;
};

export const buildSvgFromCanvases = (canvases: HTMLCanvasElement[]): string | null => {
    const composite = mergeCanvases(canvases);
    if (!composite) return null;
    const dataUrl = composite.toDataURL('image/png');
    return createSvgMarkup(dataUrl, composite.width, composite.height);
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
};

export const exportCurrentViewAsSvg = (filename: string): boolean => {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('.rcg-gantt-viewport canvas'));
    const svg = buildSvgFromCanvases(canvases);
    if (!svg) return false;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
    return true;
};

export const exportTasksToExcel = (
    tasks: Task[],
    visibleColumns: string[],
    t: (key: string) => string | undefined,
    filename: string
): boolean => {
    const columns = buildTaskExportColumns(visibleColumns, t);
    if (columns.length === 0) return false;
    const html = createExcelHtml(columns, tasks);
    downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), filename);
    return true;
};

export const exportUtils = {
    buildTaskExportColumns,
    createExcelHtml,
    createSvgMarkup
};
