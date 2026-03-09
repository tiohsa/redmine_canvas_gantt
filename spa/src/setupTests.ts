import '@testing-library/jest-dom';

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
        button_cancel: 'Cancel',
        label_loading: 'Loading...',
        label_relation_title: 'Dependency',
        label_relation_updated: 'Dependency updated',
        label_relation_delete_confirmation: 'Delete this dependency?',
        label_relation_delay_invalid: 'Delay must be 0 or greater',
        label_relation_delay_required: 'Delay is required for this relation type',
        label_relation_remove_failed: 'Failed to remove dependency',
        label_relation_removed: 'Dependency removed',
        label_relation_added: 'Dependency created',
        label_relation_already_exists: 'Relation already exists',
        label_relation_type_precedes_info: 'The predecessor task must finish before the successor task starts.',
        label_relation_type_relates_info: 'Creates a reference link only. It does not apply any schedule constraint.',
        label_relation_type_blocks_info: 'The source task blocks the target task until the blocking work is finished.'
    },
    settings: {
        row_height: '32',
    }
};
