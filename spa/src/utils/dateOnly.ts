const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a Redmine calendar date at local midnight, never as a UTC instant. */
export const parseDateOnly = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const match = DATE_ONLY_PATTERN.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
        ? date.getTime()
        : null;
};

/** Formats a local calendar-date timestamp for Redmine's date-only API fields. */
export const formatDateOnly = (value: number | Date | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
