import type { Relation, Task } from '../../types';
import { RelationType } from '../../types/constraints';
import { addWorkingDays } from '../../utils/businessCalendar';
import { timelineToCalendarDate } from '../../utils/dateOnly';
import { detectConstraintCycleTaskIds } from '../../scheduling/constraintGraph';
import { i18n } from '../../utils/i18n';
import { validateRelationDelayConsistency } from '../../utils/relationEditing';

export type RelationSnapshot = Pick<Relation, 'id' | 'from' | 'to' | 'type' | 'delay'>;
export type RelationTarget = Omit<RelationSnapshot, 'id'>;
export type RelationChangeStatus = 'pending' | 'saving' | 'failed' | 'unknown';

export type PendingRelationChange = {
    draftId: string;
    operation: 'create' | 'update' | 'delete';
    relationId?: string;
    original?: RelationSnapshot;
    desired?: RelationTarget;
    generation: number;
    status: RelationChangeStatus;
    error?: string;
};

export type RelationDraftMap = Record<string, PendingRelationChange>;

let localRelationSequence = 0;

const snapshotRelation = (relation: Relation): RelationSnapshot => ({
    id: relation.id,
    from: relation.from,
    to: relation.to,
    type: relation.type,
    ...(relation.delay === undefined ? {} : { delay: relation.delay })
});

const relationTarget = (relation: Relation | RelationTarget): RelationTarget => ({
    from: relation.from,
    to: relation.to,
    type: relation.type,
    ...(relation.delay === undefined ? {} : { delay: relation.delay })
});

const sameTarget = (left: RelationTarget | undefined, right: RelationTarget | undefined): boolean => (
    left?.from === right?.from &&
    left?.to === right?.to &&
    left?.type === right?.type &&
    (left?.delay ?? 0) === (right?.delay ?? 0)
);

const relationDuplicateKey = (relation: Pick<Relation, 'from' | 'to' | 'type'>): string => {
    if (relation.type === RelationType.Precedes) return `dependency:${relation.from}>${relation.to}`;
    if (relation.type === RelationType.Follows) return `dependency:${relation.to}>${relation.from}`;
    if (relation.type === RelationType.Blocks) return `block:${relation.from}>${relation.to}`;
    if (relation.type === RelationType.Blocked) return `block:${relation.to}>${relation.from}`;
    if (relation.type === RelationType.Relates) return `relates:${[relation.from, relation.to].sort().join(':')}`;
    if (relation.type === RelationType.Duplicates) return `duplicate:${relation.from}>${relation.to}`;
    if (relation.type === RelationType.Duplicated) return `duplicate:${relation.to}>${relation.from}`;
    if (relation.type === RelationType.CopiedTo) return `copy:${relation.from}>${relation.to}`;
    if (relation.type === RelationType.CopiedFrom) return `copy:${relation.to}>${relation.from}`;
    return `${relation.type}:${relation.from}>${relation.to}`;
};

export const getPendingRelationChange = (changes: RelationDraftMap, relationId: string): PendingRelationChange | undefined => {
    if (relationId.startsWith('local:')) return changes[relationId.slice('local:'.length)];
    return Object.values(changes).find(change => change.relationId === relationId);
};

export const normalizeRelationCreate = (
    changes: RelationDraftMap,
    serverRelations: Relation[],
    target: RelationTarget,
    generation: number
): RelationDraftMap => {
    const existingRelation = serverRelations.find(relation => (
        relation.from === target.from && relation.to === target.to && relation.type === target.type
    ));
    if (existingRelation) {
        const pending = getPendingRelationChange(changes, existingRelation.id);
        if (pending?.operation === 'delete' && pending.status !== 'saving' && pending.status !== 'unknown') {
            if (sameTarget(relationTarget(existingRelation), target)) {
                const next = { ...changes };
                delete next[pending.draftId];
                return next;
            }
            return normalizeRelationUpdate(changes, serverRelations, existingRelation.id, target, generation);
        }
        return changes;
    }

    const deletedExisting = Object.values(changes).find(change => (
        change.operation === 'delete' && change.original &&
        change.original.from === target.from && change.original.to === target.to && change.original.type === target.type &&
        change.status !== 'saving' && change.status !== 'unknown'
    ));
    if (deletedExisting) {
        const next = { ...changes };
        delete next[deletedExisting.draftId];
        return next;
    }

    const duplicate = Object.values(changes).find(change => change.operation === 'create' && sameTarget(change.desired, target));
    if (duplicate) return changes;

    const draftId = `relation-${++localRelationSequence}`;
    return {
        ...changes,
        [draftId]: { draftId, operation: 'create', desired: relationTarget(target), generation, status: 'pending' }
    };
};

