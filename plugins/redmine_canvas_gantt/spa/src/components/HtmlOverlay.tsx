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

    const hoveredTask = hoveredTaskId ? tasks.find(t => t.id === hoveredTaskId) : null;
    const contextTask = contextMenu ? tasks.find(t => t.id === contextMenu.taskId) : null;

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

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
        const { tasks: currentTasks, viewport: currentViewport } = useTaskStore.getState();
        for (const task of currentTasks) {
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

    React.useEffect(() => () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove, handleMouseUp]);

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

    return (
        <div
            ref={overlayRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
        >
            {visibleTasks.map(task => {
                if (task.id !== hoveredTaskId) return null;

                const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit');
                const centerY = bounds.y + bounds.height / 2;
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
                        <div
                            className="dependency-handle"
                            style={{ ...baseStyle, left: bounds.x - 5 }}
                            onMouseDown={() => {
                                // e.stopPropagation(); // React synthetic - not enough, handled by native listener
                                startDraft(task.id, bounds.x, centerY);
                            }}
                        />
                        <div
                            className="dependency-handle"
                            style={{ ...baseStyle, left: bounds.x + bounds.width - 5 }}
                            onMouseDown={() => {
                                // e.stopPropagation();
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

            {hoveredTask && (
                <div style={{
                    position: 'fixed',
                    bottom: 20,
                    left: 20,
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    pointerEvents: 'none'
                }}>
                    <div><strong>{hoveredTask.subject}</strong></div>
                    <div>{new Date(hoveredTask.startDate).toLocaleDateString()} - {new Date(hoveredTask.dueDate).toLocaleDateString()}</div>
                    <div>{hoveredTask.ratioDone}% {i18n.t('done')}</div>
                </div>
            )}

            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: 'white',
                        border: '1px solid #ccc',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                        pointerEvents: 'auto'
                    }}
                    onMouseLeave={() => setContextMenu(null)}
                >
                    <ul style={{ listStyle: 'none', margin: 0, padding: '4px' }}>
                        <li style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }} onClick={() => setContextMenu(null)}>{i18n.t('button_edit')}</li>
                        <li style={{ padding: '8px 12px', cursor: 'pointer', color: 'red', borderBottom: relatedRelations.length > 0 ? '1px solid #eee' : undefined }} onClick={() => setContextMenu(null)}>{i18n.t('button_delete')}</li>
                        {relatedRelations.length > 0 && (
                            <li style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                color: '#666',
                                borderBottom: '1px solid #eee'
                            }}>
                                {i18n.t('label_relations_remove_heading') || 'Remove dependency'}
                                {contextTask ? (
                                    <span style={{ marginLeft: 8, color: '#999' }}>
                                        ({contextTask.subject} #{contextTask.id})
                                    </span>
                                ) : null}
                            </li>
                        )}
                        {relatedRelations.map((rel) => {
                            const { from, to } = formatRelationLabel(rel);
                            const fromIsContext = contextMenu.taskId === from.id;
                            const toIsContext = contextMenu.taskId === to.id;
                            const emphasisId = (fromIsContext ? from.id : (toIsContext ? to.id : null));
                            const direction = fromIsContext ? '→' : '←';

                            return (
                                <li
                                    key={rel.id}
                                    data-testid={`remove-relation-${rel.id}`}
                                    style={{ padding: '8px 12px', cursor: 'pointer', color: '#d32f2f' }}
                                    onClick={() => handleRemoveRelation(rel.id)}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 260 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                            <span style={{ fontWeight: 700 }}>{i18n.t('label_relation_remove') || 'Remove dependency'}</span>
                                            <span style={{ fontSize: 12, color: '#999' }}>#{rel.id}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontWeight: emphasisId === from.id ? 700 : 400 }}>
                                                {from.subject} #{from.id}
                                            </span>
                                            <span style={{ margin: '0 6px', color: '#999' }}>{direction}</span>
                                            <span style={{ fontWeight: emphasisId === to.id ? 700 : 400 }}>
                                                {to.subject} #{to.id}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};
