import React from 'react';
import type { Task } from '../../types';
import type { InlineEditSettings, TaskEditMeta } from '../../types/editMeta';
import { InlineEditService } from '../../services/InlineEditService';
import { useUIStore, type ActiveInlineEdit } from '../../stores/UIStore';
import { useTaskStore } from '../../stores/TaskStore';
import { customFieldIdFromColumnKey, customFieldEditField, customFieldIdFromEditField, isCustomFieldColumnKey } from './sidebarColumns';
import { formatDateOnly } from '../../utils/dateOnly';
import type { FetchEditMetaOptions } from '../../stores/EditMetaStore';

type Params = {
    settings: InlineEditSettings;
    editMetaByTaskId: Record<string, TaskEditMeta>;
    fetchEditMeta: (taskId: string, options?: FetchEditMetaOptions) => Promise<TaskEditMeta>;
    selectTask: (taskId: string) => void;
    setActiveInlineEdit: (value: ActiveInlineEdit | null, ownerSessionId?: string) => void;
};

let nextInlineEditSessionId = 0;

const createInlineEditSessionId = () => `inline-edit-${++nextInlineEditSessionId}`;

export const useSidebarInlineEdit = ({
    settings,
    editMetaByTaskId,
    fetchEditMeta,
    selectTask,
    setActiveInlineEdit
}: Params) => {
    const latestSessionIdRef = React.useRef<string | null>(null);

    const metaMatchesTaskContext = React.useCallback((meta: TaskEditMeta | undefined, task: Task) => {
        const context = meta?.capabilityContext;
        if (!context) return true;
        return context.taskId === task.id &&
            context.projectId === Number(task.projectId) &&
            context.trackerId === task.trackerId &&
            context.statusId === task.statusId;
    }, []);

    const isInlineEditEnabled = React.useCallback((key: keyof InlineEditSettings, defaultValue: boolean) => {
        const value = settings[key];
        if (value === undefined) return defaultValue;
        return String(value) === '1';
    }, [settings]);

    const toDateInputValue = React.useCallback((timestamp: number | undefined) => {
        if (timestamp === undefined || !Number.isFinite(timestamp)) return '';
        return formatDateOnly(timestamp) ?? '';
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
        if (columnKey === 'author') return null;
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
            const candidateMeta = providedMeta || editMetaByTaskId[task.id];
            const meta = metaMatchesTaskContext(candidateMeta, task) ? candidateMeta : undefined;
            if (!meta) return true;
            if (!meta.editable.customFieldValues) return false;
            return meta.options.customFields.some((cf) => String(cf.id) === customFieldId);
        }



        const candidateMeta = providedMeta || editMetaByTaskId[task.id];
        const meta = metaMatchesTaskContext(candidateMeta, task) ? candidateMeta : undefined;
        if (field === 'startDate' || field === 'dueDate') {
            const mappedField = field === 'startDate' ? 'start_date' : 'due_date';
            if (meta?.editable) {
                const editableMap = meta.editable as Record<string, boolean>;
                if (editableMap[mappedField] === false) return false;
            }
        }

        if (field === 'subject') return isInlineEditEnabled('inline_edit_subject', true);
        if (field === 'assignedToId') return isInlineEditEnabled('inline_edit_assigned_to', true);
        if (field === 'statusId') return isInlineEditEnabled('inline_edit_status', true);
        if (field === 'ratioDone') return isInlineEditEnabled('inline_edit_done_ratio', true);
        if (field === 'dueDate') return isInlineEditEnabled('inline_edit_due_date', true);
        if (field === 'startDate') return isInlineEditEnabled('inline_edit_start_date', true);
        if (field === 'estimatedHours') return isInlineEditEnabled('inline_edit_estimated_hours', true);

        if (meta?.editable) {
            const editableMap = meta.editable as Record<string, boolean>;
            if (editableMap[field] === false) return false;
        }

        return ['priorityId', 'categoryId', 'estimatedHours', 'projectId', 'trackerId', 'fixedVersionId'].includes(field);
    }, [editMetaByTaskId, isInlineEditEnabled, metaMatchesTaskContext]);

    const ensureEditMeta = React.useCallback(async (taskId: string): Promise<TaskEditMeta | null> => {
        try {
            // The store validates the cache against the current effective Task
            // context, including local patches.  Do not short-circuit here or
            // Auto-save OFF edits would keep using old Workflow metadata.
            return await fetchEditMeta(taskId);
        } catch {
            return null;
        }
    }, [fetchEditMeta]);

    const startCellEdit = React.useCallback(async (task: Task, field: string) => {
        if (!shouldEnableField(field, task)) return;

        // Guard against redundant activation if already editing this cell
        const currentActive = useUIStore.getState().activeInlineEdit;
        if (currentActive?.taskId === task.id && currentActive?.field === field && currentActive?.source === 'cell') {
            return;
        }

        const sessionId = createInlineEditSessionId();
        latestSessionIdRef.current = sessionId;

        selectTask(task.id);

        const requiresMeta = [
            'assignedToId', 'statusId', 'priorityId',
            'categoryId', 'projectId', 'trackerId', 'fixedVersionId',
            'startDate', 'dueDate'
        ].includes(field);
        const needsCustomFieldMeta = customFieldIdFromEditField(field) !== null;

        if (requiresMeta || needsCustomFieldMeta) {
            const meta = await ensureEditMeta(task.id);
            if (!meta) return;
            const latestTask = useTaskStore.getState().allTasks.find((candidate) => candidate.id === task.id);
            if (!latestTask || !metaMatchesTaskContext(meta, latestTask)) return;
            if (!shouldEnableField(field, latestTask, meta)) return;
        }

        if (latestSessionIdRef.current !== sessionId) return;
        setActiveInlineEdit({ taskId: task.id, field, source: 'cell', sessionId });
    }, [ensureEditMeta, metaMatchesTaskContext, selectTask, setActiveInlineEdit, shouldEnableField]);

    const closeInlineEdit = React.useCallback((sessionId?: string) => {
        const activeEdit = useUIStore.getState().activeInlineEdit;
        if (sessionId !== undefined && activeEdit?.sessionId !== sessionId) return;

        setActiveInlineEdit(null, sessionId);
        if (sessionId === undefined || latestSessionIdRef.current === sessionId) {
            latestSessionIdRef.current = null;
        }
    }, [setActiveInlineEdit]);

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
        closeInlineEdit,
        save
    };
};
