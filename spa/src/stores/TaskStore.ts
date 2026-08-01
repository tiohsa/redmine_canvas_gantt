import { create } from 'zustand';
import type { FilterOptions, Task, Relation, DraftRelation, Viewport, ViewMode, ZoomLevel, LayoutRow, Version, TaskStatus, SavedQuery } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences, saveDisplayPreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';
import { i18n } from '../utils/i18n';
import { useUIStore } from './UIStore';
import { useBaselineStore } from './BaselineStore';
import type { MoveTaskAsChildResult } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';
import type { LayoutState, SortConfig } from './taskStore/types';
import { buildLayout, getVersionRowId, NO_VERSION_ID } from './taskStore/layout';
import { applyFilters } from './taskStore/filters';
import { isDescendantTask, tailDisplayOrderForParent, tailDisplayOrderForRoot } from './taskStore/hierarchy';
import { computeCenteredViewport } from './taskStore/viewport';
import { buildMoveTaskResult, saveModifiedTasks } from './taskStore/taskPersistence';
import { runParentMove } from './taskStore/parentMove';
import { buildUniformExpansionMaps, initializeExpansionMaps } from './taskStore/expansion';
import { syncSharedQueryState, type SharedQuerySyncState } from './taskStore/querySync';
import {
    clearSavedQueryToStandalone,
    isQueryModified as getIsQueryModified,
    selectSavedQuery,
    setAssigneeOverride,
    setStatusOverride,
    setVersionOverride
} from '../query/queryState';
import type { QueryContext, QueryOverrides } from '../query/types';
import { resolvedStateToQueryContext } from '../query/queryStateCodec';
import { toBusinessQueryState } from '../query/resolvedQueryStateCodec';
import type { SchedulingStateInfo } from '../scheduling/constraintGraph';
import type { CriticalPathTaskMetrics } from '../scheduling/criticalPath';
import { AutoScheduleMoveMode } from '../types/constraints';
import { configureBusinessCalendar } from '../utils/businessCalendar';
import { fromLocalDate, toCalendarDate, toTimelineDate, todayCalendarDate } from '../utils/dateOnly';
import { apiClient } from '../api/client';
import type { MutationMetadata } from '../api/client';
import { taskMutationService } from '../services/taskMutationService';
import {
    applyLocalPatches,
    canApplyReadResponse,
    createReadContext,
    createServerSnapshot,
    replaceServerSnapshot,
    type DerivedInvalidation,
    type LocalPatch,
    type EntityTombstone,
    type ReadContext,
    type ServerSnapshot
} from './taskStore/stateContract';
import {
    readIssueQueryParamsFromUrl,
    replaceIssueQueryParamsInUrl,
    toResolvedQueryStateFromStore,
    type ResolvedQueryState
} from '../utils/queryParams';

type DerivedSchedulingSummary = {
    schedulingStates: Record<string, SchedulingStateInfo>;
    criticalPathMetrics: Record<string, CriticalPathTaskMetrics>;
    criticalPathProjectFinish?: number;
};

type DerivedTaskState = DerivedSchedulingSummary & {
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
};

type DerivedTaskStatePatch = Pick<TaskState, 'tasks' | 'layoutRows' | 'rowCount' | 'schedulingStates' | 'criticalPathMetrics' | 'criticalPathProjectFinish'>;

type ApiData = NonNullable<
    Awaited<ReturnType<typeof import('../api/client').apiClient.fetchData>>
>;

export type TaskConflictRecord = {
    taskId: string;
    message: string;
    detectedAt: number;
};

type InitialDataParams = {
    rawSearch?: string;
    query?: ResolvedQueryState;
    queryContext?: QueryContext;
    initialState?: ResolvedQueryState;
};

let dataRequestGeneration = 0;
const invalidateDataRequests = () => {
    dataRequestGeneration += 1;
};

let saveChangesOperation: Promise<Map<string, string>> | null = null;

export const readLifecycleMetrics = {
    requestsStarted: 0,
    responsesApplied: 0,
    staleResponsesRejected: 0,
    failures: 0,
    maxInflight: 0
};

export const resetReadLifecycleMetrics = () => {
    readLifecycleMetrics.requestsStarted = 0;
    readLifecycleMetrics.responsesApplied = 0;
    readLifecycleMetrics.staleResponsesRejected = 0;
    readLifecycleMetrics.failures = 0;
    readLifecycleMetrics.maxInflight = 0;
};

const queueRefreshData = (refreshData: () => Promise<void>) => {
    queueMicrotask(() => {
        // Each UI scope change is an explicit read invalidation. This keeps
        // separately queued changes observable while identical direct
        // refresh calls can still share an in-flight request.
        dataRequestGeneration += 1;
        void refreshData().catch((error) => console.error('Failed to refresh data', error));
    });
};

interface TaskState {
    permissions: { editable: boolean; viewable: boolean; baselineEditable: boolean };
    allTasks: Task[];
    tasks: Task[];
    relations: Relation[];
    schedulingStates: Record<string, SchedulingStateInfo>;
    criticalPathMetrics: Record<string, CriticalPathTaskMetrics>;
    criticalPathProjectFinish?: number;
    versions: Version[];
    filterOptions: FilterOptions;
    taskStatuses: TaskStatus[];
    customFields: CustomFieldMeta[];
    activeQueryId: number | null;
    queryContext: QueryContext;
    isQueryModified: boolean;
    savedQueries: SavedQuery[];
    savedQueriesStatus: 'idle' | 'loading' | 'ready' | 'error';
    savedQueriesError: string | null;
    selectedStatusIds: number[];
    viewport: Viewport;
    viewMode: ViewMode;
    zoomLevel: ZoomLevel;
    layoutRows: LayoutRow[];
    rowCount: number;
    groupByProject: boolean;
    groupByAssignee: boolean;
    explicitGroupByOverride: 'project' | 'assignee' | null | undefined;
    showVersions: boolean;
    organizeByDependency: boolean;
    viewportFromStorage: boolean;
    selectedTaskId: string | null;
    selectedRelationId: string | null;
    draftRelation: DraftRelation | null;
    hoveredTaskId: string | null;
    contextMenu: { x: number; y: number; taskId: string } | null;
    projectExpansion: Record<string, boolean>;
    versionExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
    filterText: string;
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    projectSelectionExplicit: boolean;
    selectedVersionIds: string[];
    memberProjectsOnly: boolean;

    sortConfig: SortConfig;
    customScales: Record<number, number>;

    currentProjectId: string | null;
    showSubprojects: boolean;

    isSortingSuspended: boolean;
    modifiedTaskIds: Set<string>;
    editGenerations: Record<string, number>;
    autoSave: boolean;
    initialDataLoaded: boolean;
    activeReadContext: ReadContext | null;
    serverTaskSnapshot: ServerSnapshot<Task>;
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>;
    taskTombstones: Record<string, EntityTombstone>;
    taskConflicts: Record<string, TaskConflictRecord>;

    // Actions
    setAutoSave: (enabled: boolean) => void;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setFilterOptions: (filterOptions: FilterOptions) => void;
    setTaskStatuses: (statuses: TaskStatus[]) => void;
    setCustomFields: (fields: CustomFieldMeta[]) => void;
    setPermissions: (permissions: { editable: boolean; viewable: boolean; baselineEditable: boolean }) => void;
    restoreActiveQueryId: (queryId: number | null) => void;
    restoreCanvasScope: (state?: ResolvedQueryState) => void;
    restoreExplicitGroupByOverride: (groupBy: ResolvedQueryState['groupBy'] | undefined) => void;
    applyResolvedQueryState: (state?: ResolvedQueryState) => void;
    applyApiData: (data: ApiData, readContext?: ReadContext) => void;
    setSelectedStatusFromServer: (ids: number[]) => void;
    setShowVersions: (show: boolean) => void;
    addRelation: (relation: Relation) => void;
    replaceRelation: (relation: Relation) => void;
    removeRelation: (relationId: string) => void;
    selectTask: (id: string | null) => void;
    selectRelation: (id: string | null) => void;
    setDraftRelation: (relation: DraftRelation | null) => void;
    clearRelationSelection: () => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    setTaskLockVersion: (id: string, lockVersion: number) => void;
    commitTaskOperation: (id: string, operationGeneration: number, lockVersion?: number) => void;
    applyTaskMutationMetadata: (taskId: string, metadata: MutationMetadata) => void;
    refreshForMutationMetadata: (metadata: MutationMetadata) => void;
    removeTask: (id: string) => void;
    markTaskTombstone: (id: string, source?: EntityTombstone['source'], operationId?: string) => void;
    clearTaskTombstone: (id: string) => void;
    registerTaskConflict: (id: string, message: string) => void;
    resolveTaskConflict: (id: string, resolution: 'remote' | 'local' | 'dismiss') => Promise<void>;
    updateViewport: (updates: Partial<Viewport>) => void;
    setRowHeight: (height: number) => void;
    setViewMode: (mode: ViewMode) => void;
    setZoomLevel: (level: ZoomLevel) => void;
    setGroupByProject: (grouped: boolean) => void;
    setGroupByAssignee: (grouped: boolean) => void;
    setOrganizeByDependency: (enabled: boolean) => void;
    setCurrentProjectId: (id: string) => void;
    toggleProjectExpansion: (projectId: string) => void;
    toggleVersionExpansion: (versionId: string) => void;
    toggleTaskExpansion: (taskId: string) => void;
    toggleAllExpansion: () => void;
    expandAll: () => void;
    collapseAll: () => void;

    setFilterText: (text: string) => void;
    setSelectedAssigneeIds: (ids: (number | null)[]) => void;
    setSelectedProjectIds: (ids: string[]) => void;
    setSelectedVersionIds: (ids: string[]) => void;
    setMemberProjectsOnly: (enabled: boolean) => Promise<void>;
    scrollToTask: (taskId: string) => void;
    focusTask: (taskId: string) => { status: 'ok' | 'filtered_out' | 'missing' };
    setSortConfig: (key: string | null) => void;
    refreshData: () => Promise<void>;
    loadInitialData: (params: InitialDataParams) => Promise<void>;
    loadSavedQueries: (force?: boolean) => Promise<void>;
    applySavedQuery: (queryId: number) => Promise<void>;
    clearSavedQuery: () => Promise<void>;
    setSortingSuspended: (suspended: boolean) => void;
    canDropAsChild: (sourceTaskId: string, targetTaskId: string) => boolean;
    canDropToRoot: (sourceTaskId: string) => boolean;
    moveTaskAsChild: (sourceTaskId: string, targetTaskId: string) => Promise<MoveTaskAsChildResult>;
    moveTaskToRoot: (sourceTaskId: string) => Promise<MoveTaskAsChildResult>;
    saveChanges: () => Promise<Map<string, string>>;
    discardChanges: () => Promise<void>;
}

