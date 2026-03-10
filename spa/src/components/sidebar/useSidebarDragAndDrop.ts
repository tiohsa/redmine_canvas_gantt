import React from 'react';
import { useUIStore } from '../../stores/UIStore';
import { i18n } from '../../utils/i18n';
import type { MoveTaskAsChildResult } from '../../types';

type Params = {
    canDropAsChild: (sourceTaskId: string, targetTaskId: string) => boolean;
    canDropToRoot: (sourceTaskId: string) => boolean;
    moveTaskAsChild: (sourceTaskId: string, targetTaskId: string) => Promise<MoveTaskAsChildResult>;
    moveTaskToRoot: (sourceTaskId: string) => Promise<MoveTaskAsChildResult>;
};

const notifyMoveResult = (result: MoveTaskAsChildResult, successMessage: string) => {
    if (result.status === 'ok') {
        useUIStore.getState().addNotification(successMessage, 'success');
        return;
    }

    if (result.status === 'conflict') {
        useUIStore.getState().addNotification(result.error || i18n.t('label_parent_drop_conflict') || 'Task was updated by another user', 'error');
        return;
    }

    useUIStore.getState().addNotification(result.error || i18n.t('label_parent_drop_failed') || 'Failed to move task', 'error');
};

export const useSidebarDragAndDrop = ({
    canDropAsChild,
    canDropToRoot,
    moveTaskAsChild,
    moveTaskToRoot
}: Params) => {
    const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);
    const [dropTargetTaskId, setDropTargetTaskId] = React.useState<string | null>(null);
    const [isRootDropActive, setIsRootDropActive] = React.useState(false);

    const handleTaskDragStart = React.useCallback((taskId: string, e: React.DragEvent<HTMLDivElement>) => {
        setDraggingTaskId(taskId);
        setDropTargetTaskId(null);
        setIsRootDropActive(false);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
    }, []);

    const handleTaskDragOver = React.useCallback((targetTaskId: string, e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const sourceTaskId = draggingTaskId || e.dataTransfer.getData('text/plain');
        if (!sourceTaskId) return;
        setIsRootDropActive(false);
        if (!canDropAsChild(sourceTaskId, targetTaskId)) {
            e.dataTransfer.dropEffect = 'none';
            if (dropTargetTaskId) setDropTargetTaskId(null);
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTargetTaskId !== targetTaskId) {
            setDropTargetTaskId(targetTaskId);
        }
    }, [canDropAsChild, draggingTaskId, dropTargetTaskId]);

    const handleTaskDrop = React.useCallback(async (targetTaskId: string, e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        const sourceTaskId = draggingTaskId || e.dataTransfer.getData('text/plain');
        setDropTargetTaskId(null);
        setIsRootDropActive(false);
        setDraggingTaskId(null);
        if (!sourceTaskId || !canDropAsChild(sourceTaskId, targetTaskId)) {
            useUIStore.getState().addNotification(i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target', 'warning');
            return;
        }

        const result = await moveTaskAsChild(sourceTaskId, targetTaskId);
        notifyMoveResult(result, i18n.t('label_parent_drop_success') || 'Task moved as child');
    }, [canDropAsChild, draggingTaskId, moveTaskAsChild]);

    const handleRootDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
        const sourceTaskId = draggingTaskId || e.dataTransfer.getData('text/plain');
        if (!sourceTaskId) return;
        if (!canDropToRoot(sourceTaskId)) {
            e.dataTransfer.dropEffect = 'none';
            if (isRootDropActive) setIsRootDropActive(false);
            return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isRootDropActive) setIsRootDropActive(true);
        if (dropTargetTaskId) setDropTargetTaskId(null);
    }, [canDropToRoot, draggingTaskId, dropTargetTaskId, isRootDropActive]);

    const handleRootDrop = React.useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const sourceTaskId = draggingTaskId || e.dataTransfer.getData('text/plain');
        setDropTargetTaskId(null);
        setIsRootDropActive(false);
        setDraggingTaskId(null);
        if (!sourceTaskId || !canDropToRoot(sourceTaskId)) {
            useUIStore.getState().addNotification(i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target', 'warning');
            return;
        }

        const result = await moveTaskToRoot(sourceTaskId);
        notifyMoveResult(result, i18n.t('label_parent_drop_unset_success') || 'Task parent removed');
    }, [canDropToRoot, draggingTaskId, moveTaskToRoot]);

    const resetDragState = React.useCallback(() => {
        setDraggingTaskId(null);
        setDropTargetTaskId(null);
        setIsRootDropActive(false);
    }, []);

    return {
        draggingTaskId,
        dropTargetTaskId,
        isRootDropActive,
        setIsRootDropActive,
        handleTaskDragStart,
        handleTaskDragOver,
        handleTaskDrop,
        handleRootDragOver,
        handleRootDrop,
        resetDragState
    };
};
