import React from 'react';
import { createPortal } from 'react-dom';

import type { Task } from '../types';
import type { BaselineDiff } from '../utils/baseline';
import { i18n } from '../utils/i18n';
import { formatBaselineDate } from '../utils/baseline';

const formatDeltaDays = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) {
        return '-';
    }

    if (value === 0) {
        return '0d';
    }

    return `${value > 0 ? '+' : ''}${value}d`;
};

export const BaselineDiffPopover: React.FC<{
    popoverRef: React.RefObject<HTMLDivElement | null>;
    position: { x: number; y: number };
    task: Task;
    diff: BaselineDiff | null;
    baselineCapturedAt: string;
    baselineCapturedBy: string;
    baselineScope: string;
}> = ({ popoverRef, position, task, diff, baselineCapturedAt, baselineCapturedBy, baselineScope }) => {
    const [resolvedPosition, setResolvedPosition] = React.useState(position);
    const currentDurationDays = diff?.currentDurationDays ?? null;
    const baselineDurationDays = diff?.baselineDurationDays ?? null;

    React.useLayoutEffect(() => {
        if (!popoverRef.current) {
            setResolvedPosition(position);
            return;
        }

        const clampPosition = () => {
            if (!popoverRef.current) return;
            const rect = popoverRef.current.getBoundingClientRect();
            const margin = 8;
            const nextX = Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin));
            const nextY = Math.max(margin, Math.min(position.y, window.innerHeight - rect.height - margin));
            setResolvedPosition((current) => {
                if (current.x === nextX && current.y === nextY) {
                    return current;
                }
                return { x: nextX, y: nextY };
            });
        };

        clampPosition();

        const handleResize = () => clampPosition();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [popoverRef, position]);

    const rows = [
        { label: i18n.t('field_start_date') || 'Start', current: formatBaselineDate(diff?.currentStartDate ?? null), baseline: formatBaselineDate(diff?.baselineStartDate ?? null), delta: formatDeltaDays(diff?.startDeltaDays ?? null) },
        { label: i18n.t('field_due_date') || 'Due', current: formatBaselineDate(diff?.currentDueDate ?? null), baseline: formatBaselineDate(diff?.baselineDueDate ?? null), delta: formatDeltaDays(diff?.dueDeltaDays ?? null) },
        { label: i18n.t('label_baseline_duration') || 'Duration', current: currentDurationDays === null ? '-' : `${currentDurationDays}d`, baseline: baselineDurationDays === null ? '-' : `${baselineDurationDays}d`, delta: formatDeltaDays(diff?.durationDeltaDays ?? null) }
    ];

    return createPortal(
        <div
            ref={popoverRef}
            data-testid="baseline-diff-popover"
            style={{
                position: 'fixed',
                top: resolvedPosition.y,
                left: resolvedPosition.x,
                width: 320,
                boxSizing: 'border-box',
                background: '#fff',
                border: '1px solid rgba(15, 23, 42, 0.12)',
                borderRadius: 12,
                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
                padding: 14,
                zIndex: 10001,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {i18n.t('label_baseline_comparison') || 'Baseline comparison'}
                </div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>#{task.id}</span> {task.subject}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                    {(i18n.t('label_baseline_saved_meta') || 'Saved %{captured_at} by %{captured_by}')
                        .replace('%{captured_at}', baselineCapturedAt)
                        .replace('%{captured_by}', baselineCapturedBy || (i18n.t('label_none') || 'Unknown'))}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                    {(i18n.t('label_baseline_scope') || 'Scope')}: {baselineScope}
                </div>
            </div>

            {!diff ? (
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                    {i18n.t('label_no_baseline_for_task') || 'No baseline data for this task.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {diff.hasDifference ? (
                        <div style={{ fontSize: 12, color: '#b45309', lineHeight: 1.45 }}>
                            {i18n.t('label_baseline_diff_exists') || 'Baseline differs from the current plan.'}
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                            {i18n.t('label_baseline_diff_none') || 'No baseline difference.'}
                        </div>
                    )}
                    {rows.map((row) => (
                        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 52px', gap: 8, fontSize: 12, color: '#334155', lineHeight: 1.35 }}>
                            <div style={{ fontWeight: 600 }}>{row.label}</div>
                            <div style={{ color: '#0f172a' }}>{row.current} / {row.baseline}</div>
                            <div style={{ textAlign: 'right', color: '#b45309', fontWeight: 600 }}>{row.delta}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
};
