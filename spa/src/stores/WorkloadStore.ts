import { apiClient } from '../api/client';
import { buildIssueQueryParams, toResolvedQueryStateFromStore } from '../utils/queryParams';
import { calendarDateKey, todayCalendarDate } from '../utils/dateOnly';
import type { ActualWorkloadEntry, ActualWorkloadStatus, WorkloadRange, WorkloadSeries } from '../services/WorkloadLogicService';
import { applyFilters } from './taskStore/filters';
import { create } from 'zustand';
import { useTaskStore } from './TaskStore';
import {
    WorkloadLogicService,
    type DailyWorkload,
    type WorkloadData,
    type WorkloadOptions
} from '../services/WorkloadLogicService';
import { loadPreferences, savePreferences } from '../utils/preferences';
import type { Task } from '../types';

type HistogramSelectionCycle = {
    activeKey: string | null;
    nextIndex: number;
};

type OverloadFocusCycle = {
    activeAssigneeId: number | null;
    series?: WorkloadSeries;
    nextIndex: number;
};

type FocusedHistogramBar = {
    assigneeId: number;
    dateStr: string;
    series?: WorkloadSeries;
} | null;

type CycleInfo = {
    current: number;
    total: number;
} | null;

const histogramKey = (assigneeId: number, dateStr: string, series: WorkloadSeries = 'planned') =>
    `${assigneeId}:${dateStr}${series === 'actual' ? ':actual' : ''}`;

const contributionsFor = (daily: DailyWorkload | undefined, series: WorkloadSeries = 'planned') => {
    if (!daily) return [];
    if (series === 'planned') return daily.plannedContributions;
    const issues = new Map<string, { task: Task; dailyLoad: number }>();
    for (const entry of daily.actualContributions) {
        const contribution = issues.get(entry.issueId);
        if (contribution) contribution.dailyLoad += entry.hours;
        else issues.set(entry.issueId, { task: entry.issue, dailyLoad: entry.hours });
    }
    return [...issues.values()];
};

const getHistogramCycleInfo = (
    workloadData: WorkloadData | null,
    cycle: HistogramSelectionCycle,
    assigneeId: number,
    dateStr: string,
    includeInactiveCycle: boolean,
    series: WorkloadSeries = 'planned'
): CycleInfo => {
    if (!workloadData) return null;

    const total = contributionsFor(workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr), series).length;
    if (total <= 1) return null;

    const isActiveCycle = cycle.activeKey === histogramKey(assigneeId, dateStr, series);
    if (!isActiveCycle) {
        return includeInactiveCycle ? { current: 1, total } : null;
    }

    return {
        current: cycle.nextIndex === 0 ? total : cycle.nextIndex,
        total
    };
};

const getOverloadWorkloads = (workloadData: WorkloadData, assigneeId: number, series: WorkloadSeries = 'planned'): DailyWorkload[] => {
    const assignee = workloadData.assignees.get(assigneeId);
    if (!assignee) return [];

    return Array.from(assignee.dailyWorkloads.values())
        .filter((daily) => series === 'planned' ? daily.isPlannedOverload : daily.isActualOverload)
        .sort((a, b) => a.timestamp - b.timestamp);
};

const barContainsTask = (workloadData: WorkloadData, bar: FocusedHistogramBar, taskId: string): boolean => {
    if (!bar) return false;

    const daily = workloadData.assignees.get(bar.assigneeId)?.dailyWorkloads.get(bar.dateStr);
    if (!daily) return false;

    return contributionsFor(daily, bar.series).some(({ task }) => task.id === taskId);
};

const findFocusedHistogramBarForTask = (
    workloadData: WorkloadData | null,
    taskId: string | null,
    currentFocusedHistogramBar: FocusedHistogramBar
): FocusedHistogramBar => {
    if (!workloadData || !taskId) return null;

    if (barContainsTask(workloadData, currentFocusedHistogramBar, taskId)) {
        return currentFocusedHistogramBar;
    }

    for (const assignee of workloadData.assignees.values()) {
        const sortedDailyWorkloads = Array.from(assignee.dailyWorkloads.values())
            .sort((a, b) => a.timestamp - b.timestamp);

        const match = sortedDailyWorkloads.find((daily) => (
            daily.plannedContributions.some(({ task }) => task.id === taskId)
        ));

        if (match) {
            return {
                assigneeId: assignee.assigneeId,
                dateStr: match.dateStr
            };
        }
    }

    return null;
};

