import type { Task } from '../types';
import type { BaselineSaveScope, BaselineSnapshot, BaselineTaskState } from '../types/baseline';
import { diffCalendarDays, formatDateOnly, parseDateOnly } from './dateOnly';

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
    return parseDateOnly(value);
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

    return formatDateOnly(value) ?? '-';
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
        return Math.max(1, diffCalendarDays(start ?? NaN, due ?? NaN) + 1);
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
            ? diffCalendarDays(baselineStartDate, currentStartDate)
            : null;
    const dueDeltaDays =
        currentDueDate !== null && baselineDueDate !== null
            ? diffCalendarDays(baselineDueDate, currentDueDate)
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
