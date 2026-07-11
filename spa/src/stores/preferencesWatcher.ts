import {
    buildStoredDisplayPreferences,
    buildStoredGeneralPreferences,
    loadDisplayPreferencesWithSource,
    saveDisplayPreferences,
    saveGlobalDisplayPreferences,
    savePreferences
} from '../utils/preferences';
import { useTaskStore } from './TaskStore';
import { useUIStore } from './UIStore';
import { syncSharedQueryState } from './taskStore/querySync';

const persistSelections = () => {
    const taskState = useTaskStore.getState();
    if (!taskState.initialDataLoaded) return;

    const uiState = useUIStore.getState();

    const personalDisplayPreferences = loadDisplayPreferencesWithSource().preferences;
    const queryColumnsActive = uiState.columnStateSource === 'query';
    const displaySnapshot = buildStoredDisplayPreferences({
        zoomLevel: taskState.zoomLevel,
        viewMode: taskState.viewMode,
        viewport: {
            startDate: taskState.viewport.startDate,
            scrollX: taskState.viewport.scrollX,
            scrollY: taskState.viewport.scrollY,
            scale: taskState.viewport.scale
        },
        showProgressLine: uiState.showProgressLine,
        showTaskTitles: uiState.showTaskTitles,
        showTaskBarDates: uiState.showTaskBarDates,
        showHierarchyLines: uiState.showHierarchyLines,
        showBaseline: uiState.showBaseline,
        showPointsOrphans: uiState.showPointsOrphans,
        showVersions: taskState.showVersions,
        visibleColumns: queryColumnsActive ? personalDisplayPreferences.visibleColumns : uiState.visibleColumns,
        columnSettings: queryColumnsActive ? personalDisplayPreferences.columnSettings : uiState.columnSettings,
        organizeByDependency: taskState.organizeByDependency,
        columnWidths: uiState.columnWidths,
        sidebarWidth: uiState.sidebarWidth,
        customScales: taskState.customScales,
        rowHeight: taskState.viewport.rowHeight,
        sidebarFontSize: uiState.sidebarFontSize
    });

    if (uiState.displayPreferencesGlobalEnabled) {
        saveGlobalDisplayPreferences(displaySnapshot);
    } else {
        saveDisplayPreferences(displaySnapshot);
    }

    savePreferences(buildStoredGeneralPreferences({
        autoSave: taskState.autoSave,
        defaultRelationType: uiState.defaultRelationType,
        autoCalculateDelay: uiState.autoCalculateDelay,
        autoApplyDefaultRelation: uiState.autoApplyDefaultRelation,
        autoScheduleMoveMode: uiState.autoScheduleMoveMode
    }));

    syncSharedQueryState({
        ...taskState,
        visibleColumns: uiState.columnsExplicitInQuery ? uiState.visibleColumns : undefined,
        columnsExplicitInQuery: uiState.columnsExplicitInQuery
    });
};

useTaskStore.subscribe(persistSelections);
useUIStore.subscribe(persistSelections);
