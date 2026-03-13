import { create } from 'zustand';
import { RelationType, type DefaultRelationType } from '../types/constraints';
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
    leftPaneVisible: boolean;
    rightPaneVisible: boolean;
    activeInlineEdit: { taskId: string; field: string; source?: 'cell' | 'panel' } | null;
    isFullScreen: boolean;
    issueDialogUrl: string | null;
    isHelpDialogOpen: boolean;
    isSidebarResizing: boolean;
    defaultRelationType: DefaultRelationType;
    autoCalculateDelay: boolean;
    autoApplyDefaultRelation: boolean;
    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
    togglePointsOrphans: () => void;
    toggleLeftPane: () => void;
    toggleRightPane: () => void;
    showPointsOrphans: boolean;
    setVisibleColumns: (cols: string[]) => void;
    setColumnWidth: (key: string, width: number) => void;
    setSidebarWidth: (width: number) => void;
    setActiveInlineEdit: (value: { taskId: string; field: string; source?: 'cell' | 'panel' } | null) => void;
    setFullScreen: (value: boolean) => void;
    toggleFullScreen: () => void;
    openIssueDialog: (url: string) => void;
    closeIssueDialog: () => void;
    openHelpDialog: () => void;
    closeHelpDialog: () => void;
    setSidebarResizing: (value: boolean) => void;
    setDefaultRelationType: (value: DefaultRelationType) => void;
    setAutoCalculateDelay: (value: boolean) => void;
    setAutoApplyDefaultRelation: (value: boolean) => void;
    resetRelationPreferences: () => void;
}

const DEFAULT_RELATION_TYPE = RelationType.Precedes;

export const useUIStore = create<UIState>((set) => ({
    notifications: [],
    showProgressLine: preferences.showProgressLine ?? false,
    showPointsOrphans: preferences.showPointsOrphans ?? true,
    leftPaneVisible: true,
    rightPaneVisible: true,
    visibleColumns: preferences.visibleColumns
        ? preferences.visibleColumns
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
    isFullScreen: false,
    issueDialogUrl: null,
    isHelpDialogOpen: false,
    isSidebarResizing: false,
    defaultRelationType: preferences.defaultRelationType ?? DEFAULT_RELATION_TYPE,
    autoCalculateDelay: preferences.autoCalculateDelay ?? true,
    autoApplyDefaultRelation: preferences.autoApplyDefaultRelation ?? true,
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
    toggleProgressLine: () => set((state) => ({ showProgressLine: !state.showProgressLine })),
    togglePointsOrphans: () => set((state) => ({ showPointsOrphans: !state.showPointsOrphans })),
    toggleLeftPane: () => set((state) => {
        if (state.leftPaneVisible && state.rightPaneVisible) {
            return { leftPaneVisible: false, rightPaneVisible: true };
        }
        if (!state.leftPaneVisible && state.rightPaneVisible) {
            return { leftPaneVisible: true, rightPaneVisible: true };
        }
        return { leftPaneVisible: false, rightPaneVisible: true };
    }),
    toggleRightPane: () => set((state) => {
        if (state.leftPaneVisible && state.rightPaneVisible) {
            return { leftPaneVisible: true, rightPaneVisible: false };
        }
        if (state.leftPaneVisible && !state.rightPaneVisible) {
            return { leftPaneVisible: true, rightPaneVisible: true };
        }
        return { leftPaneVisible: true, rightPaneVisible: false };
    }),
    setVisibleColumns: (cols) => set(() => ({ visibleColumns: cols })),
    setColumnWidth: (key, width) => set((state) => ({ columnWidths: { ...state.columnWidths, [key]: width } })),
    setSidebarWidth: (width) => set(() => ({ sidebarWidth: width })),
    setActiveInlineEdit: (value) => set(() => ({ activeInlineEdit: value })),
    setFullScreen: (value) => set(() => ({ isFullScreen: value })),
    toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),
    openIssueDialog: (url) => set(() => ({ issueDialogUrl: url })),
    closeIssueDialog: () => set(() => ({ issueDialogUrl: null })),
    openHelpDialog: () => set(() => ({ isHelpDialogOpen: true })),
    closeHelpDialog: () => set(() => ({ isHelpDialogOpen: false })),
    setSidebarResizing: (value) => set(() => ({ isSidebarResizing: value })),
    setDefaultRelationType: (value) => set(() => ({ defaultRelationType: value })),
    setAutoCalculateDelay: (value) => set(() => ({ autoCalculateDelay: value })),
    setAutoApplyDefaultRelation: (value) => set(() => ({ autoApplyDefaultRelation: value })),
    resetRelationPreferences: () => set(() => ({
        defaultRelationType: DEFAULT_RELATION_TYPE,
        autoCalculateDelay: true,
        autoApplyDefaultRelation: true
    }))
}));
