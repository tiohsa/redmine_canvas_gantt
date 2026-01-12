// layoutHelpers.ts
// 共通レイアウト計算ロジックを提供します。
// 既存の LayoutEngine と同等の機能を持ち、他コンポーネントで再利用可能です。

import type { Task, Viewport, Bounds, ZoomLevel } from '../types';
import { snapToLocalDay, snapToLocalMonth, snapToLocalWeek } from '../utils/time';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 日付を X 座標へ変換します。
 */
export function dateToX(date: number, viewport: Viewport): number {
    return (date - viewport.startDate) * viewport.scale;
}

/**
 * X 座標を日付へ変換します。
 */
export function xToDate(x: number, viewport: Viewport): number {
    return x / viewport.scale + viewport.startDate;
}

/**
 * ズームレベルに応じて日付をスナップします。
 */
export function snapDate(timestamp: number | undefined, zoomLevel?: ZoomLevel): number {
    if (timestamp === undefined || !Number.isFinite(timestamp)) return NaN;
    if (zoomLevel === 0) return snapToLocalMonth(timestamp);
    if (zoomLevel === 1) return snapToLocalWeek(timestamp);
    return snapToLocalDay(timestamp);
}

/**
 * タスクの描画領域 (バー) を取得します。
 * `kind` が 'hit' の場合はヒット領域 (行全体) を返します。
 */
export function getTaskBounds(
    task: Task,
    viewport: Viewport,
    kind: 'bar' | 'hit' = 'bar',
    zoomLevel?: ZoomLevel
): Bounds {
    const start = task.startDate;
    const due = task.dueDate;
    if (!Number.isFinite(start) || !Number.isFinite(due)) {
        // 日付が無効な場合は 0,0 の領域を返す (呼び出し側で Y を別途計算)
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const snappedStart = snapDate(start, zoomLevel);
    const snappedDue = Math.max(snappedStart, snapDate(due, zoomLevel));
    const snappedDueInclusive = snappedDue + ONE_DAY_MS;
    const x = dateToX(snappedStart, viewport) - viewport.scrollX;
    const y = task.rowIndex * viewport.rowHeight - viewport.scrollY;
    const width = Math.max(2, (snappedDueInclusive - snappedStart) * viewport.scale);
    if (kind === 'hit') {
        return { x, y, width, height: viewport.rowHeight };
    }
    const height = Math.max(2, Math.round(viewport.rowHeight * 0.4));
    const yOffset = Math.round((viewport.rowHeight - height) / 2);
    return { x, y: y + yOffset, width, height };
}

/**
 * ビューポート内で可視行のインデックス範囲を取得します。
 */
export function getVisibleRowRange(viewport: Viewport, totalRows: number): [number, number] {
    const startRow = Math.floor(viewport.scrollY / viewport.rowHeight);
    const endRow = Math.ceil((viewport.scrollY + viewport.height) / viewport.rowHeight);
    return [Math.max(0, startRow), Math.min(totalRows - 1, endRow)];
}

/**
 * 行インデックス範囲内のタスクを高速に抽出します。
 * tasks は rowIndex が昇順にソートされていることを前提とします。
 */
export function sliceTasksInRowRange(tasks: Task[], startRow: number, endRow: number): Task[] {
    if (tasks.length === 0) return [];
    if (endRow < startRow) return [];
    // 二分探索で開始位置を探す
    let lo = 0;
    let hi = tasks.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tasks[mid].rowIndex < startRow) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    const result: Task[] = [];
    for (let i = lo; i < tasks.length; i++) {
        const t = tasks[i];
        if (t.rowIndex > endRow) break;
        result.push(t);
    }
    return result;
}
