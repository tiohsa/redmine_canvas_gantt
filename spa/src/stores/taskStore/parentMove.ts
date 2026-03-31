import type { LayoutRow, MoveTaskAsChildResult, Task } from '../../types';
import { buildMoveTaskResult, createTaskLayoutSnapshot } from './taskPersistence';
import type { LayoutState } from './types';
import type { TaskLayoutSnapshot } from './types';

type UpdateTaskFieldsResult = {
    status: 'ok' | 'conflict' | 'error';
    error?: string;
    lockVersion?: number;
    parentId?: string;
};

type ParentMoveState = LayoutState & {
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
    modifiedTaskIds: Set<string>;
    autoSave: boolean;
};

type ParentMovePatch = Partial<Pick<ParentMoveState, 'allTasks' | 'tasks' | 'layoutRows' | 'rowCount' | 'modifiedTaskIds'>>;

type ParentMoveCallbacks = {
    sourceTaskId: string;
    expectedParentId: string | undefined;
    getState: () => ParentMoveState;
    setState: (patch: ParentMovePatch) => void;
    restoreSnapshot: (snapshot: TaskLayoutSnapshot) => void;
    buildNextOrder: (allTasks: Task[], sourceBefore: Task) => number;
    buildNextAllTasks: (allTasks: Task[], sourceTaskId: string, nextOrder: number) => Task[];
    buildOptimisticPatch: (state: ParentMoveState, nextAllTasks: Task[]) => ParentMovePatch;
    buildSuccessPatch: (state: ParentMoveState, sourceBefore: Task, result: UpdateTaskFieldsResult) => ParentMovePatch;
    updateTaskFields: (taskId: string, payload: { parent_issue_id: string | null; lock_version: number }) => Promise<UpdateTaskFieldsResult>;
    validatePersistedResult: (result: UpdateTaskFieldsResult, expectedParentId: string | undefined) => boolean;
    missingSourceResult: MoveTaskAsChildResult;
    failedResult: (error?: string) => MoveTaskAsChildResult;
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
        updateTaskFields,
        validatePersistedResult,
        missingSourceResult,
        failedResult
    } = callbacks;

    const beforeState = getState();
    const snapshot = createTaskLayoutSnapshot(beforeState);
    const sourceBefore = beforeState.allTasks.find((task) => task.id === sourceTaskId);

    if (!sourceBefore) {
        return missingSourceResult;
    }

    const nextOrder = buildNextOrder(beforeState.allTasks, sourceBefore);
    const nextAllTasks = buildNextAllTasks(beforeState.allTasks, sourceTaskId, nextOrder);

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
        restoreSnapshot(snapshot);
        return failedResult(error instanceof Error ? error.message : undefined);
    }

    if (result.status !== 'ok' || !validatePersistedResult(result, expectedParentId)) {
        restoreSnapshot(snapshot);
        return buildMoveTaskResult(result.status === 'ok' ? 'error' : result.status, {
            error: result.error || (failedResult().error ?? 'Failed to update parent')
        });
    }

    const currentState = getState();
    setState(buildSuccessPatch(currentState, sourceBefore, result));

    return buildMoveTaskResult('ok', {
        lockVersion: result.lockVersion,
        parentId: expectedParentId
    });
};
