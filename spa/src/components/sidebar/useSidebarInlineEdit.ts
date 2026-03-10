import React from 'react';
import type { Task } from '../../types';
import type { InlineEditSettings, TaskEditMeta } from '../../types/editMeta';
import { InlineEditService } from '../../services/InlineEditService';
import { customFieldIdFromColumnKey, customFieldEditField, customFieldIdFromEditField, isCustomFieldColumnKey } from './sidebarColumns';

type Params = {
    settings: InlineEditSettings;
    editMetaByTaskId: Record<string, TaskEditMeta>;
    fetchEditMeta: (taskId: string) => Promise<TaskEditMeta>;
    selectTask: (taskId: string) => void;
    setActiveInlineEdit: (value: { taskId: string; field: string; source?: 'cell' | 'panel' } | null) => void;
};

export const useSidebarInlineEdit = ({
    settings,
    editMetaByTaskId,
    fetchEditMeta,
    selectTask,
    setActiveInlineEdit
}: Params) => {
    const isInlineEditEnabled = React.useCallback((key: keyof InlineEditSettings, defaultValue: boolean) => {
        const value = settings[key];
        if (value === undefined) return defaultValue;
        return String(value) === '1';
    }, [settings]);

    const toDateInputValue = React.useCallback((timestamp: number | undefined) => {
        if (timestamp === undefined || !Number.isFinite(timestamp)) return '';
        try {
            return new Date(timestamp).toISOString().split('T')[0];
        } catch {
            return '';
        }
    }, []);

    const getSortField = React.useCallback((columnKey: string): string | null => {
        if (isCustomFieldColumnKey(columnKey)) return columnKey;
        if (columnKey === 'subject') return 'subject';
        if (columnKey === 'assignee') return 'assignedToName';
        if (columnKey === 'status') return 'statusId';
        if (columnKey === 'ratioDone') return 'ratioDone';
        if (columnKey === 'dueDate') return 'dueDate';
        if (columnKey === 'startDate') return 'startDate';
        if (columnKey === 'estimatedHours') return 'estimatedHours';
        if (columnKey === 'priority') return 'priorityId';
        if (columnKey === 'author') return 'authorName';
        if (columnKey === 'category') return 'categoryName';
        if (columnKey === 'project') return 'projectName';
        if (columnKey === 'tracker') return 'trackerName';
        if (columnKey === 'spentHours') return 'spentHours';
        if (columnKey === 'version') return 'fixedVersionName';
        if (columnKey === 'createdOn') return 'createdOn';
        if (columnKey === 'updatedOn') return 'updatedOn';
        if (columnKey === 'id') return 'id';
        return null;
    }, []);

    const getEditField = React.useCallback((columnKey: string) => {
        const customFieldId = customFieldIdFromColumnKey(columnKey);
        if (customFieldId) return customFieldEditField(customFieldId);
        if (columnKey === 'subject') return 'subject';
        if (columnKey === 'assignee') return 'assignedToId';
        if (columnKey === 'status') return 'statusId';
        if (columnKey === 'ratioDone') return 'ratioDone';
        if (columnKey === 'dueDate') return 'dueDate';
        if (columnKey === 'startDate') return 'startDate';
        if (columnKey === 'priority') return 'priorityId';
        if (columnKey === 'author') return 'authorId';
        if (columnKey === 'category') return 'categoryId';
        if (columnKey === 'estimatedHours') return 'estimatedHours';
        if (columnKey === 'project') return 'projectId';
        if (columnKey === 'tracker') return 'trackerId';
        if (columnKey === 'version') return 'fixedVersionId';
        return null;
    }, []);

    const shouldEnableField = React.useCallback((field: string, task: Task, providedMeta?: TaskEditMeta) => {
        if (!task.editable) return false;

        const customFieldId = customFieldIdFromEditField(field);
        if (customFieldId) {
            if (!isInlineEditEnabled('inline_edit_custom_fields', true)) return false;
            const meta = providedMeta || editMetaByTaskId[task.id];
            if (!meta) return true;
            if (!meta.editable.customFieldValues) return false;
            return meta.options.customFields.some((cf) => String(cf.id) === customFieldId);
        }

        if (field === 'subject') return isInlineEditEnabled('inline_edit_subject', true);
        if (field === 'assignedToId') return isInlineEditEnabled('inline_edit_assigned_to', true);
        if (field === 'statusId') return isInlineEditEnabled('inline_edit_status', true);
        if (field === 'ratioDone') return isInlineEditEnabled('inline_edit_done_ratio', true);
        if (field === 'dueDate') return isInlineEditEnabled('inline_edit_due_date', true);
        if (field === 'startDate') return isInlineEditEnabled('inline_edit_start_date', true);

        const meta = providedMeta || editMetaByTaskId[task.id];
        if (meta?.editable) {
            const editableMap = meta.editable as Record<string, boolean>;
            if (editableMap[field] === false) return false;
        }

        return ['priorityId', 'authorId', 'categoryId', 'estimatedHours', 'projectId', 'trackerId', 'fixedVersionId'].includes(field);
    }, [editMetaByTaskId, isInlineEditEnabled]);

    const ensureEditMeta = React.useCallback(async (taskId: string): Promise<TaskEditMeta | null> => {
        const cached = editMetaByTaskId[taskId];
        if (cached) return cached;
        try {
            return await fetchEditMeta(taskId);
        } catch {
            return null;
        }
    }, [editMetaByTaskId, fetchEditMeta]);

    const startCellEdit = React.useCallback(async (task: Task, field: string) => {
        if (!shouldEnableField(field, task)) return;
        selectTask(task.id);

        const requiresMeta = [
            'assignedToId', 'statusId', 'priorityId', 'authorId',
            'categoryId', 'projectId', 'trackerId', 'fixedVersionId'
        ].includes(field);
        const needsCustomFieldMeta = customFieldIdFromEditField(field) !== null;

        if (requiresMeta || needsCustomFieldMeta) {
            const meta = await ensureEditMeta(task.id);
            if (!meta) return;
            if (!shouldEnableField(field, task, meta)) return;
        }

        setActiveInlineEdit({ taskId: task.id, field, source: 'cell' });
    }, [ensureEditMeta, selectTask, setActiveInlineEdit, shouldEnableField]);

    const save = React.useCallback(async (params: Parameters<typeof InlineEditService.saveTaskFields>[0]) => {
        await InlineEditService.saveTaskFields(params);
    }, []);

    return {
        isInlineEditEnabled,
        toDateInputValue,
        getSortField,
        getEditField,
        shouldEnableField,
        ensureEditMeta,
        startCellEdit,
        save
    };
};
