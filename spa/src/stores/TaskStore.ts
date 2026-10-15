import { create } from 'zustand';
import type { FilterOptions, Task, PersistedTaskState, Relation, DraftRelation, Viewport, ViewMode, ZoomLevel, LayoutRow, Version, TaskStatus, SavedQuery } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences, saveDisplayPreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';
import { i18n } from '../utils/i18n';
import { useUIStore } from './UIStore';
import { useBaselineStore } from './BaselineStore';
import type { MoveTaskAsChildResult } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';
import type { BusinessCalendarDiagnostic } from '../types/businessCalendar';
import type { LayoutState, SortConfig } from './taskStore/types';
import { buildLayout, getVersionRowId, NO_VERSION_ID } from './taskStore/layout';
import { applyFilters } from './taskStore/filters';
import { isDescendantTask, tailDisplayOrderForParent, tailDisplayOrderForRoot } from './taskStore/hierarchy';
import {
    clampViewportScrollY,
    computeCenteredViewport,
    computeFocusedViewport
} from './taskStore/viewport';
import { buildMoveTaskResult, saveModifiedTasks } from './taskStore/taskPersistence';
import { runParentMove } from './taskStore/parentMove';
import { buildUniformExpansionMaps, initializeExpansionMaps } from './taskStore/expansion';
import { syncSharedQueryState, type SharedQuerySyncState } from './taskStore/querySync';
import {
    beginBarOperation as beginBarOperationState,
    buildBarOperationRollback,
    captureBarOperationBaselines,
    endBarOperation as endBarOperationState,
    settleBarOperationTaskOwnership,
    type BarOperationRecord
} from './taskStore/barOperations';
import {
    clearSavedQueryToStandalone,
    isQueryModified as getIsQueryModified,
    selectSavedQuery,
    setAssigneeOverride,
    setStatusOverride,
    setTrackerOverride,
    setVersionOverride
} from '../query/queryState';
import type { QueryContext, QueryOverrides } from '../query/types';
import { resolvedStateToQueryContext } from '../query/queryStateCodec';
import { toBusinessQueryState } from '../query/resolvedQueryStateCodec';
import type { SchedulingStateInfo } from '../scheduling/constraintGraph';
import type { CriticalPathTaskMetrics } from '../scheduling/criticalPath';
import { AutoScheduleMoveMode, DatePlacementMode, type DatePlacementMode as DatePlacementModeValue } from '../types/constraints';
import { configureBusinessCalendar, normalizeTaskDateInterval } from '../utils/businessCalendar';
import { fromLocalDate, parseDateOnly, toCalendarDate, toTimelineDate, todayCalendarDate } from '../utils/dateOnly';
import { apiClient } from '../api/client';
import type { ExpectedRelation, MutationMetadata } from '../api/client';
import { setConfirmedProjectScope, type ConfirmedProjectScope } from '../api/projectScopeContext';
import { classifyMutationSourceDisposition } from '../api/mutationOutcome';
import type { MutationRemoteAvailability } from '../api/mutationOutcome';
import { buildTaskMutationDelta, BULK_TASK_FIELDS, PERSISTABLE_TASK_FIELDS, RelationExecutionGuardError, taskMutationFields, taskMutationService, type TaskFields } from '../services/taskMutationService';
import {
    countPendingRelationChanges,
    getPendingRelationChange as selectPendingRelationChange,
    hasPendingRelationChanges,
    normalizeRelationCreate,
    normalizeRelationDelete,
    normalizeRelationUpdate,
    orderedRelationChanges,
    projectEffectiveRelations,
    relationChangeTarget,
    sameRelationTarget,
    validateRelationDrafts,
    type PendingRelationChange,
    type RelationDraftMap,
    type RelationTarget
} from './taskStore/relationDrafts';
import {
    applyLocalPatches,
    settleLocalPatchFields,
    canApplyReadResponse,
    createReadContext,
    createServerSnapshot,
    replaceServerSnapshot,
    mergeServerEntity,
    hasLocalPatchOwnership,
    hasLocalMutationIntent,
    type DerivedInvalidation,
    type LocalPatch,
    type EntityTombstone,
    type ReadApplyOutcome,
    type ReadContext,
    type ServerSnapshot
} from './taskStore/stateContract';
import { selectConflictRemote, type SelectedConflictRemote } from './taskStore/conflictRemote';
import { applyScheduleConflict, prepareScheduleConflict, scheduleConflictIds, selectScheduleConflict, type ScheduleConflictReview } from './taskStore/scheduleConflictResolution';
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
    generation?: number;
    remoteEntity?: PersistedTaskState;
    remoteRevision?: number;
    remoteAvailability?: MutationRemoteAvailability;
    scheduleOperation?: Record<string, number>;
    scheduleReview?: ScheduleConflictReview;
    scheduleChoice?: 'local' | 'remote';
};

const terminalTaskDeletionPatch = (
    state: TaskState,
    taskId: string,
    source: EntityTombstone['source']
): Partial<TaskState> => {
    const finalTasks = state.allTasks.filter(task => task.id !== taskId);
    const derived = buildDerivedTaskState(state, { allTasks: finalTasks });
    const localTaskPatches = { ...state.localTaskPatches };
    delete localTaskPatches[taskId];
    const modifiedTaskIds = new Set(state.modifiedTaskIds);
    modifiedTaskIds.delete(taskId);
    const settlement = settleBarOperationTaskOwnership(
        state.barOperations,
        state.activeBarOperationId,
        taskId,
        { mode: 'all' }
    );
    return {
        allTasks: finalTasks,
        ...toDerivedTaskStatePatch(derived),
        localTaskPatches,
        modifiedTaskIds,
        ...settlement,
        taskConflicts: Object.fromEntries(
            Object.entries(state.taskConflicts).filter(([conflictTaskId]) => conflictTaskId !== taskId)
        ),
        serverTaskSnapshot: {
            ...state.serverTaskSnapshot,
            entitiesById: Object.fromEntries(
                Object.entries(state.serverTaskSnapshot.entitiesById).filter(([entityId]) => entityId !== taskId)
            ),
            revisions: Object.fromEntries(
                Object.entries(state.serverTaskSnapshot.revisions).filter(([entityId]) => entityId !== taskId)
            )
        },
        taskTombstones: {
            ...state.taskTombstones,
            [taskId]: { entityId: taskId, deletedAt: Date.now(), source }
        }
    };
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
let autoSaveEnableOperation: Promise<void> | null = null;
let barOperationSequence = 0;

const buildTaskPatchFieldsPayload = (task: Task, fields: Partial<Task>): Record<string, unknown> => {
    return taskMutationFields({ ...task, ...fields }, Object.keys(fields));
};

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

const queueRefreshData = (refreshData: () => Promise<ReadApplyOutcome>) => {
    queueMicrotask(() => {
        // Each UI scope change is an explicit read invalidation. This keeps
        // separately queued changes observable while identical direct
        // refresh calls can still share an in-flight request.
        dataRequestGeneration += 1;
        void refreshData().catch((error) => console.error('Failed to refresh data', error));
    });
};

export interface TaskState {
    businessCalendarValidation: {
        status: 'valid' | 'invalid' | 'stale';
        message: string | null;
        diagnostic: BusinessCalendarDiagnostic | null;
    };
    permissions: { editable: boolean; viewable: boolean; baselineEditable: boolean };
    allTasks: Task[];
    tasks: Task[];
    relations: Relation[];
    pendingRelationChanges: RelationDraftMap;
    relationEditGeneration: number;
    schedulingStates: Record<string, SchedulingStateInfo>;
    criticalPathMetrics: Record<string, CriticalPathTaskMetrics>;
    criticalPathProjectFinish?: number;
    calculateCriticalPathEnabled: boolean;
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
    selectedTrackerIds: number[];
    memberProjectsOnly: boolean;
    confirmedProjectScope: ConfirmedProjectScope | null;
    inactiveExternalProjectIds: string[];

    sortConfig: SortConfig;
    customScales: Record<number, number>;

    currentProjectId: string | null;
    showSubprojects: boolean;

    isSortingSuspended: boolean;
    modifiedTaskIds: Set<string>;
    editGenerations: Record<string, number>;
    autoSave: boolean;
    autoSaveTransition: 'idle' | 'enabling';
    initialDataLoaded: boolean;
    dataReadStatus: 'idle' | 'loading' | 'ready' | 'error';
    activeReadContext: ReadContext | null;
    serverTaskSnapshot: ServerSnapshot<Task>;
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>;
    taskTombstones: Record<string, EntityTombstone>;
    taskConflicts: Record<string, TaskConflictRecord>;
    barOperations: Record<string, BarOperationRecord>;
    activeBarOperationId: string | null;

    // Actions
    setAutoSave: (enabled: boolean) => void;
    requestAutoSaveChange: (enabled: boolean) => Promise<void>;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setFilterOptions: (filterOptions: FilterOptions) => void;
    setTaskStatuses: (statuses: TaskStatus[]) => void;
    setCalculateCriticalPathEnabled: (enabled: boolean) => void;
    setCustomFields: (fields: CustomFieldMeta[]) => void;
    setPermissions: (permissions: { editable: boolean; viewable: boolean; baselineEditable: boolean }) => void;
    restoreActiveQueryId: (queryId: number | null) => void;
    restoreCanvasScope: (state?: ResolvedQueryState, inactiveExternalProjectIds?: string[]) => void;
    restoreExplicitGroupByOverride: (groupBy: ResolvedQueryState['groupBy'] | undefined) => void;
    applyResolvedQueryState: (state?: ResolvedQueryState) => void;
    applyApiData: (data: ApiData, readContext?: ReadContext) => void;
    setSelectedStatusFromServer: (ids: number[]) => void;
    setShowVersions: (show: boolean) => void;
    addRelation: (relation: Relation) => void;
    replaceRelation: (relation: Relation) => void;
    removeRelation: (relationId: string) => void;
    stageRelationCreate: (desired: RelationTarget) => boolean;
    stageRelationUpdate: (relationId: string, desired: RelationTarget) => boolean;
    stageRelationDelete: (relationId: string) => boolean;
    discardPendingRelationChanges: () => void;
    getEffectiveRelations: () => Relation[];
    getPendingRelationChange: (relationId: string) => PendingRelationChange | undefined;
    pendingRelationCount: () => number;
    hasPendingChanges: () => boolean;
    resolveUnknownRelationChange: (draftId: string, resolution: 'assume_applied' | 'retry') => Promise<boolean>;
    selectTask: (id: string | null) => void;
    selectRelation: (id: string | null) => void;
    setDraftRelation: (relation: DraftRelation | null) => void;
    clearRelationSelection: () => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>, mutationIntent?: Partial<Task>, datePlacementMode?: DatePlacementModeValue) => void;
    beginBarOperation: (seedTaskId?: string) => string;
    endBarOperation: (operationId: string) => void;
    rollbackBarOperation: (operationId: string) => void;
    settleBarOperationTask: (taskId: string, operationGeneration?: number) => void;
    settleBarOperationTaskThrough: (taskId: string, operationGeneration: number) => void;
    completeBarOperationTask: (taskId: string, operationGeneration?: number) => void;
    setTaskLockVersion: (id: string, lockVersion: number) => void;
    commitTaskOperation: (id: string, operationGeneration: number, lockVersion?: number) => void;
    rollbackTaskOperation: (id: string, operationGeneration: number, rollbackFields?: Partial<Task>) => void;
    applyTaskMutationMetadata: (taskId: string, metadata: MutationMetadata) => void;
    refreshForMutationMetadata: (metadata: MutationMetadata) => void;
    removeTask: (id: string) => void;
    markTaskTombstone: (id: string, source?: EntityTombstone['source'], operationId?: string) => void;
    clearTaskTombstone: (id: string) => void;
    registerTaskConflict: (id: string, message: string, generation?: number, remoteEntity?: PersistedTaskState, remoteRevision?: number, remoteAvailability?: MutationRemoteAvailability) => void;
    resolveTaskConflict: (id: string, resolution: 'remote' | 'local' | 'dismiss') => Promise<void>;
    prepareScheduleConflict: (id: string) => Promise<void>;
    applyScheduleConflict: (id: string, acceptAdjustments?: boolean) => Promise<void>;
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
    setSelectedTrackerIds: (ids: number[]) => void;
    setMemberProjectsOnly: (enabled: boolean) => Promise<void>;
    scrollToTask: (taskId: string) => void;
    focusTask: (taskId: string) => { status: 'ok' | 'filtered_out' | 'missing' };
    setSortConfig: (key: string | null) => void;
    refreshData: () => Promise<ReadApplyOutcome>;
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

const DEFAULT_BUSINESS_CALENDAR_VALIDATION = {
    status: 'valid' as const,
    message: null,
    diagnostic: null
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
        : { mode: 'all' },
    tracker: state.selectedTrackerIds.length > 0
        ? { mode: 'subset', values: [...state.selectedTrackerIds] }
        : { mode: 'all' }
});

const queryContextPatch = (queryContext: QueryContext) => ({
    queryContext,
    isQueryModified: getIsQueryModified(queryContext)
});

const initialQueryContext = resolvedStateToQueryContext(initialUrlState);

