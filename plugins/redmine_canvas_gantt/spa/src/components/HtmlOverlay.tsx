import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';

export const HtmlOverlay: React.FC = () => {
    const hoveredTaskId = useTaskStore(state => state.hoveredTaskId);
    const contextMenu = useTaskStore(state => state.contextMenu);
    const tasks = useTaskStore(state => state.tasks);
    const setContextMenu = useTaskStore(state => state.setContextMenu);

    const hoveredTask = hoveredTaskId ? tasks.find(t => t.id === hoveredTaskId) : null;

    // Simple cursor follower for tooltip (could be improved)
    // For now, we don't have mouse position in store, so we might need it from InteractionEngine?
    // Actually, standard is to put tooltip near the task bar or cursor.
    // Let's assume fixed position bottom-left or use mouse tracking if we had it.
    // Simpler: CSS based tooltip on a transparent div over the task?
    // Or: Just show it at a fixed place or use InteractionEngine to update mouse pos in store.

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
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
