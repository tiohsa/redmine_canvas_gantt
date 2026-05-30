/**
 * Validates the date range between startDate and dueDate.
 * Returns { valid: true } if valid, or a detailed invalid reason otherwise.
 */
export function validateDateRange(params: {
    currentStartDate?: number;
    currentDueDate?: number;
    nextStartDate?: number;
    nextDueDate?: number;
}): { valid: true } | { valid: false; reason: 'start_after_due' | 'due_before_start' } {
    const { currentStartDate, currentDueDate, nextStartDate, nextDueDate } = params;

    const start = nextStartDate !== undefined ? nextStartDate : currentStartDate;
    const due = nextDueDate !== undefined ? nextDueDate : currentDueDate;

    if (start !== undefined && due !== undefined) {
        // If either value is null or invalid (e.g. NaN), we don't treat them as numeric limits to validate
        if (Number.isNaN(start) || Number.isNaN(due)) {
            return { valid: true };
        }
        if (start > due) {
            if (nextStartDate !== undefined) {
                return { valid: false, reason: 'start_after_due' };
            }
            if (nextDueDate !== undefined) {
                return { valid: false, reason: 'due_before_start' };
            }
            // fallback if both next values are provided or both are undefined but they are reversed
            return { valid: false, reason: 'start_after_due' };
        }
    }

    return { valid: true };
}
