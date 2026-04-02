import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { LayoutEngine } from '../engines/LayoutEngine';
import { apiClient } from '../api/client';
import { RelationType } from '../types/constraints';
import { useUIStore } from '../stores/UIStore';
import { useBaselineStore } from '../stores/BaselineStore';
import type { DraftRelation, Task } from '../types';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { calculateBaselineDiff, formatBaselineCapturedAt, getBaselineTaskState } from '../utils/baseline';
import {
    buildRelationRenderContext,
    buildRelationRoutePoints,
    getPolylineMidpoint,
    shouldRenderRelationsAtZoom
} from '../renderers/relationGeometry';
import {
    calculateDelay,
    toEditableRelationView,
} from '../utils/relationEditing';
import { BaselineDiffPopover } from './BaselineDiffPopover';
import { RelationEditorPopover, type RelationPopoverTarget } from './RelationEditorPopover';
import { TaskContextMenu } from './TaskContextMenu';

const RELATION_POPOVER_OFFSET = 12;
const RESIZE_HANDLE_HOVER_BG = 'rgba(26, 115, 232, 0.18)';
const RESIZE_HANDLE_HOVER_BORDER = 'rgba(26, 115, 232, 0.68)';
const RESIZE_HANDLE_SELECTED_BG = 'rgba(26, 115, 232, 0.24)';
const RESIZE_HANDLE_SELECTED_BORDER = 'rgba(26, 115, 232, 0.82)';
const RESIZE_HANDLE_GRIP = 'rgba(26, 115, 232, 0.92)';
const RESIZE_HANDLE_SHADOW = '0 1px 3px rgba(26, 115, 232, 0.18)';
const BASELINE_POPOVER_OFFSET = 12;


