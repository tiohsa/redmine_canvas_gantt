import { create } from 'zustand';
import { AutoScheduleMoveMode, RelationType, type AutoScheduleMoveMode as AutoScheduleMoveModeValue, type DefaultRelationType } from '../types/constraints';
import { loadDisplayPreferencesWithSource, loadPreferences, type DisplayPreferencesSource, type StoredDisplayPreferences } from '../utils/preferences';
import { buildRedmineUrl } from '../utils/redmineUrl';
import {
    buildColumnSettingsFromVisibleKeys,
    DEFAULT_VISIBLE_COLUMN_KEY_LIST,
    moveColumnSetting,
    normalizeColumnSettings,
    resetColumnSettings,
    toggleColumnSetting,
    type ColumnConfig
} from '../components/sidebar/sidebarColumnSettings';
import { getColumnDefinitions, getDefaultVisibleColumnKeys } from '../components/sidebar/sidebarColumnCatalog';

export const DEFAULT_COLUMNS = [...DEFAULT_VISIBLE_COLUMN_KEY_LIST];

const COLUMN_DEFINITIONS = getColumnDefinitions();
const generalPreferences = loadPreferences();

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
    id: string;
    message: string;
    type: NotificationType;
}

export type ActiveInlineEdit = {
    taskId: string;
    field: string;
    source?: 'cell' | 'panel';
    sessionId?: string;
};

interface UIState {
    notifications: Notification[];
    showProgressLine: boolean;
    showTaskTitles: boolean;
    showTaskBarDates: boolean;
    showHierarchyLines: boolean;
    showBaseline: boolean;
    showStartDateOnly: boolean;
    showDueDateOnly: boolean;
    visibleColumns: string[];
    columnSettings: ColumnConfig[];
    columnWidths: Record<string, number>;
    sidebarWidth: number;
    leftPaneVisible: boolean;
    rightPaneVisible: boolean;
    activeInlineEdit: ActiveInlineEdit | null;
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
    sidebarFontSize: number;
    displayPreferencesSource: DisplayPreferencesSource;
    displayPreferencesGlobalEnabled: boolean;
    columnStateSource: ColumnStateSource;
    columnsExplicitInQuery: boolean;
    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
    toggleTaskTitles: () => void;
    toggleTaskBarDates: () => void;
    toggleHierarchyLines: () => void;
    toggleBaseline: () => void;
    setShowBaseline: (value: boolean) => void;
    togglePointsOrphans: () => void;
    toggleStartDateOnly: () => void;
    toggleDueDateOnly: () => void;
    toggleLeftPane: () => void;
    toggleRightPane: () => void;
    showPointsOrphans: boolean;
    setVisibleColumns: (cols: string[]) => void;
    applyQueryVisibleColumns: (cols: string[]) => void;
    restorePreferenceColumns: () => void;
    setColumnSettings: (settings: ColumnConfig[]) => void;
    toggleColumnVisibility: (key: string) => void;
    moveColumnUp: (key: string) => void;
    moveColumnDown: (key: string) => void;
    resetColumns: () => void;
    setColumnWidth: (key: string, width: number) => void;
    setSidebarWidth: (width: number) => void;
    setActiveInlineEdit: (value: ActiveInlineEdit | null, ownerSessionId?: string) => void;
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
    setSidebarFontSize: (size: number) => void;
    setDisplayPreferencesGlobalEnabled: (enabled: boolean) => void;
    resetRelationPreferences: () => void;
}

export type ColumnStateSource = 'preference' | 'query' | 'user';

const DEFAULT_RELATION_TYPE = RelationType.Precedes;
const defaultColumnSettings = buildColumnSettingsFromVisibleKeys(COLUMN_DEFINITIONS, getDefaultVisibleColumnKeys());
export const DEFAULT_COLUMN_SETTINGS = defaultColumnSettings;

