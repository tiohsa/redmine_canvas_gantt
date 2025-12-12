import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor } from '../utils/styles';

const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const formatDate = (value: number) => {
    return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
};

const ProgressBar = ({ ratio, tone }: { ratio: number; tone: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
        <div style={{ flex: 1, height: 8, background: '#eef2f7', borderRadius: 999, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(16,38,87,0.08)' }}>
            <div style={{ width: `${Math.min(100, ratio)}%`, height: '100%', background: tone, borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3d4354', minWidth: 36, textAlign: 'right' }}>{ratio}%</span>
    </div>
);

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
            width: 300,
            render: (t: Task) => {
                const style = getStatusColor(t.statusId);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: t.parentId ? 28 : 12, gap: 10, fontWeight: t.parentId ? 600 : 700, color: '#2c3544', letterSpacing: '-0.01em' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: style.bar, boxShadow: '0 0 0 4px rgba(61,127,245,0.08)' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                    </div>
                );
            }
        },
        {
            key: 'status',
            title: 'Status',
            width: 120,
            render: (t: Task) => {
                const style = getStatusColor(t.statusId);
                return (
                    <span style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        padding: '6px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        whiteSpace: 'nowrap',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)'
                    }}>
                        {style.label}
                    </span>
                );
            }
        },
        {
            key: 'assignee',
            title: 'Assignee',
            width: 110,
            render: (t: Task) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.assignedToName && (
                        <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #5a6ff0 0%, #7ac5ff 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            color: 'white',
                            justifyContent: 'center',
                            fontSize: '11px',
                            boxShadow: '0 6px 12px rgba(90,111,240,0.18)'
                        }}
                            title={t.assignedToName}
                        >
                            {getInitials(t.assignedToName)}
                        </div>
                    )}
                </div>
            )
        },
        { key: 'startDate', title: 'Start Date', width: 110, render: (t: Task) => <span style={{ color: '#6a7282', fontWeight: 600 }}>{formatDate(t.startDate)}</span> },
        { key: 'dueDate', title: 'Due Date', width: 110, render: (t: Task) => <span style={{ color: '#6a7282', fontWeight: 600 }}>{formatDate(t.dueDate)}</span> },
        {
            key: 'ratioDone',
            title: 'Progress',
            width: 130,
            render: (t: Task) => {
                const style = getStatusColor(t.statusId);
                return <ProgressBar ratio={t.ratioDone} tone={style.progress || style.bar} />;
            }
        },
    ];

    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

    return (
        <div
            style={{
                width: totalWidth,
                backgroundColor: '#fdfefe',
                borderRight: '1px solid #e6e9f1',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flexShrink: 0
            }}
            onWheel={handleWheel}
        >
            {/* Header */}
            <div style={{
                height: 54,
                borderBottom: '1px solid #e6e9f1',
                display: 'flex',
                fontWeight: 700,
                background: 'linear-gradient(180deg, #f8fafc 0%, #f2f5fa 100%)',
                color: '#444',
                fontSize: '13px',
                letterSpacing: '0.02em'
            }}>
                {columns.map((col, idx) => (
                    <div key={idx} style={{
                        width: col.width,
                        padding: '0 12px',
                        borderRight: idx === columns.length - 1 ? 'none' : '1px solid #f1f3f7',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        boxSizing: 'border-box'
                    }}>
                        {col.title}
                    </div>
                ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#ffffff' }}>
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
                                borderBottom: '1px solid #f0f3f8',
                                backgroundColor: isSelected ? '#f0f5ff' : 'white',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: '#333',
                                transition: 'background-color 0.1s',
                                boxSizing: 'border-box'
                            }}
                        >
                            {columns.map((col, idx) => (
                                <div key={idx} style={{
                                    width: col.width,
                                    padding: '0 12px',
                                    borderRight: idx === columns.length - 1 ? 'none' : '1px solid #f8f9fb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                    boxSizing: 'border-box'
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
