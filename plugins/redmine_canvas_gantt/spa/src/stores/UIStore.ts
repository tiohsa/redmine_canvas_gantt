import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
    id: string;
    message: string;
    type: NotificationType;
}

interface UIState {
    notifications: Notification[];
    showProgressLine: boolean;
    sidebarWidth: number;
    visibleColumns: string[];
    groupByProject: boolean;

    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
    setSidebarWidth: (width: number) => void;
    toggleColumn: (key: string) => void;
    toggleGroupByProject: () => void;
}

// Key for LocalStorage
const STORAGE_KEY = 'rcg-preferences';

const loadPreferences = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load preferences', e);
    }
    return {};
};

const savePreferences = (state: Partial<UIState>) => {
    try {
        const current = loadPreferences();
        const updated = {
            ...current,
            showProgressLine: state.showProgressLine ?? current.showProgressLine,
            sidebarWidth: state.sidebarWidth ?? current.sidebarWidth,
            visibleColumns: state.visibleColumns ?? current.visibleColumns,
            groupByProject: state.groupByProject ?? current.groupByProject
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn('Failed to save preferences', e);
    }
};

const defaults = {
    showProgressLine: false,
    sidebarWidth: 400,
    visibleColumns: ['subject', 'startDate', 'dueDate', 'status', 'ratioDone', 'assignee'],
    groupByProject: false
};

const initialPrefs = { ...defaults, ...loadPreferences() };

export const useUIStore = create<UIState>((set, get) => ({
    notifications: [],
    showProgressLine: initialPrefs.showProgressLine,
    sidebarWidth: initialPrefs.sidebarWidth,
    visibleColumns: initialPrefs.visibleColumns,
    groupByProject: initialPrefs.groupByProject,

    addNotification: (message, type = 'info') => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
            notifications: [...state.notifications, { id, message, type }]
        }));

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
    toggleProgressLine: () => {
        const newState = !get().showProgressLine;
        set({ showProgressLine: newState });
        savePreferences({ showProgressLine: newState });
    },
    setSidebarWidth: (width) => {
        set({ sidebarWidth: width });
        savePreferences({ sidebarWidth: width });
    },
    toggleColumn: (key) => {
        const current = get().visibleColumns;
        let next;
        if (current.includes(key)) {
            next = current.filter(k => k !== key);
        } else {
            next = [...current, key];
        }
        set({ visibleColumns: next });
        savePreferences({ visibleColumns: next });
    },
    toggleGroupByProject: () => {
        const newState = !get().groupByProject;
        set({ groupByProject: newState });
        savePreferences({ groupByProject: newState });
    }
}));
