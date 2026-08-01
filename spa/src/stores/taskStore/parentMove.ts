import type { LayoutRow, MoveTaskAsChildResult, Task } from '../../types';
import { buildMoveTaskResult, createTaskLayoutSnapshot } from './taskPersistence';
import { i18n } from '../../utils/i18n';
import type { LayoutState } from './types';
import type { TaskLayoutSnapshot } from './types';
import type { MutationStatus } from '../../api/client';
import type { LocalPatch, ServerSnapshot } from './stateContract';

type UpdateTaskFieldsResult = {
    status: MutationStatus;
    error?: string;
    lockVersion?: number;
    parentId?: string;
};

type ParentMoveState = LayoutState & {
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
    modifiedTaskIds: Set<string>;
    editGenerations: Record<string, number>;
    autoSave: boolean;
    localTaskPatches: Record<string, Array<LocalPatch<Task>>>;
    serverTaskSnapshot: ServerSnapshot<Task>;
};

type ParentMovePatch = Partial<Pick<ParentMoveState, 'allTasks' | 'tasks' | 'layoutRows' | 'rowCount' | 'modifiedTaskIds' | 'editGenerations' | 'localTaskPatches' | 'serverTaskSnapshot'>>;

type ParentMoveCallbacks = {
    sourceTaskId: string;
    expectedParentId: string | undefined;
    getState: () => ParentMoveState;
    setState: (patch: ParentMovePatch) => void;
    restoreSnapshot: (snapshot: TaskLayoutSnapshot) => void;
    buildNextOrder: (allTasks: Task[], sourceBefore: Task) => number;
    buildNextAllTasks: (allTasks: Task[], sourceTaskId: string, nextOrder: number) => Task[];
    buildOptimisticPatch: (state: ParentMoveState, nextAllTasks: Task[]) => ParentMovePatch;
    buildSuccessPatch: (state: ParentMoveState, sourceBefore: Task, result: UpdateTaskFieldsResult, operationGeneration: number) => ParentMovePatch;
    isCurrentOperation: (state: ParentMoveState, sourceBefore: Task, operationGeneration: number) => boolean;
    updateTaskFields: (taskId: string, payload: { parent_issue_id: string | null; lock_version: number }) => Promise<UpdateTaskFieldsResult>;
    validatePersistedResult: (result: UpdateTaskFieldsResult, expectedParentId: string | undefined) => boolean;
    missingSourceResult: MoveTaskAsChildResult;
    failedResult: (error?: string) => MoveTaskAsChildResult;
    onConflict?: (taskId: string, message: string) => void;
};

export const runParentMove = async (callbacks: ParentMoveCallbacks): Promise<MoveTaskAsChildResult> => {
    const {
        sourceTaskId,
        expectedParentId,
        getState,
        setState,
        restoreSnapshot,
        buildNextOrder,
        buildNextAllTasks,
        buildOptimisticPatch,
        buildSuccessPatch,
        isCurrentOperation,
        updateTaskFields,
        validatePersistedResult,
        missingSourceResult,
        failedResult,
        onConflict
    } = callbacks;

    const beforeState = getState();
    const snapshot = createTaskLayoutSnapshot(beforeState);
    const sourceBefore = beforeState.allTasks.find((task) => task.id === sourceTaskId);

    if (!sourceBefore) {
        return missingSourceResult;
    }

    const nextOrder = buildNextOrder(beforeState.allTasks, sourceBefore);
    const nextAllTasks = buildNextAllTasks(beforeState.allTasks, sourceTaskId, nextOrder);
    const operationGeneration = (beforeState.editGenerations[sourceTaskId] ?? 0) + 1;

    setState(buildOptimisticPatch(beforeState, nextAllTasks));

    if (!beforeState.autoSave) {
        const nextModified = new Set(beforeState.modifiedTaskIds);
        nextModified.add(sourceTaskId);
        setState({ modifiedTaskIds: nextModified });
        return buildMoveTaskResult('ok', {
            lockVersion: sourceBefore.lockVersion,
            parentId: expectedParentId
        });
    }

    let result: UpdateTaskFieldsResult;
    try {
        result = await updateTaskFields(sourceTaskId, {
            parent_issue_id: expectedParentId ?? null,
            lock_version: sourceBefore.lockVersion
        });
    } catch (error) {
        if (isCurrentOperation(getState(), sourceBefore, operationGeneration)) restoreSnapshot(snapshot);
        return failedResult(error instanceof Error ? error.message : undefined);
    }

    if (result.status !== 'ok' || !validatePersistedResult(result, expectedParentId)) {
        if (result.status === 'conflict') onConflict?.(sourceTaskId, result.error || (i18n.t('label_parent_drop_conflict') || 'Task was updated by another user'));
        if (isCurrentOperation(getState(), sourceBefore, operationGeneration)) restoreSnapshot(snapshot);
        return buildMoveTaskResult(result.status === 'conflict' ? 'conflict' : 'error', {
            error: result.error || (failedResult().error ?? (i18n.t('label_failed_to_update_parent') || 'Failed to update parent'))
        });
    }

    const currentState = getState();
    // The response still advances the server revision even when a newer
    // optimistic parent move is already visible. buildSuccessPatch preserves
    // that newer local patch and commits only the matching operation.
    setState(buildSuccessPatch(currentState, sourceBefore, result, operationGeneration));

    return buildMoveTaskResult('ok', {
        lockVersion: result.lockVersion,
        parentId: expectedParentId
    });
};
