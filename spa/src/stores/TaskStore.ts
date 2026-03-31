import { create } from 'zustand';
import type { Task, Relation, DraftRelation, Viewport, ViewMode, ZoomLevel, LayoutRow, Version, TaskStatus } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';
import { i18n } from '../utils/i18n';
import { useUIStore } from './UIStore';
import type { MoveTaskAsChildResult } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';
import type { LayoutState, SortConfig } from './taskStore/types';
import { buildLayout } from './taskStore/layout';
import { applyFilters } from './taskStore/filters';
import { isDescendantTask, tailDisplayOrderForParent, tailDisplayOrderForRoot } from './taskStore/hierarchy';
import { computeCenteredViewport } from './taskStore/viewport';
import { buildMoveTaskResult, saveModifiedTasks } from './taskStore/taskPersistence';
import { runParentMove } from './taskStore/parentMove';
import { buildUniformExpansionMaps, initializeExpansionMaps } from './taskStore/expansion';
import type { SchedulingStateInfo } from '../scheduling/constraintGraph';
import type { CriticalPathTaskMetrics } from '../scheduling/criticalPath';
import { AutoScheduleMoveMode } from '../types/constraints';
import {
    readIssueQueryParamsFromUrl,
    replaceIssueQueryParamsInUrl,
    toBusinessQueryState,
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

const queueRefreshData = (refreshData: () => Promise<void>) => {
    queueMicrotask(() => {
        void refreshData().catch((error) => console.error('Failed to refresh data', error));
    });
};

interface TaskState {
    allTasks: Task[];
    tasks: Task[];
    relations: Relation[];
    schedulingStates: Record<string, SchedulingStateInfo>;
    criticalPathMetrics: Record<string, CriticalPathTaskMetrics>;
    criticalPathProjectFinish?: number;
    versions: Version[];
    taskStatuses: TaskStatus[];
    customFields: CustomFieldMeta[];
    activeQueryId: number | null;
    selectedStatusIds: number[];
    viewport: Viewport;
    viewMode: ViewMode;
    zoomLevel: ZoomLevel;
    layoutRows: LayoutRow[];
    rowCount: number;
    groupByProject: boolean;
    groupByAssignee: boolean;
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
    selectedVersionIds: string[];

    sortConfig: SortConfig;
    customScales: Record<number, number>;

    currentProjectId: string | null;
    showSubprojects: boolean;

    isSortingSuspended: boolean;
    modifiedTaskIds: Set<string>;
    autoSave: boolean;

    // Actions
    setAutoSave: (enabled: boolean) => void;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setTaskStatuses: (statuses: TaskStatus[]) => void;
    setCustomFields: (fields: CustomFieldMeta[]) => void;
    applyResolvedQueryState: (state?: ResolvedQueryState) => void;
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
    removeTask: (id: string) => void;
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
    scrollToTask: (taskId: string) => void;
    focusTask: (taskId: string) => { status: 'ok' | 'filtered_out' | 'missing' };
    setSortConfig: (key: string | null) => void;
    refreshData: () => Promise<void>;
    setSortingSuspended: (suspended: boolean) => void;
    canDropAsChild: (sourceTaskId: string, targetTaskId: string) => boolean;
    canDropToRoot: (sourceTaskId: string) => boolean;
    moveTaskAsChild: (sourceTaskId: string, targetTaskId: string) => Promise<MoveTaskAsChildResult>;
    moveTaskToRoot: (sourceTaskId: string) => Promise<MoveTaskAsChildResult>;
    saveChanges: () => Promise<void>;
    discardChanges: () => Promise<void>;
}

const preferences = loadPreferences();
const initialUrlState = readIssueQueryParamsFromUrl();

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? preferences.customScales?.[preferences.zoomLevel ?? 1] ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: preferences.rowHeight ?? (Number(window.RedmineCanvasGantt?.settings?.row_height) || 36)
};


const resolveLayoutState = (state: LayoutState, overrides: Partial<LayoutState> = {}): LayoutState => ({
    allTasks: overrides.allTasks ?? state.allTasks,
    relations: overrides.relations ?? state.relations,
    versions: overrides.versions ?? state.versions,
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
        layoutState.customFields
    );
};

const buildDerivedSchedulingSummary = (tasks: Task[], relations: Relation[]): DerivedSchedulingSummary => {
    const criticalPath = TaskLogicService.calculateCriticalPath(tasks, relations);

    return {
        schedulingStates: TaskLogicService.deriveSchedulingStates(tasks, relations),
        criticalPathMetrics: criticalPath.metricsByTaskId,
        criticalPathProjectFinish: criticalPath.projectFinish
    };
};

