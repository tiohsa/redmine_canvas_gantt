import React from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { LayoutEngine } from '../engines/LayoutEngine';
import { apiClient } from '../api/client';
import { RelationType, type DefaultRelationType } from '../types/constraints';
import { useUIStore } from '../stores/UIStore';
import type { DraftRelation, Relation, Task } from '../types';
import {
    buildRelationRenderContext,
    buildRelationRoutePoints,
    getPolylineMidpoint,
    shouldRenderRelationsAtZoom
} from '../renderers/relationGeometry';
import {
    calculateDelay,
    getRelationInfoText,
    getRelationTypeLabel,
    supportsDelayForUiType,
    toEditableRelationView,
    toRawRelationType,
    validateRelationDelayConsistency,
    type RelationDirection
} from '../utils/relationEditing';

type TaskLabel = {
    id: string;
    subject: string;
};

type RelationPopoverTarget = {
    relation: Relation | DraftRelation;
    relationId: string | null;
    isDraft: boolean;
    direction: RelationDirection;
    initialType: DefaultRelationType;
    initialDelay?: number;
    initialAutoDelayMessage?: string;
    from: TaskLabel;
    to: TaskLabel;
};

const RELATION_POPOVER_OFFSET = 12;
const RESIZE_HANDLE_HOVER_BG = 'rgba(26, 115, 232, 0.18)';
const RESIZE_HANDLE_HOVER_BORDER = 'rgba(26, 115, 232, 0.68)';
const RESIZE_HANDLE_SELECTED_BG = 'rgba(26, 115, 232, 0.24)';
const RESIZE_HANDLE_SELECTED_BORDER = 'rgba(26, 115, 232, 0.82)';
const RESIZE_HANDLE_GRIP = 'rgba(26, 115, 232, 0.92)';
const RESIZE_HANDLE_SHADOW = '0 1px 3px rgba(26, 115, 232, 0.18)';