const preferences = loadPreferences();
const initialUrlState = readIssueQueryParamsFromUrl();
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? toTimelineDate(fromLocalDate(oneYearAgo)),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? preferences.customScales?.[preferences.zoomLevel ?? 1] ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: preferences.rowHeight ?? (Number(window.RedmineCanvasGantt?.settings?.row_height) || 36)
};

const DEFAULT_PERMISSIONS = {
    editable: false,
    viewable: false,
    baselineEditable: false
};

const EMPTY_FILTER_OPTIONS: FilterOptions = {
    projects: [],
    assignees: []
};

const standaloneOverridesFromState = (state: TaskState): QueryOverrides => ({
    status: state.selectedStatusIds.length > 0
        ? { mode: 'subset', values: [...state.selectedStatusIds] }
        : { mode: 'all' },
    assignee: state.selectedAssigneeIds.length > 0
        ? { mode: 'subset', values: [...state.selectedAssigneeIds] }
        : { mode: 'all' },
    version: state.selectedVersionIds.length > 0
        ? { mode: 'subset', values: [...state.selectedVersionIds] }
        : { mode: 'all' }
});

const queryContextPatch = (queryContext: QueryContext) => ({
    queryContext,
    isQueryModified: getIsQueryModified(queryContext)
});

const initialQueryContext = resolvedStateToQueryContext(initialUrlState);

const resolveLayoutState = (state: LayoutState, overrides: Partial<LayoutState> = {}): LayoutState => ({
    allTasks: overrides.allTasks ?? state.allTasks,
    relations: overrides.relations ?? state.relations,
    versions: overrides.versions ?? state.versions,
    filterOptions: overrides.filterOptions ?? state.filterOptions ?? { projects: [], assignees: [] },
    groupByProject: overrides.groupByProject ?? state.groupByProject,
    groupByAssignee: overrides.groupByAssignee ?? state.groupByAssignee,
    showVersions: overrides.showVersions ?? state.showVersions,
    organizeByDependency: overrides.organizeByDependency ?? state.organizeByDependency,
    projectExpansion: overrides.projectExpansion ?? state.projectExpansion,
    versionExpansion: overrides.versionExpansion ?? state.versionExpansion,
    taskExpansion: overrides.taskExpansion ?? state.taskExpansion,
    selectedVersionIds: overrides.selectedVersionIds ?? state.selectedVersionIds,
    selectedProjectIds: overrides.selectedProjectIds ?? state.selectedProjectIds,
    sortConfig: overrides.sortConfig ?? state.sortConfig,
    customFields: overrides.customFields ?? state.customFields,
    filterText: overrides.filterText ?? state.filterText,
    selectedAssigneeIds: overrides.selectedAssigneeIds ?? state.selectedAssigneeIds,
    showSubprojects: overrides.showSubprojects ?? state.showSubprojects,
    currentProjectId: overrides.currentProjectId ?? state.currentProjectId
});

const buildLayoutFromState = (state: LayoutState, overrides: Partial<LayoutState> = {}) => {
    const layoutState = resolveLayoutState(state, overrides);
    const filteredTasks = applyFilters(
        layoutState.allTasks,
        layoutState.filterText,
        layoutState.selectedAssigneeIds,
        layoutState.selectedProjectIds,
        layoutState.selectedVersionIds,
        layoutState.showSubprojects,
        layoutState.currentProjectId
    );

    return buildLayout(
        filteredTasks,
        layoutState.relations,
        layoutState.versions,
        layoutState.groupByProject,
        layoutState.groupByAssignee,
        layoutState.showVersions,
        layoutState.organizeByDependency,
        layoutState.projectExpansion,
        layoutState.versionExpansion,
        layoutState.taskExpansion,
        layoutState.selectedVersionIds,
        layoutState.selectedProjectIds,
        layoutState.sortConfig,
        layoutState.allTasks,
        layoutState.customFields,
        layoutState.filterOptions.projects
    );
};

const buildDerivedSchedulingSummary = (tasks: Task[], relations: Relation[]): DerivedSchedulingSummary => {
    derivedRecalculationCounters.scheduling += 1;
    derivedRecalculationCounters.criticalPath += 1;
    const criticalPath = TaskLogicService.calculateCriticalPath(tasks, relations);

    return {
        schedulingStates: TaskLogicService.deriveSchedulingStates(tasks, relations),
        criticalPathMetrics: criticalPath.metricsByTaskId,
        criticalPathProjectFinish: criticalPath.projectFinish
    };
};

export const derivedRecalculationCounters = {
    scheduling: 0,
    criticalPath: 0,
    layout: 0
};

export const resetDerivedRecalculationCounters = () => {
    derivedRecalculationCounters.scheduling = 0;
    derivedRecalculationCounters.criticalPath = 0;
    derivedRecalculationCounters.layout = 0;
};

const buildDerivedTaskState = (
    state: TaskState,
    overrides: Partial<LayoutState> & {
        allTasks?: Task[];
        relations?: Relation[];
        derivedInvalidation?: DerivedInvalidation;
        schedulingSummary?: DerivedSchedulingSummary;
    } = {}
): DerivedTaskState => {
    const allTasks = overrides.allTasks ?? state.allTasks;
    const relations = overrides.relations ?? state.relations;
    derivedRecalculationCounters.layout += 1;
    const layout = buildLayoutFromState(state, { ...overrides, allTasks, relations });
    const schedulingSummary = overrides.schedulingSummary ?? (overrides.derivedInvalidation === 'none' || overrides.derivedInvalidation === 'layout'
        ? {
            schedulingStates: state.schedulingStates,
            criticalPathMetrics: state.criticalPathMetrics,
            criticalPathProjectFinish: state.criticalPathProjectFinish
        }
        : buildDerivedSchedulingSummary(allTasks, relations));

    return {
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        ...schedulingSummary
    };
};

const buildAllExpandedStates = (state: TaskState, expanded: boolean) => {
    const expansionMaps = buildUniformExpansionMaps(state.allTasks, expanded);
    const versionExpansion = { ...expansionMaps.versionExpansion };

    Object.keys(state.versionExpansion).forEach((versionKey) => {
        versionExpansion[versionKey] = expanded;
    });
    state.layoutRows.forEach((row) => {
        if (row.type === 'version') {
            versionExpansion[row.id] = expanded;
        }
    });

    return {
        ...expansionMaps,
        versionExpansion
    };
};

const getTaskGroupKey = (task: Task, state: Pick<TaskState, 'groupByAssignee' | 'groupByProject'>): string => {
    if (state.groupByAssignee) {
        const assigneeId = task.assignedToId === undefined || task.assignedToId === null
            ? 'none'
            : String(task.assignedToId);
        return `assignee:${assigneeId}`;
    }

    if (state.groupByProject) {
        return task.projectId ?? 'default_project';
    }

    return '_global';
};

const getLayoutRootForTask = (task: Task, taskById: Map<string, Task>, state: Pick<TaskState, 'groupByAssignee' | 'groupByProject'>): Task => {
    let root = task;
    let currentParentId = task.parentId;
    const targetGroupKey = getTaskGroupKey(task, state);

    while (currentParentId) {
        const parentTask = taskById.get(currentParentId);
        if (!parentTask) break;
        if (!state.groupByProject && !state.groupByAssignee) {
            root = parentTask;
            currentParentId = parentTask.parentId;
            continue;
        }
        if (getTaskGroupKey(parentTask, state) !== targetGroupKey) break;
        root = parentTask;
        currentParentId = parentTask.parentId;
    }

    return root;
};

const toDerivedTaskStatePatch = (derived: DerivedTaskState): DerivedTaskStatePatch => ({
    tasks: derived.tasks,
    layoutRows: derived.layoutRows,
    rowCount: derived.rowCount,
    schedulingStates: derived.schedulingStates,
    criticalPathMetrics: derived.criticalPathMetrics,
    criticalPathProjectFinish: derived.criticalPathProjectFinish
});

type ApiDataPatchResult = {
    patch: Partial<TaskState>;
    querySyncState: SharedQuerySyncState;
};

const buildApiDataPatch = (data: ApiData, state: TaskState, readContext?: ReadContext): ApiDataPatchResult => {
    const filterOptions = data.filterOptions ?? EMPTY_FILTER_OPTIONS;
    const customFields = data.customFields ?? [];
    const versions = data.versions ?? [];
    const relations = data.relations ?? [];
    const serverTasks = (data.tasks ?? []).filter(task => !state.taskTombstones[task.id]);
    const mergedServerTasks = serverTasks.map((task) => {
        const patches = state.localTaskPatches[task.id] ?? [];
        return patches.length > 0 ? applyLocalPatches(task, patches) : task;
    });
    const serverTaskIds = new Set(serverTasks.map((task) => task.id));
    const preservesDirtyScope = !readContext || !state.activeReadContext || (
        state.activeReadContext.projectId === readContext.projectId &&
        state.activeReadContext.queryIdentity === readContext.queryIdentity &&
        state.activeReadContext.scopeIdentity === readContext.scopeIdentity
    );
    const tasks = [
        ...mergedServerTasks,
        ...(preservesDirtyScope
            ? state.allTasks.filter((task) => state.modifiedTaskIds.has(task.id) && !serverTaskIds.has(task.id) && !state.taskTombstones[task.id])
            : [])
    ];
    const nextResolved: ResolvedQueryState = {
        ...(data.initialState ?? toResolvedQueryStateFromStore(state)),
        ...(state.explicitGroupByOverride !== undefined
            ? { groupBy: state.explicitGroupByOverride }
            : {}),
        // A Saved Query can define Redmine's project_id filter, but it must not
        // replace the independent Canvas project scope.
        ...(state.projectSelectionExplicit
            ? { canvasProjectIds: state.selectedProjectIds }
            : (data.initialState?.canvasProjectIds !== undefined
                ? { canvasProjectIds: data.initialState.canvasProjectIds }
                : {})),
        memberProjectsOnly: state.memberProjectsOnly,
        // showSubprojects is Canvas scope state, not a Redmine Query filter.
        showSubprojects: state.showSubprojects
    };

    const queryState = toBusinessQueryState(nextResolved);
    const queryContext = data.queryContext ?? (data.initialState ? resolvedStateToQueryContext(nextResolved) : state.queryContext);
    const sortConfig = queryState.sortConfig ?? { key: 'startDate', direction: 'asc' };
    const { projectExpansion, taskExpansion, versionExpansion } = initializeExpansionMaps(tasks, {
        projectExpansion: state.projectExpansion,
        versionExpansion: state.versionExpansion,
        taskExpansion: state.taskExpansion
    });
    const derived = buildDerivedTaskState(state, {
        allTasks: tasks,
        relations,
        versions,
        filterOptions,
        customFields,
        groupByProject: queryState.groupByProject,
        groupByAssignee: queryState.groupByAssignee,
        showSubprojects: queryState.showSubprojects,
        sortConfig,
        selectedAssigneeIds: queryState.selectedAssigneeIds,
        selectedProjectIds: queryState.selectedProjectIds,
        selectedVersionIds: queryState.selectedVersionIds,
        projectExpansion,
        versionExpansion,
        taskExpansion
    });
    const querySyncState = {
        activeQueryId: queryState.queryId,
        queryContext,
        selectedStatusIds: queryState.selectedStatusIds,
        selectedAssigneeIds: queryState.selectedAssigneeIds,
        selectedProjectIds: queryState.selectedProjectIds,
        projectSelectionExplicit: state.projectSelectionExplicit || nextResolved.canvasProjectIds !== undefined,
        selectedVersionIds: queryState.selectedVersionIds,
        memberProjectsOnly: queryState.memberProjectsOnly,
        sortConfig,
        groupByProject: queryState.groupByProject,
        groupByAssignee: queryState.groupByAssignee,
        showSubprojects: queryState.showSubprojects,
        visibleColumns: useUIStore.getState().columnsExplicitInQuery ? useUIStore.getState().visibleColumns : undefined,
        columnsExplicitInQuery: useUIStore.getState().columnsExplicitInQuery
    };

    return {
        querySyncState,
        patch: {
            ...querySyncState,
            ...queryContextPatch(queryContext),
            initialDataLoaded: true,
            allTasks: tasks,
            relations,
            versions,
            filterOptions,
            customFields,
            taskStatuses: data.statuses ?? [],
            permissions: data.permissions ?? DEFAULT_PERMISSIONS,
            selectedRelationId: state.selectedRelationId && relations.some(relation => relation.id === state.selectedRelationId)
                ? state.selectedRelationId
                : null,
            draftRelation: null,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            modifiedTaskIds: new Set(state.modifiedTaskIds),
            serverTaskSnapshot: replaceServerSnapshot(
                state.serverTaskSnapshot,
                serverTasks,
                readContext ?? state.activeReadContext
            ),
            ...toDerivedTaskStatePatch(derived)
        }
    };
};

