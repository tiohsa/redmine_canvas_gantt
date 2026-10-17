import type { Task } from '../types';
import { canvasFonts } from '../styles/designTokens';
import { snapTextPosition } from '../utils/canvasDpr';
import { calendarDateKey } from '../utils/dateOnly';

export const TASK_TITLE_OFFSET = 30;
export const TASK_TITLE_OFFSET_WITH_DATES = 42;
export const TASK_BAR_DATE_GAP = 10;
export const TASK_START_POINT_DATE_GAP = 14;
export const TASK_LABEL_FONT = canvasFonts.body;

export interface TaskTextLabel {
    text: string;
    x: number;
    y: number;
    align: 'left' | 'right';
}

export const getTaskSubjectLabel = (
    subject: string,
    barX: number,
    centerY: number,
    showTaskBarDates: boolean
): TaskTextLabel => ({
    text: subject,
    x: snapTextPosition(barX - (showTaskBarDates ? TASK_TITLE_OFFSET_WITH_DATES : TASK_TITLE_OFFSET)),
    y: snapTextPosition(centerY),
    align: 'right'
});

export const getTaskDateLabels = (
    task: Pick<Task, 'startDate' | 'dueDate'>,
    bar: { x: number; y: number; width: number; height: number },
    dateGap = TASK_BAR_DATE_GAP
): TaskTextLabel[] => {
    const labels: TaskTextLabel[] = [];
    const centerY = snapTextPosition(bar.y + bar.height / 2);
    const formatDate = (timestamp: number) => {
        const [, month, day] = calendarDateKey(timestamp).split('-');
        return `${Number(month)}/${Number(day)}`;
    };

    if (task.startDate !== undefined && Number.isFinite(task.startDate)) {
        labels.push({
            text: formatDate(task.startDate),
            x: snapTextPosition(bar.x - dateGap),
            y: centerY,
            align: 'right'
        });
    }
    if (task.dueDate !== undefined && Number.isFinite(task.dueDate)) {
        labels.push({
            text: formatDate(task.dueDate),
            x: snapTextPosition(bar.x + bar.width + dateGap),
            y: centerY,
            align: 'left'
        });
    }
    return labels;
};

export const drawTaskTextLabel = (
    ctx: CanvasRenderingContext2D,
    label: TaskTextLabel,
    fillStyle: string
) => {
    ctx.font = TASK_LABEL_FONT;
    ctx.fillStyle = fillStyle;
    ctx.textAlign = label.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, label.x, label.y);
};

export const measureTaskTextLabel = (
    ctx: CanvasRenderingContext2D,
    label: TaskTextLabel
): [number, number] => {
    ctx.save();
    ctx.font = TASK_LABEL_FONT;
    ctx.textAlign = label.align;
    let metrics: TextMetrics;
    try {
        metrics = ctx.measureText(label.text);
    } finally {
        ctx.restore();
    }
    const left = Number.isFinite(metrics.actualBoundingBoxLeft)
        ? label.x - metrics.actualBoundingBoxLeft
        : label.align === 'right' ? label.x - metrics.width : label.x;
    const right = Number.isFinite(metrics.actualBoundingBoxRight)
        ? label.x + metrics.actualBoundingBoxRight
        : label.align === 'right' ? label.x : label.x + metrics.width;
    return [Math.min(left, right), Math.max(left, right)];
};
