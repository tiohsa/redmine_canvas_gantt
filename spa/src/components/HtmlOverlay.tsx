import React from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { LayoutEngine } from '../engines/LayoutEngine';
import { apiClient } from '../api/client';
import { RelationType } from '../types/constraints';
import { useUIStore } from '../stores/UIStore';
import { InlineEditService } from '../services/InlineEditService';

export const HtmlOverlay: React.FC = () => {
    const hoveredTaskId = useTaskStore(state => state.hoveredTaskId);
    const contextMenu = useTaskStore(state => state.contextMenu);
    const tasks = useTaskStore(state => state.tasks);
    const relations = useTaskStore(state => state.relations);
    const setContextMenu = useTaskStore(state => state.setContextMenu);
    const refreshData = useTaskStore(state => state.refreshData);
    const canDropToRoot = useTaskStore(state => state.canDropToRoot);
    const moveTaskToRoot = useTaskStore(state => state.moveTaskToRoot);
    const contextCategoryMenu = useTaskStore(state => state.contextCategoryMenu);
    const setContextCategoryMenu = useTaskStore(state => state.setContextCategoryMenu);
    const setContextCategoryOptions = useTaskStore(state => state.setContextCategoryOptions);
    const clearContextCategoryMenu = useTaskStore(state => state.clearContextCategoryMenu);
    const viewport = useTaskStore(state => state.viewport);
    const zoomLevel = useTaskStore(state => state.zoomLevel);
    const rowCount = useTaskStore(state => state.rowCount);

    const overlayRef = React.useRef<HTMLDivElement>(null);
    const contextMenuRef = React.useRef<HTMLDivElement>(null);
    const [draft, setDraft] = React.useState<{ fromId: string; start: { x: number; y: number }; pointer: { x: number; y: number }; targetId?: string } | null>(null);
    const draftRef = React.useRef<typeof draft>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);
    const categoryMenuItemRef = React.useRef<HTMLDivElement | null>(null);
    const categorySubmenuRef = React.useRef<HTMLDivElement | null>(null);

    const taskById = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
    const contextTask = contextMenu ? taskById.get(contextMenu.taskId) ?? null : null;
    const fallbackProjectId = React.useMemo(() => {
        const projectId = window.RedmineCanvasGantt?.projectId;
        return projectId !== undefined && projectId !== null ? String(projectId) : '';
    }, []);

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

    const setDraftState = React.useCallback((next: typeof draft) => {
        draftRef.current = next;
        setDraft(next);
    }, []);

    const toLocalPoint = React.useCallback((clientX: number, clientY: number) => {
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect) return { x: clientX, y: clientY };
        return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const hitTestTask = React.useCallback((x: number, y: number) => {
        // Dependency dragging only needs hit-testing against currently visible rows.
        const { viewport: currentViewport, tasks: currentTasks, rowCount: currentRowCount } = useTaskStore.getState();
        const [s, e] = LayoutEngine.getVisibleRowRange(currentViewport, currentRowCount || currentTasks.length);
        const candidates = LayoutEngine.sliceTasksInRowRange(currentTasks, s, e);
        for (const task of candidates) {
            const bounds = LayoutEngine.getTaskBounds(task, currentViewport, 'hit', zoomLevel);
            if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
                return task;
            }
        }
        return null;
    }, [zoomLevel]);

    const handleMouseMove = React.useCallback((e: MouseEvent) => {
        const currentDraft = draftRef.current;
        if (!currentDraft) return;
        const point = toLocalPoint(e.clientX, e.clientY);
        const targetTask = hitTestTask(point.x, point.y);
        setDraftState({ ...currentDraft, pointer: point, targetId: targetTask ? targetTask.id : undefined });
    }, [hitTestTask, setDraftState, toLocalPoint]);

    const handleMouseUp = React.useCallback(async () => {
        const currentDraft = draftRef.current;
        if (!currentDraft) return;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        draftRef.current = null;
        setDraft(null);

        const { fromId, targetId } = currentDraft;
        if (!targetId || targetId === fromId) return;

        const { relations, addRelation } = useTaskStore.getState();
        const alreadyLinked = relations.some(r => r.from === fromId && r.to === targetId && r.type === RelationType.Precedes);
        if (alreadyLinked) {
            useUIStore.getState().addNotification(i18n.t('label_relation_already_exists') || 'Relation already exists', 'info');
            return;
        }

        try {
            const relation = await apiClient.createRelation(fromId, targetId, RelationType.Precedes);
            addRelation(relation);
            try {
                await refreshData();
            } catch (refreshError: unknown) {
                const message = refreshError instanceof Error ? refreshError.message : undefined;
                useUIStore.getState().addNotification(message || 'Failed to refresh data.', 'warning');
            }
            useUIStore.getState().addNotification(i18n.t('label_relation_added') || 'Dependency created', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || i18n.t('label_error') || 'Failed to create relation', 'error');
        }
    }, [handleMouseMove, refreshData]);

    const startDraft = React.useCallback((taskId: string, x: number, y: number) => {
        const startPoint = { x, y };
        setDraftState({ fromId: taskId, start: startPoint, pointer: startPoint });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, handleMouseUp, setDraftState]);

    React.useEffect(() => {
        const handleGlobalMouseDown = (e: MouseEvent) => {
            if (contextMenu) {
                const target = e.target as HTMLElement;
                // If it's not a menu item (which handles its own closure), close the menu
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
    }, [handleMouseMove, handleMouseUp, contextMenu, setContextMenu]);


    const relatedRelations = React.useMemo(() => {
        if (!contextMenu) return [];
        return relations.filter(r => r.from === contextMenu.taskId || r.to === contextMenu.taskId);
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
            setMenuPosition((prev) => {
                if (!prev || prev.x !== nextX || prev.y !== nextY) {
                    return { x: nextX, y: nextY };
                }
                return prev;
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

    const getTaskLabel = React.useCallback((taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        return {
            id: taskId,
            subject: task?.subject ? task.subject : taskId
        };
    }, [tasks]);

    const formatRelationLabel = React.useCallback((rel: { from: string; to: string }) => {
        const from = getTaskLabel(rel.from);
        const to = getTaskLabel(rel.to);
        return { from, to };
    }, [getTaskLabel]);

    const handleRemoveRelation = React.useCallback(async (relationId: string) => {
        try {
            await apiClient.deleteRelation(relationId);
            useTaskStore.getState().removeRelation(relationId);
            try {
                await refreshData();
            } catch (refreshError: unknown) {
                const message = refreshError instanceof Error ? refreshError.message : undefined;
                useUIStore.getState().addNotification(message || 'Failed to refresh data.', 'warning');
            }
            useUIStore.getState().addNotification(i18n.t('label_relation_removed') || 'Dependency removed', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || (i18n.t('label_relation_remove_failed') || 'Failed to remove relation'), 'error');
        } finally {
            useTaskStore.getState().setContextMenu(null);
        }
    }, [refreshData]);

    const handleTaskDelete = React.useCallback(async (taskId: string) => {
        const msg = i18n.t('text_are_you_sure') || 'Are you sure?';
        if (!window.confirm(msg)) return;

        try {
            await apiClient.deleteTask(taskId);
            useTaskStore.getState().removeTask(taskId);
            useUIStore.getState().addNotification((i18n.t('button_delete') || 'Delete') + ': ' + (i18n.t('label_success') || 'Success'), 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || (i18n.t('label_delete_task_failed') || 'Failed to delete task'), 'error');
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

    const closeCategorySubmenu = React.useCallback((force = false) => {
        if (!force && contextCategoryMenu.pinned) return;
        setContextCategoryMenu({ open: false, pinned: false, loading: false });
    }, [contextCategoryMenu.pinned, setContextCategoryMenu]);

    const loadCategorySubmenu = React.useCallback(async (taskId: string, pinned: boolean) => {
        setContextCategoryMenu({
            taskId,
            open: true,
            pinned,
            loading: true,
            disabled: false,
            disabledReason: undefined,
            options: []
        });

        try {
            const editMeta = await apiClient.fetchEditMeta(taskId);
            const canEditCategory = Boolean(editMeta.editable.categoryId);
            const options = editMeta.options.categories;
            const disabledReason = canEditCategory ? undefined : (i18n.t('label_category_assignment_forbidden') || 'Category update is not allowed');
            setContextCategoryOptions(taskId, options, !canEditCategory, disabledReason);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : (i18n.t('label_failed_to_load_edit_options') || 'Failed to load edit options');
            setContextCategoryOptions(taskId, [], true, message);
        } finally {
            setContextCategoryMenu({ loading: false });
        }
    }, [setContextCategoryMenu, setContextCategoryOptions]);

    const handleCategoryMenuHover = React.useCallback(() => {
        if (!contextMenu?.taskId) return;
        if (contextCategoryMenu.open) return;
        void loadCategorySubmenu(contextMenu.taskId, false);
    }, [contextCategoryMenu.open, contextMenu?.taskId, loadCategorySubmenu]);

    const handleCategoryMenuClick = React.useCallback(() => {
        if (!contextMenu?.taskId) return;
        const shouldPin = !contextCategoryMenu.pinned;
        void loadCategorySubmenu(contextMenu.taskId, shouldPin);
    }, [contextCategoryMenu.pinned, contextMenu?.taskId, loadCategorySubmenu]);

    const handleCategorySelect = React.useCallback(async (categoryId: number, categoryName: string) => {
        const taskId = contextMenu?.taskId;
        if (!taskId) return;
        const task = taskById.get(taskId);
        if (!task) return;

        if (contextCategoryMenu.disabled || contextCategoryMenu.loading) return;

        setContextCategoryMenu({ loading: true, pinned: true });
        try {
            await InlineEditService.saveTaskFields({
                taskId,
                optimisticTaskUpdates: { categoryId, categoryName },
                rollbackTaskUpdates: { categoryId: task.categoryId, categoryName: task.categoryName },
                fields: { category_id: categoryId }
            });
            clearContextCategoryMenu();
            setContextMenu(null);
        } catch {
            setContextCategoryMenu({ loading: false, open: true, pinned: true });
        }
    }, [clearContextCategoryMenu, contextCategoryMenu.disabled, contextCategoryMenu.loading, contextMenu?.taskId, setContextCategoryMenu, setContextMenu, taskById]);

    React.useEffect(() => {
        if (!contextMenu) {
            clearContextCategoryMenu();
        }
    }, [clearContextCategoryMenu, contextMenu]);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && contextCategoryMenu.open) {
                e.preventDefault();
                setContextCategoryMenu({ open: false, pinned: false, loading: false });
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [contextCategoryMenu.open, setContextCategoryMenu]);

    return (
        <>
            <div
                ref={overlayRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
            >
                {visibleTasks.map(task => {
                    if (task.id !== hoveredTaskId) return null;

                    const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
                    const centerY = bounds.y + bounds.height / 2;
                    // Position handles OUTSIDE the task bar to avoid conflict with resize handles
                    const handleOffset = 12; // Distance from bar edge
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
                        zIndex: 100 // Ensure above other things
                    };

                    return (
                        <React.Fragment key={`handles-${task.id}`}>
                            {/* Left handle - positioned outside the bar */}
                            <div
                                className="dependency-handle"
                                style={{ ...baseStyle, left: bounds.x - handleOffset - 5 }}
                                onMouseDown={() => {
                                    startDraft(task.id, bounds.x, centerY);
                                }}
                            />
                            {/* Right handle - positioned outside the bar */}
                            <div
                                className="dependency-handle"
                                style={{ ...baseStyle, left: bounds.x + bounds.width + handleOffset - 5 }}
                                onMouseDown={() => {
                                    startDraft(task.id, bounds.x + bounds.width, centerY);
                                }}
                            />
                        </React.Fragment>
                    );
                })}

                {draft && (
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                        <defs>
                            <marker id="draft-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L6,3 z" fill="#1a73e8" />
                            </marker>
                        </defs>
                        <line
                            x1={draft.start.x}
                            y1={draft.start.y}
                            x2={draft.pointer.x}
                            y2={draft.pointer.y}
                            stroke="#1a73e8"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            markerEnd="url(#draft-arrow)"
                        />
                    </svg>
                )}
            </div>

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
                        onContextMenu={(e) => {
                            e.preventDefault();
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
                        .menu-item.disabled {
                            color: #9aa0a6;
                            cursor: not-allowed;
                        }
                        .menu-item.disabled:hover {
                            background-color: transparent;
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
                        .menu-submenu {
                            position: absolute;
                            top: 0;
                            left: calc(100% + 6px);
                            min-width: 220px;
                            background: #fff;
                            border-radius: 8px;
                            border: 1px solid #e5e5e5;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                            padding: 6px;
                        }
                        .menu-submenu-title {
                            font-size: 11px;
                            font-weight: 700;
                            color: #888;
                            padding: 4px 10px;
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

                        <div
                            ref={categoryMenuItemRef}
                            className={`menu-item ${contextTask?.editable ? '' : 'disabled'}`}
                            data-testid="context-menu-category"
                            style={{ position: 'relative', justifyContent: 'space-between' }}
                            onMouseEnter={() => {
                                if (contextTask?.editable) handleCategoryMenuHover();
                            }}
                            onMouseLeave={(e) => {
                                if (contextCategoryMenu.pinned) return;
                                const related = e.relatedTarget as Node | null;
                                if (categorySubmenuRef.current?.contains(related)) return;
                                closeCategorySubmenu();
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!contextTask?.editable) return;
                                handleCategoryMenuClick();
                            }}
                        >
                            <span>{i18n.t('field_category') || 'Category'}</span>
                            <span style={{ fontSize: 11, opacity: 0.7 }}>▶</span>
                            {contextCategoryMenu.open && contextCategoryMenu.taskId === contextMenu.taskId && (
                                <div
                                    ref={categorySubmenuRef}
                                    className="menu-submenu"
                                    data-testid="context-menu-category-submenu"
                                    onMouseLeave={(e) => {
                                        if (contextCategoryMenu.pinned) return;
                                        const related = e.relatedTarget as Node | null;
                                        if (categoryMenuItemRef.current?.contains(related)) return;
                                        closeCategorySubmenu();
                                    }}
                                >
                                    <div className="menu-submenu-title">{i18n.t('field_category') || 'Category'}</div>
                                    {contextCategoryMenu.loading && (
                                        <div className="menu-item disabled">{i18n.t('label_loading') || 'Loading...'}</div>
                                    )}
                                    {!contextCategoryMenu.loading && contextCategoryMenu.disabled && (
                                        <div className="menu-item disabled" data-testid="context-menu-category-disabled">
                                            {contextCategoryMenu.disabledReason || i18n.t('label_category_assignment_forbidden') || 'Category update is not allowed'}
                                        </div>
                                    )}
                                    {!contextCategoryMenu.loading && !contextCategoryMenu.disabled && contextCategoryMenu.options.length === 0 && (
                                        <div className="menu-item disabled" data-testid="context-menu-category-empty">
                                            {i18n.t('label_no_assignable_categories') || 'No assignable category'}
                                        </div>
                                    )}
                                    {!contextCategoryMenu.loading && !contextCategoryMenu.disabled && contextCategoryMenu.options.map((option) => (
                                        <div
                                            key={option.id}
                                            className="menu-item"
                                            data-testid={`context-menu-category-option-${option.id}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleCategorySelect(option.id, option.name);
                                            }}
                                        >
                                            {option.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="menu-item" data-testid="context-menu-add-child-task" onClick={() => {
                            const query = new URLSearchParams();
                            // Redmine new issue form expects nested params; keep legacy param for compatibility.
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

                        <div className="menu-item danger" onClick={() => handleTaskDelete(contextMenu.taskId)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                            {i18n.t('button_delete')}
                        </div>

                        {relatedRelations.length > 0 && (
                            <>
                                <div className="menu-divider" />
                                <div className="menu-section-title">
                                    {i18n.t('label_relations_remove_heading') || 'Remove dependency'}
                                </div>

                                {relatedRelations.map((rel) => {
                                    const { from, to } = formatRelationLabel(rel);
                                    const fromIsContext = contextMenu.taskId === from.id;
                                    const direction = fromIsContext ? '→' : '←';

                                    return (
                                        <div
                                            key={rel.id}
                                            className="menu-item danger"
                                            data-testid={`remove-relation-${rel.id}`}
                                            onClick={() => handleRemoveRelation(rel.id)}
                                            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                                        >
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M18.36 6.64a9 9 0 1 1-12.73 12.73 9 9 0 0 1 12.73-12.73z" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                                <span style={{ fontWeight: 600 }}>#{rel.id}</span>
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
