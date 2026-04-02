import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof window !== 'undefined') {
    let storage: Storage | null = null;
    try {
        storage = window.localStorage;
    } catch {
        storage = null;
    }
    if (!storage || typeof storage.getItem !== 'function') {
        const store = new Map<string, string>();
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    store.set(key, String(value));
                },
                removeItem: (key: string) => {
                    store.delete(key);
                },
                clear: () => {
                    store.clear();
                }
            },
            configurable: true
        });
    }
}

// Mock RedmineCanvasGantt global object
window.RedmineCanvasGantt = {
    projectId: 1,
    apiBase: '',
    redmineBase: '',
    authToken: '',
    apiKey: '',
    nonWorkingWeekDays: [],
    i18n: {
        field_id: 'ID',
        field_subject: 'Task Name',
        field_status: 'Status',
        field_assigned_to: 'Assignee',
        field_start_date: 'Start Date',
        field_due_date: 'Due Date',
        field_done_ratio: 'Progress',
        button_collapse: 'Collapse',
        button_expand: 'Expand',
        label_sort_by: 'Sort by',
        label_project: 'Project',
        label_row_height: 'Row height',
        button_edit: 'Edit',
        button_delete: 'Delete',
        button_save: 'Save',
        button_reset: 'Reset',
        button_cancel: 'Cancel',
        label_loading: 'Loading...',
        label_notifications: 'Notifications',
        label_workload: 'Workload',
        label_show_workload: 'Show Workload Pane',
        label_capacity_threshold: 'Capacity Threshold (hours/day)',
        label_leaf_issues_only: 'Leaf Issues Only',
        label_include_closed_issues: 'Include Closed Issues',
        label_today_onward_only: 'Today Onward Only',
        label_relation_title: 'Dependency',
        label_relation_updated: 'Dependency updated',
        label_relation_delay_invalid: 'Delay must be 0 or greater',
        label_relation_delay_required: 'Delay is required for this relation type',
        label_relation_delay_mismatch: 'Delay does not match the current task dates.',
        label_relation_remove_failed: 'Failed to remove dependency',
        label_relation_removed: 'Dependency removed',
        label_relation_added: 'Dependency created',
        label_relation_already_exists: 'Relation already exists',
        label_relation_type_precedes: 'Precedes',
        label_relation_type_relates: 'Relates',
        label_relation_type_blocks: 'Blocks',
        label_relation_type_precedes_info: 'The predecessor task must finish before the successor task starts.',
        label_relation_type_relates_info: 'Creates a reference link only. It does not apply any schedule constraint.',
        label_relation_type_blocks_info: 'The source task blocks the target task until the blocking work is finished.',
        label_relation_auto_calculate_delay: 'Auto calculate delay',
        label_relation_auto_apply_default: 'Auto apply default relation',
        label_auto_schedule_move_mode: 'Auto scheduling move mode',
        label_auto_schedule_move_mode_off: 'Off',
        label_auto_schedule_move_mode_constraint_push: 'Constraint push',
        label_auto_schedule_move_mode_linked_shift: 'Linked downstream shift',
        label_export: 'Export',
        label_export_png: 'Export PNG',
        label_export_csv: 'Export CSV',
        label_export_unavailable: 'Export is unavailable in the current layout',
        label_export_failed: 'Export failed',
        help_desc_export: 'Export the current Gantt view as a PNG image, or download the visible task data as CSV including hierarchy and dependency columns.'
    },
    settings: {
        row_height: '32',
    }
};

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});