export const normalizeRelationUpdate = (
    changes: RelationDraftMap,
    serverRelations: Relation[],
    relationId: string,
    target: RelationTarget,
    generation: number
): RelationDraftMap => {
    const current = getPendingRelationChange(changes, relationId);
    if (current?.status === 'unknown' || current?.status === 'saving') return changes;

    if (current?.operation === 'create') {
        const next = { ...changes };
        if (sameTarget(current.desired, target)) return changes;
        if (Object.values(next).some(change => change.draftId !== current.draftId && change.operation === 'create' && sameTarget(change.desired, target))) {
            return changes;
        }
        next[current.draftId] = { ...current, desired: relationTarget(target), generation, status: 'pending', error: undefined };
        return next;
    }

    const original = current?.original ?? serverRelations.find(relation => relation.id === relationId);
    if (!original) return changes;
    if (current?.operation === 'delete') {
        // Editing a relation already marked for deletion cancels that deletion,
        // then applies the requested value against the server snapshot.
    }
    const originalSnapshot = current?.original ?? snapshotRelation(original);
    if (sameTarget(relationTarget(originalSnapshot), target)) {
        const next = { ...changes };
        delete next[current?.draftId ?? relationId];
        return next;
    }

    const draftId = current?.draftId ?? `relation:${relationId}`;
    return {
        ...changes,
        [draftId]: {
            draftId,
            operation: 'update',
            relationId,
            original: originalSnapshot,
            desired: relationTarget(target),
            generation,
            status: 'pending'
        }
    };
};

export const normalizeRelationDelete = (
    changes: RelationDraftMap,
    serverRelations: Relation[],
    relationId: string,
    generation: number
): RelationDraftMap => {
    const current = getPendingRelationChange(changes, relationId);
    if (!current && relationId.startsWith('local:')) return changes;
    if (current?.status === 'unknown' || current?.status === 'saving') return changes;
    if (current?.operation === 'create') {
        const next = { ...changes };
        delete next[current.draftId];
        return next;
    }
    const relation = current?.original ?? serverRelations.find(candidate => candidate.id === relationId);
    if (!relation) return changes;
    const draftId = current?.draftId ?? `relation:${relationId}`;
    return {
        ...changes,
        [draftId]: {
            draftId,
            operation: 'delete',
            relationId,
            original: current?.original ?? snapshotRelation(relation),
            generation,
            status: 'pending'
        }
    };
};

export const projectEffectiveRelations = (relations: Relation[], changes: RelationDraftMap): Relation[] => {
    const byId = new Map(relations.map(relation => [relation.id, relation]));
    for (const change of Object.values(changes).sort((a, b) => a.generation - b.generation)) {
        if (change.operation === 'delete' && change.relationId) {
            if (change.status === 'unknown') {
                const original = change.original;
                if (original) byId.set(change.relationId, { ...original });
            } else {
                byId.delete(change.relationId);
            }
        } else if (change.operation === 'update' && change.relationId && change.desired) {
            byId.set(change.relationId, { id: change.relationId, ...change.desired });
        } else if (change.operation === 'create' && change.desired) {
            byId.set(`local:${change.draftId}`, { id: `local:${change.draftId}`, ...change.desired });
        }
    }
    return [...byId.values()];
};

