import { create } from 'zustand';
import { AutoScheduleMoveMode, RelationType, type AutoScheduleMoveMode as AutoScheduleMoveModeValue, type DefaultRelationType } from '../types/constraints';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { buildRedmineUrl } from '../utils/redmineUrl';
import {
    buildColumnSettingsFromVisibleKeys,
    moveColumnSetting,
    normalizeColumnSettings,
    resetColumnSettings,
    toggleColumnSetting,
    type ColumnConfig
} from '../components/sidebar/sidebarColumnSettings';
import { getColumnDefinitions, getDefaultVisibleColumnKeys } from '../components/sidebar/sidebarColumnCatalog';

export const DEFAULT_COLUMNS = ['id', 'subject', 'notification', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone'];

const COLUMN_DEFINITIONS = getColumnDefinitions();
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
    showBaseline: boolean;
    visibleColumns: string[];
    columnSettings: ColumnConfig[];
    columnWidths: Record<string, number>;
    sidebarWidth: number;
    leftPaneVisible: boolean;
    rightPaneVisible: boolean;
    activeInlineEdit: { taskId: string; field: string; source?: 'cell' | 'panel' } | null;
    isFullScreen: boolean;
    issueDialogUrl: string | null;
    queryDialogUrl: string | null;
    savedQueriesReloadToken: number;
    isHelpDialogOpen: boolean;
    isSidebarResizing: boolean;
    defaultRelationType: DefaultRelationType;
    autoCalculateDelay: boolean;
    autoApplyDefaultRelation: boolean;
    autoScheduleMoveMode: AutoScheduleMoveModeValue;
    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
    toggleBaseline: () => void;
    setShowBaseline: (value: boolean) => void;
    togglePointsOrphans: () => void;
    toggleLeftPane: () => void;
    toggleRightPane: () => void;
    showPointsOrphans: boolean;
    setVisibleColumns: (cols: string[]) => void;
    toggleColumnVisibility: (key: string) => void;
    moveColumnUp: (key: string) => void;
    moveColumnDown: (key: string) => void;
    resetColumns: () => void;
    setColumnWidth: (key: string, width: number) => void;
    setSidebarWidth: (width: number) => void;
    setActiveInlineEdit: (value: { taskId: string; field: string; source?: 'cell' | 'panel' } | null) => void;
    setFullScreen: (value: boolean) => void;
    toggleFullScreen: () => void;
    openIssueDialog: (url: string) => void;
    closeIssueDialog: () => void;
    openQueryDialog: (url: string) => void;
    closeQueryDialog: () => void;
    openHelpDialog: () => void;
    closeHelpDialog: () => void;
    setSidebarResizing: (value: boolean) => void;
    setDefaultRelationType: (value: DefaultRelationType) => void;
    setAutoCalculateDelay: (value: boolean) => void;
    setAutoApplyDefaultRelation: (value: boolean) => void;
    setAutoScheduleMoveMode: (value: AutoScheduleMoveModeValue) => void;
    resetRelationPreferences: () => void;
}

const DEFAULT_RELATION_TYPE = RelationType.Precedes;
const defaultColumnSettings = buildColumnSettingsFromVisibleKeys(COLUMN_DEFINITIONS, getDefaultVisibleColumnKeys());
export const DEFAULT_COLUMN_SETTINGS = defaultColumnSettings;

const toVisibleColumns = (columnSettings: ColumnConfig[]) => columnSettings.filter((entry) => entry.visible).map((entry) => entry.key);

const persistColumnSettings = (columnSettings: ColumnConfig[]) => {
    savePreferences({ columnSettings, visibleColumns: toVisibleColumns(columnSettings) });
};

