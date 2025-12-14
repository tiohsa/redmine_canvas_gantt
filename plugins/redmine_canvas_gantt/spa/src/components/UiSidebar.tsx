import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor } from '../utils/styles';
import { useUIStore } from '../stores/UIStore';

const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const ProgressCircle = ({ ratio, statusId }: { ratio: number, statusId: number }) => {
    const r = 8;
    const c = 2 * Math.PI * r;
    const offset = c - (ratio / 100) * c;

    const style = getStatusColor(statusId);
    // Use status color for the circle
    const color = style.text;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="10" cy="10" r={r} fill="none" stroke="#e0e0e0" strokeWidth="3" />
                <circle cx="10" cy="10" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: '12px', color: '#666' }}>{ratio}%</span>
        </div>
    );
};

export const UiSidebar: React.FC = () => {
    const tasks = useTaskStore(state => state.tasks);
    const layoutRows = useTaskStore(state => state.layoutRows);
    const rowCount = useTaskStore(state => state.rowCount);
    const viewport = useTaskStore(state => state.viewport);
    const updateViewport = useTaskStore(state => state.updateViewport);
    const selectTask = useTaskStore(state => state.selectTask);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const visibleColumns = useUIStore(state => state.visibleColumns);

    const taskMap = React.useMemo(() => {
        const map = new Map<string, Task>();
        tasks.forEach(t => map.set(t.id, t));
        return map;
    }, [tasks]);

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleRows = layoutRows.filter(row => row.rowIndex >= startRow && row.rowIndex <= endRow);

    const handleWheel = (e: React.WheelEvent) => {
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const columns = [
        {
            key: 'id',
            title: 'ID',
            width: 72,
            render: (t: Task) => (
                <span
                    data-testid={`task-id-${t.id}`}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', color: '#666' }}
                >
                    {t.id}
                </span>
            )
        },
        {
            key: 'subject',
            title: 'Task Name',
            width: 280,
            render: (t: Task) => (
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: t.parentId ? '24px' : '4px', fontWeight: t.parentId ? 400 : 600 }}>
                    {/* Chevron for parent tasks or roots */}
                    <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, cursor: 'pointer', visibility: 'visible' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <a
                        href={`/issues/${t.id}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: '#1a73e8', textDecoration: 'none' }}
                        title={t.subject}
                    >
                        {t.subject}
                    </a>
                </div>
            )
        },
        {
            key: 'status',
            title: 'Status',
            width: 100,
            render: (t: Task) => {
                const style = getStatusColor(t.statusId);
                return (
                    <span style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'inline-block',
                        whiteSpace: 'nowrap'
                    }}>
                        {style.label}
                    </span>
                );
            }
        },
        {
            key: 'assignee',
            title: 'Assignee',
            width: 80,
            render: (t: Task) => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                    {t.assignedToName && (
                        <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#bdbdbd',
                            display: 'flex',
                            alignItems: 'center',
                            color: 'white',
                            justifyContent: 'center',
                            fontSize: '10px'
                        }}
                            title={t.assignedToName}
                        >
                            {/* In real app, check for avatar URL */}
                            {getInitials(t.assignedToName)}
                        </div>
                    )}
                </div>
            )
        },
        {
            key: 'startDate',
            title: 'Start Date',
            width: 90,
            render: (t: Task) => <span style={{ color: '#666' }}>{Number.isFinite(t.startDate) ? new Date(t.startDate).toLocaleDateString() : '-'}</span>
        },
        {
            key: 'dueDate',
            title: 'Due Date',
            width: 90,
            render: (t: Task) => <span style={{ color: '#666' }}>{Number.isFinite(t.dueDate) ? new Date(t.dueDate).toLocaleDateString() : '-'}</span>
        },
        {
            key: 'ratioDone',
            title: 'Progress',
            width: 80,
            render: (t: Task) => <ProgressCircle ratio={t.ratioDone} statusId={t.statusId} />
        },
    ];

    const activeColumns = columns.filter(col => col.key === 'subject' || visibleColumns.includes(col.key));

    return (
        <div
            style={{
                width: '100%',
                backgroundColor: '#ffffff',
                borderRight: '1px solid #e0e0e0',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flexShrink: 0
            }}
            onWheel={handleWheel}
        >
            {/* Header */}
            <div style={{
                height: 48,
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                fontWeight: 600,
                backgroundColor: '#f8f9fa',
                color: '#444',
                fontSize: '13px'
            }}>
                {
                    activeColumns.map((col, idx) => (
                        <div key={idx} style={{
                            width: col.width,
                            padding: '0 8px',
                            borderRight: '1px solid #f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden'
                        }}>
                            {col.title}
                        </div>
                    ))
                }
            </div>

            {/* Body */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {
                    visibleRows.map(row => {
                        const top = row.rowIndex * viewport.rowHeight - viewport.scrollY;
                        if (row.type === 'header') {
                            return (
                                <div
                                    key={`header-${row.projectId}-${row.rowIndex}`}
                                    style={{
                                        position: 'absolute',
                                        top,
                                        left: 0,
                                        height: viewport.rowHeight,
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0 12px',
                                        backgroundColor: '#f1f3f5',
                                        color: '#333',
                                        fontWeight: 700,
                                        borderBottom: '1px solid #e0e0e0',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    {row.projectName || 'Project'}
                                </div>
                            );
                        }

                        const task = taskMap.get(row.taskId);
                        if (!task) return null;
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
                                    width: '100%',
                                    display: 'flex',
                                    borderBottom: '1px solid #f5f5f5',
                                    backgroundColor: isSelected ? '#f0f7ff' : 'white',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: '#333',
                                    transition: 'background-color 0.1s'
                                }}
                            >
                                {activeColumns.map((col, idx) => (
                                    <div key={idx} style={{
                                        width: col.width,
                                        padding: '0 8px',
                                        borderRight: '1px solid #f9f9f9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {col.render ? col.render(task) : (task as any)[col.key]}
                                    </div>
                                ))}
                            </div>
                        );
                    })
                }
            </div>
        </div>
    );
};
