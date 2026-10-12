import { parseDateOnly } from './dateOnly';

const DAY_MS = 24 * 60 * 60 * 1000;
const YEARS_PER_INDEX = 20;

const weekdayForOrdinal = (ordinal: number): number => ((ordinal + 4) % 7 + 7) % 7;
const lowerBound = (values: readonly number[], target: number): number => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (values[middle] < target) low = middle + 1;
        else high = middle;
    }
    return low;
};

const upperBound = (values: readonly number[], target: number): number => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (values[middle] <= target) low = middle + 1;
        else high = middle;
    }
    return low;
};

/** A bounded daily cumulative index; callers use their old day walk outside it. */
export class BusinessCalendarWorkingDayIndex {
    readonly windowKey: string;
    readonly rangeStart: number | null;
    readonly rangeEnd: number | null;
    private readonly workingWeekDays: ReadonlySet<number>;
    private readonly workingOverrides: number[] = [];
    private readonly prefix: Uint32Array | null;

    static windowKeyForOrdinal(ordinal: number): string {
        const year = new Date(ordinal * DAY_MS).getUTCFullYear();
        const startYear = Math.floor(year / YEARS_PER_INDEX) * YEARS_PER_INDEX;
        return startYear >= 0 && startYear <= 9980 ? String(startYear) : 'outside';
    }

    constructor(
        nonWorkingWeekDays: Iterable<number>,
        overrides: Record<string, 'working' | 'non_working'>,
        queryOrdinal: number
    ) {
        const date = new Date(queryOrdinal * DAY_MS);
        const year = date.getUTCFullYear();
        const startYear = Math.floor(year / YEARS_PER_INDEX) * YEARS_PER_INDEX;
        this.windowKey = BusinessCalendarWorkingDayIndex.windowKeyForOrdinal(queryOrdinal);
        const nonWorking = new Set(nonWorkingWeekDays);
        this.workingWeekDays = new Set(Array.from({ length: 7 }, (_, day) => day).filter((day) => !nonWorking.has(day)));

        Object.entries(overrides).forEach(([key, type]) => {
            if (type !== 'working') return;
            const timestamp = parseDateOnly(key);
            if (timestamp !== null) this.workingOverrides.push(Math.round(timestamp / DAY_MS));
        });
        this.workingOverrides.sort((left, right) => left - right);

        if (this.windowKey === 'outside') {
            this.rangeStart = null;
            this.rangeEnd = null;
            this.prefix = null;
            return;
        }

        const rangeStart = parseDateOnly(`${String(startYear).padStart(4, '0')}-01-01`);
        const nextYear = parseDateOnly(`${String(startYear + YEARS_PER_INDEX).padStart(4, '0')}-01-01`);
        if (rangeStart === null || nextYear === null) {
            this.rangeStart = null;
            this.rangeEnd = null;
            this.prefix = null;
            return;
        }
        this.rangeStart = Math.round(rangeStart / DAY_MS);
        this.rangeEnd = Math.round(nextYear / DAY_MS) - 1;

        const overrideTypes = new Map<number, 'working' | 'non_working'>();
        Object.entries(overrides).forEach(([key, type]) => {
            const timestamp = parseDateOnly(key);
            if (timestamp !== null) overrideTypes.set(Math.round(timestamp / DAY_MS), type);
        });
        const prefix = new Uint32Array(this.rangeEnd - this.rangeStart + 2);
        for (let ordinal = this.rangeStart; ordinal <= this.rangeEnd; ordinal += 1) {
            const override = overrideTypes.get(ordinal);
            const working = override
                ? override === 'working'
                : this.workingWeekDays.has(weekdayForOrdinal(ordinal));
            prefix[ordinal - this.rangeStart + 1] = prefix[ordinal - this.rangeStart] + (working ? 1 : 0);
        }
        this.prefix = prefix;
    }

    get hasWeeklyWorkingDays(): boolean {
        return this.workingWeekDays.size > 0;
    }

    hasWorkingDateInDirection(startOrdinal: number, direction: 1 | -1): boolean {
        if (this.workingWeekDays.size > 0) return true;
        return direction > 0
            ? upperBound(this.workingOverrides, startOrdinal) < this.workingOverrides.length
            : lowerBound(this.workingOverrides, startOrdinal) > 0;
    }

    countWorkingOverridesInDirection(startOrdinal: number, direction: 1 | -1): number {
        return direction > 0
            ? this.workingOverrides.length - upperBound(this.workingOverrides, startOrdinal)
            : lowerBound(this.workingOverrides, startOrdinal);
    }

    /** Returns undefined when the requested range is outside this daily table. */
    countWorkingDays(startOrdinal: number, endOrdinal: number): number | undefined {
        if (startOrdinal > endOrdinal) return 0;
        if (this.prefix === null || startOrdinal < this.rangeStart! || endOrdinal > this.rangeEnd!) return undefined;
        return this.prefix[endOrdinal - this.rangeStart! + 1] - this.prefix[startOrdinal - this.rangeStart!];
    }

    /** Selects from the cumulative table, returning undefined for sequential fallback. */
    nthWorkingDay(startOrdinal: number, count: number, direction: 1 | -1): number | undefined {
        if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Working-day count must be a positive safe integer');
        if (this.prefix === null || this.rangeStart === null || this.rangeEnd === null) return undefined;
        const rangeStart = direction > 0 ? Math.max(startOrdinal + 1, this.rangeStart) : this.rangeStart;
        const rangeEnd = direction > 0 ? this.rangeEnd : Math.min(startOrdinal - 1, this.rangeEnd);
        if (rangeStart > this.rangeEnd || rangeEnd < this.rangeStart) return undefined;

        const available = this.countWorkingDays(rangeStart, rangeEnd);
        if (available === undefined || available < count) return undefined;

        if (direction > 0) {
            let low = rangeStart;
            let high = this.rangeEnd;
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (this.countWorkingDays(rangeStart, middle)! >= count) high = middle;
                else low = middle + 1;
            }
            return low;
        }

        let low = this.rangeStart;
        let high = rangeEnd;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (this.countWorkingDays(middle, rangeEnd)! >= count) low = middle;
            else high = middle - 1;
        }
        return low;
    }
}

