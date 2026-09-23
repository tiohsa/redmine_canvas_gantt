import type { TaskState } from '../TaskStore';
import type { ScheduleAdjustment, ScheduleMutationChange, ScheduleResolutionContext } from '../../api/client';
import type { Task } from '../../types';
import { taskMutationService } from '../../services/taskMutationService';
import { buildSchedulingEdges, deriveSchedulingStates } from '../../scheduling/constraintGraph';
import { applyLocalPatches, hasLocalMutationIntent, mergeServerEntity, settleLocalPatchFields } from './stateContract';
import { settleBarOperationTaskOwnership } from './barOperations';
import { DatePlacementMode } from '../../types/constraints';
import { i18n } from '../../utils/i18n';

export type ScheduleConflictReview = ScheduleResolutionContext & {
    /** Ownership only. Canonical tasks and draft intent stay in the existing stores. */
    generations: Record<string, number>;
    revisions: Record<string, number>;
    busy?: boolean;
    error?: string;
    stale?: boolean;
    adjustments?: { planKey: string; values: ScheduleAdjustment[] };
};
type Get = () => TaskState;
type Set = (update: (state: TaskState) => Partial<TaskState>) => void;
type Derive = (state: TaskState, tasks: Task[]) => Partial<TaskState>;
const dates = ['startDate', 'dueDate'] as const;
const hasDates = (state: TaskState, id: string) => (state.localTaskPatches[id] ?? [])
    .some(patch => dates.some(field => field in patch.mutationIntent));

export function scheduleConflictIds(state: TaskState, id: string): string[] {
    const ids = new Set([id]);
    const edges = buildSchedulingEdges(state.relations).map(edge => [edge.predecessorId, edge.successorId]);
    state.allTasks.forEach(task => { if (task.parentId) edges.push([task.id, task.parentId]); });
    let size = 0;
    while (size !== ids.size) {
        size = ids.size;
        edges.forEach(([a, b]) => { if (ids.has(a) || ids.has(b)) { ids.add(a); ids.add(b); } });
        [...ids].forEach(key => {
            Object.keys(state.taskConflicts[key]?.scheduleOperation ?? {}).forEach(member => ids.add(member));
            state.taskConflicts[key]?.scheduleReview?.taskIds.forEach(member => ids.add(member));
        });
    }
    const conflicts = [...ids].filter(key => state.taskConflicts[key]);
    return conflicts.some(key => state.taskConflicts[key].scheduleOperation || state.taskConflicts[key].scheduleReview || hasDates(state, key))
        ? conflicts.sort() : [];
}

function intentAt(state: TaskState, id: string, generation: number): Partial<Task> {
    return (state.localTaskPatches[id] ?? []).filter(patch => patch.generation <= generation)
        .reduce<Partial<Task>>((intent, patch) => ({ ...intent, ...patch.mutationIntent }), {});
}

export function scheduleConflictPlan(state: TaskState, review: ScheduleConflictReview) {
    const changes: ScheduleMutationChange[] = [];
    const tasks = review.taskIds.map(id => {
        const task = state.serverTaskSnapshot.entitiesById[id];
        if (!task) return undefined;
        const conflict = state.taskConflicts[id];
        const generation = review.generations[id];
        if (generation === undefined || (conflict && conflict.scheduleChoice !== 'local')) return task;
        const intent = intentAt(state, id, generation);
        const fields = Object.fromEntries(dates.filter(field => field in intent).map(field => [field, intent[field]]));
        if (Object.keys(fields).length) {
            const mode = [...(state.localTaskPatches[id] ?? [])].reverse().find(patch =>
                patch.generation <= generation && dates.some(field => field in patch.mutationIntent))?.mutationContext?.datePlacementMode;
            changes.push({ taskId: id, baseRevision: review.revisions[id],
                ...Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, value ?? null])),
                datePlacementMode: mode ?? DatePlacementMode.WorkingDays });
        }
        return { ...task, ...fields };
    }).filter((task): task is Task => Boolean(task));
    const incomplete = review.taskIds.some(id => state.taskConflicts[id] && !state.taskConflicts[id].scheduleChoice);
    const changed = review.taskIds.some(id => state.serverTaskSnapshot.revisions[id] !== review.revisions[id]);
    const violation = Object.entries(deriveSchedulingStates(tasks, review.relations))
        .find(([id, value]) => {
            if (value.state === 'invalid' || value.state === 'cyclic') return true;
            const task = tasks.find(task => task.id === id);
            // Partially dated tasks are allowed by Redmine. The server checks
            // their applicable bounds; an incomplete interval alone is not a
            // reason to forbid retaining the server version.
            return value.state === 'conflicted' && Number.isFinite(task?.startDate) && Number.isFinite(task?.dueDate);
        });
    const error = review.stale || changed ? (i18n.t('label_conflict_review_again') || 'The reviewed plan changed. Refresh the comparison and select again.') : violation ? `#${violation[0]}: ${violation[1].message}` : undefined;
    const planKey = JSON.stringify(changes.map(({ taskId, baseRevision, startDate, dueDate, datePlacementMode }) =>
        ({ taskId, baseRevision, startDate, dueDate, datePlacementMode })));
    return { changes, tasks, incomplete, error, planKey };
}

