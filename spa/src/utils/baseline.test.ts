import { describe, expect, it } from 'vitest';
import { calculateBaselineDiff, formatBaselineCapturedAt, normalizeBaselineSaveScope } from './baseline';
import type { Task } from '../types';

const DAY = 24 * 60 * 60 * 1000;

const buildTask = (overrides: Partial<Task>): Task => ({
    id: 'task-1',
    subject: 'Task 1',
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    startDate: 0,
    dueDate: DAY,
    ...overrides
});

describe('baseline diff helpers', () => {
    it('calculates start, due, and duration deltas', () => {
        const task = buildTask({ startDate: DAY, dueDate: DAY * 3 });
        const diff = calculateBaselineDiff(task, {
            issueId: 'task-1',
            baselineStartDate: 0,
            baselineDueDate: DAY * 2
        });

        expect(diff).toEqual({
            hasDifference: true,
            currentStartDate: DAY,
            currentDueDate: DAY * 3,
            baselineStartDate: 0,
            baselineDueDate: DAY * 2,
            startDeltaDays: 1,
            dueDeltaDays: 1,
            currentDurationDays: 3,
            baselineDurationDays: 3,
            durationDeltaDays: 0
        });
    });

    it('returns null when baseline task is missing', () => {
        const task = buildTask({});
        expect(calculateBaselineDiff(task, null)).toBeNull();
    });

    it('normalizes unknown baseline scope values to filtered', () => {
        expect(normalizeBaselineSaveScope('project')).toBe('project');
        expect(normalizeBaselineSaveScope('unexpected')).toBe('filtered');
        expect(normalizeBaselineSaveScope(undefined)).toBe('filtered');
    });

    it('formats captured timestamps for baseline metadata', () => {
        expect(formatBaselineCapturedAt('2026-04-01T00:00:00.000Z')).toBe('2026-04-01 00:00 UTC');
    });
});
