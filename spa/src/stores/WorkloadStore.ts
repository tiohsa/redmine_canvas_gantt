import { create } from 'zustand';
import { useTaskStore } from './TaskStore';
import { WorkloadLogicService, type WorkloadData, type WorkloadOptions } from '../services/WorkloadLogicService';
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
        if (!workloadData) return null;

        const total = workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr)?.contributingTasks.length ?? 0;
        if (total <= 1) return null;

        const currentKey = `${assigneeId}:${dateStr}`;
        if (histogramSelectionCycle.activeKey !== currentKey) return null;

        return {
            current: histogramSelectionCycle.nextIndex === 0 ? total : histogramSelectionCycle.nextIndex,
            total
        };
    },

    getHistogramBarLabelInfo: (assigneeId, dateStr) => {
        const { workloadData, histogramSelectionCycle } = get();
        if (!workloadData) return null;

        const total = workloadData.assignees.get(assigneeId)?.dailyWorkloads.get(dateStr)?.contributingTasks.length ?? 0;
        if (total <= 1) return null;

        const currentKey = `${assigneeId}:${dateStr}`;
        if (histogramSelectionCycle.activeKey !== currentKey) {
            return {
                current: 1,
                total
            };
        }

        return {
            current: histogramSelectionCycle.nextIndex === 0 ? total : histogramSelectionCycle.nextIndex,
            total
        };
    },

    resetOverloadFocus: () => {
        set({
            overloadFocusCycle: OVERLOAD_FOCUS_RESET,
            focusedHistogramBar: null
        });
    },

    resolveNextOverloadBar: (assigneeId) => {
        const { workloadData, overloadFocusCycle } = get();
        if (!workloadData) return null;

        const assignee = workloadData.assignees.get(assigneeId);
        if (!assignee) return null;

        const overloads = Array.from(assignee.dailyWorkloads.values())
            .filter((daily) => daily.isOverload)
            .sort((a, b) => a.timestamp - b.timestamp);
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

        const assignee = workloadData.assignees.get(assigneeId);
        if (!assignee) return null;

        const total = Array.from(assignee.dailyWorkloads.values()).filter((daily) => daily.isOverload).length;
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
        const { allTasks, taskStatuses } = taskStore;

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
        set({
            workloadData: data,
            histogramSelectionCycle: HISTOGRAM_SELECTION_RESET,
            overloadFocusCycle: OVERLOAD_FOCUS_RESET,
            focusedHistogramBar: null
        });
    }
}));

// Subscribe to task store changes so workload updates automatically
useTaskStore.subscribe((state, prevState) => {
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
