import type { LayoutRow, MoveTaskAsChildResult, PersistedTaskState, Task } from '../../types';
import { buildMoveTaskResult, createTaskLayoutSnapshot, type MutationLifecycle } from './taskPersistence';
import { i18n } from '../../utils/i18n';
import type { LayoutState } from './types';
import type { TaskLayoutSnapshot } from './types';
import type { MutationMetadata, MutationStatus } from '../../api/client';
import type { LocalPatch, ServerSnapshot } from './stateContract';
import { classifyMutationError, classifyMutationResult } from '../../api/mutationOutcome';

type UpdateTaskFieldsResult = MutationMetadata & {
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
    rollbackOperation?: (operationGeneration: number, sourceBefore: Task) => void;
    buildNextOrder: (allTasks: Task[], sourceBefore: Task) => number;
    buildNextAllTasks: (allTasks: Task[], sourceTaskId: string, nextOrder: number) => Task[];
    buildOptimisticPatch: (state: ParentMoveState, nextAllTasks: Task[]) => ParentMovePatch;
    buildSuccessPatch: (state: ParentMoveState, sourceBefore: Task, result: UpdateTaskFieldsResult, operationGeneration: number) => ParentMovePatch;
    isCurrentOperation: (state: ParentMoveState, sourceBefore: Task, operationGeneration: number) => boolean;
    updateTaskFields: (
        taskId: string,
        payload: () => { parent_issue_id: string | null; lock_version: number },
        lifecycle?: MutationLifecycle<UpdateTaskFieldsResult>
    ) => Promise<UpdateTaskFieldsResult>;
    validatePersistedResult: (result: UpdateTaskFieldsResult, expectedParentId: string | undefined) => boolean;
    missingSourceResult: MoveTaskAsChildResult;
    failedResult: (error?: string) => MoveTaskAsChildResult;
    onConflict?: (taskId: string, message: string, operationGeneration: number, remoteEntity?: PersistedTaskState, remoteRevision?: number) => void;
    onNotFound?: (taskId: string, operationGeneration: number, operationId?: string) => void;
    onMutationMetadata?: (taskId: string, metadata: MutationMetadata) => void;
};

export const runParentMove = async (callbacks: ParentMoveCallbacks): Promise<MoveTaskAsChildResult> => {
    const {
        sourceTaskId,
        expectedParentId,
        getState,
        setState,
        restoreSnapshot,
        rollbackOperation,
        buildNextOrder,
        buildNextAllTasks,
        buildOptimisticPatch,
        buildSuccessPatch,
        isCurrentOperation,
        updateTaskFields,
        validatePersistedResult,
        missingSourceResult,
        failedResult,
        onConflict,
        onNotFound,
        onMutationMetadata
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
        return buildMoveTaskResult('ok', {
            lockVersion: sourceBefore.lockVersion,
            parentId: expectedParentId
        });
    }

    let result: UpdateTaskFieldsResult;
    const lifecycle: MutationLifecycle<UpdateTaskFieldsResult> = {
        onResult: (completedResult, context) => {
            if (completedResult.status === 'ok' && validatePersistedResult(completedResult, expectedParentId)) {
                setState(buildSuccessPatch(getState(), sourceBefore, completedResult, operationGeneration));
                onMutationMetadata?.(sourceTaskId, completedResult);
                return;
            }

            if (completedResult.status === 'conflict') {
                onConflict?.(
                    sourceTaskId,
                    completedResult.error || (i18n.t('label_parent_drop_conflict') || 'Task was updated by another user'),
                    operationGeneration,
                    completedResult.entity,
                    completedResult.revision ?? completedResult.entity?.lockVersion
                );
                return;
            }
            if (completedResult.status === 'not_found') {
                onNotFound?.(sourceTaskId, operationGeneration, context.operationId);
                return;
            }
            if (classifyMutationResult(completedResult).kind === 'transient') return;
            if (isCurrentOperation(getState(), sourceBefore, operationGeneration)) {
                rollbackOperation?.(operationGeneration, sourceBefore);
                if (!rollbackOperation) restoreSnapshot(snapshot);
            }
        },
        onError: (error, context) => {
            if (classifyMutationError(error).status === 'not_found') {
                onNotFound?.(sourceTaskId, operationGeneration, context.operationId);
                return;
            }
            if (classifyMutationError(error).kind === 'transient') return;
            if (isCurrentOperation(getState(), sourceBefore, operationGeneration)) {
                rollbackOperation?.(operationGeneration, sourceBefore);
                if (!rollbackOperation) restoreSnapshot(snapshot);
            }
        }
    };
    try {
        result = await updateTaskFields(
            sourceTaskId,
            () => ({
                parent_issue_id: expectedParentId ?? null,
                lock_version: getState().allTasks.find(task => task.id === sourceTaskId)?.lockVersion ?? sourceBefore.lockVersion
            }),
            lifecycle
        );
    } catch (error) {
        return failedResult(error instanceof Error ? error.message : undefined);
    }

    if (result.status !== 'ok' || !validatePersistedResult(result, expectedParentId)) {
        return buildMoveTaskResult(result.status === 'conflict' ? 'conflict' : 'error', {
            error: result.error || (failedResult().error ?? (i18n.t('label_failed_to_update_parent') || 'Failed to update parent'))
        });
    }

    return buildMoveTaskResult('ok', {
        lockVersion: result.lockVersion,
        parentId: expectedParentId
    });
};
