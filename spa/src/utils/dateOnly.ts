const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;

declare const calendarDateBrand: unique symbol;
declare const timelineDateBrand: unique symbol;

/**
 * A Redmine date-only value represented as UTC midnight.
 *
 * UTC midnight is only the canonical numeric encoding. It is not an instant in
 * the user's timezone and must not be formatted with local Date accessors.
 */
export type CalendarDate = number & { readonly [calendarDateBrand]: 'CalendarDate' };

/** A fixed-width Canvas timeline value. */
export type TimelineDate = number & { readonly [timelineDateBrand]: 'TimelineDate' };

const createUtcCalendarDate = (year: number, monthIndex: number, day: number): CalendarDate => {
    // Date.UTC treats years 0..99 as 1900..1999. setUTCFullYear preserves the
    // literal Redmine year and also performs calendar overflow validation.
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, monthIndex, day);
    return date.getTime() as CalendarDate;
};

/** Parses a Redmine CalendarDate into its timezone-independent encoding. */
export const parseDateOnly = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const match = DATE_ONLY_PATTERN.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const timestamp = createUtcCalendarDate(year, monthIndex, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex && date.getUTCDate() === day
        ? timestamp
        : null;
};

/** Formats a CalendarDate for Redmine's date-only API fields. */
export const formatDateOnly = (value: number | Date | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

/** Returns the stable YYYY-MM-DD key used by calendars and persistence. */
export const calendarDateKey = (value: number | Date): string => {
    const key = formatDateOnly(value);
    if (key === null) throw new RangeError('Invalid CalendarDate');
    return key;
};

/** Adds whole calendar days without using elapsed milliseconds as duration. */
export const addCalendarDays = (value: number, days: number): CalendarDate => {
    if (!Number.isFinite(value) || !Number.isFinite(days)) {
        throw new RangeError('CalendarDate and day count must be finite');
    }
    const date = new Date(value);
    return createUtcCalendarDate(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + Math.trunc(days)
    );
};

/** Returns the signed number of calendar boundaries between two dates. */
export const diffCalendarDays = (from: number, to: number): number => {
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        throw new RangeError('CalendarDate values must be finite');
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const fromOrdinal = createUtcCalendarDate(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate()
    );
    const toOrdinal = createUtcCalendarDate(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate()
    );
    return Math.round((toOrdinal - fromOrdinal) / CALENDAR_DAY_MS);
};

/** Returns the weekday using the same calendar components as persistence. */
export const calendarWeekday = (value: number): number => {
    if (!Number.isFinite(value)) throw new RangeError('Invalid CalendarDate');
    return new Date(value).getUTCDay();
};

/**
 * Projects a CalendarDate onto the fixed-width Canvas timeline.
 * This is the only boundary where a date-only value becomes a timeline value.
 */
export const toTimelineDate = (value: number): TimelineDate => {
    if (!Number.isFinite(value)) return Number.NaN as TimelineDate;
    const date = new Date(value);
    return createUtcCalendarDate(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ) as number as TimelineDate;
};

/** Normalizes a CalendarDate-compatible value using its UTC calendar fields. */
export const toCalendarDate = (value: number): CalendarDate => {
    if (!Number.isFinite(value)) return Number.NaN as CalendarDate;
    const date = new Date(value);
    return createUtcCalendarDate(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    );
};

/** Snaps a Canvas timeline value to the nearest CalendarDate cell. */
export const timelineToCalendarDate = (value: number): CalendarDate => {
    if (!Number.isFinite(value)) return Number.NaN as CalendarDate;
    const roundedTimeline = Math.floor((value + CALENDAR_DAY_MS / 2) / CALENDAR_DAY_MS) * CALENDAR_DAY_MS;
    return roundedTimeline as CalendarDate;
};

/** Converts a CalendarDate to a local Date only for locale-aware UI display. */
export const toLocalDisplayDate = (value: number): Date => {
    if (!Number.isFinite(value)) return new Date(Number.NaN);
    const date = new Date(value);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** Creates a CalendarDate from the visible local components of a UI Date. */
export const fromLocalDate = (value: Date): CalendarDate => {
    if (!Number.isFinite(value.getTime())) return Number.NaN as CalendarDate;
    return createUtcCalendarDate(value.getFullYear(), value.getMonth(), value.getDate());
};