const buildDerivedTaskState = (
    state: TaskState,
    overrides: Partial<LayoutState> & { allTasks?: Task[]; relations?: Relation[] } = {}
): DerivedTaskState => {
    const allTasks = overrides.allTasks ?? state.allTasks;
    const relations = overrides.relations ?? state.relations;
    const layout = buildLayoutFromState(state, { ...overrides, allTasks, relations });
    const schedulingSummary = buildDerivedSchedulingSummary(allTasks, relations);

    return {
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        ...schedulingSummary
    };
};

type QuerySyncState = Pick<TaskState, 'activeQueryId' | 'selectedStatusIds' | 'selectedAssigneeIds' | 'selectedProjectIds' | 'selectedVersionIds' | 'sortConfig' | 'groupByProject' | 'groupByAssignee' | 'showSubprojects'>;

const syncQueryStateUrl = (state: QuerySyncState) => {
    replaceIssueQueryParamsInUrl(toResolvedQueryStateFromStore(state));
};

const buildAllExpandedStates = (state: TaskState, expanded: boolean) => {
    if (expanded) {
        return buildUniformExpansionMaps(state.allTasks, true);
    }

    return buildUniformExpansionMaps(state.allTasks, false);
};

const toDerivedTaskStatePatch = (derived: DerivedTaskState): DerivedTaskStatePatch => ({
    tasks: derived.tasks,
    layoutRows: derived.layoutRows,
    rowCount: derived.rowCount,
    schedulingStates: derived.schedulingStates,
    criticalPathMetrics: derived.criticalPathMetrics,
    criticalPathProjectFinish: derived.criticalPathProjectFinish
});

type ParentMoveStoreState = LayoutState & {
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
    modifiedTaskIds: Set<string>;
    autoSave: boolean;
};

const buildParentMoveOptimisticPatch = (state: ParentMoveStoreState, nextAllTasks: Task[]) => {
    const layout = buildLayoutFromState(state, { allTasks: nextAllTasks });
    return {
        allTasks: nextAllTasks,
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount
    };
};

const buildParentMoveSuccessPatch = (state: ParentMoveStoreState, sourceBefore: Task, result: { lockVersion?: number }) => {
    const sourceTaskId = sourceBefore.id;
    const updatedAllTasks = state.allTasks.map((task) => (
        task.id === sourceTaskId
            ? { ...task, lockVersion: result.lockVersion ?? task.lockVersion }
            : task
    ));
    const layout = buildLayoutFromState(state, { allTasks: updatedAllTasks });
    const nextModified = new Set(state.modifiedTaskIds);
    nextModified.delete(sourceTaskId);

    return {
        allTasks: updatedAllTasks,
        tasks: layout.tasks,
        layoutRows: layout.layoutRows,
        rowCount: layout.rowCount,
        modifiedTaskIds: nextModified
    };
};

const buildParentMoveFailure = (error?: string) => buildMoveTaskResult('error', {
    error: error || (i18n.t('label_parent_drop_failed') || 'Failed to update parent')
});

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
        return task.startDate!;
    }
    if (Number.isFinite(task.dueDate)) {
        return task.dueDate!;
    }
    return Date.now();
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


