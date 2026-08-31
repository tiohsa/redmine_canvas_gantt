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
import { syncSharedQueryState, type SharedQuerySyncState } from './taskStore/querySync';

type TaskStoreState = ReturnType<typeof useTaskStore.getState>;
type UIStoreState = ReturnType<typeof useUIStore.getState>;

type DisplayPreferenceSnapshot = {
    zoomLevel: TaskStoreState['zoomLevel'];
    viewMode: TaskStoreState['viewMode'];
    viewport: Pick<TaskStoreState['viewport'], 'startDate' | 'scrollX' | 'scrollY' | 'scale'>;
    showProgressLine: UIStoreState['showProgressLine'];
    showTaskTitles: UIStoreState['showTaskTitles'];
    showTaskBarDates: UIStoreState['showTaskBarDates'];
    showHierarchyLines: UIStoreState['showHierarchyLines'];
    showBaseline: UIStoreState['showBaseline'];
    showPointsOrphans: UIStoreState['showPointsOrphans'];
    showStartDateOnly: UIStoreState['showStartDateOnly'];
    showDueDateOnly: UIStoreState['showDueDateOnly'];
    showVersions: TaskStoreState['showVersions'];
    visibleColumns: UIStoreState['visibleColumns'] | undefined;
    columnSettings: UIStoreState['columnSettings'] | undefined;
    organizeByDependency: TaskStoreState['organizeByDependency'];
    columnWidths: UIStoreState['columnWidths'];
    sidebarWidth: UIStoreState['sidebarWidth'];
    customScales: TaskStoreState['customScales'];
    rowHeight: TaskStoreState['viewport']['rowHeight'];
    sidebarFontSize: UIStoreState['sidebarFontSize'];
    autoSave: TaskStoreState['autoSave'];
    displayPreferencesGlobalEnabled: UIStoreState['displayPreferencesGlobalEnabled'];
};

type GeneralPreferenceSnapshot = {
    autoSave: TaskStoreState['autoSave'];
    defaultRelationType: UIStoreState['defaultRelationType'];
    autoCalculateDelay: UIStoreState['autoCalculateDelay'];
    autoApplyDefaultRelation: UIStoreState['autoApplyDefaultRelation'];
    autoScheduleMoveMode: UIStoreState['autoScheduleMoveMode'];
};

type QueryPreferenceSnapshot = SharedQuerySyncState;

const areSnapshotsEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (typeof left !== typeof right || left === null || right === null) return false;

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
        return left.every((value, index) => areSnapshotsEqual(value, right[index]));
    }

    if (typeof left !== 'object' || typeof right !== 'object') return false;

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => (
        Object.prototype.hasOwnProperty.call(rightRecord, key)
        && areSnapshotsEqual(leftRecord[key], rightRecord[key])
    ));
};

const selectDisplayPreferenceSnapshot = (
    taskState: TaskStoreState,
    uiState: UIStoreState
): DisplayPreferenceSnapshot => {
    const queryColumnsActive = uiState.columnStateSource === 'query';
    return {
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
        showStartDateOnly: uiState.showStartDateOnly,
        showDueDateOnly: uiState.showDueDateOnly,
        showVersions: taskState.showVersions,
        visibleColumns: queryColumnsActive ? undefined : uiState.visibleColumns,
        columnSettings: queryColumnsActive ? undefined : uiState.columnSettings,
        organizeByDependency: taskState.organizeByDependency,
        columnWidths: uiState.columnWidths,
        sidebarWidth: uiState.sidebarWidth,
        customScales: taskState.customScales,
        rowHeight: taskState.viewport.rowHeight,
        sidebarFontSize: uiState.sidebarFontSize,
        autoSave: taskState.autoSave,
        displayPreferencesGlobalEnabled: uiState.displayPreferencesGlobalEnabled
    };
};

const selectGeneralPreferenceSnapshot = (
    taskState: TaskStoreState,
    uiState: UIStoreState
): GeneralPreferenceSnapshot => ({
    autoSave: taskState.autoSave,
    defaultRelationType: uiState.defaultRelationType,
    autoCalculateDelay: uiState.autoCalculateDelay,
    autoApplyDefaultRelation: uiState.autoApplyDefaultRelation,
    autoScheduleMoveMode: uiState.autoScheduleMoveMode
});