export const useUIStore = create<UIState>((set, get) => ({
    notifications: [],
    showProgressLine: preferences.showProgressLine ?? false,
    showBaseline: preferences.showBaseline ?? false,
    showPointsOrphans: preferences.showPointsOrphans ?? true,
    leftPaneVisible: true,
    rightPaneVisible: true,
    visibleColumns: preferences.visibleColumns ?? DEFAULT_COLUMNS,
    columnSettings: preferences.columnSettings
        ? normalizeColumnSettings(COLUMN_DEFINITIONS, preferences.columnSettings)
        : defaultColumnSettings,
    columnWidths: preferences.columnWidths ?? {
        id: 72,
        notification: 44,
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
    queryDialogUrl: null,
    savedQueriesReloadToken: 0,
    isHelpDialogOpen: false,
    isSidebarResizing: false,
    defaultRelationType: preferences.defaultRelationType ?? DEFAULT_RELATION_TYPE,
    autoCalculateDelay: preferences.autoCalculateDelay ?? true,
    autoApplyDefaultRelation: preferences.autoApplyDefaultRelation ?? true,
    autoScheduleMoveMode: preferences.autoScheduleMoveMode ?? AutoScheduleMoveMode.ConstraintPush,
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
    toggleBaseline: () => set((state) => ({ showBaseline: !state.showBaseline })),
    setShowBaseline: (value) => set(() => ({ showBaseline: value })),
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
    setVisibleColumns: (cols) => {
        const next = buildColumnSettingsFromVisibleKeys(COLUMN_DEFINITIONS, cols);
        set(() => ({ visibleColumns: cols, columnSettings: next }));
        persistColumnSettings(next);
    },
    toggleColumnVisibility: (key) => {
        const next = toggleColumnSetting(get().columnSettings, key);
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next }));
        persistColumnSettings(next);
    },
    moveColumnUp: (key) => {
        const next = moveColumnSetting(get().columnSettings, key, 'up');
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next }));
        persistColumnSettings(next);
    },
    moveColumnDown: (key) => {
        const next = moveColumnSetting(get().columnSettings, key, 'down');
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next }));
        persistColumnSettings(next);
    },
    resetColumns: () => {
        const next = resetColumnSettings(COLUMN_DEFINITIONS);
        set(() => ({ visibleColumns: DEFAULT_COLUMNS, columnSettings: next }));
        persistColumnSettings(next);
    },
    setColumnWidth: (key, width) => set((state) => ({ columnWidths: { ...state.columnWidths, [key]: width } })),
    setSidebarWidth: (width) => set(() => ({ sidebarWidth: width })),
    setActiveInlineEdit: (value) => set(() => ({ activeInlineEdit: value })),
    setFullScreen: (value) => set(() => ({ isFullScreen: value })),
    toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),
    openIssueDialog: (url) => set(() => ({ issueDialogUrl: buildRedmineUrl(url) })),
    closeIssueDialog: () => set(() => ({ issueDialogUrl: null })),
    openQueryDialog: (url) => set(() => ({ queryDialogUrl: buildRedmineUrl(url) })),
    closeQueryDialog: () => set((state) => ({
        queryDialogUrl: null,
        savedQueriesReloadToken: state.savedQueriesReloadToken + 1
    })),
    openHelpDialog: () => set(() => ({ isHelpDialogOpen: true })),
    closeHelpDialog: () => set(() => ({ isHelpDialogOpen: false })),
    setSidebarResizing: (value) => set(() => ({ isSidebarResizing: value })),
    setDefaultRelationType: (value) => set(() => ({ defaultRelationType: value })),
    setAutoCalculateDelay: (value) => set(() => ({ autoCalculateDelay: value })),
    setAutoApplyDefaultRelation: (value) => set(() => ({ autoApplyDefaultRelation: value })),
    setAutoScheduleMoveMode: (value) => set(() => ({ autoScheduleMoveMode: value })),
    resetRelationPreferences: () => set(() => ({
        defaultRelationType: DEFAULT_RELATION_TYPE,
        autoCalculateDelay: true,
        autoApplyDefaultRelation: true,
        autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush
    }))
}));