export async function prepareScheduleConflict(get: Get, set: Set, id: string): Promise<void> {
    const before = get();
    const conflictIds = scheduleConflictIds(before, id);
    if (!conflictIds.length) return;
    const records = conflictIds.map(key => before.taskConflicts[key]);
    const generations: Record<string, number> = {};
    records.forEach(record => {
        Object.assign(generations, record.scheduleOperation);
        Object.values(before.barOperations).filter(operation => record.generation !== undefined && operation.entityGenerations[record.taskId] === record.generation)
            .forEach(operation => Object.assign(generations, operation.entityGenerations));
        generations[record.taskId] = record.generation ?? before.editGenerations[record.taskId] ?? 0;
    });
    const result = await taskMutationService.scheduleMutation([], { taskIds: Object.keys(generations), preview: true });
    if (records.some(record => get().taskConflicts[record.taskId] !== record) || get().activeReadContext !== before.activeReadContext) return;
    if (result.status !== 'ok' || !result.resolutionContext) throw new Error(result.errors?.join('; ') || (i18n.t('label_conflict_review_again') || 'The reviewed plan changed. Refresh the comparison and select again.'));
    set(state => {
        let snapshot = state.serverTaskSnapshot;
        result.entities.forEach(entity => {
            snapshot = mergeServerEntity(snapshot, { ...snapshot.entitiesById[entity.id], ...entity } as Task,
                'complete', result.revisions[entity.id]);
        });
        const taskConflicts = { ...state.taskConflicts };
        // The server may discover hidden-by-filter intermediaries or conflicts.
        result.resolutionContext!.taskIds.forEach(key => {
            const conflict = taskConflicts[key];
            if (conflict) generations[key] ??= conflict.generation ?? state.editGenerations[key] ?? 0;
        });
        const review: ScheduleConflictReview = { ...result.resolutionContext!, generations, revisions: result.revisions };
        review.taskIds.forEach(key => {
            if (taskConflicts[key]) taskConflicts[key] = { ...taskConflicts[key], scheduleReview: review,
                scheduleChoice: undefined, remoteEntity: snapshot.entitiesById[key], remoteRevision: result.revisions[key], remoteAvailability: 'known' };
        });
        return { serverTaskSnapshot: snapshot, taskConflicts };
    });
}

export async function selectScheduleConflict(get: Get, set: Set, id: string, choice: 'local' | 'remote'): Promise<boolean> {
    if (!scheduleConflictIds(get(), id).length) return false;
    const previous = get().taskConflicts[id];
    if (previous?.scheduleReview?.busy) return true;
    if (!previous?.scheduleReview) {
        await prepareScheduleConflict(get, set, id);
        // A new remote revision needs a new explicit choice after comparison.
        if (previous?.remoteRevision !== get().taskConflicts[id]?.remoteRevision) return true;
    }
    set(state => {
        const record = state.taskConflicts[id];
        if (!record?.scheduleReview || record.scheduleReview.stale) return {};
        const taskConflicts: TaskState['taskConflicts'] = Object.fromEntries(Object.entries(state.taskConflicts).map(([key, value]) => {
            const review = value.scheduleReview;
            return [key, review && review.token === record.scheduleReview?.token
                ? { ...value, scheduleReview: { ...review, adjustments: undefined, error: undefined } } : value];
        }));
        taskConflicts[id] = { ...taskConflicts[id], scheduleChoice: choice };
        return { taskConflicts };
    });
    return true;
}

