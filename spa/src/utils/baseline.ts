import type { Task } from '../types';
import type { BaselineSaveScope, BaselineSnapshot, BaselineTaskState } from '../types/baseline';
import { LayoutEngine } from '../engines/LayoutEngine';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type BaselineDiff = {
    hasDifference: boolean;
    currentStartDate: number | null;
    currentDueDate: number | null;
    baselineStartDate: number | null;
    baselineDueDate: number | null;
    startDeltaDays: number | null;
    dueDeltaDays: number | null;
    currentDurationDays: number | null;
    baselineDurationDays: number | null;
    durationDeltaDays: number | null;
};

const parseDateString = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};

export const parseBaselineDateValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        return parseDateString(value);
    }
    return null;
};

export const formatBaselineDate = (value: number | null | undefined): string => {
    if (value === undefined || value === null || !Number.isFinite(value)) {
        return '-';
    }

    return new Date(value).toISOString().slice(0, 10);
};

export const formatBaselineCapturedAt = (value: string | null | undefined): string => {
    if (!value) return '-';

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        return value;
    }

    return parsed.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

export const normalizeBaselineSaveScope = (value: unknown): BaselineSaveScope => {
    return value === 'project' ? 'project' : 'filtered';
};

export const buildBaselineTaskDurationDays = (start: number | null, due: number | null): number | null => {
    if (!Number.isFinite(start ?? NaN) && !Number.isFinite(due ?? NaN)) {
        return null;
    }

    if (Number.isFinite(start ?? NaN) && Number.isFinite(due ?? NaN)) {
        const normalizedStart = LayoutEngine.snapDate(start ?? NaN);
        const normalizedDue = Math.max(normalizedStart, LayoutEngine.snapDate(due ?? NaN));
        return Math.max(1, Math.round((normalizedDue - normalizedStart) / ONE_DAY_MS) + 1);
    }

    return 1;
};

export const calculateBaselineDiff = (
    task: Task,
    baselineTask: BaselineTaskState | null | undefined
): BaselineDiff | null => {
    if (!baselineTask) return null;

    const currentStartDate = Number.isFinite(task.startDate) ? (task.startDate as number) : null;
    const currentDueDate = Number.isFinite(task.dueDate) ? (task.dueDate as number) : null;
    const baselineStartDate = baselineTask.baselineStartDate;
    const baselineDueDate = baselineTask.baselineDueDate;

    const currentDurationDays = buildBaselineTaskDurationDays(currentStartDate, currentDueDate);
    const baselineDurationDays = buildBaselineTaskDurationDays(baselineStartDate, baselineDueDate);

    const startDeltaDays =
        currentStartDate !== null && baselineStartDate !== null
            ? Math.round((currentStartDate - baselineStartDate) / ONE_DAY_MS)
            : null;
    const dueDeltaDays =
        currentDueDate !== null && baselineDueDate !== null
            ? Math.round((currentDueDate - baselineDueDate) / ONE_DAY_MS)
            : null;
    const durationDeltaDays =
        currentDurationDays !== null && baselineDurationDays !== null
            ? currentDurationDays - baselineDurationDays
            : null;

    const hasDifference =
        startDeltaDays !== 0 ||
        dueDeltaDays !== 0 ||
        durationDeltaDays !== 0 ||
        currentStartDate !== baselineStartDate ||
        currentDueDate !== baselineDueDate;

    return {
        hasDifference,
        currentStartDate,
        currentDueDate,
        baselineStartDate,
        baselineDueDate,
        startDeltaDays,
        dueDeltaDays,
        currentDurationDays,
        baselineDurationDays,
        durationDeltaDays
    };
};

export const getBaselineTaskState = (
    snapshot: BaselineSnapshot | null | undefined,
    taskId: string
): BaselineTaskState | null => snapshot?.tasksByIssueId[taskId] ?? null;

export const buildBaselineLookup = (snapshot: BaselineSnapshot | null | undefined) => snapshot?.tasksByIssueId ?? {};
