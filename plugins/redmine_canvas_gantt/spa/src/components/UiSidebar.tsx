import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import { i18n } from '../utils/i18n';

export const UiSidebar: React.FC = () => {
    const tasks = useTaskStore(state => state.tasks);
    const viewport = useTaskStore(state => state.viewport);
    const updateViewport = useTaskStore(state => state.updateViewport);
    const selectTask = useTaskStore(state => state.selectTask);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);

    // We render only visible rows, similar to TaskRenderer
    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, tasks.length);
    const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

    const handleWheel = (e: React.WheelEvent) => {
        // Sync scrolling
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const columns = [
        { key: 'id', title: '#', width: 50 },
        { key: 'subject', title: i18n.t('field_subject'), width: 200 },
        { key: 'startDate', title: i18n.t('field_start_date'), width: 90, format: (t: any) => new Date(t.startDate).toLocaleDateString() },
        { key: 'dueDate', title: i18n.t('field_due_date'), width: 90, format: (t: any) => new Date(t.dueDate).toLocaleDateString() },
        { key: 'statusId', title: i18n.t('field_status'), width: 60 }, // Need status name map... using ID for now
        { key: 'ratioDone', title: '%', width: 50, format: (t: any) => `${t.ratioDone}%` },
    ];

    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

    return (
        <div
            style={{
                width: totalWidth,
                backgroundColor: '#f9f9f9',
                borderRight: '1px solid #ccc',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flexShrink: 0
            }}
            onWheel={handleWheel}
        >
            {/* Header */}
            <div style={{ height: 40, borderBottom: '1px solid #ddd', display: 'flex', fontWeight: 'bold', backgroundColor: '#eee' }}>
                {columns.map(col => (
                    <div key={col.key} style={{ width: col.width, padding: '0 4px', borderRight: '1px solid #ddd', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                        {col.title}
                    </div>
                ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {visibleTasks.map(task => {
                    const top = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                    const isSelected = task.id === selectedTaskId;

                    return (
                        <div
                            key={task.id}
                            onClick={() => selectTask(task.id)}
                            style={{
                                position: 'absolute',
                                top: top,
                                left: 0,
                                height: viewport.rowHeight,
                                width: totalWidth,
                                display: 'flex',
                                borderBottom: '1px solid #eee',
                                backgroundColor: isSelected ? '#fff3e0' : 'white',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            {columns.map(col => (
                                <div key={col.key} style={{ width: col.width, padding: '0 4px', borderRight: '1px solid #eee', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                    {col.format ? col.format(task) : (task as any)[col.key]}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
