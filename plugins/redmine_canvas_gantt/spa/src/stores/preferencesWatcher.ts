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
        visibleColumns: uiState.visibleColumns,
        groupByProject: taskState.groupByProject,
        organizeByDependency: taskState.organizeByDependency,
        columnWidths: uiState.columnWidths,
        sidebarWidth: uiState.sidebarWidth,
        selectedAssigneeIds: taskState.selectedAssigneeIds
    });
};

useTaskStore.subscribe(persistSelections);
useUIStore.subscribe(persistSelections);
