import type {
    BusinessCalendarDay,
    BusinessCalendarDefinition,
    BusinessCalendarPayload,
    BusinessDayInfo
} from '../types/businessCalendar';
import {
    addCalendarDays,
    calendarDateKey,
    calendarWeekday,
    timelineToCalendarDate
} from './dateOnly';
import { getNonWorkingWeekDays } from './nonWorkingWeekDays';
import { BusinessCalendarWorkingDayIndex } from './businessCalendarIndex';
import { DatePlacementMode, type DatePlacementMode as DatePlacementModeValue } from '../types/constraints';

type UnknownRecord = Record<string, unknown>;
export type ProjectCalendarArgument = string | number | Set<number> | null | undefined;
export type WorkingDateDirection = 'forward' | 'backward';
export type TaskDateIntervalMode = 'move' | 'resize_start' | 'resize_due' | 'direct_edit' | 'project_move' | 'legacy_unspecified';

export type TaskDateInterval = {
    startDate?: number | null;
    dueDate?: number | null;
};

export type NormalizeTaskDateIntervalResult = {
    valid: true;
    interval: TaskDateInterval;
} | {
    valid: false;
    interval: TaskDateInterval;
    error: 'invalid_interval';
};

const EMPTY_PAYLOAD: BusinessCalendarPayload = {
    status: 'ok',
    validationStatus: 'valid',
    revision: '',
    defaultCalendarId: null,
    projectCalendarIds: {},
    calendars: {},
    warnings: []
};

let configuredPayload: BusinessCalendarPayload = EMPTY_PAYLOAD;

const MAX_WORKING_DAY_INDEXES = 12;
const workingDayIndexes = new Map<string, BusinessCalendarWorkingDayIndex>();

const getWorkingDayIndex = (projectId: ProjectCalendarArgument | undefined, queryOrdinal: number): BusinessCalendarWorkingDayIndex => {
    const windowKey = BusinessCalendarWorkingDayIndex.windowKeyForOrdinal(queryOrdinal);
    let cacheKey: string;
    let nonWorkingWeekDays: Iterable<number>;
    let overrideDays: BusinessCalendarDefinition['days'] | undefined;

    if (projectId instanceof Set) {
        const days = [...projectId].sort((left, right) => left - right);
        cacheKey = `legacy:${days.join(',')}:${windowKey}`;
        nonWorkingWeekDays = days;
    } else {
        const calendarId = getCalendarIdForProject(projectId);
        const calendar = calendarId ? configuredPayload.calendars[calendarId] : undefined;
        if (calendar) {
            cacheKey = `calendar:${calendarId}:${windowKey}`;
            nonWorkingWeekDays = calendar.nonWorkingWeekDays;
            overrideDays = calendar.days;
        } else {
            const days = [...getNonWorkingWeekDays()].sort((left, right) => left - right);
            cacheKey = `legacy:${days.join(',')}:${windowKey}`;
            nonWorkingWeekDays = days;
        }
    }

    const cached = workingDayIndexes.get(cacheKey);
    if (cached) {
        workingDayIndexes.delete(cacheKey);
        workingDayIndexes.set(cacheKey, cached);
        return cached;
    }

    const overrides: Record<string, 'working' | 'non_working'> = {};
    Object.entries(overrideDays ?? {}).forEach(([key, day]) => { overrides[key] = day.type; });
    const index = new BusinessCalendarWorkingDayIndex(nonWorkingWeekDays, overrides, queryOrdinal);
    workingDayIndexes.set(cacheKey, index);
    if (workingDayIndexes.size > MAX_WORKING_DAY_INDEXES) {
        const oldestKey = workingDayIndexes.keys().next().value;
        if (oldestKey !== undefined) workingDayIndexes.delete(oldestKey);
    }
    return index;
};

const ordinalForDate = (timestamp: number): number => Math.round(timestamp / (24 * 60 * 60 * 1000));
const timestampForOrdinal = (ordinal: number): number => {
    const timestamp = ordinal * (24 * 60 * 60 * 1000);
    if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
        throw new RangeError('Working date is outside the supported calendar range');
    }
    return timestamp;
};