const toVisibleColumns = (columnSettings: ColumnConfig[]) => columnSettings.filter((entry) => entry.visible).map((entry) => entry.key);
const normalizeDisplayColumns = (preferences: Pick<StoredDisplayPreferences, 'visibleColumns' | 'columnSettings'>) => {
    if (preferences.columnSettings) {
        const normalizedSettings = normalizeColumnSettings(COLUMN_DEFINITIONS, preferences.columnSettings);
        const explicitSettingKeys = new Set(preferences.columnSettings.map((entry) => entry.key));
        const visibleColumnKeys = new Set(preferences.visibleColumns ?? []);
        const columnSettings = preferences.visibleColumns
            ? normalizedSettings.map((entry) => ({
                ...entry,
                visible: explicitSettingKeys.has(entry.key) ? entry.visible : visibleColumnKeys.has(entry.key)
            }))
            : normalizedSettings;
        return { columnSettings, visibleColumns: toVisibleColumns(columnSettings) };
    }

    const visibleColumns = preferences.visibleColumns ?? DEFAULT_COLUMNS;
    return {
        visibleColumns,
        columnSettings: preferences.visibleColumns
            ? normalizeColumnSettings(COLUMN_DEFINITIONS, preferences.visibleColumns)
            : defaultColumnSettings
    };
};
const loadedDisplayPreferences = loadDisplayPreferencesWithSource();
const displayPreferences = loadedDisplayPreferences.preferences;
const displayPreferencesSource: DisplayPreferencesSource = loadedDisplayPreferences.source;
const initialDisplayColumns = normalizeDisplayColumns(displayPreferences);

const normalizeQueryColumns = (columns: string[], currentSettings: ColumnConfig[]): ColumnConfig[] => {
    const knownKeys = new Set([
        ...COLUMN_DEFINITIONS.map((definition) => definition.key),
        ...currentSettings.map((entry) => entry.key)
    ]);
    const isKnownKey = (key: string) => knownKeys.has(key) || /^cf:\d+$/.test(key);
    const normalizedKeys = Array.from(new Set(columns.filter(isKnownKey)));
    const visibleKeys = new Set(normalizedKeys);
    const hiddenKeys = currentSettings
        .map((entry) => entry.key)
        .filter((key) => !visibleKeys.has(key));

    return [
        ...normalizedKeys.map((key) => ({ key, visible: true })),
        ...hiddenKeys.map((key) => ({ key, visible: false }))
    ];
};