type ParentMoveStoreState = LayoutState & {
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
    modifiedTaskIds: Set<string>;
    editGenerations: Record<string, number>;
    autoSave: boolean;
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>;
    serverTaskSnapshot: ServerSnapshot<Task>;
};

const buildParentMoveOptimisticPatch = (state: ParentMoveStoreState, nextAllTasks: Task[]) => {
    const layout = buildLayoutFromState(state, { allTasks: nextAllTasks });
    const sourceTaskId = nextAllTasks.find((task, index) => task.parentId !== state.allTasks[index]?.parentId || task.displayOrder !== state.allTasks[index]?.displayOrder)?.id;
    const editGenerations = sourceTaskId
        ? { ...state.editGenerations, [sourceTaskId]: (state.editGenerations[sourceTaskId] ?? 0) + 1 }
        : state.editGenerations;
    const sourceBefore = sourceTaskId ? state.allTasks.find(task => task.id === sourceTaskId) : undefined;
    const sourceAfter = sourceTaskId ? nextAllTasks.find(task => task.id === sourceTaskId) : undefined;
    const localTaskPatches = { ...state.localTaskPatches };
    if (sourceTaskId && sourceBefore && sourceAfter) {
        const generation = editGenerations[sourceTaskId] ?? 0;
        const fields: Partial<Task> = {};
        if (sourceBefore.parentId !== sourceAfter.parentId) fields.parentId = sourceAfter.parentId;
        if (sourceBefore.displayOrder !== sourceAfter.displayOrder) fields.displayOrder = sourceAfter.displayOrder;
        localTaskPatches[sourceTaskId] = [
            ...(localTaskPatches[sourceTaskId] ?? []),
            { entityId: sourceTaskId, fields, generation, operationId: `parent-move:${sourceTaskId}:${generation}` }
        ];
    }
    return {
        allTasks: nextAllTasks,
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        editGenerations,
        localTaskPatches
    };
};

const buildParentMoveSuccessPatch = (state: ParentMoveStoreState, sourceBefore: Task, result: { lockVersion?: number; parentId?: string }, operationGeneration: number) => {
    const sourceTaskId = sourceBefore.id;
    const currentSource = state.allTasks.find((task) => task.id === sourceTaskId);
    const responseParentId = result.parentId;
    const operationId = `parent-move:${sourceTaskId}:${operationGeneration}`;
    const operationPatch = (state.localTaskPatches[sourceTaskId] ?? []).find(patch => patch.operationId === operationId);
    const updatedAllTasks = state.allTasks.map((task) => (
        task.id === sourceTaskId
            ? { ...task, lockVersion: Math.max(task.lockVersion, result.lockVersion ?? task.lockVersion) }
            : task
    ));
    const layout = buildLayoutFromState(state, { allTasks: updatedAllTasks });
    const nextModified = new Set(state.modifiedTaskIds);
    const localTaskPatches = { ...state.localTaskPatches };
    if (operationPatch) {
        localTaskPatches[sourceTaskId] = (localTaskPatches[sourceTaskId] ?? []).filter(patch => patch.operationId !== operationId);
        if (localTaskPatches[sourceTaskId].length === 0) {
            delete localTaskPatches[sourceTaskId];
            nextModified.delete(sourceTaskId);
        }
    } else if (!currentSource || responseParentId === undefined || currentSource.parentId === responseParentId) {
        nextModified.delete(sourceTaskId);
    }
    const serverTask = state.serverTaskSnapshot.entitiesById[sourceTaskId] ?? sourceBefore;
    const nextServerTask = operationPatch
        ? { ...serverTask, ...operationPatch.fields, lockVersion: Math.max(serverTask.lockVersion, result.lockVersion ?? serverTask.lockVersion) }
        : { ...serverTask, lockVersion: Math.max(serverTask.lockVersion, result.lockVersion ?? serverTask.lockVersion) };

    return {
        allTasks: updatedAllTasks,
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        modifiedTaskIds: nextModified,
        localTaskPatches,
        serverTaskSnapshot: {
            ...state.serverTaskSnapshot,
            entitiesById: { ...state.serverTaskSnapshot.entitiesById, [sourceTaskId]: nextServerTask },
            revisions: {
                ...state.serverTaskSnapshot.revisions,
                [sourceTaskId]: Math.max(state.serverTaskSnapshot.revisions[sourceTaskId] ?? 0, nextServerTask.lockVersion)
            }
        }
    };
};

const buildParentMoveFailure = (error?: string) => buildMoveTaskResult('error', {
    error: error || (i18n.t('label_parent_drop_failed') || 'Failed to update parent')
});

const resolveCascadingScheduleUpdates = (
    tasks: Task[],
    relations: Relation[],
    seedTaskIds: Iterable<string>,
    propagateDependencies = true
): { tasks: Task[]; updates: Map<string, Partial<Task>>; error?: string } => {
    let workingTasks = tasks;
    const updates = new Map<string, Partial<Task>>();
    const affectedTaskIds = new Set(seedTaskIds);
    let frontier = new Set(affectedTaskIds);
    const maxPasses = Math.max(1, tasks.length * 2);

    const applyUpdates = (nextUpdates: Map<string, Partial<Task>>): Set<string> => {
        const changedIds = new Set<string>();
        nextUpdates.forEach((patch, taskId) => {
            const task = workingTasks.find((candidate) => candidate.id === taskId);
            if (!task) return;
            const nextTask = { ...task, ...patch };
            if (nextTask.startDate === task.startDate && nextTask.dueDate === task.dueDate) return;
            workingTasks = workingTasks.map((candidate) => candidate.id === taskId ? nextTask : candidate);
            updates.set(taskId, { ...updates.get(taskId), ...patch });
            affectedTaskIds.add(taskId);
            changedIds.add(taskId);
        });
        return changedIds;
    };

    for (let pass = 0; pass < maxPasses && frontier.size > 0; pass += 1) {
        const changedIds = new Set<string>();

        for (const taskId of frontier) {
            const task = workingTasks.find((candidate) => candidate.id === taskId);
            if (!task?.parentId) continue;
            applyUpdates(TaskLogicService.recalculateParentDates(workingTasks, task.parentId))
                .forEach((changedId) => changedIds.add(changedId));
        }

        const dependencySeeds = propagateDependencies
            ? new Set([...frontier, ...changedIds])
            : new Set<string>();
        for (const taskId of dependencySeeds) {
            const task = workingTasks.find((candidate) => candidate.id === taskId);
            if (!task || !Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) continue;
            const result = TaskLogicService.checkDependencies(
                workingTasks,
                relations,
                taskId,
                task.startDate!,
                task.dueDate!,
                AutoScheduleMoveMode.ConstraintPush
            );
            if (result.error) return { tasks, updates: new Map(), error: result.error };
            applyUpdates(result.updates).forEach((changedId) => changedIds.add(changedId));
        }

        frontier = changedIds;
    }

    const nonEditableTask = [...affectedTaskIds]
        .map((taskId) => workingTasks.find((task) => task.id === taskId))
        .find((task) => task && !TaskLogicService.canEditTask(task));
    if (nonEditableTask) {
        return {
            tasks,
            updates: new Map(),
            error: i18n.t('label_auto_schedule_permission_denied') ||
                'A linked task cannot be moved because you do not have permission to edit it.'
        };
    }

    return { tasks: workingTasks, updates };
};

const buildRelationChange = (state: TaskState, relation: Relation, nextRelations: Relation[]) => {
    let nextTasks = state.allTasks;
    const originTaskId = relation.type === 'follows' ? relation.to : relation.from;
    const originTask = nextTasks.find((task) => task.id === originTaskId);
    const dependentUpdates = TaskLogicService.checkDependencies(
        nextTasks,
        nextRelations,
        originTaskId,
        originTask?.startDate ?? Number.NaN,
        originTask?.dueDate ?? Number.NaN,
        AutoScheduleMoveMode.ConstraintPush
    );

    if (dependentUpdates.updates.size > 0) {
        nextTasks = nextTasks.map((task) => dependentUpdates.updates.has(task.id) ? { ...task, ...dependentUpdates.updates.get(task.id) } : task);
    }

    const cascadingUpdates = resolveCascadingScheduleUpdates(
        nextTasks,
        nextRelations,
        [originTaskId, ...dependentUpdates.updates.keys()]
    );
    if (cascadingUpdates.error) {
        useUIStore.getState().addNotification(cascadingUpdates.error, 'error');
        nextTasks = state.allTasks;
        dependentUpdates.updates.clear();
    } else {
        nextTasks = cascadingUpdates.tasks;
        cascadingUpdates.updates.forEach((patch, taskId) => dependentUpdates.updates.set(taskId, patch));
    }

    const modifiedTaskIds = new Set(state.modifiedTaskIds);
    dependentUpdates.updates.forEach((_, taskId) => modifiedTaskIds.add(taskId));

    return {
        nextTasks,
        modifiedTaskIds,
        derived: buildDerivedTaskState(state, { relations: nextRelations, allTasks: nextTasks })
    };
};

const getTaskFocusTimestamp = (task: Task): number => {
    if (Number.isFinite(task.startDate)) {
        return toTimelineDate(toCalendarDate(task.startDate!));
    }
    if (Number.isFinite(task.dueDate)) {
        return toTimelineDate(toCalendarDate(task.dueDate!));
    }
    return toTimelineDate(todayCalendarDate());
};

