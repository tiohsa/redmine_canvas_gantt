import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor } from '../utils/styles';

const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const ProgressCircle = ({ ratio }: { ratio: number }) => {
    const r = 8;
    const c = 2 * Math.PI * r;
    const offset = c - (ratio / 100) * c;

    // Choose color based on progress (green if done or high, blue otherwise)
    const color = ratio === 100 ? '#4caf50' : '#2196f3';

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

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, tasks.length);
    const visibleTasks = tasks.filter(t => t.rowIndex >= startRow && t.rowIndex <= endRow);

    const handleWheel = (e: React.WheelEvent) => {
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const columns = [
        {
            key: 'subject',
            title: 'Task Name',
            width: 280,
            render: (t: Task) => (
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: t.parentId ? '24px' : '4px', fontWeight: t.parentId ? 400 : 500 }}>
                    {/* Creating a chevron icon using CSS/SVG could go here for parent tasks */}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</span>
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
        { key: 'startDate', title: 'Start Date', width: 90, render: (t: Task) => <span style={{ color: '#666' }}>{new Date(t.startDate).toLocaleDateString()}</span> },
        { key: 'dueDate', title: 'Due Date', width: 90, render: (t: Task) => <span style={{ color: '#666' }}>{new Date(t.dueDate).toLocaleDateString()}</span> },
        {
            key: 'ratioDone',
            title: 'Progress',
            width: 80,
            render: (t: Task) => <ProgressCircle ratio={t.ratioDone} />
        },
    ];

    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

    return (
        <div
            style={{
                width: totalWidth,
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
                height: 48, // Taller header
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                fontWeight: 600,
                backgroundColor: '#f8f9fa',
                color: '#444',
                fontSize: '13px'
            }}>
                {columns.map((col, idx) => (
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
                })}
            </div>
        </div>
    );
};
