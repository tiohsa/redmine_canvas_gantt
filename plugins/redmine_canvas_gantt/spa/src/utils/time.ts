const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * スナップ対象のタイムスタンプを「UTC日の境界(00:00:00.000Z)」に丸める。
 * - `>= 12:00` は翌日に繰り上げ（既存挙動と同等の「最近傍日」）
 * - タイムゾーンの影響を受けない（date-only を epoch(ms) で扱うため）
 */
export function snapToUtcDay(timestampMs: number): number {
    return Math.floor((timestampMs + ONE_DAY_MS / 2) / ONE_DAY_MS) * ONE_DAY_MS;
}

