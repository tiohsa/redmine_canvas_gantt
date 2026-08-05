import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    addWorkingDays,
    configureBusinessCalendar,
    diffWorkingDays,
    getCalendarIdForProject,
    getDayInfo,
    isBusinessCalendarReady,
    isWorkingDay,
    normalizeBusinessCalendarPayload,
    normalizeTaskDateInterval,
    normalizeWorkingDate,
    nextWorkingDay,
    previousWorkingDay,
    shiftByWorkingDays,
    timestampToBusinessDateKey
} from './businessCalendar';
import type { TaskDateIntervalMode } from './businessCalendar';
import intervalVectors from './calendarDateIntervalVectors.json';
import { calculateLinkedDownstreamUpdates, recalculateDownstreamTasks } from '../scheduling/constraintGraph';
import { calculateCriticalPath } from '../scheduling/criticalPath';
import { calculateDelay } from './relationEditing';
import { AutoScheduleMoveMode, RelationType } from '../types/constraints';
import type { Task } from '../types';
import { TaskLogicService } from '../services/TaskLogicService';
import { parseDateOnly } from './dateOnly';

const timestamp = (date: string): number => parseDateOnly(date)!;
const task = (id: string, projectId: string, startDate: string, dueDate: string): Task => ({
    id,
    projectId,
    subject: id,
    startDate: timestamp(startDate),
    dueDate: timestamp(dueDate),
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

const payload = {
    status: 'ok',
    revision: 'rev-1',
    default_calendar_id: 'company-japan',
    project_calendar_ids: {
        1: 'company-japan',
        2: 'US'
    },
    calendars: {
        'company-japan': {
            id: 'company-japan',
            name: 'Japan Company',
            non_working_week_days: [0, 6],
            days: {
                '2027-01-03': { name: 'Substitute workday', type: 'working' },
                '2027-01-04': { name: 'Company holiday', type: 'non_working' }
            }
        },
        US: {
            id: 'US',
            name: 'United States',
            non_working_week_days: [0, 6],
            days: {
                '2027-01-05': { name: 'US holiday', type: 'non_working' }
            }
        }
    },
    warnings: []
};

describe('businessCalendar', () => {
    beforeEach(() => {
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/api',
            redmineBase: '',
            authToken: '',
            apiKey: '',
            nonWorkingWeekDays: [0, 6]
        };
        configureBusinessCalendar(payload);
    });

    afterEach(() => configureBusinessCalendar(undefined));

    it('normalizes API payload and resolves project calendars', () => {
        const normalized = normalizeBusinessCalendarPayload(payload);

        expect(normalized.defaultCalendarId).toBe('company-japan');
        expect(normalized.calendars['company-japan'].nonWorkingWeekDays).toEqual([0, 6]);
        configureBusinessCalendar(normalized);
        expect(getCalendarIdForProject('2')).toBe('US');
        expect(getCalendarIdForProject('missing')).toBe('company-japan');
    });

    it('lets explicit working and non-working days override weekly rules', () => {
        expect(getDayInfo(timestamp('2027-01-03'), '1')).toEqual({
            name: 'Substitute workday',
            type: 'working',
            source: 'override'
        });
        expect(isWorkingDay(timestamp('2027-01-03'), '1')).toBe(true);
        expect(getDayInfo(timestamp('2027-01-04'), '1')).toEqual({
            name: 'Company holiday',
            type: 'non_working',
            source: 'override'
        });
    });

    it('uses each project calendar for working-day arithmetic', () => {
        expect(addWorkingDays(timestamp('2027-01-01'), 1, '1')).toBe(timestamp('2027-01-03'));
        expect(addWorkingDays(timestamp('2027-01-04'), 1, '2')).toBe(timestamp('2027-01-06'));
        expect(shiftByWorkingDays(timestamp('2027-01-06'), -1, '2')).toBe(timestamp('2027-01-04'));
        expect(diffWorkingDays(timestamp('2027-01-04'), timestamp('2027-01-06'), '2')).toBe(1);
    });

    it('normalizes a non-working task date in the requested direction', () => {
        expect(nextWorkingDay(timestamp('2027-01-04'), '1')).toBe(timestamp('2027-01-05'));
        expect(previousWorkingDay(timestamp('2027-01-04'), '1')).toBe(timestamp('2027-01-03'));
        expect(normalizeWorkingDate(timestamp('2027-01-03'), 'forward', '1')).toBe(timestamp('2027-01-03'));
    });

    it('rejects interval normalization that would invert start and due dates', () => {
        expect(normalizeTaskDateInterval(
            { startDate: timestamp('2027-01-04'), dueDate: timestamp('2027-01-04') },
            { changedFields: { startDate: true, dueDate: true }, projectId: '1', mode: 'direct_edit' }
        )).toEqual({
            valid: false,
            interval: {
                startDate: timestamp('2027-01-05'),
                dueDate: timestamp('2027-01-03')
            },
            error: 'invalid_interval'
        });
    });

    it.each(intervalVectors.cases)('matches shared interval vector: $name', (testCase) => {
        configureBusinessCalendar(intervalVectors.calendarPayload);

        const result = normalizeTaskDateInterval(
            {
                startDate: testCase.startDate === null ? null : timestamp(testCase.startDate),
                dueDate: testCase.dueDate === null ? null : timestamp(testCase.dueDate)
            },
            {
                changedFields: {
                    startDate: testCase.changedFields.includes('start_date'),
                    dueDate: testCase.changedFields.includes('due_date')
                },
                projectId: testCase.projectId,
                mode: testCase.mode as TaskDateIntervalMode
            }
        );

        expect(result.valid).toBe(testCase.expected.valid);
        expect(result.interval.startDate).toBe(testCase.expected.startDate === null ? null : timestamp(testCase.expected.startDate));
        expect(result.interval.dueDate).toBe(testCase.expected.dueDate === null ? null : timestamp(testCase.expected.dueDate));
        if (!result.valid) {
            expect(result.error).toBe(testCase.expected.error);
        }
    });

    it('normalizes 5,000 task date intervals within a bounded complexity gate', () => {
        configureBusinessCalendar(intervalVectors.calendarPayload);
        const intervals = Array.from({ length: 5000 }, (_, index) => {
            const day = (index % 20) + 1;
            const startDay = String(day).padStart(2, '0');
            const dueDay = String(Math.min(day + 4, 28)).padStart(2, '0');
            return {
                startDate: timestamp(`2027-05-${startDay}`),
                dueDate: timestamp(`2027-05-${dueDay}`)
            };
        });

        const startedAt = performance.now();
        const normalized = intervals.map((interval) => normalizeTaskDateInterval(
            interval,
            {
                changedFields: { startDate: true, dueDate: true },
                projectId: '1',
                mode: 'direct_edit'
            }
        ));
        const elapsedMs = performance.now() - startedAt;

        expect(normalized).toHaveLength(5000);
        expect(normalized.every((result) => (
            !result.valid
            || !Number.isFinite(result.interval.startDate)
            || !Number.isFinite(result.interval.dueDate)
            || result.interval.startDate! <= result.interval.dueDate!
        ))).toBe(true);
        expect(elapsedMs).toBeLessThan(1000);
    }, 5_000);

    it('falls back to legacy Redmine weekdays when payload is absent', () => {
        configureBusinessCalendar(undefined);

        expect(isWorkingDay(timestamp('2027-01-03'), '1')).toBe(false);
        expect(isWorkingDay(timestamp('2027-01-04'), '1')).toBe(true);
    });

    it('falls back to weekly settings for auto scheduling when configuration is invalid', () => {
        configureBusinessCalendar({ status: 'error', revision: 'broken' });

        expect(isBusinessCalendarReady()).toBe(false);
        expect(TaskLogicService.checkDependencies(
            [task('one', '1', '2027-01-01', '2027-01-01')],
            [],
            'one',
            timestamp('2027-01-02'),
            timestamp('2027-01-02'),
            AutoScheduleMoveMode.ConstraintPush
        )).toEqual({ updates: new Map() });
    });

    it('keeps date-only calendar semantics independent of the browser timezone', () => {
        const redmineDate = timestamp('2027-01-03');

        expect(timestampToBusinessDateKey(redmineDate)).toBe('2027-01-03');
        expect(getDayInfo(redmineDate, '1')).toEqual({
            name: 'Substitute workday',
            type: 'working',
            source: 'override'
        });
        expect(isWorkingDay(redmineDate, '1')).toBe(true);
        expect(addWorkingDays(redmineDate, 1, '1')).toBe(timestamp('2027-01-05'));
        expect(shiftByWorkingDays(timestamp('2027-01-04'), -1, '1')).toBe(timestamp('2027-01-03'));
        expect(diffWorkingDays(redmineDate, timestamp('2027-01-05'), '1')).toBe(1);
    });

    it('uses the successor calendar for relation delay and downstream auto scheduling', () => {
        const predecessor = task('one', '1', '2027-01-01', '2027-01-01');
        const japanSuccessor = task('two', '1', '2027-01-02', '2027-01-02');
        const usSuccessor = task('three', '2', '2027-01-02', '2027-01-02');

        expect(calculateDelay(RelationType.Precedes, predecessor, {
            ...japanSuccessor,
            startDate: timestamp('2027-01-03')
        })).toEqual({ delay: 0 });
        const japanUpdates = recalculateDownstreamTasks(
            [predecessor, japanSuccessor],
            [{ id: 'r1', from: 'one', to: 'two', type: RelationType.Precedes, delay: 0 }],
            'one'
        );
        const usUpdates = recalculateDownstreamTasks(
            [predecessor, usSuccessor],
            [{ id: 'r2', from: 'one', to: 'three', type: RelationType.Precedes, delay: 0 }],
            'one'
        );

        expect(japanUpdates.get('two')?.startDate).toBe(timestamp('2027-01-03'));
        expect(usUpdates.get('three')?.startDate).toBe(timestamp('2027-01-04'));
    });

    it('uses each downstream task calendar for linked shifts', () => {
        const origin = task('one', '1', '2027-01-01', '2027-01-01');
        const downstream = task('two', '2', '2027-01-04', '2027-01-04');
        const result = calculateLinkedDownstreamUpdates(
            [origin, downstream],
            [{ id: 'r1', from: 'one', to: 'two', type: RelationType.Precedes, delay: 0 }],
            'one',
            timestamp('2027-01-01'),
            timestamp('2027-01-03')
        );

        expect(result.error).toBeUndefined();
        expect(result.updates.get('two')?.startDate).toBe(timestamp('2027-01-06'));
    });

    it('uses task calendars for critical-path working durations', () => {
        const result = calculateCriticalPath(
            [task('one', '1', '2027-01-01', '2027-01-04')],
            []
        );

        expect(result.metricsByTaskId.one.durationDays).toBe(1);
    });
});
