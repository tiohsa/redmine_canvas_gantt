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
    nextIndex: number;
};

type FocusedHistogramBar = {
    assigneeId: number;
    dateStr: string;
} | null;

type CycleInfo = {
    current: number;
    total: number;
} | null;

const getHistogramCycleInfo = (
    workloadData: WorkloadData | null,
    cycle: HistogramSelectionCycle,
    assigneeId: number,
    dateStr: string,
    includeInactiveCycle: boolean
): CycleInfo => {
    if (!workloadData) return null;

    const total = workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr)?.contributingTasks.length ?? 0;
    if (total <= 1) return null;

    const isActiveCycle = cycle.activeKey === `${assigneeId}:${dateStr}`;
    if (!isActiveCycle) {
        return includeInactiveCycle ? { current: 1, total } : null;
    }

    return {
        current: cycle.nextIndex === 0 ? total : cycle.nextIndex,
        total
    };
};

const getOverloadWorkloads = (workloadData: WorkloadData, assigneeId: number): DailyWorkload[] => {
    const assignee = workloadData.assignees.get(assigneeId);
    if (!assignee) return [];

    return Array.from(assignee.dailyWorkloads.values())
        .filter((daily) => daily.isOverload)
        .sort((a, b) => a.timestamp - b.timestamp);
};

const barContainsTask = (workloadData: WorkloadData, bar: FocusedHistogramBar, taskId: string): boolean => {
    if (!bar) return false;

    const daily = workloadData.assignees.get(bar.assigneeId)?.dailyWorkloads.get(bar.dateStr);
    if (!daily) return false;

    return daily.contributingTasks.some(({ task }) => task.id === taskId);
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
            daily.contributingTasks.some(({ task }) => task.id === taskId)
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
    resolveNextHistogramTask: (assigneeId: number, dateStr: string) => { taskId: string | null };
    getHistogramTaskCycleInfo: (assigneeId: number, dateStr: string) => CycleInfo;
    getHistogramBarLabelInfo: (assigneeId: number, dateStr: string) => CycleInfo;
    setFocusedHistogramBar: (bar: FocusedHistogramBar) => void;
    suppressNextFocusedHistogramBarVerticalScroll: (bar: FocusedHistogramBar) => void;
    consumeFocusedHistogramBarVerticalScrollSuppression: (bar: FocusedHistogramBar) => boolean;
    resetOverloadFocus: () => void;
    resolveNextOverloadBar: (assigneeId: number) => FocusedHistogramBar;
    getOverloadCycleInfo: (assigneeId: number) => CycleInfo;
    calculateWorkloadData: () => void;
}

const prefs = loadPreferences();

export const useWorkloadStore = create<WorkloadState>((set, get) => ({
    // Initialize from preferences or defaults
    workloadPaneVisible: false,
    capacityThreshold: prefs.capacityThreshold ?? 8.0,
    leafIssuesOnly: prefs.leafIssuesOnly ?? true,
    includeClosedIssues: prefs.includeClosedIssues ?? false,
    todayOnwardOnly: prefs.todayOnwardOnly ?? false,
    
    workloadData: null,
    histogramSelectionCycle: HISTOGRAM_SELECTION_RESET,
    overloadFocusCycle: OVERLOAD_FOCUS_RESET,
    focusedHistogramBar: null,
    suppressFocusedHistogramBarVerticalScrollKey: null,

    setWorkloadPaneVisible: (visible) => {
        set({ workloadPaneVisible: visible });
        if (visible) {
            get().calculateWorkloadData();
        }
    },

    toggleWorkloadPaneVisible: () => {
        const nextVisible = !get().workloadPaneVisible;
        set({ workloadPaneVisible: nextVisible });
        if (nextVisible) {
            get().calculateWorkloadData();
        }
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
        savePreferences({ leafIssuesOnly: leafOnly });
        if (get().workloadPaneVisible) {
            get().calculateWorkloadData();
        }
    },

    setIncludeClosedIssues: (include) => {
        set({ includeClosedIssues: include });
        savePreferences({ includeClosedIssues: include });
        if (get().workloadPaneVisible) {
            get().calculateWorkloadData();
        }
    },

    setTodayOnwardOnly: (todayOnward) => {
        set({ todayOnwardOnly: todayOnward });
        savePreferences({ todayOnwardOnly: todayOnward });
        if (get().workloadPaneVisible) {
            get().calculateWorkloadData();
        }
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

    resolveNextHistogramTask: (assigneeId, dateStr) => {
        const { workloadData, histogramSelectionCycle } = get();
        if (!workloadData) return { taskId: null };

        const daily = workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr);
        if (!daily || daily.contributingTasks.length === 0) return { taskId: null };

        const sortedTasks = sortHistogramTasks(daily.contributingTasks);
        const currentKey = `${assigneeId}:${dateStr}`;
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

    getHistogramTaskCycleInfo: (assigneeId, dateStr) => {
        const { workloadData, histogramSelectionCycle } = get();
        return getHistogramCycleInfo(workloadData, histogramSelectionCycle, assigneeId, dateStr, false);
    },

    getHistogramBarLabelInfo: (assigneeId, dateStr) => {
        const { workloadData, histogramSelectionCycle } = get();
        return getHistogramCycleInfo(workloadData, histogramSelectionCycle, assigneeId, dateStr, true);
    },

    resetOverloadFocus: () => {
        set({
            overloadFocusCycle: OVERLOAD_FOCUS_RESET,
            focusedHistogramBar: null,
            suppressFocusedHistogramBarVerticalScrollKey: null
        });
    },

    resolveNextOverloadBar: (assigneeId) => {
        const { workloadData, overloadFocusCycle } = get();
        if (!workloadData) return null;

        const overloads = getOverloadWorkloads(workloadData, assigneeId);
        if (overloads.length === 0) return null;

        const isSameAssignee = overloadFocusCycle.activeAssigneeId === assigneeId;
        const nextIndex = isSameAssignee
            ? overloadFocusCycle.nextIndex % overloads.length
            : 0;
        const nextDaily = overloads[nextIndex];
        const focusedHistogramBar = {
            assigneeId,
            dateStr: nextDaily.dateStr
        };

        set({
            overloadFocusCycle: {
                activeAssigneeId: assigneeId,
                nextIndex: overloads.length > 1
                    ? (nextIndex + 1) % overloads.length
                    : 0
            },
            focusedHistogramBar
        });

        return focusedHistogramBar;
    },

    getOverloadCycleInfo: (assigneeId) => {
        const { workloadData, overloadFocusCycle } = get();
        if (!workloadData) return null;

        const total = getOverloadWorkloads(workloadData, assigneeId).length;
        if (total <= 1) return null;
        if (overloadFocusCycle.activeAssigneeId !== assigneeId) {
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

        const data = WorkloadLogicService.calculateWorkload(allTasks, closedStatusIds, options);
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
