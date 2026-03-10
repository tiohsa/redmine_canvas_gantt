import React from 'react';
import type { Task } from '../../types';
import type { CustomFieldMeta } from '../../types/editMeta';
import { loadPreferences } from '../../utils/preferences';
import { SIDEBAR_RESIZE_CURSOR } from '../../constants';
import { getStatusColor } from '../../utils/styles';
import { i18n } from '../../utils/i18n';
import { formatCustomFieldCellValue } from './sidebarColumns';

type Params = {
    tasks: Task[];
    customFields: CustomFieldMeta[];
    setColumnWidth: (key: string, width: number) => void;
};

export const useSidebarColumnSizing = ({ tasks, customFields, setColumnWidth }: Params) => {
    const resizeRef = React.useRef<{ key: string; startX: number; startWidth: number } | null>(null);
    const [isResizingColumn, setIsResizingColumn] = React.useState(false);
    const bodyStyleRef = React.useRef<{ cursor: string; userSelect: string } | null>(null);
    const calculatedRef = React.useRef(false);

    React.useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = e.clientX - resizeRef.current.startX;
            const newWidth = Math.max(40, resizeRef.current.startWidth + delta);
            setColumnWidth(resizeRef.current.key, newWidth);
        };

        const onMouseUp = () => {
            if (resizeRef.current) {
                resizeRef.current = null;
                setIsResizingColumn(false);
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [setColumnWidth]);

    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        if (isResizingColumn) {
            if (!bodyStyleRef.current) {
                bodyStyleRef.current = {
                    cursor: document.body.style.cursor,
                    userSelect: document.body.style.userSelect
                };
            }
            document.body.style.cursor = SIDEBAR_RESIZE_CURSOR;
            document.body.style.userSelect = 'none';
            return;
        }

        if (bodyStyleRef.current) {
            document.body.style.cursor = bodyStyleRef.current.cursor;
            document.body.style.userSelect = bodyStyleRef.current.userSelect;
            bodyStyleRef.current = null;
        } else {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, [isResizingColumn]);

    React.useEffect(() => {
        const savedPrefs = loadPreferences();
        if (calculatedRef.current || tasks.length === 0 || savedPrefs.columnWidths) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        context.font = '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        const idWidth = Math.max(
            context.measureText('ID').width,
            ...tasks.slice(0, 50).map(t => context.measureText(String(t.id)).width)
        ) + 24;

        context.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

        const measure = (text: string) => context.measureText(text).width;
        const getColWidth = (title: string, accessor: (t: Task) => string) => {
            const headerWidth = measure(title) + 24;
            const contentWidth = Math.max(...tasks.slice(0, 50).map(t => measure(accessor(t))));
            return Math.ceil(Math.max(headerWidth, contentWidth + 20));
        };

        const newWidths: Record<string, number> = {};
        newWidths.id = Math.ceil(idWidth);

        const getSubjectWidth = (t: Task) => {
            const indent = 8 + (t.indentLevel ?? 0) * 16;
            const icons = 18 + 6 + 16;
            const text = measure(t.subject);
            const editIcon = 24;
            return indent + icons + text + editIcon + 12;
        };
        const subjectTitle = i18n.t('field_subject') || 'Task Name';
        const subjectWidth = Math.max(measure(subjectTitle) + 24, ...tasks.slice(0, 50).map(getSubjectWidth));
        newWidths.subject = Math.ceil(Math.min(600, subjectWidth));

        newWidths.status = getColWidth(i18n.t('field_status') || 'Status', (t: Task) => getStatusColor(t.statusId).label) + 16;
        newWidths.assignee = Math.max(measure(i18n.t('field_assigned_to') || 'Assignee') + 24, ...tasks.slice(0, 50).map(t => t.assignedToName ? 36 : 0));
        newWidths.startDate = getColWidth(i18n.t('field_start_date') || 'Start Date', (t: Task) => (t.startDate !== undefined && Number.isFinite(t.startDate)) ? new Date(t.startDate).toLocaleDateString() : '-');
        newWidths.dueDate = getColWidth(i18n.t('field_due_date') || 'Due Date', (t: Task) => (t.dueDate !== undefined && Number.isFinite(t.dueDate)) ? new Date(t.dueDate).toLocaleDateString() : '-');
        newWidths.ratioDone = Math.max(measure(i18n.t('field_done_ratio') || 'Progress') + 24, ...tasks.slice(0, 50).map(() => 32));

        const addAutoWidth = (key: string, title: string, accessor: (t: Task) => string) => {
            newWidths[key] = getColWidth(title, accessor);
        };

        addAutoWidth('project', i18n.t('field_project') || 'Project', (t) => t.projectName || '');
        addAutoWidth('tracker', i18n.t('field_tracker') || 'Tracker', (t) => t.trackerName || '');
        addAutoWidth('priority', i18n.t('field_priority') || 'Priority', (t) => t.priorityName || '');
        newWidths.priority += 16;
        addAutoWidth('author', i18n.t('field_author') || 'Author', (t) => t.authorName || '');
        addAutoWidth('category', i18n.t('field_category') || 'Category', (t) => t.categoryName || '');
        addAutoWidth('estimatedHours', i18n.t('field_estimated_hours') || 'Estimated Time', (t) => t.estimatedHours !== undefined ? `${t.estimatedHours}h` : '');
        addAutoWidth('createdOn', i18n.t('field_created_on') || 'Created', (t) => t.createdOn ? new Date(t.createdOn).toLocaleString() : '');
        addAutoWidth('updatedOn', i18n.t('field_updated_on') || 'Updated', (t) => t.updatedOn ? new Date(t.updatedOn).toLocaleString() : '');
        addAutoWidth('spentHours', i18n.t('field_spent_hours') || 'Spent Time', (t) => t.spentHours !== undefined ? `${t.spentHours}h` : '');
        addAutoWidth('version', i18n.t('field_version') || 'Target Version', (t) => t.fixedVersionName || '');
        customFields.forEach((cf) => {
            addAutoWidth(`cf:${cf.id}`, cf.name, (t) => formatCustomFieldCellValue(t, cf));
        });

        Object.keys(newWidths).forEach(key => {
            setColumnWidth(key, newWidths[key]);
        });

        calculatedRef.current = true;
    }, [customFields, setColumnWidth, tasks]);

    const handleResizeStart = React.useCallback((e: React.MouseEvent, key: string, currentWidth: number) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = { key, startX: e.clientX, startWidth: currentWidth };
        setIsResizingColumn(true);
    }, []);

    return {
        handleResizeStart
    };
};