const HISTOGRAM_SELECTION_RESET: HistogramSelectionCycle = {
    activeKey: null,
    nextIndex: 0
};

const OVERLOAD_FOCUS_RESET: OverloadFocusCycle = {
    activeAssigneeId: null,
    nextIndex: 0
};

const getTaskIdSortValue = (taskId: string): { isNumeric: boolean; numeric: number; text: string } => {
    const numeric = Number(taskId);
    return {
        isNumeric: Number.isFinite(numeric),
        numeric,
        text: taskId
    };
};

const compareTaskIds = (a: string, b: string): number => {
    const aValue = getTaskIdSortValue(a);
    const bValue = getTaskIdSortValue(b);

    if (aValue.isNumeric && bValue.isNumeric) {
        return aValue.numeric - bValue.numeric;
    }

    return aValue.text.localeCompare(bValue.text);
};

const sortHistogramTasks = (tasks: Array<{ task: Task; dailyLoad: number }>): Array<{ task: Task; dailyLoad: number }> => (
    [...tasks].sort((a, b) => {
        const estimatedHoursA = a.task.estimatedHours ?? 0;
        const estimatedHoursB = b.task.estimatedHours ?? 0;

        if (estimatedHoursA !== estimatedHoursB) {
            return estimatedHoursB - estimatedHoursA;
        }

        return compareTaskIds(a.task.id, b.task.id);
    })
);

interface WorkloadState {
    // Settings
    workloadPaneVisible: boolean;
    capacityThreshold: number;
    leafIssuesOnly: boolean;
    includeClosedIssues: boolean;
    todayOnwardOnly: boolean;

    actualStatus: ActualWorkloadStatus;
    actualEntries: ActualWorkloadEntry[];
    actualScopeKey: string | null;
    range: WorkloadRange | null;
    setRange: (range: WorkloadRange) => void;
    refreshActual: () => void;
    loadActual: () => Promise<void>;
    // Derived Data
    workloadData: WorkloadData | null;
    histogramSelectionCycle: HistogramSelectionCycle;
    overloadFocusCycle: OverloadFocusCycle;
    focusedHistogramBar: FocusedHistogramBar;
    suppressFocusedHistogramBarVerticalScrollKey: string | null;

    // Actions
    setWorkloadPaneVisible: (visible: boolean) => void;
    toggleWorkloadPaneVisible: () => void;
    setCapacityThreshold: (threshold: number) => void;
    setLeafIssuesOnly: (leafOnly: boolean) => void;
    setIncludeClosedIssues: (include: boolean) => void;
    setTodayOnwardOnly: (todayOnward: boolean) => void;
    resetHistogramSelectionCycle: () => void;
    resolveNextHistogramTask: (assigneeId: number, dateStr: string, series?: WorkloadSeries) => { taskId: string | null };
    getHistogramTaskCycleInfo: (assigneeId: number, dateStr: string, series?: WorkloadSeries) => CycleInfo;
    getHistogramBarLabelInfo: (assigneeId: number, dateStr: string, series?: WorkloadSeries) => CycleInfo;
    setFocusedHistogramBar: (bar: FocusedHistogramBar) => void;
    suppressNextFocusedHistogramBarVerticalScroll: (bar: FocusedHistogramBar) => void;
    consumeFocusedHistogramBarVerticalScrollSuppression: (bar: FocusedHistogramBar) => boolean;
    resetOverloadFocus: () => void;
    resolveNextOverloadBar: (assigneeId: number, series?: WorkloadSeries) => FocusedHistogramBar;
    getOverloadCycleInfo: (assigneeId: number, series?: WorkloadSeries) => CycleInfo;
    calculateWorkloadData: () => void;
}

