import { savePreferences } from '../utils/preferences';
import { useTaskStore } from './TaskStore';
import { useUIStore } from './UIStore';

const persistSelections = () => {
    const taskState = useTaskStore.getState();
    const uiState = useUIStore.getState();

    savePreferences({
        zoomLevel: taskState.zoomLevel,
        viewMode: taskState.viewMode,
        viewport: {
            startDate: taskState.viewport.startDate,
            scrollX: taskState.viewport.scrollX,
            scrollY: taskState.viewport.scrollY,
            scale: taskState.viewport.scale
        },
        showProgressLine: uiState.showProgressLine,
        showPointsOrphans: uiState.showPointsOrphans,
        showVersions: taskState.showVersions,
        visibleColumns: uiState.visibleColumns,
        groupByProject: taskState.groupByProject,
        groupByAssignee: taskState.groupByAssignee,
        organizeByDependency: taskState.organizeByDependency,
        columnWidths: uiState.columnWidths,
        sidebarWidth: uiState.sidebarWidth,
        selectedAssigneeIds: taskState.selectedAssigneeIds,
        selectedProjectIds: taskState.selectedProjectIds,
        selectedVersionIds: taskState.selectedVersionIds,
        customScales: taskState.customScales,
        rowHeight: taskState.viewport.rowHeight,
        selectedStatusIds: taskState.selectedStatusIds,
        sortConfig: taskState.sortConfig,
        autoSave: taskState.autoSave
    });
};

useTaskStore.subscribe(persistSelections);
useUIStore.subscribe(persistSelections);
