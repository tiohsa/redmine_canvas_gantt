const FALLBACK_NON_WORKING_WEEK_DAYS = [0, 6] as const;

const normalizeWeekDay = (day: unknown): number | undefined => {
    const value = Number(day);
    if (!Number.isInteger(value)) return undefined;

    if (value === 0) return 0;
    if (value >= 1 && value <= 7) return value % 7;

    return undefined;
};

export const getNonWorkingWeekDays = (): Set<number> => {
    if (typeof window === 'undefined') {
        return new Set(FALLBACK_NON_WORKING_WEEK_DAYS);
    }

    const raw = window.RedmineCanvasGantt?.nonWorkingWeekDays;
    if (!Array.isArray(raw)) {
        return new Set(FALLBACK_NON_WORKING_WEEK_DAYS);
    }

    if (raw.length === 0) {
        return new Set();
    }

    const normalized = raw
        .map(normalizeWeekDay)
        .filter((day): day is number => typeof day === 'number');

    if (normalized.length === 0) {
        return new Set(FALLBACK_NON_WORKING_WEEK_DAYS);
    }

    const unique = [...new Set(normalized)];
    if (unique.length >= 7) {
        return new Set();
    }

    return new Set(unique);
};
