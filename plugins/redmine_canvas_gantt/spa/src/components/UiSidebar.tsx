import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor } from '../utils/styles';

const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const ProgressCircle = ({ ratio, statusId }: { ratio: number, statusId: number }) => {
    const r = 8;
    const c = 2 * Math.PI * r;
    const offset = c - (ratio / 100) * c;

    const style = getStatusColor(statusId);
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
    const viewport = useTaskStore(state => state.viewport);
    const updateViewport = useTaskStore(state => state.updateViewport);
    const selectTask = useTaskStore(state => state.selectTask);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const visibleColumns = useUIStore(state => state.visibleColumns);

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, tasks.length);
    const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

    const handleWheel = (e: React.WheelEvent) => {
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const allColumns = [
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
                    {/* Requirement 2: Link to ticket */}
                    <a
                        href={`/issues/${t.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'inherit', textDecoration: 'none' }}
                        onMouseDown={(e) => e.stopPropagation()} // Prevent row selection when clicking link
                        onClick={(e) => e.stopPropagation()}
                    >
                        <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>{t.subject}</span>
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

    const columns = allColumns.filter(c => visibleColumns.includes(c.key));

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
            < div style={{
                height: 48,
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                fontWeight: 600,
                backgroundColor: '#f8f9fa',
                color: '#444',
                fontSize: '13px'
            }}>
                {
                    columns.map((col, idx) => (
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
            </div >

            {/* Body */}
            < div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {
                    visibleTasks.map(task => {
                        const top = task.rowIndex * viewport.rowHeight - viewport.scrollY;
                        const isSelected = task.id === selectedTaskId;

                        // Requirement 7: Visual indication of Group Header?
                        // If we use pseudo-tasks with isGroupHeader, we can style them differently.
                        if (task.isGroupHeader) {
                             return (
                                <div
                                    key={task.id}
                                    style={{
                                        position: 'absolute',
                                        top: top,
                                        left: 0,
                                        height: viewport.rowHeight,
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderBottom: '1px solid #f5f5f5',
                                        backgroundColor: '#eee',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        color: '#333',
                                        paddingLeft: '8px'
                                    }}
                                >
                                    {task.subject}
                                </div>
                             );
                        }

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
                                {columns.map((col, idx) => (
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
            </div >
        </div >
    );
};
