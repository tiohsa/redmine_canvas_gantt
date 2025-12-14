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
    const setContextMenu = useTaskStore(state => state.setContextMenu);
    const viewport = useTaskStore(state => state.viewport);
    const rowCount = useTaskStore(state => state.rowCount);
    const addRelation = useTaskStore(state => state.addRelation);
    const { addNotification } = useUIStore();

    const overlayRef = React.useRef<HTMLDivElement>(null);
    const [draft, setDraft] = React.useState<{ fromId: string; start: { x: number; y: number }; pointer: { x: number; y: number }; targetId?: string } | null>(null);

    const hoveredTask = hoveredTaskId ? tasks.find(t => t.id === hoveredTaskId) : null;

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

    const toLocalPoint = (clientX: number, clientY: number) => {
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect) return { x: clientX, y: clientY };
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const hitTestTask = (x: number, y: number) => {
        for (const task of tasks) {
            const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit');
            if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
                return task;
            }
        }
        return null;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!draft) return;
        const point = toLocalPoint(e.clientX, e.clientY);
        const targetTask = hitTestTask(point.x, point.y);
        setDraft({ ...draft, pointer: point, targetId: targetTask ? targetTask.id : undefined });
    };

    const handleMouseUp = async () => {
        if (!draft) return;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        const { fromId, targetId } = draft;
        setDraft(null);

        if (!targetId || targetId === fromId) return;

        const alreadyLinked = useTaskStore.getState().relations.some(r => r.from === fromId && r.to === targetId && r.type === RelationType.Precedes);
        if (alreadyLinked) {
            addNotification(i18n.t('label_relation_already_exists') || 'Relation already exists', 'info');
            return;
        }

        try {
            const relation = await apiClient.createRelation(fromId, targetId, RelationType.Precedes);
            addRelation(relation);
            addNotification(i18n.t('label_relation_added') || 'Dependency created', 'success');
        } catch (error: any) {
            addNotification(error?.message || 'Failed to create relation', 'error');
        }
    };

    const startDraft = (taskId: string, x: number, y: number) => {
        const startPoint = { x, y };
        setDraft({ fromId: taskId, start: startPoint, pointer: startPoint });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    React.useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const handleNativeMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target && target.classList.contains('dependency-handle')) {
                e.stopPropagation();
            }
        };

        overlay.addEventListener('mousedown', handleNativeMouseDown);
        return () => {
            overlay.removeEventListener('mousedown', handleNativeMouseDown);
        };
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
                        <li style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }} onClick={() => alert('Edit task ' + contextMenu.taskId)}>{i18n.t('button_edit')}</li>
                        <li style={{ padding: '8px 12px', cursor: 'pointer', color: 'red' }} onClick={() => alert('Delete task ' + contextMenu.taskId)}>{i18n.t('button_delete')}</li>
                    </ul>
                </div>
            )}
        </div>
    );
};