const matchesTaskFilters = (task: Task, state: TaskState): boolean => {
    const lowerText = state.filterText.toLowerCase();
    const hasTextFilter = Boolean(lowerText);
    const hasAssigneeFilter = state.selectedAssigneeIds.length > 0;
    const hasProjectFilter = state.selectedProjectIds.length > 0;
    const hasVersionFilter = state.selectedVersionIds.length > 0;
    const hasSubprojectFilter = !state.showSubprojects && state.currentProjectId !== null && !hasProjectFilter;

    if (!hasTextFilter && !hasAssigneeFilter && !hasProjectFilter && !hasVersionFilter && !hasSubprojectFilter) {
        return true;
    }

    const taskAssignee = task.assignedToId === undefined ? null : task.assignedToId;

    return (
        (!hasTextFilter || task.subject.toLowerCase().includes(lowerText)) &&
        (!hasAssigneeFilter || state.selectedAssigneeIds.includes(taskAssignee)) &&
        (!hasProjectFilter || (task.projectId !== undefined && state.selectedProjectIds.includes(task.projectId))) &&
        (!hasVersionFilter || (
            (state.selectedVersionIds.includes('_none') && !task.fixedVersionId) ||
            (task.fixedVersionId !== undefined && state.selectedVersionIds.includes(task.fixedVersionId))
        )) &&
        (!hasSubprojectFilter || task.projectId === state.currentProjectId)
    );
};

const computeFocusedViewport = (state: TaskState, task: Task) => {
    const BOTTOM_PADDING_PX = 40;
    const targetMetadata = getTaskFocusTimestamp(task);
    let startDate = state.viewport.startDate;

    if (targetMetadata < startDate) {
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        startDate = targetMetadata - ONE_WEEK;
    }

    const taskX = (targetMetadata - startDate) * state.viewport.scale;
    const scrollX = Math.max(0, taskX - (state.viewport.width / 2));

    const rawScrollY = task.rowIndex * state.viewport.rowHeight - ((state.viewport.height - state.viewport.rowHeight) / 2);
    const maxScrollY = Math.max(0, state.rowCount * state.viewport.rowHeight + BOTTOM_PADDING_PX - state.viewport.height);
    const scrollY = Math.max(0, Math.min(maxScrollY, rawScrollY));

    return {
        ...state.viewport,
        startDate,
        scrollX,
        scrollY
    };
};