export async function applyScheduleConflict(get: Get, set: Set, derive: Derive, id: string, acceptAdjustments = false): Promise<void> {
    const before = get();
    const review = before.taskConflicts[id]?.scheduleReview;
    if (!review || review.busy) return;
    const plan = scheduleConflictPlan(before, review);
    if (plan.incomplete || plan.error) return;
    const proposal = review.adjustments?.planKey === plan.planKey ? review.adjustments.values : undefined;
    if (acceptAdjustments ? !proposal?.length : Boolean(proposal?.length)) return;
    const records = review.taskIds.filter(key => before.taskConflicts[key]).map(key => before.taskConflicts[key]);
    const updateReview = (updates: Partial<ScheduleConflictReview>) => set(state => ({ taskConflicts: Object.fromEntries(
        Object.entries(state.taskConflicts).map(([key, record]) => [key, record.scheduleReview?.token === review.token
            ? { ...record, scheduleReview: { ...record.scheduleReview, ...updates } } : record])
    ) }));
    updateReview({ busy: true, error: undefined });
    try {
        const result = await taskMutationService.scheduleMutation(plan.changes, {
            taskIds: Object.keys(review.generations), token: review.token,
            ...(acceptAdjustments && proposal ? { acceptedAdjustments: proposal } : {})
        });
        if (result.status !== 'ok') {
            updateReview({ busy: false, error: result.errors?.join('; ') || i18n.t('label_failed_to_save') || 'Failed to apply the schedule group.',
                stale: result.status === 'conflict',
                adjustments: result.adjustments?.length ? { planKey: plan.planKey, values: result.adjustments } : undefined });
            return;
        }
        set(state => {
            // Do not settle a replaced conflict or another view's drafts.
            if (state.activeReadContext !== before.activeReadContext || records.some(record =>
                state.taskConflicts[record.taskId]?.scheduleReview?.token !== review.token) ||
                review.taskIds.some(key => !before.taskConflicts[key] && state.taskConflicts[key])) return {};
            let snapshot = state.serverTaskSnapshot;
            result.entities.forEach(entity => { snapshot = mergeServerEntity(snapshot,
                { ...snapshot.entitiesById[entity.id], ...entity } as Task, 'complete', result.revisions[entity.id]); });
            const patches = { ...state.localTaskPatches };
            const modified = new Set(state.modifiedTaskIds);
            const conflicts = { ...state.taskConflicts };
            let ownership = { barOperations: state.barOperations, activeBarOperationId: state.activeBarOperationId };
            Object.entries(review.generations).forEach(([key, generation]) => {
                const choice = before.taskConflicts[key]?.scheduleChoice;
                patches[key] = choice === 'remote'
                    ? (patches[key] ?? []).filter(patch => patch.generation > generation)
                    : settleLocalPatchFields(patches[key] ?? [], generation, [...dates]);
                if (!patches[key].length) delete patches[key];
                if (hasLocalMutationIntent(patches[key])) modified.add(key); else modified.delete(key);
                // Non-date intent remains a draft, under the normal save contract.
                delete conflicts[key];
                if (!hasLocalMutationIntent((patches[key] ?? []).filter(patch => patch.generation <= generation))) {
                    ownership = settleBarOperationTaskOwnership(ownership.barOperations, ownership.activeBarOperationId,
                        key, { mode: 'through', generation });
                }
            });
            const tasks = state.allTasks.map(task => applyLocalPatches(snapshot.entitiesById[task.id] ?? task, patches[task.id] ?? []));
            return { ...derive(state, tasks), allTasks: tasks, serverTaskSnapshot: snapshot,
                localTaskPatches: patches, modifiedTaskIds: modified, taskConflicts: conflicts, ...ownership };
        });
    } catch (error) {
        updateReview({ busy: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
        updateReview({ busy: false });
    }
}