const selectQueryPreferenceSnapshot = (
    taskState: TaskStoreState,
    uiState: UIStoreState
): QueryPreferenceSnapshot => ({
    activeQueryId: taskState.activeQueryId,
    queryContext: taskState.queryContext,
    selectedStatusIds: taskState.selectedStatusIds,
    selectedAssigneeIds: taskState.selectedAssigneeIds,
    selectedProjectIds: taskState.selectedProjectIds,
    projectSelectionExplicit: taskState.projectSelectionExplicit,
    selectedVersionIds: taskState.selectedVersionIds,
    selectedTrackerIds: taskState.selectedTrackerIds,
    memberProjectsOnly: taskState.memberProjectsOnly,
    sortConfig: taskState.sortConfig,
    groupByProject: taskState.groupByProject,
    groupByAssignee: taskState.groupByAssignee,
    showSubprojects: taskState.showSubprojects,
    visibleColumns: uiState.columnsExplicitInQuery ? uiState.visibleColumns : undefined,
    columnsExplicitInQuery: uiState.columnsExplicitInQuery
});

const persistDisplayPreferences = (taskState: TaskStoreState, uiState: UIStoreState): void => {
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
        showStartDateOnly: uiState.showStartDateOnly,
        showDueDateOnly: uiState.showDueDateOnly,
        showVersions: taskState.showVersions,
        visibleColumns: queryColumnsActive ? personalDisplayPreferences.visibleColumns : uiState.visibleColumns,
        columnSettings: queryColumnsActive ? personalDisplayPreferences.columnSettings : uiState.columnSettings,
        organizeByDependency: taskState.organizeByDependency,
        columnWidths: uiState.columnWidths,
        sidebarWidth: uiState.sidebarWidth,
        customScales: taskState.customScales,
        rowHeight: taskState.viewport.rowHeight,
        sidebarFontSize: uiState.sidebarFontSize,
        autoSave: taskState.autoSave
    });

    if (uiState.displayPreferencesGlobalEnabled) {
        saveGlobalDisplayPreferences(displaySnapshot);
    } else {
        saveDisplayPreferences(displaySnapshot);
    }
};

const persistGeneralPreferences = (taskState: TaskStoreState, uiState: UIStoreState): void => {
    savePreferences(buildStoredGeneralPreferences({
        autoSave: taskState.autoSave,
        defaultRelationType: uiState.defaultRelationType,
        autoCalculateDelay: uiState.autoCalculateDelay,
        autoApplyDefaultRelation: uiState.autoApplyDefaultRelation,
        autoScheduleMoveMode: uiState.autoScheduleMoveMode
    }));
};

const persistQueryState = (taskState: TaskStoreState, uiState: UIStoreState): void => {
    syncSharedQueryState(selectQueryPreferenceSnapshot(taskState, uiState));
};

let wasReady = useTaskStore.getState().initialDataLoaded;
let previousDisplayPreferences = selectDisplayPreferenceSnapshot(useTaskStore.getState(), useUIStore.getState());
let previousGeneralPreferences = selectGeneralPreferenceSnapshot(useTaskStore.getState(), useUIStore.getState());
let previousQueryState = selectQueryPreferenceSnapshot(useTaskStore.getState(), useUIStore.getState());

export const persistSelections = (): void => {
    const taskState = useTaskStore.getState();
    const uiState = useUIStore.getState();
    if (!taskState.initialDataLoaded) {
        wasReady = false;
        return;
    }

    const displayPreferences = selectDisplayPreferenceSnapshot(taskState, uiState);
    const generalPreferences = selectGeneralPreferenceSnapshot(taskState, uiState);
    const queryState = selectQueryPreferenceSnapshot(taskState, uiState);
    const forceInitialPersistence = !wasReady;

    if (forceInitialPersistence || !areSnapshotsEqual(previousDisplayPreferences, displayPreferences)) {
        persistDisplayPreferences(taskState, uiState);
    }
    if (forceInitialPersistence || !areSnapshotsEqual(previousGeneralPreferences, generalPreferences)) {
        persistGeneralPreferences(taskState, uiState);
    }
    if (forceInitialPersistence || !areSnapshotsEqual(previousQueryState, queryState)) {
        persistQueryState(taskState, uiState);
    }

    previousDisplayPreferences = displayPreferences;
    previousGeneralPreferences = generalPreferences;
    previousQueryState = queryState;
    wasReady = true;
};

useTaskStore.subscribe(persistSelections);
useUIStore.subscribe(persistSelections);
