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
        button_edit: 'Edit',
        button_delete: 'Delete',
        button_save: 'Save',
        button_cancel: 'Cancel',
        label_loading: 'Loading...'
    },
    settings: {
        row_height: '32'
    }
};