const resolveLayoutState = (state: LayoutState, overrides: Partial<LayoutState> = {}): LayoutState => ({
    allTasks: overrides.allTasks ?? state.allTasks,
    relations: overrides.relations ?? projectEffectiveRelations(
        state.relations,
        (state as LayoutState & { pendingRelationChanges?: RelationDraftMap }).pendingRelationChanges ?? {}
    ),
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
    selectedTrackerIds: overrides.selectedTrackerIds ?? state.selectedTrackerIds,
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
        layoutState.selectedTrackerIds,
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

const buildCriticalPathSummary = (
    tasks: Task[],
    relations: Relation[],
    enabled: boolean
): Pick<DerivedSchedulingSummary, 'criticalPathMetrics' | 'criticalPathProjectFinish'> => {
    if (!enabled) return { criticalPathMetrics: {}, criticalPathProjectFinish: undefined };
    derivedRecalculationCounters.criticalPath += 1;
    const criticalPath = TaskLogicService.calculateCriticalPath(tasks, relations);
    return {
        criticalPathMetrics: criticalPath.metricsByTaskId,
        criticalPathProjectFinish: criticalPath.projectFinish
    };
};

const buildDerivedSchedulingSummary = (tasks: Task[], relations: Relation[], calculateCriticalPathEnabled: boolean): DerivedSchedulingSummary => {
    derivedRecalculationCounters.scheduling += 1;

    return {
        schedulingStates: TaskLogicService.deriveSchedulingStates(tasks, relations),
        ...buildCriticalPathSummary(tasks, relations, calculateCriticalPathEnabled)
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

const mergeVisibleTask = (visibleTask: Task, updatedTask: Task): Task => ({
    ...updatedTask,
    rowIndex: visibleTask.rowIndex,
    indentLevel: visibleTask.indentLevel,
    treeLevelGuides: visibleTask.treeLevelGuides,
    isLastChild: visibleTask.isLastChild,
    hasChildren: visibleTask.hasChildren,
    isContextOnly: visibleTask.isContextOnly
});

const buildDerivedTaskState = (
    state: TaskState,
    overrides: Partial<LayoutState> & {
        allTasks?: Task[];
        relations?: Relation[];
        relationChanges?: RelationDraftMap;
        derivedInvalidation?: DerivedInvalidation;
        schedulingSummary?: DerivedSchedulingSummary;
    } = {}
): DerivedTaskState => {
    const allTasks = overrides.allTasks ?? state.allTasks;
    const relations = projectEffectiveRelations(
        overrides.relations ?? state.relations,
        overrides.relationChanges ?? state.pendingRelationChanges ?? {}
    );
    const invalidation = overrides.derivedInvalidation;
    // Header and fallback version ranges depend on dates, including collapsed
    // tasks. Reuse the existing layout builder so their aggregation rules stay
    // consistent even when the edit cannot change row ordering.
    const summaryDatesChanged = invalidation !== undefined && invalidation !== 'layout'
        && allTasks !== state.allTasks
        && state.layoutRows.some(row => row.type !== 'task')
        && (() => {
            const previousTasks = new Map(state.allTasks.map(task => [task.id, task]));
            return allTasks.some(task => {
                const previous = previousTasks.get(task.id);
                return previous?.startDate !== task.startDate || previous?.dueDate !== task.dueDate;
            });
        })();
    const shouldBuildLayout = invalidation === undefined || invalidation === 'layout' || summaryDatesChanged;
    const shouldBuildScheduling = invalidation === undefined || invalidation === 'schedule';
    const shouldBuildCriticalPath = invalidation === undefined || invalidation === 'schedule' || invalidation === 'critical_path';
    const layout = shouldBuildLayout
        ? (() => {
            derivedRecalculationCounters.layout += 1;
            return buildLayoutFromState(state, { ...overrides, allTasks, relations });
        })()
        : null;
    let schedulingSummary = overrides.schedulingSummary;
    if (!schedulingSummary) {
        let schedulingStates = state.schedulingStates;
        if (shouldBuildScheduling) {
            derivedRecalculationCounters.scheduling += 1;
            schedulingStates = TaskLogicService.deriveSchedulingStates(allTasks, relations);
        }
        schedulingSummary = {
            schedulingStates,
            ...(shouldBuildCriticalPath
                ? buildCriticalPathSummary(allTasks, relations, state.calculateCriticalPathEnabled)
                : { criticalPathMetrics: state.criticalPathMetrics, criticalPathProjectFinish: state.criticalPathProjectFinish })
        };
    }
    const visibleTasks = layout?.tasks ?? (allTasks === state.allTasks
        ? state.tasks
        : (() => {
            const previousTaskById = new Map(state.allTasks.map(task => [task.id, task]));
            const taskById = new Map(allTasks.map(task => [task.id, task]));
            return state.tasks.flatMap((visibleTask) => {
                const updatedTask = taskById.get(visibleTask.id);
                if (!updatedTask) return [];
                if (previousTaskById.get(visibleTask.id) === updatedTask) return [visibleTask];
                return [mergeVisibleTask(visibleTask, updatedTask)];
            });
        })());

    return {
        tasks: visibleTasks,
        layoutRows: layout?.layoutRows ?? state.layoutRows,
        rowCount: layout?.rowCount ?? state.rowCount,
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

const relationDraftDerivedPatch = (state: TaskState, relationChanges: RelationDraftMap): Partial<TaskState> => {
    const previousRelations = projectEffectiveRelations(state.relations, state.pendingRelationChanges);
    const nextRelations = projectEffectiveRelations(state.relations, relationChanges);
    if (state.organizeByDependency) {
        return toDerivedTaskStatePatch(buildDerivedTaskState(state, {
            relations: nextRelations,
            relationChanges
        }));
    }

    const previousById = new Map(previousRelations.map(relation => [relation.id, relation]));
    const nextById = new Map(nextRelations.map(relation => [relation.id, relation]));
    const changedIds = new Set([...previousById.keys(), ...nextById.keys()]);
    const changesConstraintGraph = [...changedIds].some((id) => {
        const previous = previousById.get(id);
        const next = nextById.get(id);
        if (previous && next && previous.from === next.from && previous.to === next.to && previous.type === next.type &&
            (previous.delay ?? 0) === (next.delay ?? 0)) return false;
        return [previous, next].some(relation => relation?.type === 'precedes' || relation?.type === 'follows');
    });
    if (!changesConstraintGraph) return {};
    return toDerivedTaskStatePatch(buildDerivedTaskState(state, {
        relations: nextRelations,
        relationChanges,
        derivedInvalidation: 'schedule'
    }));
};

type ApiDataPatchResult = {
    patch: Partial<TaskState>;
    querySyncState: SharedQuerySyncState;
};

const buildApiDataPatch = (data: ApiData, state: TaskState, readContext?: ReadContext): ApiDataPatchResult => {
    const requestedMode = (readContext?.scope as { memberProjectsOnly?: boolean } | undefined)?.memberProjectsOnly;
    const confirmedScope = data.projectScope;
    const filterOptions = data.filterOptions ?? EMPTY_FILTER_OPTIONS;
    const customFields = data.customFields ?? [];
    const versions = data.versions ?? [];
    const relations = data.relations ?? [];
    const serverTasks = (data.tasks ?? []).filter(task => !state.taskTombstones[task.id]);
    const serverTaskSnapshot = replaceServerSnapshot(
        state.serverTaskSnapshot, serverTasks, readContext ?? state.activeReadContext
    );
    const mergedServerTasks = Object.values(serverTaskSnapshot.entitiesById).map((task) => {
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
        ...(confirmedScope
            ? { canvasProjectIds: confirmedScope.selectedProjectIds }
            : state.projectSelectionExplicit
            ? { canvasProjectIds: state.selectedProjectIds }
            : (data.initialState?.canvasProjectIds !== undefined
                ? { canvasProjectIds: data.initialState.canvasProjectIds }
                : {})),
        // Candidate data and its confirmed mode are committed in the same update.
        memberProjectsOnly: confirmedScope ? confirmedScope.mode === 'member_all' : (requestedMode ?? state.memberProjectsOnly),
        // showSubprojects is Canvas scope state, not a Redmine Query filter.
        showSubprojects: state.showSubprojects
    };

    const inactiveExternalProjectIds = confirmedScope?.mode === 'member_all'
        ? []
        : confirmedScope && state.memberProjectsOnly
            ? [...new Set([...state.inactiveExternalProjectIds,
                ...state.selectedProjectIds.filter((id) => !confirmedScope.selectedProjectIds.includes(id))])]
            : state.inactiveExternalProjectIds;

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
        selectedTrackerIds: queryState.selectedTrackerIds,
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
        projectSelectionExplicit: confirmedScope?.selectionExplicit ?? (state.projectSelectionExplicit || nextResolved.canvasProjectIds !== undefined),
        inactiveExternalProjectIds,
        selectedVersionIds: queryState.selectedVersionIds,
        selectedTrackerIds: queryState.selectedTrackerIds,
        memberProjectsOnly: queryState.memberProjectsOnly,
        sortConfig,
        groupByProject: queryState.groupByProject,
        groupByAssignee: queryState.groupByAssignee,
        showSubprojects: queryState.showSubprojects,
        visibleColumns: useUIStore.getState().columnsExplicitInQuery ? useUIStore.getState().visibleColumns : undefined,
        columnsExplicitInQuery: useUIStore.getState().columnsExplicitInQuery
    };

    const draftRelation = state.draftRelation;
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
            confirmedProjectScope: confirmedScope ?? null,
            inactiveExternalProjectIds,
            customFields,
            taskStatuses: data.statuses ?? [],
            permissions: data.permissions ?? DEFAULT_PERMISSIONS,
            selectedRelationId: preservesDirtyScope && state.selectedRelationId &&
                projectEffectiveRelations(relations, state.pendingRelationChanges).some(relation => relation.id === state.selectedRelationId)
                ? state.selectedRelationId
                : null,
            draftRelation: !state.autoSave && preservesDirtyScope && draftRelation &&
                derived.tasks.some(task => task.id === draftRelation.from) &&
                derived.tasks.some(task => task.id === draftRelation.to)
                ? draftRelation
                : null,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            modifiedTaskIds: new Set(state.modifiedTaskIds),
            serverTaskSnapshot,
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
    const sourceBefore = sourceTaskId ? state.allTasks.find(task => task.id === sourceTaskId) : undefined;
    const sourceAfter = sourceTaskId ? nextAllTasks.find(task => task.id === sourceTaskId) : undefined;
    const fields: Partial<Task> = {};
    if (sourceBefore && sourceAfter && sourceBefore.parentId !== sourceAfter.parentId) {
        fields.parentId = sourceAfter.parentId;
    }
    const hasPersistedFields = Object.keys(fields).length > 0;
    const editGenerations = sourceTaskId && hasPersistedFields
        ? { ...state.editGenerations, [sourceTaskId]: (state.editGenerations[sourceTaskId] ?? 0) + 1 }
        : state.editGenerations;
    const localTaskPatches = { ...state.localTaskPatches };
    const modifiedTaskIds = new Set(state.modifiedTaskIds);
    if (sourceTaskId && sourceBefore && sourceAfter && hasPersistedFields) {
        const generation = editGenerations[sourceTaskId] ?? 0;
        localTaskPatches[sourceTaskId] = [
            ...(localTaskPatches[sourceTaskId] ?? []),
            {
                entityId: sourceTaskId,
                projection: fields,
                mutationIntent: fields,
                generation,
                operationId: `parent-move:${sourceTaskId}:${generation}`
            }
        ];
        modifiedTaskIds.add(sourceTaskId);
    }
    return {
        allTasks: nextAllTasks,
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        editGenerations,
        localTaskPatches,
        modifiedTaskIds
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
        }
        if (!hasLocalMutationIntent(localTaskPatches[sourceTaskId])) nextModified.delete(sourceTaskId);
    } else if (!currentSource || responseParentId === undefined || currentSource.parentId === responseParentId) {
        nextModified.delete(sourceTaskId);
    }
    const serverTask = state.serverTaskSnapshot.entitiesById[sourceTaskId] ?? sourceBefore;
    const nextServerTask = operationPatch
        ? { ...serverTask, ...operationPatch.mutationIntent, lockVersion: Math.max(serverTask.lockVersion, result.lockVersion ?? serverTask.lockVersion) }
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
            // Redmine owns scheduling for date-derived parents. The client task
            // graph may omit siblings, so using a projected parent range here
            // could create incorrect downstream edits before the server runs
            // its complete callback graph.
            if (!task || task.datesDerived || !Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) continue;
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

const hasOwnField = (value: object, field: string): boolean => (
    Object.prototype.hasOwnProperty.call(value, field)
);

const normalizeTaskDateUpdates = (
    task: Task,
    updates: Partial<Task>,
    datePlacementMode?: DatePlacementModeValue
): Partial<Task> => {
    if (!hasOwnField(updates, 'startDate') && !hasOwnField(updates, 'dueDate')) return updates;

    const nextUpdates = { ...updates };
    const normalized = normalizeTaskDateInterval(
        {
            startDate: hasOwnField(updates, 'startDate') ? updates.startDate : task.startDate,
            dueDate: hasOwnField(updates, 'dueDate') ? updates.dueDate : task.dueDate
        },
        {
            changedFields: {
                startDate: hasOwnField(updates, 'startDate'),
                dueDate: hasOwnField(updates, 'dueDate')
            },
            projectId: updates.projectId ?? task.projectId,
            mode: 'legacy_unspecified',
            datePlacementMode: datePlacementMode ?? useUIStore.getState().datePlacementMode
        }
    );
    if (!normalized.valid) return { ...nextUpdates, startDate: task.startDate, dueDate: task.dueDate };
    const nextStart = normalized.interval.startDate;
    const nextDue = normalized.interval.dueDate;

    if (hasOwnField(updates, 'startDate') || nextStart !== task.startDate) {
        nextUpdates.startDate = nextStart ?? undefined;
    }
    if (hasOwnField(updates, 'dueDate') || nextDue !== task.dueDate) {
        nextUpdates.dueDate = nextDue ?? undefined;
    }
    return nextUpdates;
};

const buildRelationChange = (state: TaskState, relation: Relation, nextRelations: Relation[]) => {
    const effectiveRelations = projectEffectiveRelations(nextRelations, state.pendingRelationChanges);
    let nextTasks = state.allTasks;
    const originTaskId = relation.type === 'follows' ? relation.to : relation.from;
    const originTask = nextTasks.find((task) => task.id === originTaskId);
    const dependentUpdates = TaskLogicService.checkDependencies(
        nextTasks,
        effectiveRelations,
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
        effectiveRelations,
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
    const editGenerations = { ...state.editGenerations };
    const localTaskPatches = { ...state.localTaskPatches };
    dependentUpdates.updates.forEach((fields, taskId) => {
        const meaningfulFields = Object.fromEntries(
            Object.entries(fields).filter(([key]) => key !== 'lockVersion' && key !== 'id')
        ) as Partial<Task>;
        if (Object.keys(meaningfulFields).length === 0) return;
        const task = nextTasks.find((candidate) => candidate.id === taskId);
        const mutationIntent = task?.datesDerived
            ? Object.fromEntries(Object.entries(meaningfulFields).filter(([key]) => key !== 'startDate' && key !== 'dueDate')) as Partial<Task>
            : meaningfulFields;
        const generation = (editGenerations[taskId] ?? 0) + 1;
        editGenerations[taskId] = generation;
        if (Object.keys(mutationIntent).length > 0) modifiedTaskIds.add(taskId);
        const operationId = `relation-cascade:${relation.id || 'new'}:${taskId}:${generation}`;
        localTaskPatches[taskId] = [
            ...(localTaskPatches[taskId] ?? []).filter(patch => patch.operationId !== operationId),
            {
                entityId: taskId,
                projection: meaningfulFields,
                mutationIntent,
                generation,
                operationId
            }
        ];
    });

    return {
        nextTasks,
        modifiedTaskIds,
        editGenerations,
        localTaskPatches,
        derived: buildDerivedTaskState(state, { relations: effectiveRelations, allTasks: nextTasks })
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
    const hasTrackerFilter = state.selectedTrackerIds.length > 0;
    const hasSubprojectFilter = !state.showSubprojects && state.currentProjectId !== null && !hasProjectFilter;

    if (!hasTextFilter && !hasAssigneeFilter && !hasProjectFilter && !hasVersionFilter && !hasTrackerFilter && !hasSubprojectFilter) {
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
        (!hasTrackerFilter || (task.trackerId !== undefined && state.selectedTrackerIds.includes(task.trackerId))) &&
        (!hasSubprojectFilter || task.projectId === state.currentProjectId)
    );
};

const taskFieldsAffectLayout = (
    state: TaskState,
    changedFields: Set<string>,
    changedTaskNames?: { projectName: boolean; assignedToName: boolean }
): boolean => {
    if (['projectId', 'assignedToId', 'fixedVersionId', 'parentId', 'displayOrder'].some(field => changedFields.has(field))) {
        return true;
    }
    const projectNameChanged = changedFields.has('projectName') && changedTaskNames?.projectName === true;
    const assigneeNameChanged = changedFields.has('assignedToName') && changedTaskNames?.assignedToName === true;
    if ((state.groupByProject && projectNameChanged) || (state.groupByAssignee && assigneeNameChanged)) {
        return true;
    }
    if (state.sortConfig && (
        (changedFields.has(state.sortConfig.key) && (
            (state.sortConfig.key !== 'projectName' || projectNameChanged) &&
            (state.sortConfig.key !== 'assignedToName' || assigneeNameChanged)
        )) ||
        (state.sortConfig.key.startsWith('cf:') && changedFields.has('customFieldValues'))
    )) {
        return true;
    }
    if (state.filterText && changedFields.has('subject')) return true;
    if (state.selectedAssigneeIds.length > 0 && changedFields.has('assignedToId')) return true;
    if (state.selectedProjectIds.length > 0 && changedFields.has('projectId')) return true;
    if (state.selectedVersionIds.length > 0 && changedFields.has('fixedVersionId')) return true;
    if (state.selectedTrackerIds.length > 0 && changedFields.has('trackerId')) return true;
    return !state.showSubprojects && state.currentProjectId !== null && changedFields.has('projectId');
};

export const useTaskStore = create<TaskState>((set, get) => {
    const inflightReads = new Map<string, Promise<ReadApplyOutcome>>();
    let auxiliaryReadContext: ReadContext | null = null;
    let auxiliaryReadGeneration = 0;
    let mutationResyncGeneration = 0;
    let activeReadContext: ReadContext | null = null;
    let lastAppliedViewIdentity: string | null = null;
    const currentViewIdentity = () => {
        const state = get();
        return createReadContext({
            generation: 0,
            projectId: state.currentProjectId,
            query: toResolvedQueryStateFromStore(state),
            scope: { showSubprojects: state.showSubprojects, memberProjectsOnly: state.memberProjectsOnly },
            purpose: 'refresh'
        }).contextId;
    };
    const settleSupersededRead = (context: ReadContext, viewIdentityAtStart: string) => {
        if (activeReadContext !== context || get().dataReadStatus !== 'loading') return;
        if (get().initialDataLoaded && lastAppliedViewIdentity === viewIdentityAtStart &&
            currentViewIdentity() === viewIdentityAtStart) {
            set({ dataReadStatus: 'ready' });
        } else {
            // The discarded response belonged to another view (or no view was loaded).
            // Start a read for the current view while retaining local patches.
            void get().refreshData().catch((error) => console.error('Failed to refresh data', error));
        }
    };
    const requestAndApplyData = async (
        fetchData: () => Promise<ApiData>,
        context: ReadContext
    ): Promise<ReadApplyOutcome> => {
        const readKey = context.contextId;
        const existing = inflightReads.get(readKey);
        if (existing) return existing;
        const viewIdentityAtStart = currentViewIdentity();
        activeReadContext = context;
        set({ dataReadStatus: 'loading' });
        readLifecycleMetrics.requestsStarted += 1;
        readLifecycleMetrics.maxInflight = Math.max(readLifecycleMetrics.maxInflight, inflightReads.size + 1);
        const request = (async (): Promise<ReadApplyOutcome> => {
        try {
            const data = await fetchData();
            if (context.generation !== dataRequestGeneration || !canApplyReadResponse(activeReadContext, context)) {
                readLifecycleMetrics.staleResponsesRejected += 1;
                return { status: 'superseded', context };
            }
            get().applyApiData(data, context);
            readLifecycleMetrics.responsesApplied += 1;
            return { status: 'applied', context };
        } catch (error) {
            // A superseded request must not surface as a user-visible failure.
            if (context.generation !== dataRequestGeneration || !canApplyReadResponse(activeReadContext, context)) {
                readLifecycleMetrics.staleResponsesRejected += 1;
                return { status: 'superseded', context };
            }
            readLifecycleMetrics.failures += 1;
            set({ dataReadStatus: 'error' });
            throw error;
        }
        })();
        inflightReads.set(readKey, request);
        try {
            return await request;
        } finally {
            if (inflightReads.get(readKey) === request) inflightReads.delete(readKey);
            if (context.generation !== dataRequestGeneration) settleSupersededRead(context, viewIdentityAtStart);
        }
    };
    const refreshCurrentData = async (
        purpose: 'refresh' | 'saved_query',
        memberProjectsOnly = get().memberProjectsOnly
    ): Promise<ReadApplyOutcome> => {
        const state = get();
        const query = toResolvedQueryStateFromStore({ ...state, memberProjectsOnly });
        // Restore selections outside the current tree when their candidates are shown again.
        if (memberProjectsOnly && !state.memberProjectsOnly && state.inactiveExternalProjectIds.length > 0 &&
            state.projectSelectionExplicit) {
            query.canvasProjectIds = [...new Set([...state.selectedProjectIds, ...state.inactiveExternalProjectIds])];
        }
        const scope = { showSubprojects: state.showSubprojects, memberProjectsOnly };
        const generation = ++dataRequestGeneration;
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query,
            scope,
            purpose
        });
        return requestAndApplyData(() => apiClient.fetchData({ query, queryContext: state.queryContext }), context);
    };
    const fetchMutationResyncData = async (params: { query?: { selectedStatusIds?: number[] } }): Promise<ApiData> => {
        const state = get();
        const viewIdentityAtStart = currentViewIdentity();
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
        set({ dataReadStatus: 'loading' });
        try {
            const data = await apiClient.fetchData({ query, queryContext: state.queryContext });
            if (resyncGeneration !== mutationResyncGeneration || !canApplyReadResponse(activeReadContext, context)) {
                readLifecycleMetrics.staleResponsesRejected += 1;
                throw new Error('Superseded mutation resync');
            }
            if (currentViewIdentity() === viewIdentityAtStart &&
                lastAppliedViewIdentity === viewIdentityAtStart && get().initialDataLoaded) {
                set({ dataReadStatus: 'ready' });
            } else {
                void get().refreshData().catch((error) => console.error('Failed to refresh data', error));
            }
            return data;
        } catch (error) {
            if (activeReadContext === context && get().dataReadStatus === 'loading') {
                set({ dataReadStatus: 'error' });
            }
            throw error;
        }
    };

    return ({
    businessCalendarValidation: DEFAULT_BUSINESS_CALENDAR_VALIDATION,
    allTasks: [],
    tasks: [],
    relations: [],
    pendingRelationChanges: {},
    relationEditGeneration: 0,
    schedulingStates: {},
    criticalPathMetrics: {},
    criticalPathProjectFinish: undefined,
    calculateCriticalPathEnabled: preferences.calculateCriticalPathEnabled ?? true,
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
    selectedTrackerIds: [],
    memberProjectsOnly: preferences.memberProjectsOnly ?? false,
    confirmedProjectScope: null,
    inactiveExternalProjectIds: [],
    sortConfig: { key: 'startDate', direction: 'asc' },
    customScales: preferences.customScales ?? {},
    currentProjectId: window.RedmineCanvasGantt?.projectId?.toString() || null,
    showSubprojects: true,
    isSortingSuspended: false,
    modifiedTaskIds: new Set(),
    editGenerations: {},
    autoSave: preferences.autoSave ?? false,
    autoSaveTransition: 'idle',
    initialDataLoaded: false,
    dataReadStatus: 'idle',
    activeReadContext: null,
    serverTaskSnapshot: createServerSnapshot<Task>([]),
    localTaskPatches: {},
    taskTombstones: {},
    taskConflicts: {},
    barOperations: {},
    activeBarOperationId: null,

    setAutoSave: (enabled) => set({ autoSave: enabled }),

    requestAutoSaveChange: async (enabled) => {
        if (!enabled) {
            set({ autoSave: false, autoSaveTransition: 'idle' });
            return;
        }

        const state = get();
        if (state.autoSave || state.autoSaveTransition === 'enabling') {
            return autoSaveEnableOperation ?? Promise.resolve();
        }
        if (state.modifiedTaskIds.size === 0 && !hasPendingRelationChanges(state.pendingRelationChanges)) {
            set({ autoSave: true });
            return;
        }

        set({ autoSaveTransition: 'enabling' });
        const operation = (async () => {
            try {
                const failures = await get().saveChanges();
                if (failures.size === 0 && get().modifiedTaskIds.size === 0 && !hasPendingRelationChanges(get().pendingRelationChanges) && get().autoSaveTransition === 'enabling') {
                    set({ autoSave: true });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_save') || 'Failed to save');
                useUIStore.getState().addNotification(message, 'error');
            } finally {
                if (get().autoSaveTransition === 'enabling') {
                    set({ autoSaveTransition: 'idle' });
                }
            }
        })();

        autoSaveEnableOperation = operation;
        try {
            await operation;
        } finally {
            if (autoSaveEnableOperation === operation) autoSaveEnableOperation = null;
        }
    },

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
        const derived = buildDerivedTaskState(state, { relations, relationChanges: state.pendingRelationChanges });
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
    setCalculateCriticalPathEnabled: (enabled) => set((state) => {
        if (state.calculateCriticalPathEnabled === enabled) return state;
        if (!enabled) {
            return {
                calculateCriticalPathEnabled: false,
                criticalPathMetrics: {},
                criticalPathProjectFinish: undefined
            };
        }
        return {
            calculateCriticalPathEnabled: true,
            ...buildCriticalPathSummary(
                state.allTasks,
                projectEffectiveRelations(state.relations, state.pendingRelationChanges),
                true
            )
        };
    }),
    setPermissions: (permissions) => set(() => ({ permissions })),
    restoreActiveQueryId: (queryId) => {
        const queryContext = { ...get().queryContext, baseQueryId: queryId };
        set({ activeQueryId: queryId, ...queryContextPatch(queryContext) });
    },
    restoreCanvasScope: (resolved, inactiveExternalProjectIds) => set((state) => {
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
            inactiveExternalProjectIds: inactiveExternalProjectIds ?? [],
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
        const selectedTrackerIds = queryState.selectedTrackerIds;
        const memberProjectsOnly = queryState.memberProjectsOnly;
        const activeQueryId = queryState.queryId;
        const layout = buildLayoutFromState(state, {
            groupByProject,
            groupByAssignee,
            showSubprojects,
            sortConfig,
            selectedAssigneeIds,
            selectedProjectIds,
            selectedVersionIds,
            selectedTrackerIds
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
            inactiveExternalProjectIds: state.inactiveExternalProjectIds,
            selectedVersionIds,
            selectedTrackerIds,
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
        const previousMode = get().memberProjectsOnly;
        const businessCalendar = configureBusinessCalendar(data.businessCalendar);
        let querySyncState: SharedQuerySyncState | null = null;
        set((state) => {
            const result = buildApiDataPatch(data, state, readContext);
            querySyncState = result.querySyncState;
            return { ...result.patch, businessCalendarValidation: {
                status: businessCalendar.validationStatus ?? (businessCalendar.status === 'error' ? 'invalid' : 'valid'),
                message: businessCalendar.validationMessage ?? null,
                diagnostic: businessCalendar.diagnostic ?? null
            }, activeReadContext: readContext ?? activeReadContext,
                dataReadStatus: readContext ? 'ready' : state.dataReadStatus };
        });
        const confirmedState = get();
        setConfirmedProjectScope(confirmedState.confirmedProjectScope);
        if (confirmedState.memberProjectsOnly !== previousMode) {
            saveDisplayPreferences({ memberProjectsOnly: confirmedState.memberProjectsOnly }, confirmedState.currentProjectId);
        }
        const isQueryBoundary = readContext?.purpose === 'initial_load' || readContext?.purpose === 'saved_query';
        const currentColumnSource = useUIStore.getState().columnStateSource;
        const shouldApplyQueryColumns = data.initialState?.visibleColumns?.length && (
            readContext?.purpose === 'saved_query'
            || (isQueryBoundary && currentColumnSource === 'query')
            || (!isQueryBoundary && currentColumnSource !== 'user')
        );
        if (shouldApplyQueryColumns) {
            useUIStore.getState().applyQueryVisibleColumns(data.initialState!.visibleColumns!);
        } else if (isQueryBoundary && currentColumnSource === 'query') {
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
        lastAppliedViewIdentity = currentViewIdentity();
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
        const { nextTasks, modifiedTaskIds, editGenerations, localTaskPatches, derived } = buildRelationChange(state, relation, nextRelations);
        return {
            allTasks: nextTasks,
            relations: nextRelations,
            draftRelation: null,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds,
            editGenerations,
            localTaskPatches
        };
    }),
    replaceRelation: (relation) => set((state) => {
        invalidateDataRequests();
        const existingIndex = state.relations.findIndex(r => r.id === relation.id);
        const nextRelations =
            existingIndex === -1
                ? [...state.relations, relation]
                : state.relations.map((current) => current.id === relation.id ? relation : current);
        const { nextTasks, modifiedTaskIds, editGenerations, localTaskPatches, derived } = buildRelationChange(state, relation, nextRelations);
        return {
            allTasks: nextTasks,
            relations: nextRelations,
            draftRelation: null,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds,
            editGenerations,
            localTaskPatches
        };
    }),
    removeRelation: (relationId) => set((state) => {
        const nextRelations = state.relations.filter(r => r.id !== relationId);
        if (nextRelations.length === state.relations.length) return state;
        invalidateDataRequests();
        const relation = state.relations.find(current => current.id === relationId);
        const relationChange = relation
            ? buildRelationChange(state, relation, nextRelations)
            : { nextTasks: state.allTasks, modifiedTaskIds: state.modifiedTaskIds, editGenerations: state.editGenerations, localTaskPatches: state.localTaskPatches, derived: buildDerivedTaskState(state, { relations: nextRelations }) };
        return {
            allTasks: relationChange.nextTasks,
            relations: nextRelations,
            selectedRelationId: state.selectedRelationId === relationId ? null : state.selectedRelationId,
            ...toDerivedTaskStatePatch(relationChange.derived),
            modifiedTaskIds: relationChange.modifiedTaskIds,
            editGenerations: relationChange.editGenerations,
            localTaskPatches: relationChange.localTaskPatches
        };
    }),
    stageRelationCreate: (desired) => {
        let accepted = false;
        set((state) => {
            if (state.autoSave || state.autoSaveTransition === 'enabling' || !state.permissions.editable || Object.values(state.pendingRelationChanges).some(change => change.status === 'saving')) return state;
            if (Object.values(state.pendingRelationChanges).some(change => change.status === 'unknown' &&
                [change.original, change.desired].some(target => target && target.from === desired.from && target.to === desired.to && target.type === desired.type))) return state;
            const generation = state.relationEditGeneration + 1;
            const pendingRelationChanges = normalizeRelationCreate(
                state.pendingRelationChanges,
                state.relations,
                relationChangeTarget(desired),
                generation
            );
            accepted = projectEffectiveRelations(state.relations, pendingRelationChanges).some(relation => sameRelationTarget(relation, desired));
            if (!accepted || pendingRelationChanges === state.pendingRelationChanges) return state;
            return {
                pendingRelationChanges,
                relationEditGeneration: generation,
                draftRelation: null,
                ...relationDraftDerivedPatch(state, pendingRelationChanges)
            };
        });
        return accepted;
    },
    stageRelationUpdate: (relationId, desired) => {
        let accepted = false;
        set((state) => {
            if (state.autoSave || state.autoSaveTransition === 'enabling' || !state.permissions.editable || Object.values(state.pendingRelationChanges).some(change => change.status === 'saving')) return state;
            if (selectPendingRelationChange(state.pendingRelationChanges, relationId)?.status === 'unknown') return state;
            const generation = state.relationEditGeneration + 1;
            const pendingRelationChanges = normalizeRelationUpdate(
                state.pendingRelationChanges,
                state.relations,
                relationId,
                relationChangeTarget(desired),
                generation
            );
            accepted = projectEffectiveRelations(state.relations, pendingRelationChanges).some(relation => relation.id === relationId && sameRelationTarget(relation, desired));
            if (!accepted || pendingRelationChanges === state.pendingRelationChanges) return state;
            return {
                pendingRelationChanges,
                relationEditGeneration: generation,
                ...relationDraftDerivedPatch(state, pendingRelationChanges)
            };
        });
        return accepted;
    },
    stageRelationDelete: (relationId) => {
        let accepted = false;
        set((state) => {
            if (state.autoSave || state.autoSaveTransition === 'enabling' || !state.permissions.editable || Object.values(state.pendingRelationChanges).some(change => change.status === 'saving')) return state;
            if (selectPendingRelationChange(state.pendingRelationChanges, relationId)?.status === 'unknown') return state;
            const generation = state.relationEditGeneration + 1;
            const pendingRelationChanges = normalizeRelationDelete(
                state.pendingRelationChanges,
                state.relations,
                relationId,
                generation
            );
            accepted = !projectEffectiveRelations(state.relations, pendingRelationChanges).some(relation => relation.id === relationId);
            if (!accepted || pendingRelationChanges === state.pendingRelationChanges) return state;
            return {
                pendingRelationChanges,
                relationEditGeneration: generation,
                selectedRelationId: state.selectedRelationId === relationId ? null : state.selectedRelationId,
                ...relationDraftDerivedPatch(state, pendingRelationChanges)
            };
        });
        return accepted;
    },
    discardPendingRelationChanges: () => set((state) => {
        if (!hasPendingRelationChanges(state.pendingRelationChanges)) return state;
        return {
            pendingRelationChanges: {},
            relationEditGeneration: state.relationEditGeneration + 1,
            ...relationDraftDerivedPatch(state, {})
        };
    }),
    getEffectiveRelations: () => projectEffectiveRelations(get().relations, get().pendingRelationChanges),
    getPendingRelationChange: (relationId) => selectPendingRelationChange(get().pendingRelationChanges, relationId),
    pendingRelationCount: () => countPendingRelationChanges(get().pendingRelationChanges),
    hasPendingChanges: () => get().modifiedTaskIds.size > 0 || hasPendingRelationChanges(get().pendingRelationChanges),
    resolveUnknownRelationChange: async (draftId, resolution) => {
        const initial = get().pendingRelationChanges[draftId];
        if (!initial || initial.status !== 'unknown') return false;
        const viewIdentity = currentViewIdentity();
        let refreshedContext: ReadContext;
        try {
            const outcome = await get().refreshData();
            if (outcome.status !== 'applied' || currentViewIdentity() !== viewIdentity) return false;
            refreshedContext = outcome.context;
        } catch {
            return false;
        }
        const current = get().pendingRelationChanges[draftId];
        if (!current || current.generation !== initial.generation || current.status !== 'unknown') return false;
        const serverRelations = get().relations;
        if (current.operation === 'delete') {
            const refreshedTaskSnapshot = get().serverTaskSnapshot;
            const original = current.original;
            if (refreshedTaskSnapshot.context !== refreshedContext || !original ||
                !refreshedTaskSnapshot.entitiesById[original.from] ||
                !refreshedTaskSnapshot.entitiesById[original.to]) return false;
        }
        const matching = current.operation === 'delete'
            ? !serverRelations.some(relation => relation.id === current.relationId)
            : current.operation === 'create'
                ? serverRelations.some(relation => current.desired && (
                    relation.from === current.desired.from && relation.to === current.desired.to &&
                    relation.type === current.desired.type && (relation.delay ?? 0) === (current.desired.delay ?? 0)
                ))
                : serverRelations.some(relation => relation.id === current.relationId && current.desired && (
                    relation.from === current.desired.from && relation.to === current.desired.to &&
                    relation.type === current.desired.type && (relation.delay ?? 0) === (current.desired.delay ?? 0)
                ));
        if (resolution === 'assume_applied') {
            if (!matching) return false;
            set((state) => {
                const next = { ...state.pendingRelationChanges };
                delete next[draftId];
                const derived = buildDerivedTaskState(state, { relations: state.relations, relationChanges: next });
                return {
                    pendingRelationChanges: next,
                    relationEditGeneration: state.relationEditGeneration + 1,
                    ...toDerivedTaskStatePatch(derived)
                };
            });
            return true;
        }
        if (matching) return false;
        const expectedStillCurrent = current.operation === 'create'
            ? !serverRelations.some(relation => current.desired && relation.from === current.desired.from && relation.to === current.desired.to && relation.type === current.desired.type)
            : serverRelations.some(relation => relation.id === current.relationId && current.original && (
                relation.from === current.original.from && relation.to === current.original.to && relation.type === current.original.type &&
                (relation.delay ?? 0) === (current.original.delay ?? 0)
            ));
        if (!expectedStillCurrent) {
            set((state) => ({ pendingRelationChanges: {
                ...state.pendingRelationChanges,
                [draftId]: { ...current, status: 'failed', error: i18n.t('label_relation_change_conflict') || i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked' }
            } }));
            return false;
        }
        set((state) => ({ pendingRelationChanges: {
            ...state.pendingRelationChanges,
            [draftId]: { ...current, status: 'pending', error: undefined }
        } }));
        const failures = await get().saveChanges();
        return !failures.has(`relation:${draftId}`) && !get().pendingRelationChanges[draftId];
    },
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
        if (source.parentId === targetTaskId) return false;
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
            rollbackOperation: (operationGeneration, sourceBefore) => get().rollbackTaskOperation(
                sourceTaskId,
                operationGeneration,
                { parentId: sourceBefore.parentId, displayOrder: sourceBefore.displayOrder }
            ),
            buildNextOrder: (allTasks) => tailDisplayOrderForParent(allTasks, targetTaskId, sourceTaskId),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: targetTaskId, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            ownsOperation: (state, sourceBefore, operationGeneration) => hasLocalPatchOwnership(
                state.localTaskPatches[sourceBefore.id],
                sourceBefore.id,
                operationGeneration
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
            onConflict: (taskId, message, operationGeneration, remoteEntity, remoteRevision) => get().registerTaskConflict(taskId, message, operationGeneration, remoteEntity, remoteRevision),
            onNotFound: (taskId, _operationGeneration, operationId) => get().markTaskTombstone(taskId, 'server', operationId),
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
            rollbackOperation: (operationGeneration, sourceBefore) => get().rollbackTaskOperation(
                sourceTaskId,
                operationGeneration,
                { parentId: sourceBefore.parentId, displayOrder: sourceBefore.displayOrder }
            ),
            buildNextOrder: (allTasks, sourceBefore) => tailDisplayOrderForRoot(allTasks, sourceBefore),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: undefined, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            ownsOperation: (state, sourceBefore, operationGeneration) => hasLocalPatchOwnership(
                state.localTaskPatches[sourceBefore.id],
                sourceBefore.id,
                operationGeneration
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
            onConflict: (taskId, message, operationGeneration, remoteEntity, remoteRevision) => get().registerTaskConflict(taskId, message, operationGeneration, remoteEntity, remoteRevision),
            onNotFound: (taskId, _operationGeneration, operationId) => get().markTaskTombstone(taskId, 'server', operationId),
            onMutationMetadata: (taskId, metadata) => get().applyTaskMutationMetadata(taskId, metadata)
        });
    },

    beginBarOperation: (seedTaskId) => {
        const operationId = `bar:${++barOperationSequence}`;
        set((state) => beginBarOperationState(
            state.barOperations,
            state.allTasks,
            state.editGenerations,
            operationId,
            seedTaskId
        ));
        return operationId;
    },

    endBarOperation: (operationId) => set((state) => {
        const transition = endBarOperationState(
            state.barOperations,
            state.activeBarOperationId,
            state.allTasks,
            state.editGenerations,
            operationId
        );
        return transition.barOperations === state.barOperations && transition.activeBarOperationId === state.activeBarOperationId
            ? state
            : transition;
    }),

    completeBarOperationTask: (taskId, completedGeneration) => set((state) => {
        if (completedGeneration === undefined) return state;
        const settlement = settleBarOperationTaskOwnership(state.barOperations, state.activeBarOperationId, taskId, {
            mode: 'exact',
            generation: completedGeneration
        });
        return settlement.barOperations === state.barOperations && settlement.activeBarOperationId === state.activeBarOperationId
            ? state
            : settlement;
    }),

    settleBarOperationTask: (taskId, operationGeneration) => set((state) => {
        if (operationGeneration === undefined) return state;
        const settlement = settleBarOperationTaskOwnership(state.barOperations, state.activeBarOperationId, taskId, {
            mode: 'exact',
            generation: operationGeneration
        });
        return settlement.barOperations === state.barOperations && settlement.activeBarOperationId === state.activeBarOperationId
            ? state
            : settlement;
    }),

    settleBarOperationTaskThrough: (taskId, operationGeneration) => set((state) => {
        const settlement = settleBarOperationTaskOwnership(state.barOperations, state.activeBarOperationId, taskId, {
            mode: 'through',
            generation: operationGeneration
        });
        return settlement.barOperations === state.barOperations && settlement.activeBarOperationId === state.activeBarOperationId
            ? state
            : settlement;
    }),

    rollbackBarOperation: (operationId) => set((state) => {
        const rollback = buildBarOperationRollback(state, operationId);
        if (!rollback) return state;
        const effectiveRelations = projectEffectiveRelations(state.relations, state.pendingRelationChanges);
        const schedulingSummary = buildDerivedSchedulingSummary(rollback.allTasks, effectiveRelations, state.calculateCriticalPathEnabled);
        const changedFields = new Set<string>();
        const previousTasksById = new Map(state.allTasks.map(task => [task.id, task]));
        rollback.allTasks.forEach((task) => {
            const previousTask = previousTasksById.get(task.id);
            if (!previousTask) return;
            if (previousTask.startDate !== task.startDate) changedFields.add('startDate');
            if (previousTask.dueDate !== task.dueDate) changedFields.add('dueDate');
        });
        const derived = buildDerivedTaskState(state, {
            allTasks: rollback.allTasks,
            derivedInvalidation: taskFieldsAffectLayout(state, changedFields) ? 'layout' : 'schedule',
            schedulingSummary
        });
        return {
            ...rollback,
            ...toDerivedTaskStatePatch(derived),
        };
    }),

    updateTask: (id, updates, mutationIntent = updates, datePlacementMode) => set((state) => {
        const task = state.allTasks.find(t => t.id === id);
        if (!task) return state;

        if (!TaskLogicService.canEditTask(task)) {
            console.warn('Task is not editable');
            return state;
        }

        const hasDerivedDateEdit = task.datesDerived && (
            hasOwnField(updates, 'startDate') || hasOwnField(updates, 'dueDate') ||
            hasOwnField(mutationIntent, 'startDate') || hasOwnField(mutationIntent, 'dueDate')
        );
        if (hasDerivedDateEdit) {
            useUIStore.getState().addNotification(
                i18n.t('label_dates_derived_from_children') || 'Dates for this task are derived from its children.',
                'error'
            );
        }

        invalidateDataRequests();

        const capturedDatePlacementMode = datePlacementMode ?? useUIStore.getState().datePlacementMode;
        const requestedUpdates = task.datesDerived
            ? Object.fromEntries(Object.entries(updates).filter(([field]) => field !== 'startDate' && field !== 'dueDate')) as Partial<Task>
            : updates;
        const requestedMutationIntent = task.datesDerived
            ? Object.fromEntries(Object.entries(mutationIntent).filter(([field]) => field !== 'startDate' && field !== 'dueDate')) as Partial<Task>
            : mutationIntent;
        const canonicalUpdates = normalizeTaskDateUpdates(task, requestedUpdates, capturedDatePlacementMode);
        const canonicalMutationIntent = normalizeTaskDateUpdates(task, requestedMutationIntent, capturedDatePlacementMode);
        if (Object.keys(canonicalUpdates).length === 0 && Object.keys(canonicalMutationIntent).length === 0) return state;
        const updatedTask = { ...task, ...canonicalUpdates };
        TaskLogicService.validateDates(updatedTask).forEach(warn => console.warn(warn));
        const effectiveRelations = projectEffectiveRelations(state.relations, state.pendingRelationChanges);

        let currentTasks = state.allTasks.map(t => t.id === id ? updatedTask : t);
        const pendingUpdates = new Map<string, Partial<Task>>();
        const isContextChange = hasOwnField(canonicalUpdates, 'projectId') || hasOwnField(canonicalUpdates, 'trackerId');

        if (!isContextChange && (hasOwnField(canonicalUpdates, 'startDate') || hasOwnField(canonicalUpdates, 'dueDate'))) {
            const depResult = TaskLogicService.checkDependencies(
                state.allTasks,
                effectiveRelations,
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

        const hasScheduleSeed = hasOwnField(canonicalUpdates, 'startDate') ||
            hasOwnField(canonicalUpdates, 'dueDate') || pendingUpdates.size > 0;
        // A non-date edit must not create a derived parent's projection with
        // no schedule operation to settle it. Keep existing manual-parent
        // recalculation behavior unchanged.
        const parentDatesAreDerived = state.allTasks.find(candidate => candidate.id === task.parentId)?.datesDerived;
        if (!isContextChange && (hasScheduleSeed || !parentDatesAreDerived)) {
            const cascadingUpdates = resolveCascadingScheduleUpdates(
                currentTasks,
                effectiveRelations,
                [id, ...pendingUpdates.keys()],
                useUIStore.getState().autoScheduleMoveMode !== AutoScheduleMoveMode.Off
            );
            if (cascadingUpdates.error) {
                useUIStore.getState().addNotification(cascadingUpdates.error, 'error');
                return state;
            }
            currentTasks = cascadingUpdates.tasks;
            cascadingUpdates.updates.forEach((patch, taskId) => pendingUpdates.set(taskId, patch));
        }

        const changedTaskIds = new Set([id, ...pendingUpdates.keys()]);
        const finalTaskById = new Map<string, Task>();
        const taskChanges: Array<[Task, Task]> = [];
        const finalTasks = state.allTasks.map(t => {
            if (t.id === id) {
                finalTaskById.set(t.id, updatedTask);
                taskChanges.push([t, updatedTask]);
                return updatedTask;
            }
            if (pendingUpdates.has(t.id)) {
                const nextTask = { ...t, ...pendingUpdates.get(t.id) };
                finalTaskById.set(t.id, nextTask);
                taskChanges.push([t, nextTask]);
                return nextTask;
            }
            return t;
        });

        const barOperations = captureBarOperationBaselines(
            state.barOperations,
            state.allTasks,
            state.editGenerations,
            state.activeBarOperationId,
            [id, ...pendingUpdates.keys()]
        );



        // Add modified task IDs
        const newModifiedIds = new Set(state.modifiedTaskIds);
        const nextEditGenerations = { ...state.editGenerations };
        [id, ...pendingUpdates.keys()].forEach((taskId) => {
            nextEditGenerations[taskId] = (nextEditGenerations[taskId] ?? 0) + 1;
        });
        const nextLocalTaskPatches = { ...state.localTaskPatches };
        const patchFor = (
            taskId: string,
            projectionFields: Partial<Task>,
            intentFields: Partial<Task>,
            mutationDatePlacementMode?: DatePlacementModeValue
        ) => {
            const projection = Object.fromEntries(
                Object.entries(projectionFields).filter(([key]) => key !== 'lockVersion' && key !== 'id')
            ) as Partial<Task>;
            const persistenceIntent = Object.fromEntries(
                Object.entries(intentFields).filter(([key]) => key !== 'lockVersion' && key !== 'id')
            ) as Partial<Task>;
            if (Object.keys(projection).length === 0 && Object.keys(persistenceIntent).length === 0) return;
            const generation = nextEditGenerations[taskId] ?? 0;
            const operationId = `edit:${taskId}:${generation}`;
            const hasDateMutation = Object.keys(persistenceIntent).some(field => field === 'startDate' || field === 'dueDate');
            nextLocalTaskPatches[taskId] = [
                ...(nextLocalTaskPatches[taskId] ?? []).filter(patch => patch.operationId !== operationId),
                {
                    entityId: taskId,
                    projection,
                    mutationIntent: persistenceIntent,
                    generation,
                    operationId,
                    ...(hasDateMutation && mutationDatePlacementMode
                        ? { mutationContext: { datePlacementMode: mutationDatePlacementMode } }
                        : {})
                }
            ];
            if (Object.keys(persistenceIntent).length > 0) newModifiedIds.add(taskId);
        };
        patchFor(id, canonicalUpdates, canonicalMutationIntent, capturedDatePlacementMode);
        pendingUpdates.forEach((fields, taskId) => {
            const affectedTask = state.allTasks.find(candidate => candidate.id === taskId);
            const mutationIntent = affectedTask?.datesDerived
                ? Object.fromEntries(Object.entries(fields).filter(([field]) => field !== 'startDate' && field !== 'dueDate')) as Partial<Task>
                : fields;
            patchFor(taskId, fields, mutationIntent);
        });

        const changedFields = new Set([...Object.keys(canonicalUpdates), ...[...pendingUpdates.values()].flatMap(patch => Object.keys(patch))]);
        const requiresLayout = taskFieldsAffectLayout(state, changedFields, {
            projectName: changedFields.has('projectName') && taskChanges.some(([previousTask, updatedTask]) => (
                previousTask.projectName !== updatedTask.projectName
            )),
            assignedToName: changedFields.has('assignedToName') && taskChanges.some(([previousTask, updatedTask]) => (
                previousTask.assignedToName !== updatedTask.assignedToName
            ))
        });
        const hasSchedulingChanges = ['startDate', 'dueDate', 'projectId'].some(field => changedFields.has(field));
        const nextSchedulingSummary = hasSchedulingChanges
            ? buildDerivedSchedulingSummary(finalTasks, effectiveRelations, state.calculateCriticalPathEnabled)
            : {
                schedulingStates: state.schedulingStates,
                criticalPathMetrics: state.criticalPathMetrics,
                criticalPathProjectFinish: state.criticalPathProjectFinish
            };

        if (state.isSortingSuspended) {
            // Just update the view 'tasks' without re-layout (preserving order)
            const newViewTasks = state.tasks.map(viewTask => {
                if (!changedTaskIds.has(viewTask.id)) return viewTask;
                const updatedTask = finalTaskById.get(viewTask.id);
                return updatedTask ? mergeVisibleTask(viewTask, updatedTask) : viewTask;
            });

            return {
                allTasks: finalTasks,
                tasks: newViewTasks,
                ...nextSchedulingSummary,
                modifiedTaskIds: newModifiedIds, // Add here for suspended case
                editGenerations: nextEditGenerations,
                localTaskPatches: nextLocalTaskPatches,
                barOperations
            };
        }

        if (!requiresLayout && !hasSchedulingChanges) {
            const nextViewTasks = state.tasks.map(viewTask => {
                if (!changedTaskIds.has(viewTask.id)) return viewTask;
                const updatedTask = finalTaskById.get(viewTask.id);
                return updatedTask ? mergeVisibleTask(viewTask, updatedTask) : viewTask;
            });
            return {
                allTasks: finalTasks,
                tasks: nextViewTasks,
                modifiedTaskIds: newModifiedIds,
                editGenerations: nextEditGenerations,
                localTaskPatches: nextLocalTaskPatches,
                barOperations
            };
        }

        const derived = buildDerivedTaskState(state, {
            allTasks: finalTasks,
            derivedInvalidation: requiresLayout ? 'layout' : 'schedule',
            schedulingSummary: nextSchedulingSummary
        });

        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds: newModifiedIds, // Add here for normal case
            editGenerations: nextEditGenerations,
            localTaskPatches: nextLocalTaskPatches,
            barOperations
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
        const localTaskPatches = { ...state.localTaskPatches };
        localTaskPatches[id] = (localTaskPatches[id] ?? []).filter(patch => patch.generation !== operationGeneration);
        if (localTaskPatches[id].length === 0) delete localTaskPatches[id];
        const modifiedTaskIds = new Set(state.modifiedTaskIds);
        if (!hasLocalMutationIntent(localTaskPatches[id])) modifiedTaskIds.delete(id);
        const taskConflicts = { ...state.taskConflicts };
        delete taskConflicts[id];
        const serverTask = state.serverTaskSnapshot.entitiesById[id] ?? currentTask;
        const canonicalTask = {
            ...serverTask,
            lockVersion: Math.max(serverTask.lockVersion, lockVersion ?? serverTask.lockVersion)
        };
        const settledTask = applyLocalPatches(canonicalTask, localTaskPatches[id] ?? []);
        const allTasks = state.allTasks.map(task => task.id === id ? settledTask : task);
        const derived = buildDerivedTaskState(state, { allTasks });
        return {
            allTasks,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds,
            localTaskPatches,
            taskConflicts,
            serverTaskSnapshot: {
                ...state.serverTaskSnapshot,
                entitiesById: { ...state.serverTaskSnapshot.entitiesById, [id]: canonicalTask },
                revisions: {
                    ...state.serverTaskSnapshot.revisions,
                    [id]: Math.max(state.serverTaskSnapshot.revisions[id] ?? 0, canonicalTask.lockVersion)
                }
            }
        };
    }),

    rollbackTaskOperation: (id, operationGeneration, rollbackFields = {}) => set((state) => {
        const currentTask = state.allTasks.find(task => task.id === id);
        const serverTask = state.serverTaskSnapshot.entitiesById[id] ?? (currentTask ? { ...currentTask, ...rollbackFields } : undefined);
        if (!serverTask) return terminalTaskDeletionPatch(state, id, 'server');

        const laterPatches = (state.localTaskPatches[id] ?? []).filter(patch => patch.generation > operationGeneration);
        const rolledBackTask = laterPatches.length > 0 ? applyLocalPatches(serverTask, laterPatches) : serverTask;
        const allTasks = state.allTasks.some(task => task.id === id)
            ? state.allTasks.map(task => task.id === id ? rolledBackTask : task)
            : [...state.allTasks, rolledBackTask];
        const derived = buildDerivedTaskState(state, { allTasks });
        const localTaskPatches = { ...state.localTaskPatches };
        if (laterPatches.length > 0) {
            localTaskPatches[id] = laterPatches;
        } else {
            delete localTaskPatches[id];
        }
        const modifiedTaskIds = new Set(state.modifiedTaskIds);
        if (hasLocalMutationIntent(laterPatches)) {
            modifiedTaskIds.add(id);
        } else {
            modifiedTaskIds.delete(id);
        }

        return {
            allTasks,
            ...toDerivedTaskStatePatch(derived),
            localTaskPatches,
            modifiedTaskIds,
            ...settleBarOperationTaskOwnership(
                state.barOperations,
                state.activeBarOperationId,
                id,
                { mode: 'exact', generation: operationGeneration }
            )
        };
    }),

    applyTaskMutationMetadata: (taskId, metadata) => {
        const invalidatedIds = new Set(metadata.invalidatedEntityIds ?? []);
        const deletedIds = new Set(metadata.deletedEntityIds ?? []);
        const needsRefresh = [...invalidatedIds].some(id => id !== taskId);

        if (invalidatedIds.size > 0 || deletedIds.size > 0) invalidateDataRequests();

        set((state) => {
            if (deletedIds.has(taskId)) {
                return terminalTaskDeletionPatch(state, taskId, 'server');
            }
            if (!metadata.entity) return state;
            const currentTask = state.allTasks.find(task => task.id === taskId);
            const currentServerTask = state.serverTaskSnapshot.entitiesById[taskId] ?? currentTask;
            // Mutation entities contain persisted fields only. Build the internal
            // compatibility snapshot from the existing server/view entity so a
            // partial response can never manufacture view defaults.
            const persistedServerTask = currentServerTask
                ? { ...currentServerTask, ...metadata.entity } as Task
                : undefined;
            if (!persistedServerTask) return state;
            const serverTaskSnapshot = mergeServerEntity(
                state.serverTaskSnapshot,
                persistedServerTask,
                metadata.completeness ?? 'partial',
                metadata.revision ?? metadata.entity.lockVersion ?? 0
            );
            if (serverTaskSnapshot === state.serverTaskSnapshot) return state;
            const mergedTask = applyLocalPatches(
                serverTaskSnapshot.entitiesById[taskId],
                state.localTaskPatches[taskId] ?? []
            );
            const allTasks = currentTask
                ? state.allTasks.map(task => task.id === taskId ? { ...task, ...mergedTask } : task)
                : [...state.allTasks, mergedTask];
            const derived = buildDerivedTaskState(state, { allTasks });
            return { serverTaskSnapshot, allTasks, ...toDerivedTaskStatePatch(derived) };
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



    removeTask: (id) => {
        invalidateDataRequests();
        set((state) => terminalTaskDeletionPatch(state, id, 'local'));
    },

    markTaskTombstone: (id, source = 'server', operationId) => set((state) => {
        invalidateDataRequests();
        const patch = terminalTaskDeletionPatch(state, id, source);
        return {
            ...patch,
            taskTombstones: {
                ...patch.taskTombstones,
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

    registerTaskConflict: (id, message, generation = get().editGenerations[id], remoteEntity, remoteRevision, remoteAvailability = remoteEntity ? 'known' : 'needs_refresh') => set((state) => ({
        taskConflicts: {
            ...state.taskConflicts,
            [id]: { taskId: id, message, detectedAt: Date.now(), generation, remoteEntity, remoteRevision, remoteAvailability }
        }
    })),

    prepareScheduleConflict: async id => {
        // Explicit re-review also refreshes the shared business calendar and
        // its request header; a stale calendar must not strand this action.
        await get().refreshData();
        await prepareScheduleConflict(get, set, id);
    },
    applyScheduleConflict: (id, acceptAdjustments = false) => {
        invalidateDataRequests();
        return applyScheduleConflict(get, set,
            (state, allTasks) => toDerivedTaskStatePatch(buildDerivedTaskState(state, { allTasks })), id, acceptAdjustments);
    },
    resolveTaskConflict: async (id, resolution) => {
        if (resolution === 'dismiss') {
            return;
        }
        if (scheduleConflictIds(get(), id).length) {
            await selectScheduleConflict(get, set, id, resolution);
            return;
        }

        if (resolution === 'local') {
            const beforeRetry = get();
            const conflictRecord = beforeRetry.taskConflicts[id];
            if (!conflictRecord) return;
            const conflictGeneration = conflictRecord?.generation;
            const retryGeneration = beforeRetry.editGenerations[id] ?? conflictGeneration ?? 0;
            const retryFields = (beforeRetry.localTaskPatches[id] ?? [])
                .filter(patch => patch.generation <= retryGeneration)
                .reduce<Partial<Task>>((fields, patch) => ({ ...fields, ...patch.mutationIntent }), {});
            const retryDatePlacementMode = [...(beforeRetry.localTaskPatches[id] ?? [])]
                .reverse()
                .find(patch => (
                    patch.generation <= retryGeneration &&
                    Object.keys(patch.mutationIntent).some(field => field === 'startDate' || field === 'dueDate')
                ))
                ?.mutationContext?.datePlacementMode ?? DatePlacementMode.WorkingDays;
            const retryTask = beforeRetry.allTasks.find(task => task.id === id);
            const maxRetryGeneration = Math.max(
                retryGeneration,
                ...(beforeRetry.localTaskPatches[id] ?? []).map(patch => patch.generation)
            );
            const retryFieldNames = Object.keys(retryFields);
            const hasPersistedRetryFields = retryFieldNames.length > 0;
            const canRetryFieldsDirectly = retryTask && hasPersistedRetryFields && Object.keys(buildTaskPatchFieldsPayload(retryTask, retryFields)).length > 0;
            let confirmedRemote = selectConflictRemote(
                conflictRecord, beforeRetry.serverTaskSnapshot, beforeRetry.activeReadContext, beforeRetry.dataReadStatus
            );
            if (canRetryFieldsDirectly && !confirmedRemote) {
                const viewIdentityAtRetry = currentViewIdentity();
                const retryIsCurrent = () => get().taskConflicts[id] === conflictRecord &&
                    currentViewIdentity() === viewIdentityAtRetry &&
                    get().editGenerations[id] === beforeRetry.editGenerations[id];
                try {
                    const resyncData = await fetchMutationResyncData({ query: { selectedStatusIds: beforeRetry.selectedStatusIds } });
                    if (!retryIsCurrent() || get().dataReadStatus !== 'ready') return;
                    const entity = resyncData.tasks.find(task => task.id === id);
                    if (!entity) throw new Error(i18n.t('label_task_not_found') || 'Task no longer exists');
                    confirmedRemote = { entity, revision: entity.lockVersion };
                    get().applyApiData(resyncData);
                } catch (error) {
                    if (!retryIsCurrent() || get().dataReadStatus === 'loading') return;
                    const message = error instanceof Error ? error.message : (i18n.t('label_conflict') || 'Conflict');
                    get().registerTaskConflict(id, conflictRecord.message || message, conflictRecord.generation,
                        undefined, conflictRecord.remoteRevision, 'unavailable');
                    useUIStore.getState().addNotification(message, 'error');
                    return;
                }
            }
            set((state) => {
                if (!state.taskConflicts[id]) return state;
                const taskConflicts = { ...state.taskConflicts };
                delete taskConflicts[id];
                return { taskConflicts };
            });
            if (canRetryFieldsDirectly && confirmedRemote) {
                try {
                    // Pin the confirmed revision across queue waits and transport retries.
                    const retryBaseRevision = confirmedRemote.revision;
                    get().applyTaskMutationMetadata(id, confirmedRemote);
                    const result = await taskMutationService.updateTaskFields(id, () => {
                        const latestTask = get().allTasks.find(task => task.id === id) ?? retryTask;
                        return {
                            ...buildTaskPatchFieldsPayload(latestTask, retryFields),
                            lock_version: retryBaseRevision
                        };
                    }, undefined, retryDatePlacementMode);
                    get().applyTaskMutationMetadata(id, result);
                    if (result.status === 'ok') {
                        const committedGenerations = [...new Set((get().localTaskPatches[id] ?? [])
                            .map(patch => patch.generation)
                            .filter(generation => generation <= maxRetryGeneration))];
                        committedGenerations.forEach((generation) => {
                            get().commitTaskOperation(id, generation, result.lockVersion);
                        });
                        if (committedGenerations.length === 0 && typeof result.lockVersion === 'number') {
                            get().setTaskLockVersion(id, result.lockVersion);
                        }
                        get().settleBarOperationTaskThrough(id, maxRetryGeneration);
                        return;
                    }
                    const sourceDisposition = classifyMutationSourceDisposition(result);
                    if (sourceDisposition === 'target_missing') {
                        get().markTaskTombstone(id, 'server');
                        return;
                    }
                    if (sourceDisposition === 'reference_missing' || sourceDisposition === 'source_preserved') {
                        useUIStore.getState().addNotification(
                            result.error || (i18n.t('label_failed_to_save') || 'Failed to save'),
                            'error'
                        );
                        return;
                    }
                    if (result.status === 'conflict') {
                        get().registerTaskConflict(id, result.error || (i18n.t('label_conflict') || 'Conflict'), retryGeneration, result.entity, result.revision ?? result.entity?.lockVersion);
                        return;
                    }
                    get().registerTaskConflict(
                        id,
                        result.error || (i18n.t('label_failed_to_save') || 'Failed to save'),
                        retryGeneration
                    );
                    useUIStore.getState().addNotification(
                        `${i18n.t('label_failed_to_save') || 'Failed to save'} (#${id}: ${result.error || result.status})`,
                        'error'
                    );
                    return;
                } catch (error) {
                    const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_save') || 'Failed to save');
                    get().registerTaskConflict(id, message, retryGeneration);
                    useUIStore.getState().addNotification(message, 'error');
                    return;
                }
            }
            const failures = await get().saveChanges();
            if (!failures.has(id) && conflictGeneration !== undefined) {
                get().settleBarOperationTask(id, conflictGeneration);
            }
            return;
        }

        const initialState = get();
        const initialConflict = initialState.taskConflicts[id];
        if (!initialConflict) return;
        const viewIdentityAtResolution = currentViewIdentity();
        invalidateDataRequests();
        let selectedRemote: SelectedConflictRemote | undefined = initialConflict && selectConflictRemote(
            initialConflict, initialState.serverTaskSnapshot, initialState.activeReadContext, initialState.dataReadStatus
        );
        if (!selectedRemote) {
            try {
                const resyncData = await fetchMutationResyncData({ query: { selectedStatusIds: get().selectedStatusIds } });
                if (get().taskConflicts[id] !== initialConflict ||
                    currentViewIdentity() !== viewIdentityAtResolution || get().dataReadStatus !== 'ready') return;
                const remoteEntity = resyncData.tasks.find(task => task.id === id);
                if (!remoteEntity) throw new Error(i18n.t('label_task_not_found') || 'Task no longer exists');
                get().applyApiData(resyncData);
                selectedRemote = { entity: remoteEntity, revision: remoteEntity.lockVersion };
            } catch (error) {
                if (get().taskConflicts[id] !== initialConflict ||
                    currentViewIdentity() !== viewIdentityAtResolution || get().dataReadStatus === 'loading') return;
                const message = error instanceof Error ? error.message : (i18n.t('label_conflict') || 'Conflict');
                const conflict = get().taskConflicts[id];
                get().registerTaskConflict(id, conflict?.message || message, conflict?.generation, undefined, conflict?.remoteRevision, 'unavailable');
                useUIStore.getState().addNotification(message, 'error');
                return;
            }
        }

        set((state) => {
            const recordedConflictGeneration = state.taskConflicts[id]?.generation;
            const conflictGeneration = recordedConflictGeneration ?? state.editGenerations[id] ?? 0;
            const conflictRecord = state.taskConflicts[id];
            if (!conflictRecord || (initialConflict && conflictRecord !== initialConflict)) return state;
            const remoteChoice = selectConflictRemote(
                conflictRecord, state.serverTaskSnapshot, state.activeReadContext, state.dataReadStatus
            ) ?? selectedRemote;
            if (!remoteChoice) return state;
            const currentTask = state.allTasks.find(task => task.id === id)
                ?? state.serverTaskSnapshot.entitiesById[id];
            if (!currentTask) return state;
            const remoteTask = {
                ...(state.serverTaskSnapshot.entitiesById[id] ?? currentTask),
                ...remoteChoice.entity
            };
            const serverTaskSnapshot = mergeServerEntity(state.serverTaskSnapshot, remoteTask, 'complete', remoteChoice.revision);
            // A newer canonical revision must never be replaced by an older conflict response.
            if (serverTaskSnapshot.revisions[id] > remoteChoice.revision) return state;
            const canonicalTask = serverTaskSnapshot.entitiesById[id];
            const laterPatches = recordedConflictGeneration !== undefined
                ? (state.localTaskPatches[id] ?? []).filter(patch => patch.generation > conflictGeneration)
                : [];
            const resolvedTask = laterPatches.length > 0
                ? applyLocalPatches(canonicalTask, laterPatches)
                : canonicalTask;
            const allTasks = state.allTasks.some(task => task.id === id)
                ? state.allTasks.map(task => task.id === id ? resolvedTask : task)
                : [...state.allTasks, resolvedTask];
            const derived = buildDerivedTaskState(state, { allTasks });
            const localTaskPatches = { ...state.localTaskPatches };
            if (laterPatches.length > 0) localTaskPatches[id] = laterPatches;
            else delete localTaskPatches[id];
            const modifiedTaskIds = new Set(state.modifiedTaskIds);
            if (hasLocalMutationIntent(laterPatches)) modifiedTaskIds.add(id);
            else modifiedTaskIds.delete(id);
            const taskTombstones = { ...state.taskTombstones };
            delete taskTombstones[id];
            const taskConflicts = { ...state.taskConflicts };
            delete taskConflicts[id];
            const settlement = settleBarOperationTaskOwnership(
                state.barOperations,
                state.activeBarOperationId,
                id,
                { mode: 'exact', generation: conflictGeneration }
            );
            return {
                allTasks,
                ...toDerivedTaskStatePatch(derived),
                serverTaskSnapshot,
                localTaskPatches,
                modifiedTaskIds,
                taskTombstones,
                taskConflicts,
                ...settlement
            };
        });
    },

    updateViewport: (updates) => set((state) => {
        const nextViewport = { ...state.viewport, ...updates };
        const nextScrollY = clampViewportScrollY(nextViewport.scrollY, nextViewport, state.rowCount);

        const viewportChanged = (
            state.viewport.startDate !== nextViewport.startDate
            || state.viewport.scrollX !== nextViewport.scrollX
            || state.viewport.scrollY !== nextScrollY
            || state.viewport.scale !== nextViewport.scale
            || state.viewport.width !== nextViewport.width
            || state.viewport.height !== nextViewport.height
            || state.viewport.rowHeight !== nextViewport.rowHeight
        );

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

        if (!viewportChanged && !nextState.customScales) return state;

        return nextState;
    }),
    setRowHeight: (height) => set((state) => (
        state.viewport.rowHeight === height
            ? state
            : { viewport: { ...state.viewport, rowHeight: height } }
    )),

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
            inactiveExternalProjectIds: [],
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        // Keep a tentative selection out of shared URLs until the server normalizes it.
        if (!state.confirmedProjectScope) syncSharedQueryState({ ...state, ...nextState });
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
    setSelectedTrackerIds: (ids) => set((state) => {
        invalidateDataRequests();
        const layout = buildLayoutFromState(state, { selectedTrackerIds: ids });
        const queryContext = setTrackerOverride(state.queryContext, ids.length > 0
            ? { mode: 'subset', values: ids }
            : { mode: 'all' });
        const nextState = {
            ...queryContextPatch(queryContext),
            selectedTrackerIds: ids,
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
        // Even the confirmed value can cancel a different mode still in flight.
        if (current.memberProjectsOnly === enabled && current.dataReadStatus !== 'loading') return;
        await refreshCurrentData('refresh', enabled);
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
                viewport: state.viewport,
                rowCount: layout.rowCount,
                targetTimestamp: getTaskFocusTimestamp(focusedTask),
                targetRowIndex: focusedTask.rowIndex
            }),
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
        refreshData: async () => refreshCurrentData('refresh'),

    loadInitialData: async (params) => {
        const generation = ++dataRequestGeneration;
        const state = get();
        const context = createReadContext({
            generation,
            projectId: state.currentProjectId,
            query: params.query ?? params.initialState ?? {},
            scope: { rawSearch: params.rawSearch, queryContext: params.queryContext, memberProjectsOnly: state.memberProjectsOnly },
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
        await refreshCurrentData('saved_query');
    },

    saveChanges: async () => {
        if (saveChangesOperation) return saveChangesOperation;

        let committedTaskCount = 0;
        let committedRelationCount = 0;
        let relationWorkCaptured = false;
        const partialSaveMessage = () => i18n.t('label_relation_save_partial', {
            task_count: committedTaskCount,
            relation_count: committedRelationCount
        }) || 'label_relation_save_partial';

        const operation = (async () => {
            while (true) {
                const snapshot = get();
                if (snapshot.modifiedTaskIds.size === 0 && !hasPendingRelationChanges(snapshot.pendingRelationChanges)) return new Map<string, string>();
                relationWorkCaptured = relationWorkCaptured || hasPendingRelationChanges(snapshot.pendingRelationChanges);
                const relationViewIdentity = currentViewIdentity();
                const relationScopeProjectIds = snapshot.confirmedProjectScope
                    ? new Set(snapshot.confirmedProjectScope.effectiveProjectIds)
                    : undefined;
                const relationScopeIdentity = snapshot.confirmedProjectScope
                    ? [...snapshot.confirmedProjectScope.effectiveProjectIds].sort().join(',')
                    : '';

                const snapshotGenerations = { ...snapshot.editGenerations };
                const snapshotTaskIds = new Set(snapshot.modifiedTaskIds);
                const snapshotMutationFields: Record<string, TaskFields> = {};
                const snapshotMutationDatePlacementModes: Record<string, DatePlacementModeValue> = {};
                const snapshotMutationScheduling: Record<string, boolean> = {};
                const unsupportedMutationFailures = new Map<string, string>();
                snapshotTaskIds.forEach((taskId) => {
                    if (snapshot.taskConflicts[taskId] || Object.values(snapshot.taskConflicts).some(conflict =>
                        conflict.scheduleOperation?.[taskId] !== undefined || conflict.scheduleReview?.taskIds.includes(taskId))) {
                        unsupportedMutationFailures.set(taskId, i18n.t('label_unresolved_task_conflict') || 'Resolve the task conflict before saving.');
                        return;
                    }
                    const task = snapshot.allTasks.find(candidate => candidate.id === taskId);
                    const taskPatches = snapshot.localTaskPatches[taskId] ?? [];
                    const fields = taskPatches.reduce<Partial<Task>>(
                        (owned, patch) => ({ ...owned, ...patch.mutationIntent }), {}
                    );
                    // The latest date edit owns the merged interval's mode.
                    // Automatic patches have no manual context and use working days.
                    const datePlacementMode = [...taskPatches]
                        .reverse()
                        .find(patch => (
                            Object.keys(patch.mutationIntent).some(field => field === 'startDate' || field === 'dueDate')
                        ))
                        ?.mutationContext?.datePlacementMode;
                    if (task) {
                        const changedFields = Object.keys(fields).filter(field => PERSISTABLE_TASK_FIELDS.includes(field as typeof PERSISTABLE_TASK_FIELDS[number]));
                        const intendedTask = { ...task, ...fields };
                        const delta = buildTaskMutationDelta(
                            taskId,
                            snapshotGenerations[taskId] ?? 0,
                            intendedTask,
                            changedFields
                        );
                        if (Object.keys(delta.fields).length === 0) {
                            unsupportedMutationFailures.set(
                                taskId,
                                i18n.t('label_no_bulk_supported_mutation_fields') || 'No saveable task changes are available.'
                            );
                        } else {
                            snapshotMutationFields[taskId] = delta.fields;
                            if (datePlacementMode) snapshotMutationDatePlacementModes[taskId] = datePlacementMode;
                            snapshotMutationScheduling[taskId] = Object.prototype.hasOwnProperty.call(delta.fields, 'start_date') ||
                                Object.prototype.hasOwnProperty.call(delta.fields, 'due_date');
                        }
                    }
                });
                const relationSnapshot = Object.fromEntries(Object.entries(snapshot.pendingRelationChanges).map(([key, value]) => [key, { ...value }]));
                const relationOperations = orderedRelationChanges(relationSnapshot);
                const relationValidation = hasPendingRelationChanges(relationSnapshot)
                    ? validateRelationDrafts(
                        snapshot.allTasks,
                        snapshot.relations,
                        relationSnapshot,
                        snapshotMutationFields,
                        relationScopeProjectIds
                    )
                    : null;
                const conflictedRelation = Object.values(relationSnapshot).find((change) => {
                    const endpoints = new Set([change.original?.from, change.original?.to, change.desired?.from, change.desired?.to].filter((id): id is string => Boolean(id)));
                    return [...endpoints].some(taskId => snapshot.taskConflicts[taskId] || Object.values(snapshot.taskConflicts).some(conflict => (
                        conflict.scheduleOperation?.[taskId] !== undefined || conflict.scheduleReview?.taskIds.includes(taskId)
                    )));
                });
                const relationConflictValidation = conflictedRelation
                    ? { draftId: conflictedRelation.draftId, error: i18n.t('label_unresolved_task_conflict') || 'label_unresolved_task_conflict' }
                    : null;
                if (relationValidation || relationConflictValidation) {
                    const validation = relationValidation ?? relationConflictValidation!;
                    set((state) => {
                        const current = state.pendingRelationChanges[validation.draftId];
                        if (!current) return state;
                        return { pendingRelationChanges: {
                            ...state.pendingRelationChanges,
                            [validation.draftId]: { ...current, status: current.status === 'unknown' ? 'unknown' : 'failed', error: validation.error }
                        } };
                    });
                    return new Map([[`relation:${validation.draftId}`, validation.error]]);
                }
                if (relationOperations.length > 0) {
                    set((state) => {
                        const pendingRelationChanges = { ...state.pendingRelationChanges };
                        relationOperations.forEach((operation) => {
                            const current = pendingRelationChanges[operation.draftId];
                            if (current?.generation === operation.generation) {
                                pendingRelationChanges[operation.draftId] = { ...current, status: 'saving', error: undefined };
                            }
                        });
                        return { pendingRelationChanges };
                    });
                }
                const terminalBarFailureTaskGenerations = new Map<string, number>();
                const conflictMessages = new Map<string, { message: string; generation: number; remoteEntity?: PersistedTaskState; remoteRevision?: number; remoteAvailability: MutationRemoteAvailability }>();
                const savedLockVersions = new Map<string, number>();
                const successfulMutationTaskIds = new Set<string>();
                const canonicalDerivedDateTaskIds = new Set<string>();
                const mutationMetadataRecords: Array<{ taskId: string; metadata: MutationMetadata }> = [];
                let mutationMetadataNeedsRefresh = false;
                const hasScheduleMutation = Object.values(snapshotMutationScheduling).some(Boolean);
                invalidateDataRequests();
                const saveResult = await saveModifiedTasks(
                    snapshot.allTasks,
                    snapshot.relations,
                    snapshot.modifiedTaskIds,
                    snapshot.selectedStatusIds,
                    taskMutationService.updateTask,
                    fetchMutationResyncData,
                    (taskId, lockVersion) => {
                        if (typeof lockVersion !== 'number') return;
                        savedLockVersions.set(
                            taskId,
                            Math.max(savedLockVersions.get(taskId) ?? 0, lockVersion)
                        );
                    },
                    (taskId, result) => {
                        if (result.status === 'ok' && result.entity?.datesDerived === true) {
                            canonicalDerivedDateTaskIds.add(taskId);
                        }
                        const invalidatedEntityIds = result.invalidatedEntityIds ?? [];
                        const deletedEntityIds = result.deletedEntityIds ?? [];
                        const sourceDisposition = classifyMutationSourceDisposition(result);
                        const targetMissing = sourceDisposition === 'target_missing';
                        const operationScopeConflict = result.status === 'conflict' && result.failure?.resourceRole === 'scope';
                        if (operationScopeConflict) {
                            // A topology conflict has no stale task owner. It
                            // refreshes the remote scope while leaving every
                            // local schedule intent unresolved for a later
                            // explicit retry.
                            invalidateDataRequests();
                            mutationMetadataNeedsRefresh = true;
                        }
                        if (invalidatedEntityIds.length > 0 || deletedEntityIds.length > 0) {
                            invalidateDataRequests();
                            if (invalidatedEntityIds.some((id) => id !== taskId)) {
                                mutationMetadataNeedsRefresh = true;
                            }
                        }
                        if (targetMissing) {
                            invalidateDataRequests();
                        }
                        if (result.entity || invalidatedEntityIds.length > 0 || deletedEntityIds.length > 0 || targetMissing) {
                            mutationMetadataRecords.push({
                                taskId,
                                metadata: targetMissing
                                    ? {
                                        ...result,
                                        deletedEntityIds: [...new Set([...deletedEntityIds, taskId])]
                                    }
                                    : result
                            });
                        }
                        if (result.status === 'ok') successfulMutationTaskIds.add(taskId);
                        if (result.status !== 'ok' && (result.status === 'validation_error' || result.status === 'forbidden' || sourceDisposition !== 'not_applicable')) {
                            const operationGeneration = snapshotGenerations[taskId] ?? 0;
                            const hasBarOperation = Object.values(get().barOperations).some((operation) => (
                                operation.entityGenerations[taskId] === operationGeneration
                            ));
                            if (hasBarOperation) {
                                terminalBarFailureTaskGenerations.set(taskId, operationGeneration);
                            }
                        }
                    },
                    (taskId, message, remoteEntity, remoteRevision) => {
                        if (remoteEntity) {
                            mutationMetadataRecords.push({
                                taskId,
                                metadata: {
                                    entity: remoteEntity,
                                    revision: remoteRevision ?? remoteEntity.lockVersion
                                }
                            });
                        }
                        conflictMessages.set(taskId, {
                            message,
                            generation: snapshotGenerations[taskId] ?? 0,
                            remoteEntity,
                            remoteRevision,
                            remoteAvailability: remoteEntity ? 'known' : 'unavailable'
                        });
                    },
                    (taskId) => {
                        if (terminalBarFailureTaskGenerations.size === 0) return false;
                        const operationGeneration = terminalBarFailureTaskGenerations.get(taskId);
                        if (operationGeneration !== undefined) return true;
                        return Object.values(get().barOperations).some((operation) => (
                            operation.entityGenerations[taskId] !== undefined &&
                            Object.entries(operation.entityGenerations).some(([failedTaskId, failedGeneration]) => (
                                terminalBarFailureTaskGenerations.get(failedTaskId) === failedGeneration
                            ))
                        ));
                    },
                    snapshotGenerations,
                    snapshotMutationFields,
                    unsupportedMutationFailures,
                    snapshotMutationScheduling,
                    typeof apiClient.scheduleMutation === 'function' ? (changes) => taskMutationService.scheduleMutation(changes.map(change => ({
                        taskId: change.taskId,
                        baseRevision: change.baseRevision,
                        task: change.task,
                        mutationFields: change.mutationFields,
                        datePlacementMode: change.datePlacementMode,
                        ...(Object.prototype.hasOwnProperty.call(change.fields, 'start_date') ? { startDate: parseDateOnly(change.fields.start_date as string | null) } : {}),
                        ...(Object.prototype.hasOwnProperty.call(change.fields, 'due_date') ? { dueDate: parseDateOnly(change.fields.due_date as string | null) } : {})
                    }))) : undefined,
                    snapshot.serverTaskSnapshot.revisions,
                    snapshotMutationDatePlacementModes
                );
                const { failures, savedTaskIds, settledFieldsByTask } = saveResult;
                committedTaskCount += savedTaskIds.size;

                if (savedLockVersions.size > 0 || mutationMetadataRecords.length > 0 || savedTaskIds.size > 0 || successfulMutationTaskIds.size > 0) {
                    set((state) => {
                        const currentTaskById = new Map(state.allTasks.map((task) => [task.id, task]));
                        const entitiesById = { ...state.serverTaskSnapshot.entitiesById };
                        const revisions = { ...state.serverTaskSnapshot.revisions };
                        const affectedTaskIds = new Set<string>();
                        const deletedTaskIds = new Set<string>();

                        mutationMetadataRecords.forEach(({ taskId, metadata }) => {
                            const deletedEntityIds = new Set(metadata.deletedEntityIds ?? []);
                            deletedEntityIds.forEach((deletedTaskId) => {
                                deletedTaskIds.add(deletedTaskId);
                                delete entitiesById[deletedTaskId];
                                delete revisions[deletedTaskId];
                            });
                            if (deletedTaskIds.has(taskId)) return;
                            if (!metadata.entity) return;
                            affectedTaskIds.add(taskId);

                            const currentTask = currentTaskById.get(taskId);
                            const currentServerTask = entitiesById[taskId] ?? currentTask;
                            if (!currentServerTask) return;

                            const persistedServerTask = {
                                ...currentServerTask,
                                ...metadata.entity
                            } as Task;
                            const revision = metadata.revision ?? metadata.entity.lockVersion ?? 0;
                            const currentRevision = revisions[taskId] ?? 0;
                            if (revision < currentRevision) return;

                            entitiesById[taskId] = metadata.completeness === 'partial' && entitiesById[taskId]
                                ? { ...entitiesById[taskId], ...persistedServerTask }
                                : persistedServerTask;
                            revisions[taskId] = Math.max(currentRevision, revision);
                        });

                        savedLockVersions.forEach((lockVersion, taskId) => {
                            if (deletedTaskIds.has(taskId)) return;
                            const currentTask = currentTaskById.get(taskId);
                            const currentServerTask = entitiesById[taskId] ?? currentTask;
                            if (!currentServerTask) return;

                            affectedTaskIds.add(taskId);
                            const canonicalTask = {
                                ...currentServerTask,
                                lockVersion: Math.max(currentServerTask.lockVersion, lockVersion)
                            };
                            entitiesById[taskId] = canonicalTask;
                            revisions[taskId] = Math.max(revisions[taskId] ?? 0, lockVersion);
                        });

                        const settledTaskById = new Map<string, Task>();
                        const canonicalDateSettlementIds = new Set([...canonicalDerivedDateTaskIds].filter((taskId) => (
                            (state.editGenerations[taskId] ?? 0) === (snapshotGenerations[taskId] ?? 0)
                        )));
                        affectedTaskIds.forEach((taskId) => {
                            if (deletedTaskIds.has(taskId)) return;
                            const currentTask = currentTaskById.get(taskId);
                            const canonicalTask = entitiesById[taskId] ?? currentTask;
                            if (!canonicalTask) return;

                            const patches = state.localTaskPatches[taskId] ?? [];
                            const shouldSettle = savedLockVersions.has(taskId) || canonicalDateSettlementIds.has(taskId);
                            const settledFields = new Set(settledFieldsByTask.get(taskId) ?? []);
                            if (canonicalDateSettlementIds.has(taskId)) {
                                settledFields.add('startDate');
                                settledFields.add('dueDate');
                            }
                            const patchesToApply = shouldSettle
                                ? settleLocalPatchFields(
                                    patches,
                                    snapshotGenerations[taskId] ?? 0,
                                    settledFields
                                )
                                : patches;
                            settledTaskById.set(taskId, applyLocalPatches(canonicalTask, patchesToApply));
                        });

                        const allTasks = state.allTasks
                            .filter((task) => !deletedTaskIds.has(task.id))
                            .map((task) => settledTaskById.get(task.id) ?? task);
                        settledTaskById.forEach((task, taskId) => {
                            if (!currentTaskById.has(taskId) && !deletedTaskIds.has(taskId)) {
                                allTasks.push(task);
                            }
                        });

                        let localTaskPatches = state.localTaskPatches;
                        let modifiedTaskIds = state.modifiedTaskIds;
                        let taskConflicts = state.taskConflicts;
                        let taskTombstones = state.taskTombstones;
                        let barOperations = state.barOperations;
                        let activeBarOperationId = state.activeBarOperationId;
                        if (savedTaskIds.size > 0) {
                            localTaskPatches = { ...state.localTaskPatches };
                            modifiedTaskIds = new Set(state.modifiedTaskIds);
                            snapshotTaskIds.forEach((taskId) => {
                                if (!savedTaskIds.has(taskId)) return;
                                const remainingPatches = settleLocalPatchFields(
                                    localTaskPatches[taskId] ?? [],
                                    snapshotGenerations[taskId] ?? 0,
                                    settledFieldsByTask.get(taskId) ?? []
                                );
                                if (remainingPatches.length > 0) {
                                    localTaskPatches[taskId] = remainingPatches;
                                } else {
                                    delete localTaskPatches[taskId];
                                }
                                if (hasLocalMutationIntent(remainingPatches)) {
                                    modifiedTaskIds.add(taskId);
                                } else {
                                    modifiedTaskIds.delete(taskId);
                                }

                            });
                        }
                        canonicalDateSettlementIds.forEach((taskId) => {
                            if (localTaskPatches === state.localTaskPatches) localTaskPatches = { ...state.localTaskPatches };
                            const remainingPatches = settleLocalPatchFields(
                                localTaskPatches[taskId] ?? [],
                                snapshotGenerations[taskId] ?? 0,
                                ['startDate', 'dueDate']
                            );
                            if (remainingPatches.length > 0) localTaskPatches[taskId] = remainingPatches;
                            else delete localTaskPatches[taskId];
                        });
                        successfulMutationTaskIds.forEach((taskId) => {
                            const settlement = settleBarOperationTaskOwnership(
                                barOperations,
                                activeBarOperationId,
                                taskId,
                                { mode: 'through', generation: snapshotGenerations[taskId] ?? 0 }
                            );
                            barOperations = settlement.barOperations;
                            activeBarOperationId = settlement.activeBarOperationId;
                        });
                        if (deletedTaskIds.size > 0) {
                            if (localTaskPatches === state.localTaskPatches) localTaskPatches = { ...state.localTaskPatches };
                            if (modifiedTaskIds === state.modifiedTaskIds) modifiedTaskIds = new Set(state.modifiedTaskIds);
                            taskConflicts = { ...state.taskConflicts };
                            taskTombstones = { ...state.taskTombstones };
                            deletedTaskIds.forEach((taskId) => {
                                delete localTaskPatches[taskId];
                                modifiedTaskIds.delete(taskId);
                                delete taskConflicts[taskId];
                                delete entitiesById[taskId];
                                delete revisions[taskId];
                                taskTombstones[taskId] = {
                                    entityId: taskId,
                                    deletedAt: Date.now(),
                                    source: 'server'
                                };
                                const settlement = settleBarOperationTaskOwnership(
                                    barOperations,
                                    activeBarOperationId,
                                    taskId,
                                    { mode: 'all' }
                                );
                                barOperations = settlement.barOperations;
                                activeBarOperationId = settlement.activeBarOperationId;
                            });
                        }

                        const hasDerivedChanges = affectedTaskIds.size > 0 || deletedTaskIds.size > 0;
                        const derived = hasDerivedChanges
                            ? buildDerivedTaskState(state, { allTasks })
                            : undefined;
                        return {
                            allTasks,
                            ...(derived ? toDerivedTaskStatePatch(derived) : {}),
                            ...(deletedTaskIds.size > 0
                                ? { localTaskPatches, modifiedTaskIds, taskConflicts, taskTombstones, barOperations, activeBarOperationId }
                                : savedTaskIds.size > 0 || successfulMutationTaskIds.size > 0 || canonicalDateSettlementIds.size > 0
                                    ? { localTaskPatches, modifiedTaskIds, barOperations, activeBarOperationId }
                                : {}),
                            serverTaskSnapshot: {
                                ...state.serverTaskSnapshot,
                                entitiesById,
                                revisions
                            }
                        };
                    });
                }

                const requiresResync = saveResult.savedTaskIds.size > 0 && [...saveResult.savedTaskIds].some(taskId => (
                    (snapshot.localTaskPatches[taskId] ?? []).some(patch => (
                        BULK_TASK_FIELDS.some(field => field in patch.mutationIntent)
                    ))
                ));
                const requiresPostTaskRefresh = mutationMetadataNeedsRefresh || (
                    saveResult.batchStatus !== 'preflight_failure' && hasScheduleMutation && requiresResync
                );
                if (requiresPostTaskRefresh) {
                    try {
                        await get().refreshData();
                    } catch (error) {
                        // A failed conflict resync is already represented as a
                        // terminal conflict. Do not replace that actionable
                        // result with a second refresh exception; the local
                        // patch must remain available for manual resolution.
                        if (conflictMessages.size === 0 && hasScheduleMutation && requiresResync) throw error;
                        console.error('Failed to refresh saved tasks after mutation', error);
                    }
                }
                if (conflictMessages.size > 0) {
                    set((state) => {
                        const taskConflicts = { ...state.taskConflicts };
                        conflictMessages.forEach(({ message, generation, remoteEntity, remoteRevision, remoteAvailability }, taskId) => {
                            taskConflicts[taskId] = { taskId, message, detectedAt: Date.now(), generation, remoteEntity, remoteRevision, remoteAvailability,
                                ...(snapshotMutationScheduling[taskId] ? { scheduleOperation: Object.fromEntries(
                                    Object.keys(snapshotMutationScheduling).filter(key => snapshotMutationScheduling[key])
                                        .map(key => [key, snapshotGenerations[key] ?? 0])
                                ) } : {}) };
                        });
                        return { taskConflicts };
                    });
                }
                terminalBarFailureTaskGenerations.forEach((operationGeneration, taskId) => {
                    const operation = Object.values(get().barOperations).find((candidate) => (
                        candidate.entityGenerations[taskId] === operationGeneration
                    ));
                    if (operation) get().rollbackBarOperation(operation.operationId);
                });
                if (failures.size > 0) {
                    if (relationOperations.length > 0) {
                        const blockedMessage = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                        set((state) => {
                            const pendingRelationChanges = { ...state.pendingRelationChanges };
                            relationOperations.forEach((operation) => {
                                const current = pendingRelationChanges[operation.draftId];
                                if (current?.generation === operation.generation && current.status === 'saving') {
                                    pendingRelationChanges[operation.draftId] = { ...current, status: 'pending', error: blockedMessage };
                                    failures.set(`relation:${operation.draftId}`, blockedMessage);
                                }
                            });
                            return { pendingRelationChanges };
                        });
                    }
                    const [failedTaskId, failedReason] = failures.entries().next().value as [string, string];
                    const failureMessage = failedTaskId.startsWith('relation:')
                        ? failedReason
                        : `${i18n.t('label_failed_to_save') || 'Failed to save'} (#${failedTaskId}: ${failedReason})`;
                    const notificationMessage = relationWorkCaptured && (committedTaskCount > 0 || committedRelationCount > 0)
                        ? `${partialSaveMessage()} ${failureMessage}`
                        : failureMessage;
                    useUIStore.getState().addNotification(notificationMessage, 'error');
                    return failures;
                }

                if (relationOperations.length > 0 && get().modifiedTaskIds.size > 0) {
                    set((state) => {
                        const pendingRelationChanges = { ...state.pendingRelationChanges };
                        relationOperations.forEach((operation) => {
                            const current = pendingRelationChanges[operation.draftId];
                            if (current?.generation === operation.generation && current.status === 'saving') {
                                pendingRelationChanges[operation.draftId] = { ...current, status: 'pending' };
                            }
                        });
                        return { pendingRelationChanges };
                    });
                    continue;
                }

                if (relationOperations.length > 0) {
                    const hasRelationSaveScope = () => currentViewIdentity() === relationViewIdentity &&
                        (get().confirmedProjectScope
                            ? [...get().confirmedProjectScope!.effectiveProjectIds].sort().join(',')
                            : '') === relationScopeIdentity;
                    if (!hasRelationSaveScope()) {
                        const message = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                        set((state) => {
                            const pendingRelationChanges = { ...state.pendingRelationChanges };
                            relationOperations.forEach((operation) => {
                                const current = pendingRelationChanges[operation.draftId];
                                if (current?.generation === operation.generation && current.status === 'saving') {
                                    pendingRelationChanges[operation.draftId] = { ...current, status: 'pending', error: message };
                                }
                            });
                            return { pendingRelationChanges };
                        });
                        return new Map([['relations', message]]);
                    }
                    let refreshOutcome: ReadApplyOutcome;
                    try {
                        refreshOutcome = await get().refreshData();
                    } catch {
                        refreshOutcome = { status: 'superseded' } as ReadApplyOutcome;
                    }
                    if (refreshOutcome.status !== 'applied' || !hasRelationSaveScope()) {
                        const message = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                        set((state) => {
                            const pendingRelationChanges = { ...state.pendingRelationChanges };
                            relationOperations.forEach((operation) => {
                                const current = pendingRelationChanges[operation.draftId];
                                if (current?.generation === operation.generation && current.status === 'saving') {
                                    pendingRelationChanges[operation.draftId] = { ...current, status: 'pending', error: message };
                                }
                            });
                            return { pendingRelationChanges };
                        });
                        if (committedTaskCount > 0 || committedRelationCount > 0) {
                            useUIStore.getState().addNotification(`${partialSaveMessage()} ${message}`, 'warning');
                        }
                        return new Map([['relations', message]]);
                    }

                    // Edits can arrive while refresh is in flight. Persist them
                    // first, then validate drafts against their confirmed state.
                    if (get().modifiedTaskIds.size > 0) {
                        set((state) => {
                            const pendingRelationChanges = { ...state.pendingRelationChanges };
                            relationOperations.forEach((operation) => {
                                const current = pendingRelationChanges[operation.draftId];
                                if (current?.generation === operation.generation && current.status === 'saving') {
                                    pendingRelationChanges[operation.draftId] = { ...current, status: 'pending' };
                                }
                            });
                            return { pendingRelationChanges };
                        });
                        continue;
                    }

                    const currentState = get();
                    const revalidationChanges = Object.fromEntries(Object.entries(currentState.pendingRelationChanges).map(([key, value]) => [
                        key,
                        value.status === 'saving' ? { ...value, status: 'pending' as const } : value
                    ]));
                    const authoritativeTasks = currentState.allTasks.map(task => ({
                        ...task,
                        ...(currentState.serverTaskSnapshot.entitiesById[task.id] ?? {})
                    }));
                    const revalidation = validateRelationDrafts(
                        authoritativeTasks,
                        currentState.relations,
                        revalidationChanges,
                        {},
                        relationScopeProjectIds
                    );
                    if (revalidation) {
                        set((state) => {
                            const pendingRelationChanges = { ...state.pendingRelationChanges };
                            relationOperations.forEach((operation) => {
                                const current = pendingRelationChanges[operation.draftId];
                                if (current?.generation === operation.generation && current.status === 'saving') {
                                    pendingRelationChanges[operation.draftId] = {
                                        ...current,
                                        status: current.draftId === revalidation.draftId ? 'failed' : 'pending',
                                        error: current.draftId === revalidation.draftId ? revalidation.error : undefined
                                    };
                                }
                            });
                            return { pendingRelationChanges };
                        });
                        if (committedTaskCount > 0 || committedRelationCount > 0) {
                            useUIStore.getState().addNotification(`${partialSaveMessage()} ${revalidation.error}`, 'warning');
                        }
                        return new Map([[`relation:${revalidation.draftId}`, revalidation.error]]);
                    }

                    const relationFailures = new Map<string, string>();
                    let failedOperationId: string | null = null;
                    const relationEndpointIds = new Set(relationOperations.flatMap(operation => [
                        operation.original?.from, operation.original?.to,
                        operation.desired?.from, operation.desired?.to
                    ]).filter((id): id is string => Boolean(id)));
                    const hasNewerEndpointEdits = () => [...relationEndpointIds].some(taskId =>
                        get().modifiedTaskIds.has(taskId) &&
                        (get().editGenerations[taskId] ?? 0) > (snapshotGenerations[taskId] ?? 0)
                    );
                    const committedRelationsBeforeBatch = committedRelationCount;
                    for (let operationIndex = 0; operationIndex < relationOperations.length; operationIndex += 1) {
                        const operation = relationOperations[operationIndex];
                        const current = get().pendingRelationChanges[operation.draftId];
                        if (!current || current.generation !== operation.generation || current.status !== 'saving') continue;
                        if (!hasRelationSaveScope() || hasNewerEndpointEdits()) {
                            const message = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                            set((state) => {
                                const pendingRelationChanges = { ...state.pendingRelationChanges };
                                relationOperations.slice(operationIndex).forEach((later) => {
                                    const active = pendingRelationChanges[later.draftId];
                                    if (active?.generation === later.generation && active.status === 'saving') {
                                        pendingRelationChanges[later.draftId] = { ...active, status: 'pending', error: message };
                                    }
                                });
                                return { pendingRelationChanges };
                            });
                            relationFailures.set(`relation:${operation.draftId}`, message);
                            break;
                        }
                        try {
                            const executionGuard = () => {
                                if (!hasRelationSaveScope() || hasNewerEndpointEdits()) {
                                    throw new RelationExecutionGuardError(i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked');
                                }
                            };
                            let savedRelation: Relation | null = null;
                            if (operation.operation === 'create' && operation.desired) {
                                savedRelation = await taskMutationService.createRelation(
                                    operation.desired.from,
                                    operation.desired.to,
                                    operation.desired.type,
                                    operation.desired.delay,
                                    executionGuard
                                );
                            } else if (operation.operation === 'update' && operation.relationId && operation.desired && operation.original) {
                                const expected: ExpectedRelation = {
                                    from: operation.original.from,
                                    to: operation.original.to,
                                    type: operation.original.type,
                                    ...(operation.original.delay === undefined ? {} : { delay: operation.original.delay })
                                };
                                savedRelation = await taskMutationService.updateRelation(
                                    operation.relationId,
                                    operation.desired.type,
                                    operation.desired.delay,
                                    [operation.original.from, operation.original.to, operation.desired.from, operation.desired.to],
                                    expected,
                                    executionGuard
                                );
                            } else if (operation.operation === 'delete' && operation.relationId && operation.original) {
                                const expected: ExpectedRelation = {
                                    from: operation.original.from,
                                    to: operation.original.to,
                                    type: operation.original.type,
                                    ...(operation.original.delay === undefined ? {} : { delay: operation.original.delay })
                                };
                                await taskMutationService.deleteRelation(
                                    operation.relationId,
                                    [operation.original.from, operation.original.to],
                                    expected,
                                    executionGuard
                                );
                            }

                            const relationViewStillCurrent = hasRelationSaveScope();
                            set((state) => {
                                const pendingRelationChanges = { ...state.pendingRelationChanges };
                                const active = pendingRelationChanges[operation.draftId];
                                if (active?.generation === operation.generation) delete pendingRelationChanges[operation.draftId];
                                const relations = !relationViewStillCurrent
                                    ? state.relations
                                    : operation.operation === 'delete' && operation.relationId
                                    ? state.relations.filter(relation => relation.id !== operation.relationId)
                                    : savedRelation
                                        ? [...state.relations.filter(relation => relation.id !== savedRelation!.id), savedRelation]
                                        : state.relations;
                                const derived = buildDerivedTaskState(state, { relations, relationChanges: pendingRelationChanges });
                                return {
                                    relations,
                                    pendingRelationChanges,
                                    relationEditGeneration: state.relationEditGeneration + 1,
                                    ...toDerivedTaskStatePatch(derived)
                                };
                            });
                            committedRelationCount += 1;
                            if (!relationViewStillCurrent) {
                                queueMicrotask(() => { void get().refreshData().catch(() => undefined); });
                            }
                            if (hasNewerEndpointEdits()) {
                                const message = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                                set((state) => {
                                    const pendingRelationChanges = { ...state.pendingRelationChanges };
                                    relationOperations.slice(operationIndex + 1).forEach((later) => {
                                        const active = pendingRelationChanges[later.draftId];
                                        if (active?.generation === later.generation && active.status === 'saving') {
                                            pendingRelationChanges[later.draftId] = { ...active, status: 'pending', error: message };
                                        }
                                    });
                                    return { pendingRelationChanges };
                                });
                                relationFailures.set(`relation:${operation.draftId}`, message);
                                break;
                            }
                        } catch (error) {
                            const errorRecord = error && typeof error === 'object' ? error as { status?: unknown; statusCode?: unknown; httpStatus?: unknown; name?: unknown; knownUnsent?: unknown } : null;
                            const responseStatus = typeof errorRecord?.status === 'number'
                                ? errorRecord.status
                                : typeof errorRecord?.httpStatus === 'number'
                                    ? errorRecord.httpStatus
                                    : typeof errorRecord?.statusCode === 'number' ? errorRecord.statusCode : undefined;
                            const unknown = errorRecord?.knownUnsent !== true && (
                                responseStatus === undefined || responseStatus === 408 || responseStatus >= 500 ||
                                errorRecord?.name === 'AbortError' || error instanceof TypeError
                            );
                            const message = unknown
                                ? (i18n.t('label_relation_result_unknown') || 'label_relation_result_unknown')
                                : (error instanceof Error ? error.message : (i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked'));
                            set((state) => {
                                const pendingRelationChanges = { ...state.pendingRelationChanges };
                                const active = pendingRelationChanges[operation.draftId];
                                if (active?.generation === operation.generation) {
                                    pendingRelationChanges[operation.draftId] = { ...active, status: unknown ? 'unknown' : 'failed', error: message };
                                }
                                for (const later of relationOperations.slice(operationIndex + 1)) {
                                    const next = pendingRelationChanges[later.draftId];
                                    if (next?.generation === later.generation && next.status === 'saving') {
                                        pendingRelationChanges[later.draftId] = { ...next, status: 'pending', error: undefined };
                                    }
                                }
                                return {
                                    pendingRelationChanges,
                                    ...relationDraftDerivedPatch(state, pendingRelationChanges)
                                };
                            });
                            failedOperationId = operation.draftId;
                            relationFailures.set(`relation:${operation.draftId}`, message);
                            break;
                        }
                    }
                    let relationRefreshError: string | null = null;
                    if (committedRelationCount > committedRelationsBeforeBatch) {
                        try {
                            const reconcileOutcome = await get().refreshData();
                            if (reconcileOutcome.status !== 'applied') {
                                relationRefreshError = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                            }
                        } catch {
                            relationRefreshError = i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked';
                        }
                    }
                    if (relationFailures.size > 0) {
                        const first = relationFailures.values().next().value as string;
                        const failure = relationRefreshError ? `${first} ${relationRefreshError}` : first;
                        useUIStore.getState().addNotification(
                            committedTaskCount > 0 || committedRelationCount > 0
                                ? `${partialSaveMessage()} ${failure}`
                                : failure,
                            'error'
                        );
                        return relationFailures;
                    }
                    if (failedOperationId) return relationFailures;
                    if (relationRefreshError) {
                        useUIStore.getState().addNotification(`${partialSaveMessage()} ${relationRefreshError}`, 'warning');
                        return new Map([['relations', relationRefreshError]]);
                    }
                }

                const remainingSaveableRelations = orderedRelationChanges(get().pendingRelationChanges).length > 0;
                if (get().modifiedTaskIds.size === 0 && !remainingSaveableRelations) return failures;
            }
        })().catch((error) => {
            if (relationWorkCaptured && (committedTaskCount > 0 || committedRelationCount > 0) && hasPendingRelationChanges(get().pendingRelationChanges)) {
                useUIStore.getState().addNotification(partialSaveMessage(), 'warning');
            }
            throw error;
        });

        saveChangesOperation = operation;
        try {
            return await operation;
        } finally {
            set((state) => {
                const pendingRelationChanges = { ...state.pendingRelationChanges };
                let changed = false;
                Object.values(pendingRelationChanges).forEach((change) => {
                    if (change.status === 'saving') {
                        pendingRelationChanges[change.draftId] = {
                            ...change,
                            status: 'pending',
                            error: change.error ?? (i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked')
                        };
                        changed = true;
                    }
                });
                return changed ? { pendingRelationChanges } : state;
            });
            if (saveChangesOperation === operation) saveChangesOperation = null;
        }
    },

    discardChanges: async () => {
        const state = get();
        set({
            selectedRelationId: null,
            draftRelation: null,
            localTaskPatches: {},
            modifiedTaskIds: new Set(),
            pendingRelationChanges: {},
            relationEditGeneration: state.relationEditGeneration + 1,
            barOperations: {},
            activeBarOperationId: null,
            ...toDerivedTaskStatePatch(buildDerivedTaskState(state, { relations: state.relations, relationChanges: {} }))
        });
        await state.refreshData();
    }
});
});