export const orderedRelationChanges = (changes: RelationDraftMap): PendingRelationChange[] => (
    Object.values(changes)
        .filter(change => change.status === 'pending' || change.status === 'failed')
        .sort((left, right) => {
            const order = { delete: 0, update: 1, create: 2 };
            return order[left.operation] - order[right.operation] || left.draftId.localeCompare(right.draftId);
        })
);

export const countPendingRelationChanges = (changes: RelationDraftMap): number => Object.keys(changes).length;

export const hasPendingRelationChanges = (changes: RelationDraftMap): boolean => Object.keys(changes).length > 0;

export const relationChangeTarget = relationTarget;

export type RelationDraftValidationResult = { draftId: string; error: string } | null;

export const validateRelationDrafts = (
    tasks: Task[],
    serverRelations: Relation[],
    changes: RelationDraftMap,
    mutationFields: Record<string, Partial<Task> | Record<string, unknown>> = {},
    allowedProjectIds?: ReadonlySet<string>
): RelationDraftValidationResult => {
    const unknown = Object.values(changes).find(change => change.status === 'unknown');
    if (unknown) {
        return { draftId: unknown.draftId, error: i18n.t('label_relation_result_unknown') || 'label_relation_result_unknown' };
    }
    const effectiveRelations = projectEffectiveRelations(serverRelations, changes);
    const taskById = new Map(tasks.map(task => [task.id, task]));
    for (const change of orderedRelationChanges(changes)) {
        const target = change.desired ?? change.original;
        if (!target || !taskById.has(target.from) || !taskById.has(target.to)) {
            return { draftId: change.draftId, error: i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked' };
        }
        const fromTask = taskById.get(target.from)!;
        const toTask = taskById.get(target.to)!;
        if (!fromTask.editable || !toTask.editable) {
            return { draftId: change.draftId, error: i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked' };
        }
        if (allowedProjectIds) {
            const fromProjectId = taskById.get(target.from)?.projectId;
            const toProjectId = taskById.get(target.to)?.projectId;
            if (!fromProjectId || !toProjectId || !allowedProjectIds.has(fromProjectId) || !allowedProjectIds.has(toProjectId)) {
                return { draftId: change.draftId, error: i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked' };
            }
        }
        if (target.from === target.to) {
            return { draftId: change.draftId, error: i18n.t('label_relation_save_blocked') || 'label_relation_save_blocked' };
        }
        if (change.desired) {
            const implicitZeroDelay = change.desired.type === RelationType.Precedes || change.desired.type === RelationType.Follows
                ? 0
                : undefined;
            if (change.desired.type === RelationType.Precedes || change.desired.type === RelationType.Follows) {
                const predecessor = change.desired.type === RelationType.Precedes ? fromTask : toTask;
                const successor = change.desired.type === RelationType.Precedes ? toTask : fromTask;
                const boundary = Number.isFinite(predecessor.dueDate) ? predecessor.dueDate : predecessor.startDate;
                if (typeof boundary === 'number' && Number.isFinite(successor.startDate)) {
                    const requiredStart = addWorkingDays(boundary, 1 + (change.desired.delay ?? 0), successor.projectId);
                    if (timelineToCalendarDate(successor.startDate!) < requiredStart) {
                        return { draftId: change.draftId, error: i18n.t('label_relation_delay_mismatch') || 'label_relation_delay_mismatch' };
                    }
                }
            }
            const delayValidation = validateRelationDelayConsistency(change.desired.type, change.desired.delay ?? implicitZeroDelay, fromTask, toTask);
            if (!delayValidation.valid) return { draftId: change.draftId, error: delayValidation.message };
        }
    }

    const duplicate = new Map<string, Relation>();
    for (const relation of effectiveRelations) {
        const key = relationDuplicateKey(relation);
        if (duplicate.has(key)) {
            const change = Object.values(changes).find(candidate => candidate.desired &&
                candidate.desired.from === relation.from && candidate.desired.to === relation.to && candidate.desired.type === relation.type);
            return { draftId: change?.draftId ?? 'relation', error: i18n.t('label_relation_already_exists') || 'label_relation_already_exists' };
        }
        duplicate.set(key, relation);
    }

    const cyclicTaskIds = detectConstraintCycleTaskIds(effectiveRelations);
    if (cyclicTaskIds.size > 0) {
        const change = orderedRelationChanges(changes).find(candidate => {
            const target = candidate.desired;
            return target && cyclicTaskIds.has(target.from) && cyclicTaskIds.has(target.to);
        });
        return { draftId: change?.draftId ?? 'relation', error: i18n.t('label_scheduling_state_cyclic') || 'label_scheduling_state_cyclic' };
    }

    let orderedGraph = [...serverRelations];
    for (const change of orderedRelationChanges(changes)) {
        if (change.operation === 'delete' && change.relationId) {
            orderedGraph = orderedGraph.filter(relation => relation.id !== change.relationId);
        } else if (change.operation === 'update' && change.relationId && change.desired) {
            orderedGraph = orderedGraph.map(relation => relation.id === change.relationId
                ? { id: relation.id, ...change.desired! }
                : relation);
        } else if (change.operation === 'create' && change.desired) {
            orderedGraph.push({ id: `local:${change.draftId}`, ...change.desired });
        }
        const cycle = detectConstraintCycleTaskIds(orderedGraph);
        if (cycle.size > 0) {
            return { draftId: change.draftId, error: i18n.t('label_scheduling_state_cyclic') || 'label_scheduling_state_cyclic' };
        }
        const graphKeys = new Set<string>();
        for (const relation of orderedGraph) {
            const key = relationDuplicateKey(relation);
            if (graphKeys.has(key)) return { draftId: change.draftId, error: i18n.t('label_relation_already_exists') || 'label_relation_already_exists' };
            graphKeys.add(key);
        }
    }

    // A sequential task save cannot first remove a dependency that currently
    // rejects the desired successor date. Such changes need one server-side
    // transaction across task and relation resources, which is not available.
    const removedRelationIds = new Set(Object.values(changes)
        .filter(change => change.operation === 'delete' || (change.operation === 'update' && change.original && change.desired && (
            change.original.from !== change.desired.from || change.original.to !== change.desired.to ||
            change.original.type !== change.desired.type || change.original.delay !== change.desired.delay
        )))
        .map(change => change.relationId)
        .filter((id): id is string => Boolean(id)));
    const relevantRemoved = serverRelations.filter(relation => removedRelationIds.has(relation.id));
    for (const relation of relevantRemoved) {
        let predecessorId: string;
        let successorId: string;
        if (relation.type === RelationType.Precedes) {
            predecessorId = relation.from;
            successorId = relation.to;
        } else if (relation.type === RelationType.Follows) {
            predecessorId = relation.to;
            successorId = relation.from;
        } else {
            continue;
        }
        const successorFields = mutationFields[successorId] ?? {};
        const predecessorFields = mutationFields[predecessorId] ?? {};
        const successorStartChanged = Object.prototype.hasOwnProperty.call(successorFields, 'startDate') || Object.prototype.hasOwnProperty.call(successorFields, 'start_date');
        const predecessorDueChanged = Object.prototype.hasOwnProperty.call(predecessorFields, 'dueDate') || Object.prototype.hasOwnProperty.call(predecessorFields, 'due_date');
        if (!successorStartChanged && !predecessorDueChanged) continue;
        const predecessor = taskById.get(predecessorId);
        const successor = taskById.get(successorId);
        if (!predecessor || !successor || typeof predecessor.dueDate !== 'number' || typeof successor.startDate !== 'number') continue;
        const requiredStart = addWorkingDays(predecessor.dueDate, 1 + (relation.delay ?? 0), successor.projectId);
        if (successor.startDate < requiredStart) {
            const change = Object.values(changes).find(candidate => candidate.relationId === relation.id);
            return { draftId: change?.draftId ?? 'relation', error: i18n.t('label_relation_combined_change_unsupported') || 'label_relation_combined_change_unsupported' };
        }
    }

    return null;
};