const requireWorkingCapacity = (
    index: BusinessCalendarWorkingDayIndex,
    startOrdinal: number,
    count: number,
    direction: 1 | -1
): void => {
    if (index.hasWeeklyWorkingDays) return;
    if (index.countWorkingOverridesInDirection(startOrdinal, direction) < count) {
        throw new RangeError('Calendar has no working date in the requested direction');
    }
};

const walkWorkingDays = (
    timestamp: number,
    count: number,
    direction: 1 | -1,
    projectId?: ProjectCalendarArgument
): number => {
    let date = timestamp;
    let remaining = count;
    while (remaining > 0) {
        date = addCalendarDays(date, direction);
        if (!Number.isFinite(date)) throw new RangeError('Working date is outside the supported calendar range');
        if (isWorkingDay(date, projectId)) remaining -= 1;
    }
    return date;
};

const asRecord = (value: unknown): UnknownRecord | null => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as UnknownRecord
        : null
);

const normalizeWeekDays = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((day): day is number => (
        typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6
    )))].sort((left, right) => left - right);
};

const normalizeDay = (value: unknown): BusinessCalendarDay | null => {
    const record = asRecord(value);
    if (!record || typeof record.name !== 'string') return null;
    if (record.type !== 'working' && record.type !== 'non_working') return null;
    return { name: record.name, type: record.type };
};

const normalizeCalendar = (key: string, value: unknown): BusinessCalendarDefinition | null => {
    const record = asRecord(value);
    if (!record || typeof record.id !== 'string' || record.id !== key || typeof record.name !== 'string') return null;

    const rawDays = asRecord(record.days) ?? {};
    const days: Record<string, BusinessCalendarDay> = {};
    Object.entries(rawDays).forEach(([dateKey, rawDay]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
        const day = normalizeDay(rawDay);
        if (day) days[dateKey] = day;
    });

    return {
        id: record.id,
        name: record.name,
        nonWorkingWeekDays: normalizeWeekDays(record.non_working_week_days ?? record.nonWorkingWeekDays),
        days
    };
};

export const normalizeBusinessCalendarPayload = (value: unknown): BusinessCalendarPayload => {
    const record = asRecord(value);
    if (!record) return EMPTY_PAYLOAD;

    const rawCalendars = asRecord(record.calendars) ?? {};
    const calendars: Record<string, BusinessCalendarDefinition> = {};
    Object.entries(rawCalendars).forEach(([id, rawCalendar]) => {
        const calendar = normalizeCalendar(id, rawCalendar);
        if (calendar) calendars[id] = calendar;
    });

    const rawProjectCalendarIds = asRecord(record.project_calendar_ids ?? record.projectCalendarIds) ?? {};
    const projectCalendarIds: Record<string, string> = {};
    Object.entries(rawProjectCalendarIds).forEach(([projectId, calendarId]) => {
        if (typeof calendarId === 'string' && calendars[calendarId]) {
            projectCalendarIds[String(projectId)] = calendarId;
        }
    });

    const rawDefaultCalendarId = record.default_calendar_id ?? record.defaultCalendarId;
    const defaultCalendarId = typeof rawDefaultCalendarId === 'string' && calendars[rawDefaultCalendarId]
        ? rawDefaultCalendarId
        : null;
    const warnings = Array.isArray(record.warnings)
        ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
        : [];

    return {
        status: record.status === 'error' ? 'error' : 'ok',
        validationStatus: record.validationStatus === 'invalid' || record.validationStatus === 'stale'
            ? record.validationStatus
            : record.status === 'error' ? 'invalid' : 'valid',
        ...(typeof record.validationMessage === 'string' ? { validationMessage: record.validationMessage } : {}),
        ...(asRecord(record.diagnostic) && typeof asRecord(record.diagnostic)?.code === 'string'
            && typeof asRecord(record.diagnostic)?.message === 'string'
            ? { diagnostic: {
                code: asRecord(record.diagnostic)!.code as string,
                ...(typeof asRecord(record.diagnostic)!.file === 'string' ? { file: asRecord(record.diagnostic)!.file as string } : {}),
                ...(typeof asRecord(record.diagnostic)!.line === 'number' ? { line: asRecord(record.diagnostic)!.line as number } : {}),
                message: asRecord(record.diagnostic)!.message as string,
                ...(typeof asRecord(record.diagnostic)!.cause === 'string' ? { cause: asRecord(record.diagnostic)!.cause as string } : {}),
                ...(typeof asRecord(record.diagnostic)!.value === 'string' ? { value: asRecord(record.diagnostic)!.value as string } : {})
            } }
            : {}),
        revision: typeof record.revision === 'string' ? record.revision : '',
        defaultCalendarId,
        projectCalendarIds,
        calendars,
        warnings
    };
};