export const useTaskStore = create<TaskState>((set, get) => {
    const inflightReads = new Map<string, Promise<void>>();
    let auxiliaryReadContext: ReadContext | null = null;
    let auxiliaryReadGeneration = 0;
    let mutationResyncGeneration = 0;
    let activeReadContext: ReadContext | null = null;
    const requestAndApplyData = async (
        fetchData: () => Promise<ApiData>,
        context: ReadContext
    ): Promise<void> => {
        const readKey = context.contextId;
        const existing = inflightReads.get(readKey);
        if (existing) return existing;
        activeReadContext = context;
        readLifecycleMetrics.requestsStarted += 1;
        readLifecycleMetrics.maxInflight = Math.max(readLifecycleMetrics.maxInflight, inflightReads.size + 1);
        const request = (async () => {
        try {
            const data = await fetchData();
            if (context.generation !== dataRequestGeneration || !canApplyReadResponse(activeReadContext, context)) {
                readLifecycleMetrics.staleResponsesRejected += 1;
                return;
            }
            get().applyApiData(data, context);
            readLifecycleMetrics.responsesApplied += 1;
        } catch (error) {
            // A superseded request must not surface as a user-visible failure.
            if (context.generation !== dataRequestGeneration || !canApplyReadResponse(activeReadContext, context)) {
                readLifecycleMetrics.staleResponsesRejected += 1;
                return;
            }
            readLifecycleMetrics.failures += 1;
            throw error;
        }
        })();
        inflightReads.set(readKey, request);
        try {
            await request;
        } finally {
            if (inflightReads.get(readKey) === request) inflightReads.delete(readKey);
        }
    };
    const fetchMutationResyncData = async (params: { query?: { selectedStatusIds?: number[] } }): Promise<ApiData> => {
        const state = get();
        const generation = ++dataRequestGeneration;
        const resyncGeneration = ++mutationResyncGeneration;
        readLifecycleMetrics.requestsStarted += 1;
        readLifecycleMetrics.maxInflight = Math.max(readLifecycleMetrics.maxInflight, 1);
        const query = {
            ...toResolvedQueryStateFromStore(state),
            ...(params.query?.selectedStatusIds ? { selectedStatusIds: params.query.selectedStatusIds } : {})
        };
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query,
            scope: { showSubprojects: state.showSubprojects, memberProjectsOnly: state.memberProjectsOnly },
            purpose: 'mutation_resync',
            mergePolicy: 'preserve_dirty'
        });
        activeReadContext = context;
        const data = await apiClient.fetchData({ query, queryContext: state.queryContext });
        if (resyncGeneration !== mutationResyncGeneration || !canApplyReadResponse(activeReadContext, context)) {
            readLifecycleMetrics.staleResponsesRejected += 1;
            throw new Error('Superseded mutation resync');
        }
        return data;
    };

    return ({
    allTasks: [],
    tasks: [],
    relations: [],
    schedulingStates: {},
    criticalPathMetrics: {},
    criticalPathProjectFinish: undefined,
    versions: [],
    filterOptions: { projects: [], assignees: [] },
    taskStatuses: [],
    customFields: [],
    permissions: { editable: false, viewable: false, baselineEditable: false },
    activeQueryId: initialUrlState.queryId ?? null,
    queryContext: initialQueryContext,
    isQueryModified: getIsQueryModified(initialQueryContext),
    savedQueries: [],
    savedQueriesStatus: 'idle',
    savedQueriesError: null,
    selectedStatusIds: [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: preferences.viewMode ?? 'Week',
    zoomLevel: preferences.zoomLevel ?? 1,
    layoutRows: [],
    rowCount: 0,
    groupByProject: true,
    groupByAssignee: false,
    explicitGroupByOverride: undefined,
    showVersions: preferences.showVersions ?? true,
    organizeByDependency: preferences.organizeByDependency ?? false,
    viewportFromStorage: Boolean(preferences.viewport),
    selectedTaskId: null,
    selectedRelationId: null,
    draftRelation: null,
    hoveredTaskId: null,
    contextMenu: null,
    projectExpansion: {},
    versionExpansion: {},
    taskExpansion: {},
    filterText: '',
    selectedAssigneeIds: [],
    selectedProjectIds: [],
    projectSelectionExplicit: false,
    selectedVersionIds: [],
    memberProjectsOnly: preferences.memberProjectsOnly ?? false,
    sortConfig: { key: 'startDate', direction: 'asc' },
    customScales: preferences.customScales ?? {},
    currentProjectId: window.RedmineCanvasGantt?.projectId?.toString() || null,
    showSubprojects: true,
    isSortingSuspended: false,
    modifiedTaskIds: new Set(),
    editGenerations: {},
    autoSave: preferences.autoSave ?? false,
    initialDataLoaded: false,
    activeReadContext: null,
    serverTaskSnapshot: createServerSnapshot<Task>([]),
    localTaskPatches: {},
    taskTombstones: {},
    taskConflicts: {},

    setAutoSave: (enabled) => set({ autoSave: enabled }),

    setTasks: (tasks) => set((state) => {
        const effectiveTasks = tasks.filter(task => !state.taskTombstones[task.id]);
        const { projectExpansion, taskExpansion, versionExpansion } = initializeExpansionMaps(effectiveTasks, {
            projectExpansion: state.projectExpansion,
            versionExpansion: state.versionExpansion,
            taskExpansion: state.taskExpansion
        });

        const derived = buildDerivedTaskState(state, {
            allTasks: effectiveTasks,
            projectExpansion,
            versionExpansion,
            taskExpansion
        });

        return {
            allTasks: tasks,
            ...toDerivedTaskStatePatch(derived),
            projectExpansion,
            versionExpansion,
            taskExpansion
        };
    }),
    setRelations: (relations) => set((state) => {
        const derived = buildDerivedTaskState(state, { relations });
        return {
            relations,
            selectedRelationId: state.selectedRelationId && relations.some(relation => relation.id === state.selectedRelationId)
                ? state.selectedRelationId
                : null,
            draftRelation: null,
            ...toDerivedTaskStatePatch(derived)
        };
    }),
    setVersions: (versions) => set((state) => {
        const derived = buildDerivedTaskState(state, { versions });
        return {
            versions,
            ...toDerivedTaskStatePatch(derived)
        };
    }),
    setFilterOptions: (filterOptions) => set(() => ({ filterOptions })),
    setTaskStatuses: (statuses) => set(() => ({ taskStatuses: statuses })),
    setPermissions: (permissions) => set(() => ({ permissions })),
    restoreActiveQueryId: (queryId) => {
        const queryContext = { ...get().queryContext, baseQueryId: queryId };
        set({ activeQueryId: queryId, ...queryContextPatch(queryContext) });
    },
    restoreCanvasScope: (resolved) => set((state) => {
        const showSubprojects = resolved?.showSubprojects ?? state.showSubprojects;
        const selectedProjectIds = resolved?.canvasProjectIds
            ?? resolved?.selectedProjectIds
            ?? state.selectedProjectIds;
        const projectSelectionExplicit = resolved?.canvasProjectIds !== undefined
            || resolved?.selectedProjectIds !== undefined
            || state.projectSelectionExplicit;
        const layout = buildLayoutFromState(state, {
            showSubprojects,
            selectedProjectIds
        });

        return {
            showSubprojects,
            selectedProjectIds,
            projectSelectionExplicit,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    restoreExplicitGroupByOverride: (groupBy) => set({ explicitGroupByOverride: groupBy }),
    applyResolvedQueryState: (resolved) => set((state) => {
        const queryState = toBusinessQueryState(resolved);
        const queryContext = resolvedStateToQueryContext(resolved);
        const groupByProject = queryState.groupByProject;
        const groupByAssignee = queryState.groupByAssignee;
        const showSubprojects = queryState.showSubprojects;
        const sortConfig = queryState.sortConfig ?? { key: 'startDate', direction: 'asc' };
        const selectedStatusIds = queryState.selectedStatusIds;
        const selectedAssigneeIds = queryState.selectedAssigneeIds;
        const selectedProjectIds = queryState.selectedProjectIds;
        const selectedVersionIds = queryState.selectedVersionIds;
        const memberProjectsOnly = queryState.memberProjectsOnly;
        const activeQueryId = queryState.queryId;
        const layout = buildLayoutFromState(state, {
            groupByProject,
            groupByAssignee,
            showSubprojects,
            sortConfig,
            selectedAssigneeIds,
            selectedProjectIds,
            selectedVersionIds
        });

        const nextState = {
            activeQueryId,
            ...queryContextPatch(queryContext),
            selectedStatusIds,
            selectedAssigneeIds,
            selectedProjectIds,
            projectSelectionExplicit: resolved?.canvasProjectIds !== undefined
                || resolved?.selectedProjectIds !== undefined
                || state.projectSelectionExplicit,
            selectedVersionIds,
            groupByProject,
            groupByAssignee,
            showSubprojects,
            memberProjectsOnly,
            sortConfig,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState(nextState);
        return nextState;
    }),
    applyApiData: (data, readContext) => {
        const businessCalendar = configureBusinessCalendar(data.businessCalendar);
        let querySyncState: SharedQuerySyncState | null = null;
        set((state) => {
            const result = buildApiDataPatch(data, state, readContext);
            querySyncState = result.querySyncState;
            return { ...result.patch, activeReadContext: readContext ?? activeReadContext };
        });
        if (data.initialState?.visibleColumns?.length) {
            useUIStore.getState().applyQueryVisibleColumns(data.initialState.visibleColumns);
        } else if (useUIStore.getState().columnStateSource === 'query') {
            useUIStore.getState().restorePreferenceColumns();
        }
        const nextQuerySyncState = querySyncState as SharedQuerySyncState | null;
        if (nextQuerySyncState) {
            const uiState = useUIStore.getState();
            syncSharedQueryState({
                ...nextQuerySyncState,
                visibleColumns: uiState.columnsExplicitInQuery ? uiState.visibleColumns : undefined,
                columnsExplicitInQuery: uiState.columnsExplicitInQuery
            });
        }
        useBaselineStore.getState().setSnapshot(data.baseline ?? null, data.warnings ?? []);
        (data.warnings ?? []).forEach((warning) => {
            useUIStore.getState().addNotification(warning, 'warning');
        });
        if (businessCalendar.status === 'error') {
            useUIStore.getState().addNotification(
                i18n.t('error_canvas_gantt_business_calendar_invalid') ||
                    "Business calendar configuration is invalid. Redmine's non-working weekdays are being used as a fallback.",
                'warning'
            );
        }
    },
    setCustomFields: (customFields) => set((state) => {
        const derived = buildDerivedTaskState(state, { customFields });
        return {
            customFields,
            ...toDerivedTaskStatePatch(derived)
        };
    }),
    setSelectedStatusFromServer: (ids) => {
        invalidateDataRequests();
        const queryContext = setStatusOverride(get().queryContext, ids.length > 0
            ? { mode: 'subset', values: ids }
            : { mode: 'all' });
        set({ selectedStatusIds: ids, ...queryContextPatch(queryContext) });
        syncSharedQueryState(get());
        void get().refreshData().catch((error) => console.error('Failed to refresh data', error));
    },
    setShowVersions: (show) => set((state) => {
        const organizeByDependency = show ? false : state.organizeByDependency;
        const layout = buildLayoutFromState(state, { showVersions: show, organizeByDependency });
        return {
            showVersions: show,
            organizeByDependency,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
        invalidateDataRequests();
        const nextRelations = [...state.relations, relation];
        const { nextTasks, modifiedTaskIds, derived } = buildRelationChange(state, relation, nextRelations);
        return {
            allTasks: nextTasks,
            relations: nextRelations,
            draftRelation: null,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds
        };
    }),
    replaceRelation: (relation) => set((state) => {
        invalidateDataRequests();
        const existingIndex = state.relations.findIndex(r => r.id === relation.id);
        const nextRelations =
            existingIndex === -1
                ? [...state.relations, relation]
                : state.relations.map((current) => current.id === relation.id ? relation : current);
        const { nextTasks, modifiedTaskIds, derived } = buildRelationChange(state, relation, nextRelations);
        return {
            allTasks: nextTasks,
            relations: nextRelations,
            draftRelation: null,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds
        };
    }),
    removeRelation: (relationId) => set((state) => {
        const nextRelations = state.relations.filter(r => r.id !== relationId);
        if (nextRelations.length === state.relations.length) return state;
        invalidateDataRequests();
        const derived = buildDerivedTaskState(state, { relations: nextRelations });
        return {
            relations: nextRelations,
            selectedRelationId: state.selectedRelationId === relationId ? null : state.selectedRelationId,
            ...toDerivedTaskStatePatch(derived)
        };
    }),
    selectTask: (id) => set({
        selectedTaskId: id,
        selectedRelationId: null,
        draftRelation: null,
        contextMenu: null
    }),
    selectRelation: (id) => set({
        selectedTaskId: null,
        selectedRelationId: id,
        draftRelation: null,
        contextMenu: null
    }),
    setDraftRelation: (relation) => set({
        selectedTaskId: null,
        selectedRelationId: null,
        draftRelation: relation,
        contextMenu: null
    }),
    clearRelationSelection: () => set({ selectedRelationId: null, draftRelation: null }),
    setHoveredTask: (id) => set({ hoveredTaskId: id }),
    setContextMenu: (menu) => set({
        contextMenu: menu,
        ...(menu ? { selectedRelationId: null, draftRelation: null } : {})
    }),
    setSortingSuspended: (suspended) => set((state) => {
        if (!suspended && state.isSortingSuspended) {
            // Turning it off -> trigger re-layout
            const layout = buildLayoutFromState(state);
            return {
                isSortingSuspended: false,
                tasks: layout.tasks,
                layoutRows: layout.layoutRows,
                rowCount: layout.rowCount
            };
        }
        return { isSortingSuspended: suspended };
    }),
    canDropAsChild: (sourceTaskId, targetTaskId) => {
        if (!sourceTaskId || !targetTaskId) return false;
        if (sourceTaskId === targetTaskId) return false;

        const state = get();
        const taskById = new Map(state.allTasks.map(task => [task.id, task]));
        const source = taskById.get(sourceTaskId);
        const target = taskById.get(targetTaskId);
        if (!source || !target) return false;
        if (!source.editable) return false;
        if (source.projectId && target.projectId && source.projectId !== target.projectId) return false;
        if (isDescendantTask(taskById, sourceTaskId, targetTaskId)) return false;
        return true;
    },
    canDropToRoot: (sourceTaskId) => {
        if (!sourceTaskId) return false;
        const source = get().allTasks.find(task => task.id === sourceTaskId);
        if (!source) return false;
        if (!source.editable) return false;
        return Boolean(source.parentId);
    },
    moveTaskAsChild: async (sourceTaskId, targetTaskId) => {
        if (!get().canDropAsChild(sourceTaskId, targetTaskId)) {
            return buildMoveTaskResult('error', { error: i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target' });
        }

        invalidateDataRequests();
        return runParentMove({
            sourceTaskId,
            expectedParentId: targetTaskId,
            getState: () => get(),
            setState: (patch) => set(patch),
            restoreSnapshot: (snapshot) => set((state) => {
                const currentTask = state.allTasks.find((task) => task.id === sourceTaskId);
                const snapshotTask = snapshot.allTasks.find((task) => task.id === sourceTaskId);
                const lockVersion = Math.max(currentTask?.lockVersion ?? 0, snapshotTask?.lockVersion ?? 0);
                return {
                    ...snapshot,
                    allTasks: snapshot.allTasks.map((task) => task.id === sourceTaskId ? { ...task, lockVersion } : task),
                    tasks: snapshot.tasks.map((task) => task.id === sourceTaskId ? { ...task, lockVersion } : task)
                };
            }),
            buildNextOrder: (allTasks) => tailDisplayOrderForParent(allTasks, targetTaskId, sourceTaskId),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: targetTaskId, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            isCurrentOperation: (state, sourceBefore, operationGeneration) => (
                state.editGenerations[sourceBefore.id] === operationGeneration &&
                state.allTasks.find((task) => task.id === sourceBefore.id)?.parentId === targetTaskId
            ),
            updateTaskFields: (taskId, payload, lifecycle) => taskMutationService.updateTaskFields(
                taskId,
                () => ({
                    parent_issue_id: Number(targetTaskId),
                    lock_version: payload().lock_version
                }),
                lifecycle
            ),
            validatePersistedResult: (result) => result.parentId === targetTaskId,
            missingSourceResult: buildParentMoveFailure(),
            failedResult: buildParentMoveFailure,
            onConflict: (taskId, message) => get().registerTaskConflict(taskId, message),
            onMutationMetadata: (taskId, metadata) => get().applyTaskMutationMetadata(taskId, metadata)
        });
    },
    moveTaskToRoot: async (sourceTaskId) => {
        if (!get().canDropToRoot(sourceTaskId)) {
            return buildMoveTaskResult('error', { error: i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target' });
        }

        invalidateDataRequests();
        return runParentMove({
            sourceTaskId,
            expectedParentId: undefined,
            getState: () => get(),
            setState: (patch) => set(patch),
            restoreSnapshot: (snapshot) => set((state) => {
                const currentTask = state.allTasks.find((task) => task.id === sourceTaskId);
                const snapshotTask = snapshot.allTasks.find((task) => task.id === sourceTaskId);
                const lockVersion = Math.max(currentTask?.lockVersion ?? 0, snapshotTask?.lockVersion ?? 0);
                return {
                    ...snapshot,
                    allTasks: snapshot.allTasks.map((task) => task.id === sourceTaskId ? { ...task, lockVersion } : task),
                    tasks: snapshot.tasks.map((task) => task.id === sourceTaskId ? { ...task, lockVersion } : task)
                };
            }),
            buildNextOrder: (allTasks, sourceBefore) => tailDisplayOrderForRoot(allTasks, sourceBefore),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: undefined, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            isCurrentOperation: (state, sourceBefore, operationGeneration) => (
                state.editGenerations[sourceBefore.id] === operationGeneration &&
                state.allTasks.find((task) => task.id === sourceBefore.id)?.parentId === undefined
            ),
            updateTaskFields: (taskId, payload, lifecycle) => taskMutationService.updateTaskFields(
                taskId,
                () => ({
                    parent_issue_id: null,
                    lock_version: payload().lock_version
                }),
                lifecycle
            ),
            validatePersistedResult: (result) => result.parentId === undefined,
            missingSourceResult: buildParentMoveFailure(),
            failedResult: buildParentMoveFailure,
            onConflict: (taskId, message) => get().registerTaskConflict(taskId, message),
            onMutationMetadata: (taskId, metadata) => get().applyTaskMutationMetadata(taskId, metadata)
        });
    },

    updateTask: (id, updates) => set((state) => {
        const task = state.allTasks.find(t => t.id === id);
        if (!task) return state;

        if (!TaskLogicService.canEditTask(task)) {
            console.warn('Task is not editable');
            return state;
        }

        invalidateDataRequests();

        const updatedTask = { ...task, ...updates };
        TaskLogicService.validateDates(updatedTask).forEach(warn => console.warn(warn));

        let currentTasks = state.allTasks.map(t => t.id === id ? updatedTask : t);
        const pendingUpdates = new Map<string, Partial<Task>>();

        if (updates.startDate !== undefined || updates.dueDate !== undefined) {
            const depResult = TaskLogicService.checkDependencies(
                state.allTasks,
                state.relations,
                id,
                updatedTask.startDate!,
                updatedTask.dueDate!,
                useUIStore.getState().autoScheduleMoveMode
            );
            if (depResult.error) {
                useUIStore.getState().addNotification(depResult.error, 'error');
                return state;
            }
            depResult.updates.forEach((v, k) => pendingUpdates.set(k, v));
        }

        if (pendingUpdates.size > 0) {
            currentTasks = currentTasks.map(t => {
                if (pendingUpdates.has(t.id)) {
                    return { ...t, ...pendingUpdates.get(t.id) };
                }
                return t;
            });
        }

            const cascadingUpdates = resolveCascadingScheduleUpdates(
                currentTasks,
                state.relations,
                [id, ...pendingUpdates.keys()],
                useUIStore.getState().autoScheduleMoveMode !== AutoScheduleMoveMode.Off
            );
            if (cascadingUpdates.error) {
                useUIStore.getState().addNotification(cascadingUpdates.error, 'error');
                return state;
            }
            currentTasks = cascadingUpdates.tasks;
            cascadingUpdates.updates.forEach((patch, taskId) => pendingUpdates.set(taskId, patch));

            const finalTasks = state.allTasks.map(t => {
            if (t.id === id) return updatedTask;
            if (pendingUpdates.has(t.id)) return { ...t, ...pendingUpdates.get(t.id) };
            return t;
        });



        // Add modified task IDs
        const newModifiedIds = new Set(state.modifiedTaskIds);
        newModifiedIds.add(id);
        pendingUpdates.forEach((_, key) => newModifiedIds.add(key));
        const nextEditGenerations = { ...state.editGenerations };
        [id, ...pendingUpdates.keys()].forEach((taskId) => {
            nextEditGenerations[taskId] = (nextEditGenerations[taskId] ?? 0) + 1;
        });
        const nextLocalTaskPatches = { ...state.localTaskPatches };
        const patchFor = (taskId: string, fields: Partial<Task>) => {
            const meaningfulFields = Object.fromEntries(
                Object.entries(fields).filter(([key]) => key !== 'lockVersion' && key !== 'id')
            ) as Partial<Task>;
            if (Object.keys(meaningfulFields).length === 0) return;
            const generation = nextEditGenerations[taskId] ?? 0;
            const operationId = `edit:${taskId}:${generation}`;
            nextLocalTaskPatches[taskId] = [
                ...(nextLocalTaskPatches[taskId] ?? []).filter(patch => patch.operationId !== operationId),
                { entityId: taskId, fields: meaningfulFields, generation, operationId }
            ];
        };
        patchFor(id, updates);
        pendingUpdates.forEach((fields, taskId) => patchFor(taskId, fields));

        const changedFields = new Set([...Object.keys(updates), ...[...pendingUpdates.values()].flatMap(patch => Object.keys(patch))]);
        const requiresLayout = ['projectId', 'assignedToId', 'fixedVersionId'].some(field => changedFields.has(field));
        const requiresScheduling = ['startDate', 'dueDate', 'parentId', 'displayOrder'].some(field => changedFields.has(field));
        const derivedInvalidation: DerivedInvalidation = requiresScheduling
            ? 'critical_path'
            : requiresLayout
                ? 'layout'
                : 'none';
        const nextSchedulingSummary = requiresScheduling
            ? buildDerivedSchedulingSummary(finalTasks, state.relations)
            : {
                schedulingStates: state.schedulingStates,
                criticalPathMetrics: state.criticalPathMetrics,
                criticalPathProjectFinish: state.criticalPathProjectFinish
            };

        if (state.isSortingSuspended) {
            // Just update the view 'tasks' without re-layout (preserving order)
            const newViewTasks = state.tasks.map(t => {
                const updated = finalTasks.find(ft => ft.id === t.id);
                if (updated) {
                    // Keep layout-specific props from 't', update data from 'updated'
                    return {
                        ...updated,
                        rowIndex: t.rowIndex,
                        indentLevel: t.indentLevel,
                        treeLevelGuides: t.treeLevelGuides,
                        isLastChild: t.isLastChild,
                        hasChildren: t.hasChildren
                    };
                }
                return t;
            });

            return {
                allTasks: finalTasks,
                tasks: newViewTasks,
                ...nextSchedulingSummary,
                modifiedTaskIds: newModifiedIds, // Add here for suspended case
                editGenerations: nextEditGenerations,
                localTaskPatches: nextLocalTaskPatches
            };
        }

        if (!requiresLayout && !requiresScheduling) {
            const nextViewTasks = state.tasks.map(viewTask => {
                const updated = finalTasks.find(task => task.id === viewTask.id);
                return updated ? {
                    ...updated,
                    rowIndex: viewTask.rowIndex,
                    indentLevel: viewTask.indentLevel,
                    treeLevelGuides: viewTask.treeLevelGuides,
                    isLastChild: viewTask.isLastChild,
                    hasChildren: viewTask.hasChildren
                } : viewTask;
            });
            return {
                allTasks: finalTasks,
                tasks: nextViewTasks,
                modifiedTaskIds: newModifiedIds,
                editGenerations: nextEditGenerations,
                localTaskPatches: nextLocalTaskPatches
            };
        }

        const derived = buildDerivedTaskState(state, {
            allTasks: finalTasks,
            derivedInvalidation,
            schedulingSummary: nextSchedulingSummary
        });

        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds: newModifiedIds, // Add here for normal case
            editGenerations: nextEditGenerations,
            localTaskPatches: nextLocalTaskPatches
        };
    }),

    setTaskLockVersion: (id, lockVersion) => set((state) => {
        const currentLockVersion = state.allTasks.find(task => task.id === id)?.lockVersion ?? 0;
        if (lockVersion < currentLockVersion) return state;
        const allTasks = state.allTasks.map((task) => (
            task.id === id ? { ...task, lockVersion } : task
        ));
        const tasks = state.tasks.map((task) => (
            task.id === id ? { ...task, lockVersion } : task
        ));
        const serverEntity = state.serverTaskSnapshot.entitiesById[id];
        return {
            allTasks,
            tasks,
            ...(serverEntity && lockVersion >= (state.serverTaskSnapshot.revisions[id] ?? 0)
                ? {
                    serverTaskSnapshot: {
                        ...state.serverTaskSnapshot,
                        entitiesById: {
                            ...state.serverTaskSnapshot.entitiesById,
                            [id]: { ...serverEntity, lockVersion }
                        },
                        revisions: { ...state.serverTaskSnapshot.revisions, [id]: lockVersion }
                    }
                }
                : {})
        };
    }),

    commitTaskOperation: (id, operationGeneration, lockVersion) => set((state) => {
        const currentTask = state.allTasks.find(task => task.id === id);
        if (!currentTask) return state;
        const operationPatches = (state.localTaskPatches[id] ?? []).filter(patch => patch.generation === operationGeneration);
        if (operationPatches.length === 0) return state;
        const committedFields = operationPatches.reduce<Partial<Task>>(
            (fields, patch) => ({ ...fields, ...patch.fields }),
            {}
        );
        const committedTask = {
            ...(state.serverTaskSnapshot.entitiesById[id] ?? currentTask),
            ...committedFields,
            lockVersion: Math.max(currentTask.lockVersion, lockVersion ?? currentTask.lockVersion)
        };
        const localTaskPatches = { ...state.localTaskPatches };
        localTaskPatches[id] = (localTaskPatches[id] ?? []).filter(patch => patch.generation !== operationGeneration);
        if (localTaskPatches[id].length === 0) delete localTaskPatches[id];
        const modifiedTaskIds = new Set(state.modifiedTaskIds);
        if (!localTaskPatches[id]) modifiedTaskIds.delete(id);
        const taskConflicts = { ...state.taskConflicts };
        delete taskConflicts[id];
        const allTasks = state.allTasks.map(task => task.id === id
            ? { ...task, lockVersion: committedTask.lockVersion }
            : task);
        const tasks = state.tasks.map(task => task.id === id
            ? { ...task, lockVersion: committedTask.lockVersion }
            : task);
        return {
            allTasks,
            tasks,
            modifiedTaskIds,
            localTaskPatches,
            taskConflicts,
            serverTaskSnapshot: {
                ...state.serverTaskSnapshot,
                entitiesById: { ...state.serverTaskSnapshot.entitiesById, [id]: committedTask },
                revisions: {
                    ...state.serverTaskSnapshot.revisions,
                    [id]: Math.max(state.serverTaskSnapshot.revisions[id] ?? 0, committedTask.lockVersion)
                }
            }
        };
    }),

    applyTaskMutationMetadata: (taskId, metadata) => {
        const invalidatedIds = new Set(metadata.invalidatedEntityIds ?? []);
        const deletedIds = new Set(metadata.deletedEntityIds ?? []);
        const needsRefresh = [...invalidatedIds].some(id => id !== taskId);

        if (invalidatedIds.size > 0 || deletedIds.size > 0) invalidateDataRequests();

        set((state) => {
            if (!deletedIds.has(taskId)) return state;

            const finalTasks = state.allTasks.filter(task => task.id !== taskId);
            const derived = buildDerivedTaskState(state, { allTasks: finalTasks });
            const localTaskPatches = { ...state.localTaskPatches };
            delete localTaskPatches[taskId];
            const modifiedTaskIds = new Set(state.modifiedTaskIds);
            modifiedTaskIds.delete(taskId);
            return {
                allTasks: finalTasks,
                ...toDerivedTaskStatePatch(derived),
                localTaskPatches,
                modifiedTaskIds,
                taskTombstones: {
                    ...state.taskTombstones,
                    [taskId]: { entityId: taskId, deletedAt: Date.now(), source: 'server' }
                }
            };
        });

        if (needsRefresh) {
            queueMicrotask(() => {
                void get().refreshData().catch((error) => console.error('Failed to refresh invalidated tasks', error));
            });
        }
    },

    refreshForMutationMetadata: (metadata) => {
        if ((metadata.invalidatedEntityIds?.length ?? 0) === 0) return;
        invalidateDataRequests();
        queueMicrotask(() => {
            void get().refreshData().catch((error) => console.error('Failed to refresh invalidated tasks', error));
        });
    },



    removeTask: (id) => set((state) => {
        invalidateDataRequests();
        const finalTasks = state.allTasks.filter(t => t.id !== id);
        const derived = buildDerivedTaskState(state, { allTasks: finalTasks });
        const localTaskPatches = { ...state.localTaskPatches };
        delete localTaskPatches[id];
        const modifiedTaskIds = new Set(state.modifiedTaskIds);
        modifiedTaskIds.delete(id);
        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds,
            localTaskPatches,
            taskTombstones: {
                ...state.taskTombstones,
                [id]: { entityId: id, deletedAt: Date.now(), source: 'local' }
            }
        };
    }),

    markTaskTombstone: (id, source = 'server', operationId) => set((state) => {
        invalidateDataRequests();
        const finalTasks = state.allTasks.filter(task => task.id !== id);
        const derived = buildDerivedTaskState(state, { allTasks: finalTasks });
        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived),
            taskTombstones: {
                ...state.taskTombstones,
                [id]: { entityId: id, deletedAt: Date.now(), source, operationId }
            }
        };
    }),

    clearTaskTombstone: (id) => set((state) => {
        if (!state.taskTombstones[id]) return state;
        const taskTombstones = { ...state.taskTombstones };
        delete taskTombstones[id];
        return { taskTombstones };
    }),

    registerTaskConflict: (id, message) => set((state) => ({
        taskConflicts: {
            ...state.taskConflicts,
            [id]: { taskId: id, message, detectedAt: Date.now() }
        }
    })),

    resolveTaskConflict: async (id, resolution) => {
        if (resolution === 'dismiss') {
            set((state) => {
                if (!state.taskConflicts[id]) return state;
                const taskConflicts = { ...state.taskConflicts };
                delete taskConflicts[id];
                return { taskConflicts };
            });
            return;
        }

        if (resolution === 'local') {
            set((state) => {
                if (!state.taskConflicts[id]) return state;
                const taskConflicts = { ...state.taskConflicts };
                delete taskConflicts[id];
                return { taskConflicts };
            });
            await get().saveChanges();
            return;
        }

        invalidateDataRequests();
        set((state) => {
            const remoteTask = state.serverTaskSnapshot.entitiesById[id];
            const allTasks = remoteTask
                ? state.allTasks.some(task => task.id === id)
                    ? state.allTasks.map(task => task.id === id ? remoteTask : task)
                    : [...state.allTasks, remoteTask]
                : state.allTasks.filter(task => task.id !== id);
            const derived = buildDerivedTaskState(state, { allTasks });
            const localTaskPatches = { ...state.localTaskPatches };
            delete localTaskPatches[id];
            const modifiedTaskIds = new Set(state.modifiedTaskIds);
            modifiedTaskIds.delete(id);
            const taskTombstones = { ...state.taskTombstones };
            if (remoteTask) {
                delete taskTombstones[id];
            } else {
                taskTombstones[id] = { entityId: id, deletedAt: Date.now(), source: 'server' };
            }
            const taskConflicts = { ...state.taskConflicts };
            delete taskConflicts[id];
            return {
                allTasks,
                ...toDerivedTaskStatePatch(derived),
                localTaskPatches,
                modifiedTaskIds,
                taskTombstones,
                taskConflicts
            };
        });
    },

    updateViewport: (updates) => set((state) => {
        const nextViewport = { ...state.viewport, ...updates };

        // Must match BOTTOM_PADDING_PX in GanttContainer.tsx
        const BOTTOM_PADDING_PX = 40;
        const totalHeight = Math.max(0, state.rowCount * nextViewport.rowHeight + BOTTOM_PADDING_PX);
        const maxScrollY = Math.max(0, totalHeight - nextViewport.height);
        const nextScrollY = Math.max(0, Math.min(maxScrollY, nextViewport.scrollY));

        const nextState: Partial<TaskState> = {
            viewport: { ...nextViewport, scrollY: nextScrollY }
        };

        // If scale changed (e.g. CTRL+wheel), persist it to customScales for current level
        if (updates.scale !== undefined && updates.scale !== state.viewport.scale) {
            nextState.customScales = {
                ...state.customScales,
                [state.zoomLevel]: updates.scale
            };
        }

        return nextState;
    }),
    setRowHeight: (height) => set((state) => ({
        viewport: { ...state.viewport, rowHeight: height }
    })),

    setViewMode: (mode) => set((state) => {
        let zoom = state.zoomLevel;
        if (mode === 'Month') zoom = 0;
        if (mode === 'Week') zoom = 1;
        if (mode === 'Day') zoom = 2;

        const { viewport, customScales } = state;
        const newScale = customScales[zoom] ?? ZOOM_SCALES[zoom];
        const tasksMaxDue = getMaxFiniteDueDate(state.allTasks);
        const adjustment = computeCenteredViewport(viewport, newScale, tasksMaxDue);

        return {
            viewMode: mode,
            zoomLevel: zoom,
            viewport: { ...state.viewport, scale: newScale, scrollX: adjustment.scrollX, startDate: adjustment.startDate }
        };
    }),

    setZoomLevel: (level) => set((state) => {
        const { viewport, customScales } = state;
        const newScale = customScales[level] ?? ZOOM_SCALES[level];
        const tasksMaxDue = getMaxFiniteDueDate(state.allTasks);
        const adjustment = computeCenteredViewport(viewport, newScale, tasksMaxDue);

        let mode: ViewMode = 'Week';
        if (level === 0) mode = 'Month';
        if (level === 1) mode = 'Week';
        if (level === 2) mode = 'Day';

        return {
            zoomLevel: level,
            viewMode: mode,
            viewport: { ...state.viewport, scale: newScale, scrollX: adjustment.scrollX, startDate: adjustment.startDate }
        };
    }),

    setGroupByProject: (grouped) => set((state) => {
        const nextGroupByAssignee = grouped ? false : state.groupByAssignee;
        const layout = buildLayoutFromState(state, {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee
        });
        const nextState = {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee,
            explicitGroupByOverride: grouped ? 'project' as const : (nextGroupByAssignee ? 'assignee' as const : null),
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        return nextState;
    }),
    setGroupByAssignee: (grouped) => set((state) => {
        const nextGroupByProject = grouped ? false : state.groupByProject;
        const nextShowSubprojects = state.showSubprojects;
        const layout = buildLayoutFromState(state, {
            groupByAssignee: grouped,
            groupByProject: nextGroupByProject,
            showSubprojects: nextShowSubprojects
        });
        const nextState = {
            groupByAssignee: grouped,
            groupByProject: nextGroupByProject,
            explicitGroupByOverride: grouped ? 'assignee' as const : (nextGroupByProject ? 'project' as const : null),
            showSubprojects: nextShowSubprojects,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        return nextState;
    }),
    setOrganizeByDependency: (enabled) => set((state) => {
        const showVersions = enabled ? false : state.showVersions;
        const layout = buildLayoutFromState(state, { organizeByDependency: enabled, showVersions });
        return {
            organizeByDependency: enabled,
            showVersions,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),


    setCurrentProjectId: (id) => set((state) => {
        if (state.currentProjectId === id) return state;
        const newPrefs = loadPreferences(id);
        const layout = buildLayoutFromState(state, { currentProjectId: id });
        return {
            currentProjectId: id,
            memberProjectsOnly: newPrefs.memberProjectsOnly ?? false,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleProjectExpansion: (projectId) => set((state) => {
        const projectExpansion = { ...state.projectExpansion, [projectId]: !(state.projectExpansion[projectId] ?? true) };
        const layout = buildLayoutFromState(state, { projectExpansion });
        return {
            projectExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleVersionExpansion: (versionId) => set((state) => {
        const versionExpansion = { ...state.versionExpansion, [versionId]: !(state.versionExpansion[versionId] ?? true) };
        const layout = buildLayoutFromState(state, { versionExpansion });
        return {
            versionExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleTaskExpansion: (taskId: string) => set((state) => {
        const taskExpansion = { ...state.taskExpansion, [taskId]: !(state.taskExpansion[taskId] ?? true) };
        const layout = buildLayoutFromState(state, { taskExpansion });
        return {
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleAllExpansion: () => set((state) => {
        // Check if anything is collapsed. If so, expand all. Otherwise, collapse all.
        const anyProjectCollapsed = (state.groupByProject || state.groupByAssignee) &&
            Object.keys(state.projectExpansion).length > 0 &&
            Object.values(state.projectExpansion).some(v => v === false);

        const anyVersionCollapsed = state.showVersions &&
            Object.keys(state.versionExpansion).length > 0 &&
            Object.values(state.versionExpansion).some(v => v === false);

        const anyTaskCollapsed = state.tasks.some(t => t.hasChildren && state.taskExpansion[t.id] === false);

        const shouldExpand = anyProjectCollapsed || anyVersionCollapsed || anyTaskCollapsed;

        const { projectExpansion, versionExpansion, taskExpansion } = buildAllExpandedStates(state, shouldExpand);

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    expandAll: () => set((state) => {
        const { projectExpansion, versionExpansion, taskExpansion } = buildAllExpandedStates(state, true);

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    collapseAll: () => set((state) => {
        const { projectExpansion, versionExpansion, taskExpansion } = buildAllExpandedStates(state, false);

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setFilterText: (text) => set((state) => {
        const layout = buildLayoutFromState(state, { filterText: text });
        return {
            filterText: text,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setSelectedAssigneeIds: (ids) => set((state) => {
        invalidateDataRequests();
        const layout = buildLayoutFromState(state, { selectedAssigneeIds: ids });
        const queryContext = setAssigneeOverride(state.queryContext, ids.length > 0
            ? { mode: 'subset', values: ids }
            : { mode: 'all' });
        const nextState = {
            ...queryContextPatch(queryContext),
            selectedAssigneeIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),

    setSelectedProjectIds: (ids) => set((state) => {
        invalidateDataRequests();
        const layout = buildLayoutFromState(state, { selectedProjectIds: ids });
        const nextState = {
            selectedProjectIds: ids,
            projectSelectionExplicit: true,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),
    setSelectedVersionIds: (ids) => set((state) => {
        invalidateDataRequests();
        const layout = buildLayoutFromState(state, { selectedVersionIds: ids });
        const queryContext = setVersionOverride(state.queryContext, ids.length > 0
            ? { mode: 'subset', values: ids }
            : { mode: 'all' });
        const nextState = {
            ...queryContextPatch(queryContext),
            selectedVersionIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),
    setMemberProjectsOnly: async (enabled) => {
        const current = get();
        if (current.memberProjectsOnly === enabled) return;

        invalidateDataRequests();
        set({ memberProjectsOnly: enabled });
        saveDisplayPreferences({ memberProjectsOnly: enabled }, current.currentProjectId);
        syncSharedQueryState({ ...get(), memberProjectsOnly: enabled });
        await get().refreshData();
    },

    scrollToTask: (taskId: string) => set((state) => {
        const targetTask = state.tasks.find(t => t.id === taskId)
            ?? state.allTasks.find(t => t.id === taskId);
        if (!targetTask) return state;

        const targetMetadata = getTaskFocusTimestamp(targetTask);

        let { viewport } = state;

        if (targetMetadata < viewport.startDate) {
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const newStartDate = targetMetadata - ONE_WEEK;
            viewport = {
                ...viewport,
                startDate: newStartDate
            };
        }

        const taskX = (targetMetadata - viewport.startDate) * viewport.scale;
        const centeredX = Math.max(0, taskX - (viewport.width / 2));

        return {
            viewport: { ...viewport, scrollX: centeredX }
        };
    }),

    focusTask: (taskId: string) => {
        const state = get();
        const targetTask = state.allTasks.find((task) => task.id === taskId);
        if (!targetTask) {
            return { status: 'missing' } as const;
        }

        if (!matchesTaskFilters(targetTask, state)) {
            return { status: 'filtered_out' } as const;
        }

        const nextTaskExpansion = { ...state.taskExpansion };
        const nextProjectExpansion = { ...state.projectExpansion };
        const nextVersionExpansion = { ...state.versionExpansion };
        const taskById = new Map(state.allTasks.map((task) => [task.id, task]));

        let currentParentId = targetTask.parentId;
        while (currentParentId) {
            nextTaskExpansion[currentParentId] = true;
            currentParentId = taskById.get(currentParentId)?.parentId;
        }

        const projectId = targetTask.projectId ?? 'default_project';
        nextProjectExpansion[projectId] = true;
        const assigneeId = targetTask.assignedToId === undefined || targetTask.assignedToId === null
            ? 'none'
            : String(targetTask.assignedToId);
        nextProjectExpansion[`assignee:${assigneeId}`] = true;

        const rootTask = getLayoutRootForTask(targetTask, taskById, state);
        const rootGroupKey = getTaskGroupKey(rootTask, state);
        const rootVersionId = rootTask.fixedVersionId || NO_VERSION_ID;
        nextVersionExpansion[rootVersionId] = true;
        nextVersionExpansion[getVersionRowId(rootGroupKey, rootVersionId)] = true;

        const layout = buildLayoutFromState(state, {
            taskExpansion: nextTaskExpansion,
            projectExpansion: nextProjectExpansion,
            versionExpansion: nextVersionExpansion
        });
        const focusedTask = layout.tasks.find((task) => task.id === taskId);
        if (!focusedTask) {
            return { status: 'filtered_out' } as const;
        }

        const nextState = {
            taskExpansion: nextTaskExpansion,
            projectExpansion: nextProjectExpansion,
            versionExpansion: nextVersionExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount,
            viewport: computeFocusedViewport({
                ...state,
                rowCount: layout.rowCount,
                tasks: layout.tasks,
                layoutRows: layout.layoutRows
            }, focusedTask),
            selectedTaskId: taskId,
            selectedRelationId: null,
            draftRelation: null,
            contextMenu: null
        };

        set(nextState);
        return { status: 'ok' } as const;
    },

    setSortConfig: (key) => set((state) => {
        let newSort: TaskState['sortConfig'] = null;
        if (key === null) {
            newSort = null;
        } else {
            if (state.sortConfig?.key === key) {
                newSort = { key, direction: state.sortConfig.direction === 'asc' ? 'desc' : 'asc' };
            } else {
                newSort = { key, direction: 'asc' };
            }
        }

        const layout = buildLayoutFromState(state, { sortConfig: newSort });

        const nextState = {
            sortConfig: newSort,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncSharedQueryState({ ...state, ...nextState });
        return nextState;
    }),
    refreshData: async () => {
        const state = get();
        const query = toResolvedQueryStateFromStore(state);
        const scope = { showSubprojects: state.showSubprojects, memberProjectsOnly: state.memberProjectsOnly };
        const generation = ++dataRequestGeneration;
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query,
            scope,
            purpose: 'refresh'
        });
        await requestAndApplyData(() => apiClient.fetchData({ query, queryContext: state.queryContext }), context);
    },

    loadInitialData: async (params) => {
        const generation = ++dataRequestGeneration;
        const state = get();
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query: params.query ?? params.initialState ?? {},
            scope: { rawSearch: params.rawSearch, queryContext: params.queryContext },
            purpose: 'initial_load'
        });
        await requestAndApplyData(async () => {
            const { initialState, ...fetchParams } = params;
            const data = await apiClient.fetchData(fetchParams);
            return {
                ...data,
                ...(initialState ? { initialState: { ...data.initialState, ...initialState } } : {}),
                ...(params.queryContext ? { queryContext: params.queryContext } : {})
            };
        }, context);
    },

    loadSavedQueries: async (force = false) => {
        const { savedQueriesStatus } = get();
        if (!force && (savedQueriesStatus === 'loading' || savedQueriesStatus === 'ready')) {
            return;
        }

        const context = createReadContext({
            generation: ++auxiliaryReadGeneration,
            projectId: get().currentProjectId,
            query: { force },
            scope: { savedQueries: true },
            purpose: 'saved_queries',
            mergePolicy: 'replace'
        });
        auxiliaryReadContext = context;
        set({ savedQueriesStatus: 'loading', savedQueriesError: null });

        try {
            const { apiClient } = await import('../api/client');
            const queries = await apiClient.fetchQueries();
            if (!canApplyReadResponse(auxiliaryReadContext, context)) return;
            set({ savedQueries: queries, savedQueriesStatus: 'ready' });
        } catch (error) {
            if (!canApplyReadResponse(auxiliaryReadContext, context)) return;
            set({
                savedQueries: [],
                savedQueriesStatus: 'error',
                savedQueriesError: error instanceof Error ? error.message : (i18n.t('label_saved_query_load_failed') || 'Failed to load saved queries')
            });
        }
    },

    applySavedQuery: async (queryId) => {
        const generation = ++dataRequestGeneration;
        const state = get();
        const queryContext = selectSavedQuery(queryId);
        const query: ResolvedQueryState = {
            queryId,
            ...(state.projectSelectionExplicit ? { canvasProjectIds: state.selectedProjectIds } : {}),
            ...(state.memberProjectsOnly ? { memberProjectsOnly: true } : {})
        };
        set({
            activeQueryId: queryId,
            explicitGroupByOverride: undefined,
            ...queryContextPatch(queryContext)
        });
        replaceIssueQueryParamsInUrl(query, queryContext);
        syncSharedQueryState({ ...get(), activeQueryId: queryId });
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query,
            scope: { showSubprojects: state.showSubprojects, memberProjectsOnly: state.memberProjectsOnly },
            purpose: 'saved_query'
        });
        await requestAndApplyData(() => apiClient.fetchData({ query, queryContext }), context);
    },

    clearSavedQuery: async () => {
        invalidateDataRequests();
        const state = get();
        const queryContext = clearSavedQueryToStandalone(standaloneOverridesFromState(state));
        set({ activeQueryId: null, ...queryContextPatch(queryContext) });
        syncSharedQueryState({ ...get(), activeQueryId: null });
        await get().refreshData();
    },

    saveChanges: async () => {
        if (saveChangesOperation) return saveChangesOperation;

        const operation = (async () => {
            while (true) {
                const snapshot = get();
                if (snapshot.modifiedTaskIds.size === 0) return new Map<string, string>();

                const snapshotGenerations = { ...snapshot.editGenerations };
                const snapshotTaskIds = new Set(snapshot.modifiedTaskIds);
                const conflictMessages = new Map<string, string>();
                const requiresResync = [...snapshotTaskIds].some(taskId => (
                    (snapshot.localTaskPatches[taskId] ?? []).some(patch => (
                        ['startDate', 'dueDate', 'parentId', 'displayOrder'].some(field => field in patch.fields)
                    ))
                ));
                invalidateDataRequests();
                const failures = await saveModifiedTasks(
                    snapshot.allTasks,
                    snapshot.relations,
                    snapshot.modifiedTaskIds,
                    snapshot.selectedStatusIds,
                    taskMutationService.updateTask,
                    fetchMutationResyncData,
                    (taskId, lockVersion) => {
                        if (typeof lockVersion !== 'number') return;
                        set((state) => {
                            const savedTask = snapshot.allTasks.find((task) => task.id === taskId);
                            const allTasks = state.allTasks.map((task) => (
                                task.id === taskId ? { ...task, lockVersion: Math.max(task.lockVersion, lockVersion) } : task
                            ));
                            const currentServerTask = state.serverTaskSnapshot.entitiesById[taskId] ?? savedTask;
                            const persistedFields: Partial<Task> = savedTask
                                ? {
                                    startDate: savedTask.startDate,
                                    dueDate: savedTask.dueDate,
                                    parentId: savedTask.parentId,
                                    displayOrder: savedTask.displayOrder
                                }
                                : {};
                            return {
                                allTasks,
                                serverTaskSnapshot: {
                                    ...state.serverTaskSnapshot,
                                    entitiesById: {
                                        ...state.serverTaskSnapshot.entitiesById,
                                        ...(currentServerTask
                                            ? { [taskId]: { ...currentServerTask, ...persistedFields, lockVersion: Math.max(currentServerTask.lockVersion, lockVersion) } }
                                            : {})
                                    },
                                    revisions: { ...state.serverTaskSnapshot.revisions, [taskId]: Math.max(state.serverTaskSnapshot.revisions[taskId] ?? 0, lockVersion) }
                                }
                            };
                        });
                    },
                    (taskId, result) => {
                        get().applyTaskMutationMetadata(taskId, result);
                        if (result.status === 'not_found') {
                            get().markTaskTombstone(taskId, 'server');
                            get().registerTaskConflict(taskId, result.error || (i18n.t('error_canvas_gantt_task_not_found') || 'Task no longer exists'));
                        }
                    },
                    (taskId, message) => {
                        conflictMessages.set(taskId, message);
                    }
                );

                set((state) => {
                    const modifiedTaskIds = new Set(state.modifiedTaskIds);
                    const localTaskPatches = { ...state.localTaskPatches };
                    snapshotTaskIds.forEach((taskId) => {
                        if (failures.has(taskId)) return;
                        const currentGeneration = state.editGenerations[taskId] ?? 0;
                        const savedGeneration = snapshotGenerations[taskId] ?? 0;
                        localTaskPatches[taskId] = (localTaskPatches[taskId] ?? [])
                            .filter(patch => patch.generation > savedGeneration);
                        if (currentGeneration === savedGeneration) {
                            modifiedTaskIds.delete(taskId);
                        }
                    });
                    return { modifiedTaskIds, localTaskPatches };
                });

                if (requiresResync || conflictMessages.size > 0) await get().refreshData();
                if (conflictMessages.size > 0) {
                    set((state) => {
                        const taskConflicts = { ...state.taskConflicts };
                        conflictMessages.forEach((message, taskId) => {
                            taskConflicts[taskId] = { taskId, message, detectedAt: Date.now() };
                        });
                        return { taskConflicts };
                    });
                }
                if (failures.size > 0) {
                    const [failedTaskId, failedReason] = failures.entries().next().value as [string, string];
                    useUIStore.getState().addNotification(
                        `${i18n.t('label_failed_to_save') || 'Failed to save'} (#${failedTaskId}: ${failedReason})`,
                        'error'
                    );
                    return failures;
                }

                if (get().modifiedTaskIds.size === 0) return failures;
            }
        })();

        saveChangesOperation = operation;
        try {
            return await operation;
        } finally {
            if (saveChangesOperation === operation) saveChangesOperation = null;
        }
    },

    discardChanges: async () => {
        const state = get();
        set({ localTaskPatches: {}, modifiedTaskIds: new Set() });
        await state.refreshData();
    }
});
});