let actualGeneration = 0;
let actualReloadTimer: ReturnType<typeof setTimeout> | undefined;
const cancelActual = () => { actualGeneration++; clearTimeout(actualReloadTimer); };

const actualRequest = () => {
    const state = useWorkloadStore.getState();
    const taskState = useTaskStore.getState();
    if (!state.range) return null;
    const from = state.todayOnwardOnly ? Math.max(state.range.from, todayCalendarDate()) : state.range.from;
    const query = toResolvedQueryStateFromStore(taskState);
    const params = { query, queryContext: taskState.queryContext,
        from: calendarDateKey(from), to: calendarDateKey(state.range.to),
        leafOnly: state.leafIssuesOnly, includeClosed: state.includeClosedIssues };
    const key = JSON.stringify([taskState.currentProjectId,
        buildIssueQueryParams(query, { queryContext: taskState.queryContext }).toString(),
        params.from, params.to, params.leafOnly, params.includeClosed]);
    return { params, key, empty: from > state.range.to };
};

const prefs = loadPreferences();

export const useWorkloadStore = create<WorkloadState>((set, get) => ({
    // Initialize from preferences or defaults
    workloadPaneVisible: false,
    capacityThreshold: prefs.capacityThreshold ?? 8.0,
    leafIssuesOnly: prefs.leafIssuesOnly ?? true,
    includeClosedIssues: prefs.includeClosedIssues ?? false,
    todayOnwardOnly: prefs.todayOnwardOnly ?? false,
    
    actualStatus: 'idle',
    actualEntries: [],
    actualScopeKey: null,
    range: null,
    setRange: (range) => {
        if (range.from === get().range?.from && range.to === get().range?.to) return;
        set({ range });
        if (!get().workloadPaneVisible) return;
        get().refreshActual();
    },
    refreshActual: () => {
        cancelActual();
        if (!get().workloadPaneVisible) return;
        if (!get().range) {
            get().calculateWorkloadData();
            return;
        }
        const request = actualRequest();
        set({ actualStatus: 'loading',
            ...(request?.key !== get().actualScopeKey ? { actualEntries: [] } : {}) });
        get().calculateWorkloadData();
        actualReloadTimer = setTimeout(() => { void get().loadActual(); }, 150);
    },
    loadActual: async () => {
        clearTimeout(actualReloadTimer);
        if (!get().workloadPaneVisible) return;
        const request = actualRequest();
        if (!request) return;
        const generation = ++actualGeneration;
        set({ actualStatus: 'loading' });
        try {
            const entries = request.empty ? [] : await apiClient.fetchActualWorkload(request.params);
            if (generation !== actualGeneration || !get().workloadPaneVisible || actualRequest()?.key !== request.key) return;
            set({ actualEntries: entries, actualStatus: 'ready', actualScopeKey: request.key });
        } catch {
            if (generation !== actualGeneration || !get().workloadPaneVisible || actualRequest()?.key !== request.key) return;
            set({ actualStatus: 'error' });
        }
        get().calculateWorkloadData();
    },
    workloadData: null,
    histogramSelectionCycle: HISTOGRAM_SELECTION_RESET,
    overloadFocusCycle: OVERLOAD_FOCUS_RESET,
    focusedHistogramBar: null,
    suppressFocusedHistogramBarVerticalScrollKey: null,

    setWorkloadPaneVisible: (visible) => {
        cancelActual();
        set({ workloadPaneVisible: visible });
        if (visible) get().refreshActual();
    },

    toggleWorkloadPaneVisible: () => {
        get().setWorkloadPaneVisible(!get().workloadPaneVisible);
    },

    setCapacityThreshold: (threshold) => {
        set({ capacityThreshold: threshold });
        savePreferences({ capacityThreshold: threshold });
        if (get().workloadPaneVisible) {
            get().calculateWorkloadData();
        }
    },

    setLeafIssuesOnly: (leafOnly) => {
        set({ leafIssuesOnly: leafOnly });
        get().refreshActual();
        savePreferences({ leafIssuesOnly: leafOnly });
    },

    setIncludeClosedIssues: (include) => {
        set({ includeClosedIssues: include });
        get().refreshActual();
        savePreferences({ includeClosedIssues: include });
    },

    setTodayOnwardOnly: (todayOnward) => {
        set({ todayOnwardOnly: todayOnward });
        get().refreshActual();
        savePreferences({ todayOnwardOnly: todayOnward });
    },

    resetHistogramSelectionCycle: () => {
        set({ histogramSelectionCycle: HISTOGRAM_SELECTION_RESET });
    },

    setFocusedHistogramBar: (bar) => {
        set({ focusedHistogramBar: bar });
    },

    suppressNextFocusedHistogramBarVerticalScroll: (bar) => {
        const key = bar ? `${bar.assigneeId}:${bar.dateStr}` : null;
        set({ suppressFocusedHistogramBarVerticalScrollKey: key });
    },

    consumeFocusedHistogramBarVerticalScrollSuppression: (bar) => {
        const currentKey = get().suppressFocusedHistogramBarVerticalScrollKey;
        const barKey = bar ? `${bar.assigneeId}:${bar.dateStr}` : null;
        if (!currentKey || !barKey || currentKey !== barKey) {
            return false;
        }

        set({ suppressFocusedHistogramBarVerticalScrollKey: null });
        return true;
    },

    resolveNextHistogramTask: (assigneeId, dateStr, series = 'planned') => {
        const { workloadData, histogramSelectionCycle } = get();
        if (!workloadData) return { taskId: null };

        const daily = workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr);
        const contributions = contributionsFor(daily, series);
        if (!daily || contributions.length === 0) return { taskId: null };

        const sortedTasks = sortHistogramTasks(contributions);
        const currentKey = histogramKey(assigneeId, dateStr, series);
        const isSameBar = histogramSelectionCycle.activeKey === currentKey;
        const nextIndex = isSameBar
            ? histogramSelectionCycle.nextIndex % sortedTasks.length
            : 0;
        const nextTask = sortedTasks[nextIndex]?.task;
        if (!nextTask) return { taskId: null };

        set({
            histogramSelectionCycle: {
                activeKey: currentKey,
                nextIndex: sortedTasks.length > 1
                    ? (nextIndex + 1) % sortedTasks.length
                    : 0
            }
        });

        return { taskId: nextTask.id };
    },

    getHistogramTaskCycleInfo: (assigneeId, dateStr, series = 'planned') => {
        const { workloadData, histogramSelectionCycle } = get();
        return getHistogramCycleInfo(workloadData, histogramSelectionCycle, assigneeId, dateStr, false, series);
    },

    getHistogramBarLabelInfo: (assigneeId, dateStr, series = 'planned') => {
        const { workloadData, histogramSelectionCycle } = get();
        return getHistogramCycleInfo(workloadData, histogramSelectionCycle, assigneeId, dateStr, true, series);
    },

    resetOverloadFocus: () => {
        set({
            overloadFocusCycle: OVERLOAD_FOCUS_RESET,
            focusedHistogramBar: null,
            suppressFocusedHistogramBarVerticalScrollKey: null
        });
    },

    resolveNextOverloadBar: (assigneeId, series = 'planned') => {
        const { workloadData, overloadFocusCycle } = get();
        if (!workloadData) return null;

        const overloads = getOverloadWorkloads(workloadData, assigneeId, series);
        if (overloads.length === 0) return null;

        const isSameAssignee = overloadFocusCycle.activeAssigneeId === assigneeId && (overloadFocusCycle.series ?? 'planned') === series;
        const nextIndex = isSameAssignee
            ? overloadFocusCycle.nextIndex % overloads.length
            : 0;
        const nextDaily = overloads[nextIndex];
        const focusedHistogramBar = {
            assigneeId,
            dateStr: nextDaily.dateStr,
            ...(series === 'actual' ? { series } : {})
        };

        set({
            overloadFocusCycle: {
                activeAssigneeId: assigneeId,
                series,
                nextIndex: overloads.length > 1
                    ? (nextIndex + 1) % overloads.length
                    : 0
            },
            focusedHistogramBar
        });

        return focusedHistogramBar;
    },

    getOverloadCycleInfo: (assigneeId, series = 'planned') => {
        const { workloadData, overloadFocusCycle } = get();
        if (!workloadData) return null;

        const total = getOverloadWorkloads(workloadData, assigneeId, series).length;
        if (total <= 1) return null;
        if (overloadFocusCycle.activeAssigneeId !== assigneeId || (overloadFocusCycle.series ?? 'planned') !== series) {
            return {
                current: 1,
                total
            };
        }

        return {
            current: overloadFocusCycle.nextIndex === 0 ? total : overloadFocusCycle.nextIndex,
            total
        };
    },

    calculateWorkloadData: () => {
        const { capacityThreshold, leafIssuesOnly, includeClosedIssues, todayOnwardOnly } = get();
        
        const taskStore = useTaskStore.getState();
        const { allTasks, taskStatuses, selectedTaskId } = taskStore;

        const closedStatusIds = new Set(
            taskStatuses.filter(s => s.isClosed).map(s => s.id)
        );

        const options: WorkloadOptions = {
            capacityThreshold,
            leafIssuesOnly,
            includeClosedIssues,
            todayOnwardOnly
        };

        const scopedTasks = applyFilters(allTasks, '', taskStore.selectedAssigneeIds,
            taskStore.selectedProjectIds, taskStore.selectedVersionIds, taskStore.selectedTrackerIds,
            taskStore.showSubprojects, taskStore.currentProjectId)
            .filter(task => !task.isContextOnly && (taskStore.selectedStatusIds.length === 0 || taskStore.selectedStatusIds.includes(task.statusId)));
        const data = WorkloadLogicService.calculateWorkload(scopedTasks, closedStatusIds, options,
            get().actualEntries, get().range ?? undefined);
        const focusedHistogramBar = findFocusedHistogramBarForTask(
            data,
            selectedTaskId,
            get().focusedHistogramBar
        );
        set({
            workloadData: data,
            histogramSelectionCycle: HISTOGRAM_SELECTION_RESET,
            overloadFocusCycle: OVERLOAD_FOCUS_RESET,
            focusedHistogramBar,
            suppressFocusedHistogramBarVerticalScrollKey: null
        });
    }
}));