export const useTaskStore = create<TaskState>((set, get) => ({
    allTasks: [],
    tasks: [],
    relations: [],
    schedulingStates: {},
    criticalPathMetrics: {},
    criticalPathProjectFinish: undefined,
    versions: [],
    taskStatuses: [],
    customFields: [],
    activeQueryId: initialUrlState.queryId ?? null,
    selectedStatusIds: [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: preferences.viewMode ?? 'Week',
    zoomLevel: preferences.zoomLevel ?? 1,
    layoutRows: [],
    rowCount: 0,
    groupByProject: true,
    groupByAssignee: false,
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
    selectedVersionIds: [],
    sortConfig: { key: 'startDate', direction: 'asc' },
    customScales: preferences.customScales ?? {},
    currentProjectId: window.RedmineCanvasGantt?.projectId?.toString() || null,
    showSubprojects: true,
    isSortingSuspended: false,
    modifiedTaskIds: new Set(),
    autoSave: preferences.autoSave ?? false,

    setAutoSave: (enabled) => set({ autoSave: enabled }),

    setTasks: (tasks) => set((state) => {
        const { projectExpansion, taskExpansion, versionExpansion } = initializeExpansionMaps(tasks, {
            projectExpansion: state.projectExpansion,
            versionExpansion: state.versionExpansion,
            taskExpansion: state.taskExpansion
        });

        const derived = buildDerivedTaskState(state, {
            allTasks: tasks,
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
    setTaskStatuses: (statuses) => set(() => ({ taskStatuses: statuses })),
    applyResolvedQueryState: (resolved) => set((state) => {
        const queryState = toBusinessQueryState(resolved);
        const groupByProject = queryState.groupByProject;
        const groupByAssignee = queryState.groupByAssignee;
        const showSubprojects = queryState.showSubprojects;
        const sortConfig = queryState.sortConfig ?? { key: 'startDate', direction: 'asc' };
        const selectedStatusIds = queryState.selectedStatusIds;
        const selectedAssigneeIds = queryState.selectedAssigneeIds;
        const selectedProjectIds = queryState.selectedProjectIds;
        const selectedVersionIds = queryState.selectedVersionIds;
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
            selectedStatusIds,
            selectedAssigneeIds,
            selectedProjectIds,
            selectedVersionIds,
            groupByProject,
            groupByAssignee,
            showSubprojects,
            sortConfig,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl(nextState);
        return nextState;
    }),
    setCustomFields: (customFields) => set((state) => {
        const derived = buildDerivedTaskState(state, { customFields });
        return {
            customFields,
            ...toDerivedTaskStatePatch(derived)
        };
    }),
    setSelectedStatusFromServer: (ids) => {
        set({ selectedStatusIds: ids });
        syncQueryStateUrl(get());
        void get().refreshData().catch((error) => console.error('Failed to refresh data', error));
    },
    setShowVersions: (show) => set((state) => {
        const layout = buildLayoutFromState(state, { showVersions: show });
        savePreferences({ showVersions: show });
        return {
            showVersions: show,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
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

        const { apiClient } = await import('../api/client');
        return runParentMove({
            sourceTaskId,
            expectedParentId: targetTaskId,
            getState: () => get(),
            setState: (patch) => set(patch),
            restoreSnapshot: (snapshot) => set(snapshot),
            buildNextOrder: (allTasks) => tailDisplayOrderForParent(allTasks, targetTaskId, sourceTaskId),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: targetTaskId, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            updateTaskFields: (taskId, payload) => apiClient.updateTaskFields(taskId, {
                parent_issue_id: Number(targetTaskId),
                lock_version: payload.lock_version
            }),
            validatePersistedResult: (result) => result.parentId === targetTaskId,
            missingSourceResult: buildParentMoveFailure(),
            failedResult: buildParentMoveFailure
        });
    },
    moveTaskToRoot: async (sourceTaskId) => {
        if (!get().canDropToRoot(sourceTaskId)) {
            return buildMoveTaskResult('error', { error: i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target' });
        }

        const { apiClient } = await import('../api/client');
        return runParentMove({
            sourceTaskId,
            expectedParentId: undefined,
            getState: () => get(),
            setState: (patch) => set(patch),
            restoreSnapshot: (snapshot) => set(snapshot),
            buildNextOrder: (allTasks, sourceBefore) => tailDisplayOrderForRoot(allTasks, sourceBefore),
            buildNextAllTasks: (allTasks, movingTaskId, nextOrder) => allTasks.map((task) => (
                task.id === movingTaskId
                    ? { ...task, parentId: undefined, displayOrder: nextOrder }
                    : task
            )),
            buildOptimisticPatch: buildParentMoveOptimisticPatch,
            buildSuccessPatch: buildParentMoveSuccessPatch,
            updateTaskFields: (taskId, payload) => apiClient.updateTaskFields(taskId, {
                parent_issue_id: null,
                lock_version: payload.lock_version
            }),
            validatePersistedResult: (result) => result.parentId === undefined,
            missingSourceResult: buildParentMoveFailure(),
            failedResult: buildParentMoveFailure
        });
    },

    updateTask: (id, updates) => set((state) => {
        const task = state.allTasks.find(t => t.id === id);
        if (!task) return state;

        if (!TaskLogicService.canEditTask(task)) {
            console.warn('Task is not editable');
            return state;
        }

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

        const tasksToCheckParents = [id, ...pendingUpdates.keys()];
        const processedParents = new Set<string>();

        tasksToCheckParents.forEach(taskId => {
            const t = currentTasks.find(ct => ct.id === taskId);
            if (t && t.parentId && !processedParents.has(t.parentId)) {
                processedParents.add(t.parentId);
                const parentUpdates = TaskLogicService.recalculateParentDates(currentTasks, t.parentId);
                parentUpdates.forEach((v, k) => pendingUpdates.set(k, v));
            }
        });

        const finalTasks = state.allTasks.map(t => {
            if (t.id === id) return updatedTask;
            if (pendingUpdates.has(t.id)) return { ...t, ...pendingUpdates.get(t.id) };
            return t;
        });



        // Add modified task IDs
        const newModifiedIds = new Set(state.modifiedTaskIds);
        newModifiedIds.add(id);
        pendingUpdates.forEach((_, key) => newModifiedIds.add(key));

        const nextSchedulingSummary = buildDerivedSchedulingSummary(finalTasks, state.relations);

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
                modifiedTaskIds: newModifiedIds // Add here for suspended case
            };
        }

        const derived = buildDerivedTaskState(state, { allTasks: finalTasks });

        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived),
            modifiedTaskIds: newModifiedIds // Add here for normal case
        };
    }),



    removeTask: (id) => set((state) => {
        const finalTasks = state.allTasks.filter(t => t.id !== id);
        const derived = buildDerivedTaskState(state, { allTasks: finalTasks });
        return {
            allTasks: finalTasks,
            ...toDerivedTaskStatePatch(derived)
        };
    }),

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
        const nextShowSubprojects = grouped;
        const nextGroupByAssignee = grouped ? false : state.groupByAssignee;
        const layout = buildLayoutFromState(state, {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee,
            showSubprojects: nextShowSubprojects
        });
        const nextState = {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee,
            showSubprojects: nextShowSubprojects,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl({ ...state, ...nextState });
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
            showSubprojects: nextShowSubprojects,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl({ ...state, ...nextState });
        return nextState;
    }),
    setOrganizeByDependency: (enabled) => set((state) => {
        const layout = buildLayoutFromState(state, { organizeByDependency: enabled });
        return {
            organizeByDependency: enabled,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),


    setCurrentProjectId: (id) => set((state) => {
        if (state.currentProjectId === id) return state;
        const layout = buildLayoutFromState(state, { currentProjectId: id });
        return {
            currentProjectId: id,
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
        const layout = buildLayoutFromState(state, { selectedAssigneeIds: ids });
        const nextState = {
            selectedAssigneeIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),

    setSelectedProjectIds: (ids) => set((state) => {
        const layout = buildLayoutFromState(state, { selectedProjectIds: ids });
        const nextState = {
            selectedProjectIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),
    setSelectedVersionIds: (ids) => set((state) => {
        const layout = buildLayoutFromState(state, { selectedVersionIds: ids });
        const nextState = {
            selectedVersionIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
        syncQueryStateUrl({ ...state, ...nextState });
        queueRefreshData(get().refreshData);
        return nextState;
    }),

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

        if (targetTask.fixedVersionId) {
            nextVersionExpansion[targetTask.fixedVersionId] = true;
        }

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
        syncQueryStateUrl({ ...state, ...nextState });
        return nextState;
    }),
    refreshData: async () => {
        const { apiClient } = await import('../api/client');
        const state = get();
        const data = await apiClient.fetchData({
            query: toResolvedQueryStateFromStore(state)
        });
        if (!data) return;
        const { setTasks, setRelations, setVersions, setTaskStatuses, setCustomFields, applyResolvedQueryState } = state;
        applyResolvedQueryState(data.initialState);
        setTasks(data.tasks);
        setRelations(data.relations);
        setVersions(data.versions);
        setTaskStatuses(data.statuses);
        setCustomFields(data.customFields);
        set({ modifiedTaskIds: new Set() });
        (data.warnings ?? []).forEach((warning) => useUIStore.getState().addNotification(warning, 'warning'));
    },

    saveChanges: async () => {
        const { apiClient } = await import('../api/client');
        const state = get();
        const failures = await saveModifiedTasks(
            state.allTasks,
            state.relations,
            state.modifiedTaskIds,
            state.selectedStatusIds,
            apiClient.updateTask,
            apiClient.fetchData
        );

        await state.refreshData();

        if (failures.size > 0) {
            const [failedTaskId, failedReason] = failures.entries().next().value as [string, string];
            useUIStore.getState().addNotification(
                `${i18n.t('label_failed_to_save') || 'Failed to save'} (#${failedTaskId}: ${failedReason})`,
                'error'
            );
        }
    },

    discardChanges: async () => {
        const state = get();
        await state.refreshData();
    }
}));