export const configureBusinessCalendar = (payload: unknown): BusinessCalendarPayload => {
    configuredPayload = normalizeBusinessCalendarPayload(payload);
    workingDayIndexes.clear();
    return configuredPayload;
};

export const getBusinessCalendarPayload = (): BusinessCalendarPayload => configuredPayload;

export const isBusinessCalendarReady = (): boolean => configuredPayload.status !== 'error';

export const getCalendarIdForProject = (projectId?: string | number | null): string | null => {
    if (projectId !== null && projectId !== undefined) {
        const assigned = configuredPayload.projectCalendarIds[String(projectId)];
        if (assigned) return assigned;
    }
    return configuredPayload.defaultCalendarId;
};

export const timestampToBusinessDateKey = (timestamp: number): string => calendarDateKey(timestamp);

const legacyDayInfo = (timestamp: number, weekDays?: Set<number>): BusinessDayInfo => {
    const nonWorkingWeekDays = weekDays ?? getNonWorkingWeekDays();
    return {
        name: null,
        type: nonWorkingWeekDays.has(calendarWeekday(timestamp)) ? 'non_working' : 'working',
        source: 'weekly'
    };
};

export const getDayInfo = (timestamp: number, projectId?: ProjectCalendarArgument): BusinessDayInfo => {
    if (projectId instanceof Set) return legacyDayInfo(timestamp, projectId);

    const calendarId = getCalendarIdForProject(projectId);
    const calendar = calendarId ? configuredPayload.calendars[calendarId] : undefined;
    if (!calendar) return legacyDayInfo(timestamp);

    const explicit = calendar.days[timestampToBusinessDateKey(timestamp)];
    if (explicit) {
        return { name: explicit.name, type: explicit.type, source: 'override' };
    }

    return {
        name: null,
        type: calendar.nonWorkingWeekDays.includes(calendarWeekday(timestamp)) ? 'non_working' : 'working',
        source: 'weekly'
    };
};

export const isWorkingDay = (timestamp: number, projectId?: ProjectCalendarArgument): boolean => (
    getDayInfo(timestamp, projectId).type === 'working'
);

/**
 * Returns the nearest working date in the requested direction.
 * Date-only values remain UTC-midnight calendar dates throughout the walk.
 */
export const normalizeWorkingDate = (
    timestamp: number,
    direction: WorkingDateDirection,
    projectId?: ProjectCalendarArgument
): number => {
    // Task dates are date-only UTC midnights. Preserve non-date numeric values
    // used by generic store callers rather than collapsing them to epoch day 0.
    if (!Number.isFinite(timestamp) || timestamp !== timelineToCalendarDate(timestamp)) {
        return timestamp;
    }
    const date = timelineToCalendarDate(timestamp);
    if (isWorkingDay(date, projectId)) return date;
    const startOrdinal = ordinalForDate(date);
    const index = getWorkingDayIndex(projectId, startOrdinal);
    const targetOrdinal = direction === 'forward'
        ? index.nthWorkingDay(startOrdinal - 1, 1, 1)
        : index.nthWorkingDay(startOrdinal + 1, 1, -1);
    if (targetOrdinal !== undefined) return timestampForOrdinal(targetOrdinal);
    const step = direction === 'forward' ? 1 : -1;
    requireWorkingCapacity(index, startOrdinal - step, 1, step);
    return walkWorkingDays(date, 1, step, projectId);
};

export const nextWorkingDay = (timestamp: number, projectId?: ProjectCalendarArgument): number => (
    normalizeWorkingDate(timestamp, 'forward', projectId)
);

export const previousWorkingDay = (timestamp: number, projectId?: ProjectCalendarArgument): number => (
    normalizeWorkingDate(timestamp, 'backward', projectId)
);

