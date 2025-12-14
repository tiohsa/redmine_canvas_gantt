import { create } from 'zustand';
import { loadPreferences } from '../utils/preferences';

export const DEFAULT_COLUMNS = ['status', 'assignee', 'startDate', 'dueDate', 'ratioDone'];
const preferences = loadPreferences();

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
    id: string;
    message: string;
    type: NotificationType;
}

interface UIState {
    notifications: Notification[];
    showProgressLine: boolean;
    visibleColumns: string[];
    columnWidths: Record<string, number>;
    sidebarWidth: number;
    activeInlineEdit: { taskId: string; field: string; source?: 'cell' | 'panel' } | null;
    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
    setVisibleColumns: (cols: string[]) => void;
    setColumnWidth: (key: string, width: number) => void;
    setSidebarWidth: (width: number) => void;
    setActiveInlineEdit: (value: { taskId: string; field: string; source?: 'cell' | 'panel' } | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    notifications: [],
    showProgressLine: preferences.showProgressLine ?? false,
    visibleColumns: preferences.visibleColumns
        ? Array.from(new Set([...preferences.visibleColumns, 'id']))
        : ['id', ...DEFAULT_COLUMNS],
    columnWidths: preferences.columnWidths ?? {
        id: 72,
        subject: 280,
        status: 100,
        assignee: 80,
        startDate: 90,
        dueDate: 90,
        ratioDone: 80
    },
    sidebarWidth: preferences.sidebarWidth ?? 400,
    activeInlineEdit: null,
    addNotification: (message, type = 'info') => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
            notifications: [...state.notifications, { id, message, type }]
        }));

        // Auto-remove after 3 seconds
        setTimeout(() => {
            set((state) => ({
                notifications: state.notifications.filter((n) => n.id !== id)
            }));
        }, 3000);
    },
    removeNotification: (id) =>
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
        })),
    toggleProgressLine: () => set((state) => ({ showProgressLine: !state.showProgressLine })),
    setVisibleColumns: (cols) => set(() => ({ visibleColumns: cols })),
    setColumnWidth: (key, width) => set((state) => ({ columnWidths: { ...state.columnWidths, [key]: width } })),
    setSidebarWidth: (width) => set(() => ({ sidebarWidth: width })),
    setActiveInlineEdit: (value) => set(() => ({ activeInlineEdit: value }))
}));
