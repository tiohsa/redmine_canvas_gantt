const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * スナップ対象のタイムスタンプを「UTC日の境界(00:00:00.000Z)」に丸める。
 * - `>= 12:00` は翌日に繰り上げ（既存挙動と同等の「最近傍日」）
 * - タイムゾーンの影響を受けない（date-only を epoch(ms) で扱うため）
 */
export function snapToUtcDay(timestampMs: number): number {
    return Math.floor((timestampMs + ONE_DAY_MS / 2) / ONE_DAY_MS) * ONE_DAY_MS;
}

/**
 * ローカル日の境界(00:00:00)にスナップする。
 * Canvas の日付グリッド(ローカル基準)と揃えるために使用する。
 */
export function snapToLocalDay(timestampMs: number): number {
    const shifted = new Date(timestampMs + ONE_DAY_MS / 2);
    return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate()).getTime();
}

/**
 * ローカル週の境界(月曜開始)にスナップする。
 */
export function snapToLocalWeek(timestampMs: number): number {
    const shifted = new Date(timestampMs + ONE_WEEK_MS / 2);
    const day = shifted.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(shifted);
    monday.setDate(shifted.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
}

/**
 * ローカル月の境界(1日)にスナップする。
 */
export function snapToLocalMonth(timestampMs: number): number {
    const base = new Date(timestampMs);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const shifted = new Date(timestampMs + (daysInMonth * ONE_DAY_MS) / 2);
    return new Date(shifted.getFullYear(), shifted.getMonth(), 1).getTime();
}

export function formatLocalDateInputValue(timestampMs: number | undefined): string {
    if (timestampMs === undefined || !Number.isFinite(timestampMs)) return '';
    const date = new Date(timestampMs);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function parseLocalDateInputValue(value: string): number {
    if (!value) return Number.NaN;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return Number.NaN;
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}