export const useUIStore = create<UIState>((set, get) => ({
    notifications: [],
    showProgressLine: displayPreferences.showProgressLine ?? false,
    showTaskTitles: displayPreferences.showTaskTitles ?? true,
    showTaskBarDates: displayPreferences.showTaskBarDates ?? false,
    showHierarchyLines: displayPreferences.showHierarchyLines ?? true,
    showBaseline: displayPreferences.showBaseline ?? false,
    showPointsOrphans: displayPreferences.showPointsOrphans ?? true,
    showStartDateOnly: displayPreferences.showStartDateOnly ?? displayPreferences.showPointsOrphans ?? true,
    showDueDateOnly: displayPreferences.showDueDateOnly ?? displayPreferences.showPointsOrphans ?? true,
    leftPaneVisible: true,
    rightPaneVisible: true,
    visibleColumns: initialDisplayColumns.visibleColumns,
    columnSettings: initialDisplayColumns.columnSettings,
    columnWidths: displayPreferences.columnWidths ?? {
        id: 72,
        notification: 44,
        subject: 280,
        status: 100,
        assignee: 80,
        startDate: 90,
        dueDate: 90,
        ratioDone: 80
    },
    sidebarWidth: displayPreferences.sidebarWidth ?? 400,
    activeInlineEdit: null,
    isFullScreen: false,
    issueDialogUrl: null,
    queryDialogUrl: null,
    savedQueriesReloadToken: 0,
    isHelpDialogOpen: false,
    isSidebarResizing: false,
    defaultRelationType: generalPreferences.defaultRelationType ?? DEFAULT_RELATION_TYPE,
    autoCalculateDelay: generalPreferences.autoCalculateDelay ?? true,
    autoApplyDefaultRelation: generalPreferences.autoApplyDefaultRelation ?? true,
    autoScheduleMoveMode: generalPreferences.autoScheduleMoveMode ?? AutoScheduleMoveMode.ConstraintPush,
    sidebarFontSize: displayPreferences.sidebarFontSize ?? 13,
    displayPreferencesSource,
    displayPreferencesGlobalEnabled: loadedDisplayPreferences.globalEnabled,
    columnStateSource: 'preference',
    columnsExplicitInQuery: false,
    addNotification: (message, type = 'info') => {
        if (get().notifications.some((notification) => (
            notification.message === message && notification.type === type
        ))) return;

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
    toggleTaskTitles: () => set((state) => ({ showTaskTitles: !state.showTaskTitles })),
    toggleTaskBarDates: () => set((state) => ({ showTaskBarDates: !state.showTaskBarDates })),
    toggleHierarchyLines: () => set((state) => ({ showHierarchyLines: !state.showHierarchyLines })),
    toggleBaseline: () => set((state) => ({ showBaseline: !state.showBaseline })),
    setShowBaseline: (value) => set(() => ({ showBaseline: value })),
    togglePointsOrphans: () => set((state) => {
        const next = !state.showPointsOrphans;
        return { showPointsOrphans: next, showStartDateOnly: next, showDueDateOnly: next };
    }),
    toggleStartDateOnly: () => set((state) => ({ showStartDateOnly: !state.showStartDateOnly })),
    toggleDueDateOnly: () => set((state) => ({ showDueDateOnly: !state.showDueDateOnly })),
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
        const next = normalizeQueryColumns(cols, get().columnSettings);
        set(() => ({
            visibleColumns: toVisibleColumns(next),
            columnSettings: next,
            columnStateSource: 'user',
            columnsExplicitInQuery: true
        }));
    },
    applyQueryVisibleColumns: (cols) => {
        const next = normalizeQueryColumns(cols, get().columnSettings);
        set(() => ({
            visibleColumns: toVisibleColumns(next),
            columnSettings: next,
            columnStateSource: 'query',
            columnsExplicitInQuery: true
        }));
    },
    restorePreferenceColumns: () => {
        const preferences = loadDisplayPreferencesWithSource().preferences;
        const columns = normalizeDisplayColumns(preferences);
        set(() => ({
            visibleColumns: columns.visibleColumns,
            columnSettings: columns.columnSettings,
            columnStateSource: 'preference',
            columnsExplicitInQuery: false
        }));
    },
    setColumnSettings: (settings) => {
        const next = settings.map((entry) => ({ ...entry }));
        set(() => ({
            visibleColumns: toVisibleColumns(next),
            columnSettings: next,
            columnStateSource: 'user',
            columnsExplicitInQuery: true
        }));
    },
    toggleColumnVisibility: (key) => {
        const next = toggleColumnSetting(get().columnSettings, key);
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next, columnStateSource: 'user', columnsExplicitInQuery: true }));
    },
    moveColumnUp: (key) => {
        const next = moveColumnSetting(get().columnSettings, key, 'up');
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next, columnStateSource: 'user', columnsExplicitInQuery: true }));
    },
    moveColumnDown: (key) => {
        const next = moveColumnSetting(get().columnSettings, key, 'down');
        set(() => ({ visibleColumns: toVisibleColumns(next), columnSettings: next, columnStateSource: 'user', columnsExplicitInQuery: true }));
    },
    resetColumns: () => {
        const next = resetColumnSettings(COLUMN_DEFINITIONS);
        set(() => ({ visibleColumns: DEFAULT_COLUMNS, columnSettings: next, columnStateSource: 'user', columnsExplicitInQuery: true }));
    },
    setColumnWidth: (key, width) => set((state) => ({ columnWidths: { ...state.columnWidths, [key]: width } })),
    setSidebarWidth: (width) => set(() => ({ sidebarWidth: width })),
    setActiveInlineEdit: (value, ownerSessionId) => set((state) => {
        if (
            value === null &&
            ownerSessionId !== undefined &&
            state.activeInlineEdit?.sessionId !== ownerSessionId
        ) {
            return {};
        }
        return { activeInlineEdit: value };
    }),
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
    setSidebarFontSize: (size) => set(() => ({ sidebarFontSize: size })),
    setDisplayPreferencesGlobalEnabled: (enabled) => set(() => ({ displayPreferencesGlobalEnabled: enabled })),
    resetRelationPreferences: () => set(() => ({
        defaultRelationType: DEFAULT_RELATION_TYPE,
        autoCalculateDelay: true,
        autoApplyDefaultRelation: true,
        autoScheduleMoveMode: AutoScheduleMoveMode.ConstraintPush
    }))
}));