// Subscribe to task store changes so workload updates automatically
useTaskStore.subscribe((state, prevState) => {
    if (state.selectedTaskId !== prevState.selectedTaskId) {
        const workloadState = useWorkloadStore.getState();
        const nextFocusedHistogramBar = findFocusedHistogramBarForTask(
            workloadState.workloadData,
            state.selectedTaskId,
            workloadState.focusedHistogramBar
        );

        if (
            workloadState.focusedHistogramBar?.assigneeId !== nextFocusedHistogramBar?.assigneeId ||
            workloadState.focusedHistogramBar?.dateStr !== nextFocusedHistogramBar?.dateStr
        ) {
            useWorkloadStore.setState({
                focusedHistogramBar: nextFocusedHistogramBar,
                suppressFocusedHistogramBarVerticalScrollKey: null
            });
        }
    }

    if (useWorkloadStore.getState().workloadPaneVisible && (
        state.queryContext !== prevState.queryContext || state.currentProjectId !== prevState.currentProjectId ||
        state.serverTaskSnapshot !== prevState.serverTaskSnapshot || state.showSubprojects !== prevState.showSubprojects ||
        state.memberProjectsOnly !== prevState.memberProjectsOnly ||
        state.selectedProjectIds !== prevState.selectedProjectIds || state.selectedStatusIds !== prevState.selectedStatusIds ||
        state.selectedAssigneeIds !== prevState.selectedAssigneeIds || state.selectedVersionIds !== prevState.selectedVersionIds ||
        state.selectedTrackerIds !== prevState.selectedTrackerIds
    )) {
        useWorkloadStore.getState().refreshActual();
        return;
    }

    // Basic optimization: Only recalculate if task list or statuses change,
    // and only if workload pane is visible
    if (!useWorkloadStore.getState().workloadPaneVisible) return;

    if (
        state.allTasks !== prevState.allTasks ||
        state.taskStatuses !== prevState.taskStatuses
    ) {
        useWorkloadStore.getState().calculateWorkloadData();
    }
});
