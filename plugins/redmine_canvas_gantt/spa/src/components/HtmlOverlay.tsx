import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { LayoutEngine } from '../engines/LayoutEngine';
import { apiClient } from '../api/client';
import { RelationType } from '../types/constraints';
import { useUIStore } from '../stores/UIStore';

export const HtmlOverlay: React.FC = () => {
    const hoveredTaskId = useTaskStore(state => state.hoveredTaskId);
    const contextMenu = useTaskStore(state => state.contextMenu);
    const tasks = useTaskStore(state => state.tasks);
    const relations = useTaskStore(state => state.relations);
    const setContextMenu = useTaskStore(state => state.setContextMenu);
    const viewport = useTaskStore(state => state.viewport);
    const rowCount = useTaskStore(state => state.rowCount);

    const overlayRef = React.useRef<HTMLDivElement>(null);
    const [draft, setDraft] = React.useState<{ fromId: string; start: { x: number; y: number }; pointer: { x: number; y: number }; targetId?: string } | null>(null);
    const draftRef = React.useRef<typeof draft>(null);

    const taskById = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
    const contextTask = contextMenu ? taskById.get(contextMenu.taskId) ?? null : null;

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
            const bounds = LayoutEngine.getTaskBounds(task, currentViewport, 'hit');
            if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
                return task;
            }
        }
        return null;
    }, []);

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
            useUIStore.getState().addNotification(i18n.t('label_relation_added') || 'Dependency created', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || 'Failed to create relation', 'error');
        }
    }, [handleMouseMove]);

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
            useUIStore.getState().addNotification(i18n.t('label_relation_removed') || 'Dependency removed', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || (i18n.t('label_relation_remove_failed') || 'Failed to remove relation'), 'error');
        } finally {
            useTaskStore.getState().setContextMenu(null);
        }
    }, []);

    const handleTaskDelete = React.useCallback(async (taskId: string) => {
        const msg = i18n.t('text_are_you_sure') || 'Are you sure?';
        if (!window.confirm(msg)) return;

        try {
            await apiClient.deleteTask(taskId);
            useTaskStore.getState().removeTask(taskId);
            useUIStore.getState().addNotification(i18n.t('button_delete') + ': Success', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : undefined;
            useUIStore.getState().addNotification(message || 'Failed to delete task', 'error');
        } finally {
            useTaskStore.getState().setContextMenu(null);
        }
    }, []);

    return (
        <div
            ref={overlayRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
        >
            {visibleTasks.map(task => {
                if (task.id !== hoveredTaskId) return null;

                const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit');
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
                        markerEnd="url(#draft-arrow)"
                    />
                </svg>
            )}


            {contextMenu && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 999,
                            background: 'transparent'
                        }}
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu(null);
                        }}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            top: contextMenu.y,
                            left: contextMenu.x,
                            background: 'white',
                            borderRadius: '8px',
                            minWidth: '200px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1)',
                            padding: '6px',
                            zIndex: 1000,
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

                        <div className="menu-item" onClick={() => {
                            useUIStore.getState().openIssueDialog(`/projects/${contextTask?.projectId || ''}/issues/new?parent_issue_id=${contextMenu.taskId}`);
                            setContextMenu(null);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            {i18n.t('label_add_child_task') || 'Add Child Task'}
                        </div>

                        <div className="menu-item" onClick={() => {
                            useUIStore.getState().openIssueDialog(`/projects/${contextTask?.projectId || ''}/issues/new`);
                            setContextMenu(null);
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            {i18n.t('label_issue_new') || 'Add New Ticket'}
                        </div>

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
                </>
            )}
        </div>
    );
};
