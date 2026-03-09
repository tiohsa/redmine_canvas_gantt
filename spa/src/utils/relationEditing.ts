import type { DraftRelation, Relation, Task } from '../types';
import { RelationType, type DefaultRelationType } from '../types/constraints';
import { i18n } from './i18n';

const DAY_MS = 24 * 60 * 60 * 1000;
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

export const supportsDelayForUiType = (relationType: DefaultRelationType): boolean =>
    relationType === RelationType.Precedes;

export const toEditableRelationView = (relation: Relation | DraftRelation): EditableRelationView => {
    switch (relation.type) {
        case RelationType.Follows:
            return {
                uiType: RelationType.Precedes,
                direction: 'reverse',
                fromId: relation.to,
                toId: relation.from,
                delay: relation.delay
            };
        case RelationType.Blocked:
            return {
                uiType: RelationType.Blocks,
                direction: 'reverse',
                fromId: relation.to,
                toId: relation.from,
                delay: relation.delay
            };
        case RelationType.Blocks:
            return {
                uiType: RelationType.Blocks,
                direction: 'forward',
                fromId: relation.from,
                toId: relation.to,
                delay: relation.delay
            };
        case RelationType.Relates:
            return {
                uiType: RelationType.Relates,
                direction: 'forward',
                fromId: relation.from,
                toId: relation.to,
                delay: relation.delay
            };
        case RelationType.Precedes:
        default:
            return {
                uiType: RelationType.Precedes,
                direction: 'forward',
                fromId: relation.from,
                toId: relation.to,
                delay: relation.delay
            };
    }
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

export const calculateDelay = (
    relationType: string,
    fromTask?: DelayTask,
    toTask?: DelayTask
): { delay?: number; message?: string } => {
    if (!DELAY_ENABLED_RELATIONS.has(relationType)) {
        return {};
    }

    const predecessor = relationType === RelationType.Precedes ? fromTask : toTask;
    const successor = relationType === RelationType.Precedes ? toTask : fromTask;

    if (!predecessor?.dueDate || !successor?.startDate) {
        return {
            message: i18n.t('label_relation_delay_auto_calc_unavailable') || 'No auto calculation due to missing dates.'
        };
    }

    const delay = Math.floor((successor.startDate - predecessor.dueDate) / DAY_MS) - 1;
    if (delay < 0) {
        return {
            message: i18n.t('label_relation_delay_auto_calc_unavailable') || 'No auto calculation due to missing dates.'
        };
    }

    return { delay };
};

export const getRelationInfoText = (relationType: DefaultRelationType): string => {
    switch (relationType) {
        case RelationType.Relates:
            return i18n.t('label_relation_type_relates_info') || 'Creates a reference link only. It does not apply any schedule constraint.';
        case RelationType.Blocks:
            return i18n.t('label_relation_type_blocks_info') || 'The source task blocks the target task until the blocking work is finished.';
        case RelationType.Precedes:
        default:
            return i18n.t('label_relation_type_precedes_info') || 'The predecessor task must finish before the successor task starts.';
    }
};

export const getRelationTypeLabel = (relationType: DefaultRelationType): string => {
    switch (relationType) {
        case RelationType.Relates:
            return i18n.t('label_relation_type_relates') || 'Relates';
        case RelationType.Blocks:
            return i18n.t('label_relation_type_blocks') || 'Blocks';
        case RelationType.Precedes:
        default:
            return i18n.t('label_relation_type_precedes') || 'Precedes';
    }
};
