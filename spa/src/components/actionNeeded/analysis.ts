import type { Task, TaskStatus } from '../../types';
import type { SchedulingStateInfo } from '../../scheduling/constraintGraph';
import { applyFilters } from '../../stores/taskStore/filters';

export type ActionReason = 'constraint' | 'overdue' | 'missingDates' | 'unassigned' | 'missingEstimate';
export const ACTION_REASON_ORDER: ActionReason[] = ['constraint', 'overdue', 'missingDates', 'unassigned', 'missingEstimate'];

export type ActionItem = { task: Task; reasons: ActionReason[]; schedulingMessage?: string };
export type ActionSummary = {
    items: ActionItem[];
    counts: Record<ActionReason, number>;
    unplannedEstimatedHours: number;
    missingEstimateCount: number;
};

export type ActionFilter = {
    filterText: string;
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    selectedVersionIds: string[];
    selectedTrackerIds: number[];
    showSubprojects: boolean;
    currentProjectId: string | null;
};

export const summarizeActionNeeded = (
    allTasks: Task[], statuses: TaskStatus[], schedulingStates: Record<string, SchedulingStateInfo>,
    filters: ActionFilter, today: number
): ActionSummary => {
    const filtered = applyFilters(allTasks, filters.filterText, filters.selectedAssigneeIds,
        filters.selectedProjectIds, filters.selectedVersionIds, filters.selectedTrackerIds,
        filters.showSubprojects, filters.currentProjectId);
    const closed = new Set(statuses.filter(status => status.isClosed).map(status => status.id));
    const sourceContextOnlyIds = new Set(allTasks.filter(task => task.isContextOnly).map(task => task.id));
    const seen = new Set<string>();
    const items: ActionItem[] = [];
    const counts: Record<ActionReason, number> = { constraint: 0, overdue: 0, missingDates: 0, unassigned: 0, missingEstimate: 0 };
    let unplannedEstimatedHours = 0;
    let missingEstimateCount = 0;
    for (const task of filtered) {
        if (task.isContextOnly || sourceContextOnlyIds.has(task.id) || closed.has(task.statusId) || seen.has(task.id)) continue;
        seen.add(task.id);
        const missingDates = task.startDate == null || task.dueDate == null;
        const unassigned = task.assignedToId == null;
        const missingEstimate = task.estimatedHours == null;
        const scheduling = schedulingStates[task.id];
        const reasons: ActionReason[] = [];
        if (scheduling && ['cyclic', 'conflicted', 'invalid'].includes(scheduling.state)) reasons.push('constraint');
        if (task.dueDate != null && Number.isFinite(task.dueDate) && task.dueDate < today) reasons.push('overdue');
        if (missingDates) reasons.push('missingDates');
        if (unassigned) reasons.push('unassigned');
        if (missingEstimate) reasons.push('missingEstimate');
        if (missingEstimate) missingEstimateCount += 1;
        if (!task.hasPhysicalChildren && Number.isFinite(task.estimatedHours) && task.estimatedHours! > 0 && (missingDates || unassigned)) {
            unplannedEstimatedHours += task.estimatedHours!;
        }
        if (reasons.length === 0) continue;
        reasons.forEach(reason => { counts[reason] += 1; });
        items.push({ task, reasons, schedulingMessage: scheduling?.message });
    }
    items.sort((a, b) => {
        const priority = ACTION_REASON_ORDER.findIndex(reason => a.reasons.includes(reason)) -
            ACTION_REASON_ORDER.findIndex(reason => b.reasons.includes(reason));
        return priority || Number(a.task.id) - Number(b.task.id) || a.task.id.localeCompare(b.task.id);
    });
    return { items, counts, unplannedEstimatedHours, missingEstimateCount };
};
