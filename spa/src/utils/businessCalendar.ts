import type {
    BusinessCalendarDay,
    BusinessCalendarDefinition,
    BusinessCalendarPayload,
    BusinessDayInfo
} from '../types/businessCalendar';
import { getNonWorkingWeekDays } from './nonWorkingWeekDays';

type UnknownRecord = Record<string, unknown>;
type ProjectCalendarArgument = string | number | Set<number> | null | undefined;

const EMPTY_PAYLOAD: BusinessCalendarPayload = {
    status: 'ok',
    revision: '',
    defaultCalendarId: null,
    projectCalendarIds: {},
    calendars: {},
    warnings: []
};

let configuredPayload: BusinessCalendarPayload = EMPTY_PAYLOAD;

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
        revision: typeof record.revision === 'string' ? record.revision : '',
        defaultCalendarId,
        projectCalendarIds,
        calendars,
        warnings,
        ...(typeof record.error === 'string' ? { error: record.error } : {})
    };
};

export const configureBusinessCalendar = (payload: unknown): BusinessCalendarPayload => {
    configuredPayload = normalizeBusinessCalendarPayload(payload);
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

const padDatePart = (value: number): string => String(value).padStart(2, '0');

export const timestampToBusinessDateKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
};

const legacyDayInfo = (timestamp: number, weekDays?: Set<number>): BusinessDayInfo => {
    const nonWorkingWeekDays = weekDays ?? getNonWorkingWeekDays();
    return {
        name: null,
        type: nonWorkingWeekDays.has(new Date(timestamp).getUTCDay()) ? 'non_working' : 'working',
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
        type: calendar.nonWorkingWeekDays.includes(new Date(timestamp).getUTCDay()) ? 'non_working' : 'working',
        source: 'weekly'
    };
};

export const isWorkingDay = (timestamp: number, projectId?: ProjectCalendarArgument): boolean => (
    getDayInfo(timestamp, projectId).type === 'working'
);

const toUtcDayStart = (timestamp: number): Date => {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

export const addWorkingDays = (timestamp: number, days: number, projectId?: ProjectCalendarArgument): number => {
    const date = toUtcDayStart(timestamp);
    let remaining = Math.max(0, Math.floor(days));
    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (isWorkingDay(date.getTime(), projectId)) remaining -= 1;
    }
    return date.getTime();
};

export const shiftByWorkingDays = (timestamp: number, days: number, projectId?: ProjectCalendarArgument): number => {
    const normalizedDays = Math.trunc(days);
    if (normalizedDays === 0) return toUtcDayStart(timestamp).getTime();
    if (normalizedDays > 0) return addWorkingDays(timestamp, normalizedDays, projectId);

    const date = toUtcDayStart(timestamp);
    let remaining = Math.abs(normalizedDays);
    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() - 1);
        if (isWorkingDay(date.getTime(), projectId)) remaining -= 1;
    }
    return date.getTime();
};

export const diffWorkingDays = (fromTimestamp: number, toTimestamp: number, projectId?: ProjectCalendarArgument): number => {
    const from = toUtcDayStart(fromTimestamp);
    const to = toUtcDayStart(toTimestamp);
    if (from.getTime() === to.getTime()) return 0;

    const step = from.getTime() < to.getTime() ? 1 : -1;
    let current = from;
    let delta = 0;
    while (current.getTime() !== to.getTime()) {
        current = new Date(current.getTime());
        current.setUTCDate(current.getUTCDate() + step);
        if (isWorkingDay(current.getTime(), projectId)) delta += step;
    }
    return delta;
};