export const normalizeTaskDateInterval = (
    interval: TaskDateInterval,
    options: {
        changedFields: { startDate?: boolean; dueDate?: boolean };
        projectId?: ProjectCalendarArgument;
        mode?: TaskDateIntervalMode;
        datePlacementMode?: DatePlacementModeValue;
    }
): NormalizeTaskDateIntervalResult => {
    const startChanged = options.changedFields.startDate === true;
    const dueChanged = options.changedFields.dueDate === true;
    const datePlacementMode = options.datePlacementMode ?? DatePlacementMode.WorkingDays;
    const startDate = Number.isFinite(interval.startDate)
        ? datePlacementMode === DatePlacementMode.CalendarDays
            ? timelineToCalendarDate(interval.startDate!)
            : normalizeWorkingDate(interval.startDate!, 'forward', options.projectId)
        : interval.startDate;
    const dueDate = Number.isFinite(interval.dueDate)
        ? datePlacementMode === DatePlacementMode.CalendarDays
            ? timelineToCalendarDate(interval.dueDate!)
            : normalizeWorkingDate(interval.dueDate!, 'backward', options.projectId)
        : interval.dueDate;
    const normalized = { startDate, dueDate };

    if (Number.isFinite(startDate) && Number.isFinite(dueDate) && startDate! > dueDate!) {
        if (options.mode === 'resize_start' && !dueChanged) {
            return { valid: true, interval: { ...normalized, startDate: dueDate } };
        }
        if (options.mode === 'resize_due' && !startChanged) {
            return { valid: true, interval: { ...normalized, dueDate: startDate } };
        }
        return { valid: false, interval: normalized, error: 'invalid_interval' };
    }

    return { valid: true, interval: normalized };
};

export const addWorkingDays = (timestamp: number, days: number, projectId?: ProjectCalendarArgument): number => {
    const date = timelineToCalendarDate(timestamp);
    const remaining = Math.max(0, Math.floor(days));
    if (!(remaining > 0)) return date;
    if (!Number.isSafeInteger(remaining)) throw new RangeError('Working-day count must be a positive safe integer');
    const startOrdinal = ordinalForDate(date);
    const index = getWorkingDayIndex(projectId, startOrdinal);
    const targetOrdinal = index.nthWorkingDay(startOrdinal, remaining, 1);
    if (targetOrdinal !== undefined) return timestampForOrdinal(targetOrdinal);
    requireWorkingCapacity(index, startOrdinal, remaining, 1);
    return walkWorkingDays(date, remaining, 1, projectId);
};

export const shiftByWorkingDays = (timestamp: number, days: number, projectId?: ProjectCalendarArgument): number => {
    const normalizedDays = Math.trunc(days);
    if (normalizedDays === 0) return timelineToCalendarDate(timestamp);
    if (normalizedDays > 0) return addWorkingDays(timestamp, normalizedDays, projectId);

    if (!Number.isSafeInteger(normalizedDays)) throw new RangeError('Working-day count must be a positive safe integer');
    const date = timelineToCalendarDate(timestamp);
    const startOrdinal = ordinalForDate(date);
    const remaining = Math.abs(normalizedDays);
    const index = getWorkingDayIndex(projectId, startOrdinal);
    const targetOrdinal = index.nthWorkingDay(startOrdinal, remaining, -1);
    if (targetOrdinal !== undefined) return timestampForOrdinal(targetOrdinal);
    requireWorkingCapacity(index, startOrdinal, remaining, -1);
    return walkWorkingDays(date, remaining, -1, projectId);
};

export const diffWorkingDays = (fromTimestamp: number, toTimestamp: number, projectId?: ProjectCalendarArgument): number => {
    const from = timelineToCalendarDate(fromTimestamp);
    const to = timelineToCalendarDate(toTimestamp);
    if (from === to) return 0;

    const fromOrdinal = ordinalForDate(from);
    const toOrdinal = ordinalForDate(to);
    const index = getWorkingDayIndex(projectId, fromOrdinal);
    const count = from < to
        ? index.countWorkingDays(fromOrdinal + 1, toOrdinal)
        : index.countWorkingDays(toOrdinal, fromOrdinal - 1);
    if (count !== undefined) return count === 0 || from < to ? count : -count;

    const step = from < to ? 1 : -1;
    let current = from;
    let delta = 0;
    while (current !== to) {
        current = addCalendarDays(current, step);
        if (!Number.isFinite(current)) throw new RangeError('Working date is outside the supported calendar range');
        if (isWorkingDay(current, projectId)) delta += step;
    }
    return delta;
};