const parseDelayInput = (value: string): number | null => {
    if (!/^\d+$/.test(value.trim())) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const RelationEditorPopover: React.FC<{
    popoverRef: React.RefObject<HTMLDivElement | null>;
    target: RelationPopoverTarget;
    taskById: Map<string, Task>;
    relations: Relation[];
    position: { x: number; y: number };
    onClose: () => void;
    onCreate: (draftRelation: DraftRelation, rawType: string, delay?: number) => Promise<void>;
    onUpdate: (relationId: string, rawType: string, delay?: number) => Promise<void>;
    onDelete: (relationId: string) => Promise<void>;
}> = ({ popoverRef, target, taskById, relations, position, onClose, onCreate, onUpdate, onDelete }) => {
    const [relationType, setRelationType] = React.useState<DefaultRelationType>(target.initialType);
    const [delayValue, setDelayValue] = React.useState(target.initialDelay !== undefined ? String(target.initialDelay) : '');
    const [autoDelayMessage, setAutoDelayMessage] = React.useState<string | null>(target.initialAutoDelayMessage ?? null);
    const [error, setError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => {
        setRelationType(target.initialType);
        setDelayValue(target.initialDelay !== undefined ? String(target.initialDelay) : '');
        setAutoDelayMessage(target.initialAutoDelayMessage ?? null);
        setError(null);
        setSaving(false);
    }, [target]);

    const supportsDelay = supportsDelayForUiType(relationType);
    const helperText = getRelationInfoText(relationType);

    const updateDelayForType = React.useCallback((nextType: DefaultRelationType) => {
        setRelationType(nextType);
        setError(null);

        if (!supportsDelayForUiType(nextType)) {
            setDelayValue('');
            setAutoDelayMessage(null);
            return;
        }

        const fromTask = taskById.get(target.from.id);
        const toTask = taskById.get(target.to.id);
        const autoDelay = calculateDelay(RelationType.Precedes, fromTask, toTask);
        setDelayValue(autoDelay.delay !== undefined ? String(autoDelay.delay) : '');
        setAutoDelayMessage(autoDelay.message ?? null);
    }, [target.from.id, target.to.id, taskById]);

    const handleSave = React.useCallback(async () => {
        const rawType = target.isDraft
            ? relationType
            : toRawRelationType(relationType, target.direction);

        let delay: number | undefined;
        if (supportsDelay) {
            if (delayValue.trim() === '') {
                setError(i18n.t('label_relation_delay_required') || 'Delay is required for this relation type');
                return;
            }

            const parsedDelay = parseDelayInput(delayValue);
            if (parsedDelay === null) {
                setError(i18n.t('label_relation_delay_invalid') || 'Delay must be 0 or greater');
                return;
            }
            delay = parsedDelay;
        }

        const consistency = validateRelationDelayConsistency(
            rawType,
            delay,
            taskById.get(target.relation.from),
            taskById.get(target.relation.to)
        );
        if (!consistency.valid) {
            setError(consistency.message);
            return;
        }

        const duplicate = relations.some((relation) => {
            if (!target.isDraft && relation.id === target.relationId) {
                return false;
            }
            return relation.from === target.relation.from && relation.to === target.relation.to && relation.type === rawType;
        });
        if (duplicate) {
            setError(i18n.t('label_relation_already_exists') || 'Relation already exists');
            return;
        }

        setSaving(true);
        try {
            if (target.isDraft) {
                await onCreate(target.relation as DraftRelation, rawType, delay);
            } else if (target.relationId) {
                await onUpdate(target.relationId, rawType, delay);
            }
        } catch (saveError: unknown) {
            setError(saveError instanceof Error ? saveError.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
            setSaving(false);
        }
    }, [delayValue, onCreate, onUpdate, relationType, relations, supportsDelay, target, taskById]);

    const handleDelete = React.useCallback(async () => {
        if (!target.relationId) return;

        setSaving(true);
        try {
            await onDelete(target.relationId);
        } catch (deleteError: unknown) {
            setError(deleteError instanceof Error ? deleteError.message : (i18n.t('label_relation_remove_failed') || 'Failed to remove relation'));
            setSaving(false);
        }
    }, [onDelete, target.relationId]);

    return createPortal(
        <div
            ref={popoverRef}
            data-testid="relation-editor"
            style={{
                position: 'fixed',
                top: position.y,
                left: position.x,
                width: 320,
                boxSizing: 'border-box',
                background: '#fff',
                border: '1px solid rgba(15, 23, 42, 0.12)',
                borderRadius: 12,
                boxShadow: '0 18px 36px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
                padding: 16,
                zIndex: 10001,
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em', margin: 0 }}>
                        {i18n.t('label_relation_title') || 'Dependency'}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4, margin: 0 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>#{target.from.id}</span> {target.from.subject}
                        {' '}→{' '}
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>#{target.to.id}</span> {target.to.subject}
                    </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
                    <span style={{ fontWeight: 600 }}>{i18n.t('label_relation_type') || 'Relation type'}</span>
                    <select
                        data-testid="relation-type-select"
                        value={relationType}
                        disabled={saving}
                        onChange={(event) => updateDelayForType(event.target.value as DefaultRelationType)}
                        style={{
                            boxSizing: 'border-box',
                            height: 36,
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            padding: '0 10px',
                            fontSize: 13,
                            color: '#0f172a',
                            margin: 0,
                            fontFamily: 'inherit'
                        }}
                    >
                        <option value={RelationType.Precedes}>{getRelationTypeLabel(RelationType.Precedes)}</option>
                        <option value={RelationType.Relates}>{getRelationTypeLabel(RelationType.Relates)}</option>
                        <option value={RelationType.Blocks}>{getRelationTypeLabel(RelationType.Blocks)}</option>
                    </select>
                </label>

                {supportsDelay && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#334155', margin: 0 }}>
                        <span style={{ fontWeight: 600 }}>{i18n.t('label_delay') || 'Delay'}</span>
                        <input
                            data-testid="relation-delay-input"
                            type="text"
                            inputMode="numeric"
                            value={delayValue}
                            disabled={saving}
                            placeholder="0"
                            onChange={(event) => {
                                setDelayValue(event.target.value);
                                setError(null);
                            }}
                            style={{
                                boxSizing: 'border-box',
                                height: 36,
                                borderRadius: 8,
                                border: error ? '1px solid #ef4444' : '1px solid #cbd5e1',
                                padding: '0 10px',
                                fontSize: 13,
                                color: '#0f172a',
                                margin: 0,
                                fontFamily: 'inherit'
                            }}
                        />
                    </label>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45, margin: 0 }}>
                        {helperText}
                    </div>
                    {supportsDelay && autoDelayMessage && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, margin: 0 }}>
                            {autoDelayMessage}
                        </div>
                    )}
                    {error && (
                        <div data-testid="relation-error" style={{ fontSize: 12, color: '#dc2626', lineHeight: 1.45, margin: 0 }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                        type="button"
                        data-testid="relation-cancel-button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            boxSizing: 'border-box',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            color: '#334155',
                            borderRadius: 8,
                            padding: '0 12px',
                            height: 32,
                            fontSize: 13,
                            cursor: 'pointer',
                            margin: 0,
                            fontFamily: 'inherit',
                            lineHeight: 1
                        }}
                    >
                        {i18n.t('button_cancel') || 'Cancel'}
                    </button>
                    {!target.isDraft && target.relationId && (
                        <button
                            type="button"
                            data-testid="relation-delete-button"
                            onClick={() => {
                                void handleDelete();
                            }}
                            disabled={saving}
                            style={{
                                boxSizing: 'border-box',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(220, 38, 38, 0.18)',
                                background: '#fff5f5',
                                color: '#dc2626',
                                borderRadius: 8,
                                padding: '0 12px',
                                height: 32,
                                fontSize: 13,
                                cursor: 'pointer',
                                margin: 0,
                                fontFamily: 'inherit',
                                lineHeight: 1
                            }}
                        >
                            {i18n.t('button_delete') || 'Delete'}
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="relation-save-button"
                        onClick={() => {
                            void handleSave();
                        }}
                        disabled={saving}
                        style={{
                            boxSizing: 'border-box',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #1d4ed8',
                            background: '#1d4ed8',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '0 12px',
                            height: 32,
                            fontSize: 13,
                            cursor: 'pointer',
                            margin: 0,
                            fontFamily: 'inherit',
                            lineHeight: 1
                        }}
                    >
                        {i18n.t('button_save') || 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const HtmlOverlay: React.FC = () => {
    const hoveredTaskId = useTaskStore(state => state.hoveredTaskId);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const contextMenu = useTaskStore(state => state.contextMenu);
    const tasks = useTaskStore(state => state.tasks);
    const relations = useTaskStore(state => state.relations);
    const selectedRelationId = useTaskStore(state => state.selectedRelationId);
    const draftRelation = useTaskStore(state => state.draftRelation);
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

    const overlayRef = React.useRef<HTMLDivElement>(null);
    const contextMenuRef = React.useRef<HTMLDivElement>(null);
    const relationMenuRef = React.useRef<HTMLDivElement | null>(null);
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

    const getTaskLabel = React.useCallback((taskId: string): TaskLabel => {
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

    const formatRelationLabel = React.useCallback((relation: { from: string; to: string }) => {
        return {
            from: getTaskLabel(relation.from),
            to: getTaskLabel(relation.to)
        };
    }, [getTaskLabel]);

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
        return qs ? `${basePath}?${qs}` : basePath;
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

            {contextMenu && createPortal(
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 9999,
                            background: 'transparent'
                        }}
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenu(null);
                        }}
                    />
                    <div
                        ref={contextMenuRef}
                        style={{
                            position: 'fixed',
                            top: menuPosition?.y ?? contextMenu.y,
                            left: menuPosition?.x ?? contextMenu.x,
                            background: 'white',
                            borderRadius: '8px',
                            minWidth: '200px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1)',
                            padding: '6px',
                            zIndex: 10000,
                            pointerEvents: 'auto',
                            animation: 'fadeIn 0.1s ease-out'
                        }}
                    >
                        <style>{`
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(-4px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        .menu-item {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            padding: 8px 12px;
                            cursor: pointer;
                            border-radius: 6px;
                            font-size: 13px;
                            color: #333;
                            transition: background-color 0.1s;
                        }
                        .menu-item:hover {
                            background-color: #f0f4f9;
                        }
                        .menu-item.danger {
                            color: #d32f2f;
                        }
                        .menu-item.danger:hover {
                            background-color: #fee;
                        }
                        .menu-divider {
                            height: 1px;
                            background-color: #eee;
                            margin: 6px 0;
                        }
                        .menu-section-title {
                            font-size: 11px;
                            font-weight: 700;
                            color: #888;
                            padding: 6px 12px 2px;
                            text-transform: uppercase;
                        }
                    `}</style>

                        <div className="menu-item" onClick={() => {
                            useUIStore.getState().openIssueDialog(`/issues/${contextMenu.taskId}/edit`);
                            setContextMenu(null);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            {i18n.t('button_edit')}
                        </div>

                        <div className="menu-item" data-testid="context-menu-add-child-task" onClick={() => {
                            const query = new URLSearchParams();
                            query.set('issue[parent_issue_id]', contextMenu.taskId);
                            query.set('parent_issue_id', contextMenu.taskId);
                            useUIStore.getState().openIssueDialog(buildNewIssueUrl(query));
                            setContextMenu(null);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            {i18n.t('label_add_child_task') || 'Add Child Task'}
                        </div>

                        <div className="menu-item" data-testid="context-menu-add-new-ticket" onClick={() => {
                            useUIStore.getState().openIssueDialog(buildNewIssueUrl());
                            setContextMenu(null);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {i18n.t('label_issue_new') || 'Add New Ticket'}
                        </div>

                        {contextTask && canDropToRoot(contextTask.id) && (
                            <div className="menu-item" data-testid="context-menu-unset-parent" onClick={() => {
                                void handleUnsetParent(contextTask.id);
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 12h8" />
                                    <path d="M9 7l-5 5 5 5" />
                                    <path d="M20 7h-6a4 4 0 0 0-4 4" />
                                </svg>
                                {i18n.t('label_unset_parent_task') || 'Remove Parent'}
                            </div>
                        )}

                        <div className="menu-item danger" onClick={() => {
                            void handleTaskDelete(contextMenu.taskId);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                            {i18n.t('button_delete')}
                        </div>

                        {relatedRelations.length > 0 && (
                            <>
                                <div className="menu-divider" />
                                <div className="menu-section-title">
                                    {i18n.t('label_relations_remove_heading') || 'Remove dependency'}
                                </div>

                                {relatedRelations.map((relation) => {
                                    const { from, to } = formatRelationLabel(relation);
                                    const fromIsContext = contextMenu.taskId === from.id;
                                    const direction = fromIsContext ? '→' : '←';

                                    return (
                                        <div
                                            key={relation.id}
                                            className="menu-item danger"
                                            data-testid={`remove-relation-${relation.id}`}
                                            onClick={() => {
                                                void handleRemoveRelation(relation.id);
                                            }}
                                            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                                        >
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M18.36 6.64a9 9 0 1 1-12.73 12.73 9 9 0 0 1 12.73-12.73z" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                                <span style={{ fontWeight: 600 }}>#{relation.id}</span>
                                            </div>
                                            <div style={{ fontSize: '11px', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                                                {from.subject} {direction} {to.subject}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </>,
                document.body
            )}
        </>
    );
};