export const HtmlOverlay: React.FC = () => {
    const hoveredTaskId = useTaskStore(state => state.hoveredTaskId);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const contextMenu = useTaskStore(state => state.contextMenu);
    const tasks = useTaskStore(state => state.tasks);
    const relations = useTaskStore(state => state.relations);
    const selectedRelationId = useTaskStore(state => state.selectedRelationId);
    const draftRelation = useTaskStore(state => state.draftRelation);
    const permissions = useTaskStore(state => state.permissions);
    const setContextMenu = useTaskStore(state => state.setContextMenu);
    const setDraftRelation = useTaskStore(state => state.setDraftRelation);
    const clearRelationSelection = useTaskStore(state => state.clearRelationSelection);
    const addRelation = useTaskStore(state => state.addRelation);
    const replaceRelation = useTaskStore(state => state.replaceRelation);
    const removeRelation = useTaskStore(state => state.removeRelation);
    const canDropToRoot = useTaskStore(state => state.canDropToRoot);
    const moveTaskToRoot = useTaskStore(state => state.moveTaskToRoot);
    const viewport = useTaskStore(state => state.viewport);
    const zoomLevel = useTaskStore(state => state.zoomLevel);
    const rowCount = useTaskStore(state => state.rowCount);
    const defaultRelationType = useUIStore(state => state.defaultRelationType);
    const autoCalculateDelay = useUIStore(state => state.autoCalculateDelay);
    const autoApplyDefaultRelation = useUIStore(state => state.autoApplyDefaultRelation);
    const showBaseline = useUIStore(state => state.showBaseline);
    const baselineSnapshot = useBaselineStore(state => state.snapshot);

    const overlayRef = React.useRef<HTMLDivElement>(null);
    const contextMenuRef = React.useRef<HTMLDivElement>(null);
    const relationMenuRef = React.useRef<HTMLDivElement | null>(null);
    const baselineMenuRef = React.useRef<HTMLDivElement | null>(null);
    const [dragDraft, setDragDraft] = React.useState<{ fromId: string; start: { x: number; y: number }; pointer: { x: number; y: number }; startSide: 'left' | 'right'; targetId?: string } | null>(null);
    const dragDraftRef = React.useRef<typeof dragDraft>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);
    const [relationPosition, setRelationPosition] = React.useState<{ x: number; y: number } | null>(null);

    const taskById = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
    const contextTask = contextMenu ? taskById.get(contextMenu.taskId) ?? null : null;
    const fallbackProjectId = React.useMemo(() => {
        const projectId = window.RedmineCanvasGantt?.projectId;
        return projectId !== undefined && projectId !== null ? String(projectId) : '';
    }, []);

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

    const activePersistedRelation = React.useMemo(
        () => selectedRelationId ? relations.find((relation) => relation.id === selectedRelationId) ?? null : null,
        [relations, selectedRelationId]
    );
    const activeRelation = activePersistedRelation ?? draftRelation;

    const getTaskLabel = React.useCallback((taskId: string) => {
        const task = taskById.get(taskId);
        return {
            id: taskId,
            subject: task?.subject ? task.subject : taskId
        };
    }, [taskById]);

    const relationPopoverTarget = React.useMemo<RelationPopoverTarget | null>(() => {
        if (!activeRelation) return null;

        const editableView = toEditableRelationView(activeRelation);
        return {
            relation: activeRelation,
            relationId: activePersistedRelation?.id ?? null,
            isDraft: !activePersistedRelation,
            direction: editableView.direction,
            initialType: editableView.uiType,
            initialDelay: editableView.delay,
            initialAutoDelayMessage: draftRelation?.autoDelayMessage,
            from: getTaskLabel(editableView.fromId),
            to: getTaskLabel(editableView.toId)
        };
    }, [activePersistedRelation, activeRelation, draftRelation, getTaskLabel]);

    const relationAnchor = React.useMemo(() => {
        if (!activeRelation) return null;

        if (shouldRenderRelationsAtZoom(zoomLevel)) {
            const totalRows = rowCount || tasks.length;
            const bufferedTasks = LayoutEngine.sliceTasksInRowRange(
                tasks,
                Math.max(0, startRow - 50),
                Math.min(totalRows - 1, endRow + 50)
            );
            const context = buildRelationRenderContext(bufferedTasks, viewport, zoomLevel);
            const points = buildRelationRoutePoints(activeRelation, context, viewport);
            if (points) {
                const midpoint = getPolylineMidpoint(points);
                return {
                    x: midpoint.x - viewport.scrollX,
                    y: midpoint.y - viewport.scrollY
                };
            }
        }

        return draftRelation?.anchor ?? null;
    }, [activeRelation, draftRelation, endRow, rowCount, startRow, tasks, viewport, zoomLevel]);

    const activeBaselineTaskId = hoveredTaskId ?? selectedTaskId;
    const activeBaselineTask = React.useMemo(
        () => activeBaselineTaskId ? taskById.get(activeBaselineTaskId) ?? null : null,
        [activeBaselineTaskId, taskById]
    );
    const activeBaselineDiff = React.useMemo(() => {
        if (!showBaseline || !baselineSnapshot || !activeBaselineTask) return null;
        return calculateBaselineDiff(activeBaselineTask, getBaselineTaskState(baselineSnapshot, activeBaselineTask.id));
    }, [activeBaselineTask, baselineSnapshot, showBaseline]);
    const [baselinePopoverPosition, setBaselinePopoverPosition] = React.useState<{ x: number; y: number } | null>(null);

    React.useLayoutEffect(() => {
        if (!showBaseline || !permissions.viewable || !baselineSnapshot || !activeBaselineTask || !overlayRef.current) {
            setBaselinePopoverPosition(null);
            return;
        }

        const updatePosition = () => {
            if (!overlayRef.current) return;
            const bounds = LayoutEngine.getTaskBounds(activeBaselineTask, viewport, 'bar', zoomLevel);
            const overlayRect = overlayRef.current.getBoundingClientRect();
            setBaselinePopoverPosition({
                x: overlayRect.left + bounds.x + bounds.width + BASELINE_POPOVER_OFFSET,
                y: overlayRect.top + bounds.y
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [activeBaselineTask, baselineSnapshot, permissions.viewable, showBaseline, viewport, zoomLevel]);

    const setDragDraftState = React.useCallback((next: typeof dragDraft) => {
        dragDraftRef.current = next;
        setDragDraft(next);
    }, []);

    const toLocalPoint = React.useCallback((clientX: number, clientY: number) => {
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect) return { x: clientX, y: clientY };
        return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const hitTestTask = React.useCallback((x: number, y: number) => {
        const { viewport: currentViewport, tasks: currentTasks, rowCount: currentRowCount } = useTaskStore.getState();
        const [visibleStart, visibleEnd] = LayoutEngine.getVisibleRowRange(currentViewport, currentRowCount || currentTasks.length);
        const candidates = LayoutEngine.sliceTasksInRowRange(currentTasks, visibleStart, visibleEnd);

        for (const task of candidates) {
            const bounds = LayoutEngine.getTaskBounds(task, currentViewport, 'hit', zoomLevel);
            if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
                return task;
            }
        }

        return null;
    }, [zoomLevel]);

    const handleMouseMove = React.useCallback((event: MouseEvent) => {
        const currentDraft = dragDraftRef.current;
        if (!currentDraft) return;

        const point = toLocalPoint(event.clientX, event.clientY);
        const targetTask = hitTestTask(point.x, point.y);
        setDragDraftState({ ...currentDraft, pointer: point, targetId: targetTask ? targetTask.id : undefined });
    }, [hitTestTask, setDragDraftState, toLocalPoint]);

    const handleCreateRelation = React.useCallback(async (relation: DraftRelation, rawType: string, delay?: number) => {
        const createdRelation = await apiClient.createRelation(relation.from, relation.to, rawType, delay);
        addRelation(createdRelation);
        clearRelationSelection();
        useUIStore.getState().addNotification(i18n.t('label_relation_added') || 'Dependency created', 'success');
    }, [addRelation, clearRelationSelection]);

    const handleUpdateRelation = React.useCallback(async (relationId: string, rawType: string, delay?: number) => {
        const updatedRelation = await apiClient.updateRelation(relationId, rawType, delay);
        replaceRelation(updatedRelation);
        clearRelationSelection();
        useUIStore.getState().addNotification(i18n.t('label_relation_updated') || 'Dependency updated', 'success');
    }, [clearRelationSelection, replaceRelation]);

    const handleRemoveRelation = React.useCallback(async (relationId: string) => {
        await apiClient.deleteRelation(relationId);
        removeRelation(relationId);
        clearRelationSelection();
        setContextMenu(null);
        useUIStore.getState().addNotification(i18n.t('label_relation_removed') || 'Dependency removed', 'success');
    }, [clearRelationSelection, removeRelation, setContextMenu]);

    const handleMouseUp = React.useCallback(() => {
        const currentDraft = dragDraftRef.current;
        if (!currentDraft) return;

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        dragDraftRef.current = null;
        setDragDraft(null);

        const { fromId, targetId, start, pointer, startSide } = currentDraft;
        if (!targetId || targetId === fromId) return;

        const relationFromId = startSide === 'left' ? targetId : fromId;
        const relationToId = startSide === 'left' ? fromId : targetId;

        const fromTask = taskById.get(relationFromId);
        const toTask = taskById.get(relationToId);
        const autoDelay = autoCalculateDelay && defaultRelationType === RelationType.Precedes
            ? calculateDelay(RelationType.Precedes, fromTask, toTask)
            : {};

        const duplicate = relations.some((relation) => (
            relation.from === relationFromId && relation.to === relationToId && relation.type === defaultRelationType
        ));
        if (duplicate) {
            useUIStore.getState().addNotification(i18n.t('label_relation_already_exists') || 'Relation already exists', 'warning');
            return;
        }

        const relationDelay = defaultRelationType === RelationType.Precedes ? autoDelay.delay : undefined;

        if (autoApplyDefaultRelation) {
            void handleCreateRelation({ from: relationFromId, to: relationToId, type: defaultRelationType }, defaultRelationType, relationDelay).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : (i18n.t('label_relation_add_failed') || 'Failed to create relation');
                useUIStore.getState().addNotification(message, 'error');
            });
            return;
        }

        setDraftRelation({
            from: relationFromId,
            to: relationToId,
            type: defaultRelationType,
            delay: relationDelay,
            autoDelayMessage: defaultRelationType === RelationType.Precedes ? autoDelay.message : undefined,
            anchor: {
                x: (start.x + pointer.x) / 2,
                y: (start.y + pointer.y) / 2
            }
        });
    }, [autoApplyDefaultRelation, autoCalculateDelay, defaultRelationType, handleCreateRelation, handleMouseMove, relations, setDraftRelation, taskById]);

    const startDraft = React.useCallback((taskId: string, x: number, y: number, startSide: 'left' | 'right') => {
        const startPoint = { x, y };
        setDragDraftState({ fromId: taskId, start: startPoint, pointer: startPoint, startSide });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, handleMouseUp, setDragDraftState]);

    React.useEffect(() => {
        const handleGlobalMouseDown = (event: MouseEvent) => {
            if (contextMenu) {
                const target = event.target as HTMLElement;
                if (!target.closest('.menu-item')) {
                    setContextMenu(null);
                }
            }
        };

        window.addEventListener('mousedown', handleGlobalMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousedown', handleGlobalMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [contextMenu, handleMouseMove, handleMouseUp, setContextMenu]);

    React.useEffect(() => {
        if (!activeRelation) return;

        const handleWindowMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (relationMenuRef.current?.contains(target)) {
                return;
            }

            const viewportElement = overlayRef.current?.parentElement;
            if (target && viewportElement?.contains(target)) {
                return;
            }

            useTaskStore.getState().clearRelationSelection();
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                useTaskStore.getState().clearRelationSelection();
            }
        };

        window.addEventListener('mousedown', handleWindowMouseDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handleWindowMouseDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [activeRelation]);

    const relatedRelations = React.useMemo(() => {
        if (!contextMenu) return [];
        return relations.filter((relation) => relation.from === contextMenu.taskId || relation.to === contextMenu.taskId);
    }, [contextMenu, relations]);

    React.useEffect(() => {
        if (!contextMenu) {
            setMenuPosition(null);
            return;
        }
        setMenuPosition({ x: contextMenu.x, y: contextMenu.y });
    }, [contextMenu]);

    React.useLayoutEffect(() => {
        if (!contextMenu || !contextMenuRef.current) return;

        const clampPosition = () => {
            if (!contextMenuRef.current) return;
            const rect = contextMenuRef.current.getBoundingClientRect();
            const margin = 8;
            const maxX = window.innerWidth - rect.width - margin;
            const maxY = window.innerHeight - rect.height - margin;
            const nextX = Math.max(margin, Math.min(contextMenu.x, maxX));
            const nextY = Math.max(margin, Math.min(contextMenu.y, maxY));
            setMenuPosition((previous) => {
                if (!previous || previous.x !== nextX || previous.y !== nextY) {
                    return { x: nextX, y: nextY };
                }
                return previous;
            });
        };

        clampPosition();

        const handleWindowResize = () => clampPosition();
        window.addEventListener('resize', handleWindowResize);

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => clampPosition());
            resizeObserver.observe(contextMenuRef.current);
            return () => {
                resizeObserver.disconnect();
                window.removeEventListener('resize', handleWindowResize);
            };
        }

        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [contextMenu, relatedRelations.length]);

    React.useLayoutEffect(() => {
        if (!relationPopoverTarget || !relationAnchor || !overlayRef.current || !relationMenuRef.current) {
            setRelationPosition(null);
            return;
        }

        const clampPosition = () => {
            if (!overlayRef.current || !relationMenuRef.current || !relationAnchor) return;

            const overlayRect = overlayRef.current.getBoundingClientRect();
            const popoverRect = relationMenuRef.current.getBoundingClientRect();
            const anchorX = overlayRect.left + relationAnchor.x;
            const anchorY = overlayRect.top + relationAnchor.y;
            const margin = 8;

            const candidateAbove = {
                x: anchorX - popoverRect.width / 2,
                y: anchorY - popoverRect.height - RELATION_POPOVER_OFFSET
            };
            const candidateBelow = {
                x: anchorX - popoverRect.width / 2,
                y: anchorY + RELATION_POPOVER_OFFSET
            };

            const preferred = candidateAbove.y >= margin ? candidateAbove : candidateBelow;
            const nextX = Math.max(margin, Math.min(preferred.x, window.innerWidth - popoverRect.width - margin));
            const nextY = Math.max(margin, Math.min(preferred.y, window.innerHeight - popoverRect.height - margin));
            setRelationPosition((previous) => {
                if (!previous || previous.x !== nextX || previous.y !== nextY) {
                    return { x: nextX, y: nextY };
                }
                return previous;
            });
        };

        clampPosition();

        const handleWindowResize = () => clampPosition();
        window.addEventListener('resize', handleWindowResize);

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => clampPosition());
            resizeObserver.observe(relationMenuRef.current);
            return () => {
                resizeObserver.disconnect();
                window.removeEventListener('resize', handleWindowResize);
            };
        }

        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [relationAnchor, relationPopoverTarget]);

    const handleTaskDelete = React.useCallback(async (taskId: string) => {
        const message = i18n.t('text_are_you_sure') || 'Are you sure?';
        if (!window.confirm(message)) return;

        try {
            await apiClient.deleteTask(taskId);
            useTaskStore.getState().removeTask(taskId);
            useUIStore.getState().addNotification((i18n.t('button_delete') || 'Delete') + ': ' + (i18n.t('label_success') || 'Success'), 'success');
        } catch (error: unknown) {
            const messageText = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(messageText || (i18n.t('label_delete_task_failed') || 'Failed to delete task'), 'error');
        } finally {
            useTaskStore.getState().setContextMenu(null);
        }
    }, []);

    const buildNewIssueUrl = React.useCallback((query?: URLSearchParams) => {
        const projectId = contextTask?.projectId || fallbackProjectId;
        const basePath = projectId ? `/projects/${projectId}/issues/new` : '/issues/new';
        const qs = query?.toString();
        const url = qs ? `${basePath}?${qs}` : basePath;
        return buildRedmineUrl(url);
    }, [contextTask?.projectId, fallbackProjectId]);

    const handleUnsetParent = React.useCallback(async (taskId: string) => {
        if (!canDropToRoot(taskId)) {
            useUIStore.getState().addNotification(i18n.t('label_parent_drop_invalid_target') || 'Invalid drop target', 'warning');
            useTaskStore.getState().setContextMenu(null);
            return;
        }

        const result = await moveTaskToRoot(taskId);
        if (result.status === 'ok') {
            useUIStore.getState().addNotification(i18n.t('label_parent_drop_unset_success') || 'Task parent removed', 'success');
            useTaskStore.getState().setContextMenu(null);
            return;
        }

        if (result.status === 'conflict') {
            useUIStore.getState().addNotification(result.error || i18n.t('label_parent_drop_conflict') || 'Task was updated by another user', 'error');
            useTaskStore.getState().setContextMenu(null);
            return;
        }

        useUIStore.getState().addNotification(result.error || i18n.t('label_parent_drop_failed') || 'Failed to move task', 'error');
        useTaskStore.getState().setContextMenu(null);
    }, [canDropToRoot, moveTaskToRoot]);

    const isResizableTask = React.useCallback((task: Task) => (
        task.editable &&
        !task.hasChildren &&
        Number.isFinite(task.startDate) &&
        Number.isFinite(task.dueDate)
    ), []);

    return (
        <>
            <div
                ref={overlayRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
            >
                {visibleTasks.map((task) => {
                    const isDependencyDragging = dragDraft !== null;
                    const showDependencyHandles = task.id === hoveredTaskId;
                    const showResizeHandles = !isDependencyDragging && isResizableTask(task) && (task.id === hoveredTaskId || task.id === selectedTaskId);
                    if (!showDependencyHandles && !showResizeHandles) return null;

                    const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
                    const centerY = bounds.y + bounds.height / 2;
                    const handleOffset = 12;
                    const resizeHandleWidth = Math.max(8, Math.min(12, Math.floor(bounds.width / 3)));
                    const resizeHandleHeight = Math.max(18, Math.min(28, bounds.height - 4));
                    const resizeHandleTop = bounds.y + (bounds.height - resizeHandleHeight) / 2;
                    const isSelectedResizeHandle = task.id === selectedTaskId && task.id !== hoveredTaskId;
                    const baseStyle: React.CSSProperties = {
                        position: 'absolute',
                        top: centerY - 5,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: '#1a73e8',
                        border: '2px solid #fff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        pointerEvents: 'auto',
                        cursor: 'crosshair',
                        zIndex: 100
                    };

                    const resizeHandleBaseStyle: React.CSSProperties = {
                        position: 'absolute',
                        top: resizeHandleTop,
                        width: resizeHandleWidth,
                        height: resizeHandleHeight,
                        borderRadius: 999,
                        background: isSelectedResizeHandle ? RESIZE_HANDLE_SELECTED_BG : RESIZE_HANDLE_HOVER_BG,
                        border: `1px solid ${isSelectedResizeHandle ? RESIZE_HANDLE_SELECTED_BORDER : RESIZE_HANDLE_HOVER_BORDER}`,
                        boxShadow: RESIZE_HANDLE_SHADOW,
                        pointerEvents: 'auto',
                        cursor: 'ew-resize',
                        zIndex: 95,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    };

                    return (
                        <React.Fragment key={`handles-${task.id}`}>
                            {showResizeHandles && (
                                <>
                                    <div
                                        className="task-resize-handle"
                                        data-region="start"
                                        data-testid={`task-resize-handle-start-${task.id}`}
                                        style={{ ...resizeHandleBaseStyle, left: bounds.x - resizeHandleWidth / 2 }}
                                    >
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            <span style={{ width: 1, height: 10, background: RESIZE_HANDLE_GRIP }} />
                                            <span style={{ width: 1, height: 10, background: RESIZE_HANDLE_GRIP }} />
                                        </div>
                                    </div>
                                    <div
                                        className="task-resize-handle"
                                        data-region="end"
                                        data-testid={`task-resize-handle-end-${task.id}`}
                                        style={{ ...resizeHandleBaseStyle, left: bounds.x + bounds.width - resizeHandleWidth / 2 }}
                                    >
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            <span style={{ width: 1, height: 10, background: RESIZE_HANDLE_GRIP }} />
                                            <span style={{ width: 1, height: 10, background: RESIZE_HANDLE_GRIP }} />
                                        </div>
                                    </div>
                                </>
                            )}
                            {showDependencyHandles && (
                                <>
                                    <div
                                        className="dependency-handle"
                                        style={{ ...baseStyle, left: bounds.x - handleOffset - 5 }}
                                        onMouseDown={() => {
                                            startDraft(task.id, bounds.x, centerY, 'left');
                                        }}
                                    />
                                    <div
                                        className="dependency-handle"
                                        style={{ ...baseStyle, left: bounds.x + bounds.width + handleOffset - 5 }}
                                        onMouseDown={() => {
                                            startDraft(task.id, bounds.x + bounds.width, centerY, 'right');
                                        }}
                                    />
                                </>
                            )}
                        </React.Fragment>
                    );
                })}

                {dragDraft && (
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                        <defs>
                            <marker id="draft-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L6,3 z" fill="#1a73e8" />
                            </marker>
                        </defs>
                        <line
                            x1={dragDraft.start.x}
                            y1={dragDraft.start.y}
                            x2={dragDraft.pointer.x}
                            y2={dragDraft.pointer.y}
                            stroke="#1a73e8"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            markerEnd="url(#draft-arrow)"
                        />
                    </svg>
                )}
            </div>

            {showBaseline && permissions.viewable && activeBaselineTask && baselineSnapshot && baselinePopoverPosition && (
                <BaselineDiffPopover
                    popoverRef={baselineMenuRef}
                    position={baselinePopoverPosition}
                    task={activeBaselineTask}
                    diff={activeBaselineDiff}
                    baselineCapturedAt={formatBaselineCapturedAt(baselineSnapshot.capturedAt)}
                    baselineCapturedBy={baselineSnapshot.capturedByName ?? ''}
                    baselineScope={baselineSnapshot.scope === 'project'
                        ? (i18n.t('label_baseline_scope_project') || 'Whole project')
                        : (i18n.t('label_baseline_scope_filtered') || 'Current filtered view')}
                />
            )}

            {relationPopoverTarget && (
                <RelationEditorPopover
                    popoverRef={relationMenuRef}
                    target={relationPopoverTarget}
                    taskById={taskById}
                    relations={relations}
                    position={relationPosition ?? { x: 8, y: 8 }}
                    onClose={clearRelationSelection}
                    onCreate={handleCreateRelation}
                    onUpdate={handleUpdateRelation}
                    onDelete={handleRemoveRelation}
                />
            )}

            {contextMenu && (
                <TaskContextMenu
                    taskId={contextMenu.taskId}
                    contextTask={contextTask}
                    relatedRelations={relatedRelations}
                    position={menuPosition ?? { x: contextMenu.x, y: contextMenu.y }}
                    contextMenuRef={contextMenuRef}
                    onClose={() => setContextMenu(null)}
                    onEdit={(taskId) => {
                        useUIStore.getState().openIssueDialog(buildRedmineUrl(`/issues/${taskId}/edit`));
                        setContextMenu(null);
                    }}
                    onAddChild={(taskId) => {
                        const query = new URLSearchParams();
                        query.set('issue[parent_issue_id]', taskId);
                        query.set('parent_issue_id', taskId);
                        useUIStore.getState().openIssueDialog(buildNewIssueUrl(query));
                        setContextMenu(null);
                    }}
                    onAddNew={() => {
                        useUIStore.getState().openIssueDialog(buildNewIssueUrl());
                        setContextMenu(null);
                    }}
                    onUnsetParent={(taskId) => {
                        void handleUnsetParent(taskId);
                    }}
                    onDelete={(taskId) => {
                        void handleTaskDelete(taskId);
                    }}
                    onRemoveRelation={(relationId) => {
                        void handleRemoveRelation(relationId);
                    }}
                    getTaskLabel={getTaskLabel}
                />
            )}
        </>
    );
};
