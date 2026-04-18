import {
    buildStoredDisplayPreferences,
    buildStoredGeneralPreferences,
    saveDisplayPreferences,
    saveGlobalDisplayPreferences,
    savePreferences
} from '../utils/preferences';
import { useTaskStore } from './TaskStore';
import { useUIStore } from './UIStore';

const persistSelections = () => {
    const taskState = useTaskStore.getState();
    const uiState = useUIStore.getState();

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
        showHierarchyLines: uiState.showHierarchyLines,
        showBaseline: uiState.showBaseline,
        showPointsOrphans: uiState.showPointsOrphans,
        showVersions: taskState.showVersions,
        visibleColumns: uiState.visibleColumns,
        columnSettings: uiState.columnSettings,
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
};

useTaskStore.subscribe(persistSelections);
useUIStore.subscribe(persistSelections);
