import type { DraftRelation, Relation, Task } from '../types';
import { RelationType, type DefaultRelationType } from '../types/constraints';
import { i18n } from './i18n';

const DELAY_ENABLED_RELATIONS: ReadonlySet<string> = new Set([RelationType.Precedes, RelationType.Follows]);

export type RelationDirection = 'forward' | 'reverse';

export type EditableRelationView = {
    uiType: DefaultRelationType;
    direction: RelationDirection;
    fromId: string;
    toId: string;
    delay?: number;
};

type DelayTask = Pick<Task, 'startDate' | 'dueDate'>;
type DelayConsistencyResult = { valid: true } | { valid: false; message: string };
type DelayEndpoints = {
    predecessor?: DelayTask;
    successor?: DelayTask;
};

const DEFAULT_EDITABLE_RELATION_CONFIG = {
    uiType: RelationType.Precedes,
    direction: 'forward'
} as const satisfies Pick<EditableRelationView, 'uiType' | 'direction'>;

const EDITABLE_RELATION_CONFIG = {
    [RelationType.Follows]: {
        uiType: RelationType.Precedes,
        direction: 'reverse'
    },
    [RelationType.Blocked]: {
        uiType: RelationType.Blocks,
        direction: 'reverse'
    },
    [RelationType.Blocks]: {
        uiType: RelationType.Blocks,
        direction: 'forward'
    },
    [RelationType.Relates]: {
        uiType: RelationType.Relates,
        direction: 'forward'
    },
    [RelationType.Precedes]: DEFAULT_EDITABLE_RELATION_CONFIG
} as const satisfies Partial<Record<Relation['type'], Pick<EditableRelationView, 'uiType' | 'direction'>>>;

const RELATION_TYPE_LABEL_KEYS: Record<DefaultRelationType, string> = {
    [RelationType.Precedes]: 'label_relation_type_precedes',
    [RelationType.Relates]: 'label_relation_type_relates',
    [RelationType.Blocks]: 'label_relation_type_blocks'
};

const RELATION_TYPE_LABEL_FALLBACKS: Record<DefaultRelationType, string> = {
    [RelationType.Precedes]: 'Precedes',
    [RelationType.Relates]: 'Relates',
    [RelationType.Blocks]: 'Blocks'
};

const RELATION_INFO_KEYS: Record<DefaultRelationType, string> = {
    [RelationType.Precedes]: 'label_relation_type_precedes_info',
    [RelationType.Relates]: 'label_relation_type_relates_info',
    [RelationType.Blocks]: 'label_relation_type_blocks_info'
};

const RELATION_INFO_FALLBACKS: Record<DefaultRelationType, string> = {
    [RelationType.Precedes]: 'The predecessor task must finish before the successor task starts.',
    [RelationType.Relates]: 'Creates a reference link only. It does not apply any schedule constraint.',
    [RelationType.Blocks]: 'The source task blocks the target task until the blocking work is finished.'
};

const getNonWorkingWeekDays = (): Set<number> => {
    const fallback = new Set<number>([0, 6]);
    if (typeof window === 'undefined') return fallback;

    const raw = window.RedmineCanvasGantt?.nonWorkingWeekDays;
    if (!Array.isArray(raw)) return fallback;

    const normalized = raw
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    return normalized.length > 0 ? new Set(normalized) : fallback;
};

const toUtcDayStart = (timestamp: number): Date => {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

const addWorkingDays = (timestamp: number, days: number, nonWorkingWeekDays: Set<number>): number => {
    const date = toUtcDayStart(timestamp);
    let remaining = Math.max(0, Math.floor(days));

    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (!nonWorkingWeekDays.has(date.getUTCDay())) {
            remaining -= 1;
        }
    }

    return date.getTime();
};

const countWorkingDaysBetween = (startTimestamp: number, endTimestamp: number, nonWorkingWeekDays: Set<number>): number => {
    const cursor = toUtcDayStart(startTimestamp);
    const end = toUtcDayStart(endTimestamp).getTime();
    let count = 0;

    while (cursor.getTime() < end) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        if (!nonWorkingWeekDays.has(cursor.getUTCDay())) {
            count += 1;
        }
    }

    return count;
};

export const supportsDelayForUiType = (relationType: DefaultRelationType): boolean =>
    relationType === RelationType.Precedes;

const resolveEditableRelationConfig = (
    relationType: Relation['type'] | DraftRelation['type']
): Pick<EditableRelationView, 'uiType' | 'direction'> =>
    EDITABLE_RELATION_CONFIG[relationType] ?? DEFAULT_EDITABLE_RELATION_CONFIG;

const isReverseDirection = (direction: RelationDirection): boolean => direction === 'reverse';

export const toEditableRelationView = (relation: Relation | DraftRelation): EditableRelationView => {
    const config = resolveEditableRelationConfig(relation.type);
    const fromId = isReverseDirection(config.direction) ? relation.to : relation.from;
    const toId = isReverseDirection(config.direction) ? relation.from : relation.to;

    return {
        ...config,
        fromId,
        toId,
        delay: relation.delay
    };
};

export const toRawRelationType = (uiType: DefaultRelationType, direction: RelationDirection): Relation['type'] => {
    if (uiType === RelationType.Precedes) {
        return direction === 'reverse' ? RelationType.Follows : RelationType.Precedes;
    }

    if (uiType === RelationType.Blocks) {
        return direction === 'reverse' ? RelationType.Blocked : RelationType.Blocks;
    }

    return RelationType.Relates;
};

const resolveDelayEndpoints = (
    relationType: string,
    fromTask?: DelayTask,
    toTask?: DelayTask
): DelayEndpoints =>
    relationType === RelationType.Precedes
        ? { predecessor: fromTask, successor: toTask }
        : { predecessor: toTask, successor: fromTask };

const hasFiniteDelayBoundaryDates = (endpoints: DelayEndpoints): endpoints is {
    predecessor: DelayTask & { dueDate: number };
    successor: DelayTask & { startDate: number };
} =>
    endpoints.predecessor?.dueDate !== undefined &&
    Number.isFinite(endpoints.predecessor.dueDate) &&
    endpoints.successor?.startDate !== undefined &&
    Number.isFinite(endpoints.successor.startDate);

const getAutoCalculationUnavailableMessage = (): string =>
    i18n.t('label_relation_delay_auto_calc_unavailable') || 'No auto calculation due to missing dates.';

const getDelayMismatchMessage = (): string =>
    i18n.t('label_relation_delay_mismatch') || 'Delay does not match the current task dates.';

export const calculateDelay = (
    relationType: string,
    fromTask?: DelayTask,
    toTask?: DelayTask
): { delay?: number; message?: string } => {
    if (!DELAY_ENABLED_RELATIONS.has(relationType)) {
        return {};
    }

    const endpoints = resolveDelayEndpoints(relationType, fromTask, toTask);
    if (!hasFiniteDelayBoundaryDates(endpoints)) {
        return {
            message: getAutoCalculationUnavailableMessage()
        };
    }

    const nonWorkingWeekDays = getNonWorkingWeekDays();
    const minimumSuccessorStart = addWorkingDays(endpoints.predecessor.dueDate, 1, nonWorkingWeekDays);
    if (toUtcDayStart(endpoints.successor.startDate).getTime() < minimumSuccessorStart) {
        return {
            message: getAutoCalculationUnavailableMessage()
        };
    }

    const delay = countWorkingDaysBetween(
        endpoints.predecessor.dueDate,
        endpoints.successor.startDate,
        nonWorkingWeekDays
    ) - 1;
    return { delay };
};

export const validateRelationDelayConsistency = (
    relationType: string,
    delay: number | undefined,
    fromTask?: DelayTask,
    toTask?: DelayTask
): DelayConsistencyResult => {
    if (!DELAY_ENABLED_RELATIONS.has(relationType) || typeof delay !== 'number') {
        return { valid: true };
    }

    const endpoints = resolveDelayEndpoints(relationType, fromTask, toTask);
    if (!hasFiniteDelayBoundaryDates(endpoints)) {
        return { valid: true };
    }

    const nonWorkingWeekDays = getNonWorkingWeekDays();
    const minimumSuccessorStart = addWorkingDays(endpoints.predecessor.dueDate, 1 + delay, nonWorkingWeekDays);
    if (toUtcDayStart(endpoints.successor.startDate).getTime() >= minimumSuccessorStart) {
        return { valid: true };
    }

    return {
        valid: false,
        message: getDelayMismatchMessage()
    };
};

export const getRelationInfoText = (relationType: DefaultRelationType): string => {
    return i18n.t(RELATION_INFO_KEYS[relationType]) || RELATION_INFO_FALLBACKS[relationType];
};

export const getRelationTypeLabel = (relationType: DefaultRelationType): string => {
    return i18n.t(RELATION_TYPE_LABEL_KEYS[relationType]) || RELATION_TYPE_LABEL_FALLBACKS[relationType];
};
