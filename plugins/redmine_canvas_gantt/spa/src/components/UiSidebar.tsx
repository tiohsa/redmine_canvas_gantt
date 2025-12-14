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

const ProjectIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d61b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
);

const TrackerIcon = ({ name }: { name?: string }) => {
    const lowerName = name?.toLowerCase() || '';

    // Bug icon - 🐞
    if (lowerName.includes('bug') || lowerName.includes('バグ')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                {name && <title>{name}</title>}
                <rect x="8" y="6" width="8" height="14" rx="4" fill="#d32f2f" fillOpacity="0.1" />
                <line x1="4" y1="10" x2="8" y2="10"></line>
                <line x1="16" y1="10" x2="20" y2="10"></line>
                <line x1="4" y1="14" x2="8" y2="14"></line>
                <line x1="16" y1="14" x2="20" y2="14"></line>
                <path d="M10 6 L8 4 M14 6 L16 4"></path>
                <circle cx="10" cy="10" r="1" fill="#d32f2f" />
                <circle cx="14" cy="10" r="1" fill="#d32f2f" />
            </svg>
        );
    }

    // Feature icon - ⭐
    if (lowerName.includes('feature') || lowerName.includes('機能')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                {name && <title>{name}</title>}
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#f57c00" fillOpacity="0.2"></polygon>
            </svg>
        );
    }

    // Support icon - ❓
    if (lowerName.includes('support') || lowerName.includes('サポート')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                {name && <title>{name}</title>}
                <circle cx="12" cy="12" r="10" fill="#1976d2" fillOpacity="0.1"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <circle cx="12" cy="17" r="0.5" fill="#1976d2"></circle>
            </svg>
        );
    }

    // Task icon (default) - 📄
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d61b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            {name && <title>{name}</title>}
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
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
    const projectExpansion = useTaskStore(state => state.projectExpansion);
    const taskExpansion = useTaskStore(state => state.taskExpansion);
    const toggleProjectExpansion = useTaskStore(state => state.toggleProjectExpansion);
    const toggleTaskExpansion = useTaskStore(state => state.toggleTaskExpansion);
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
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: `${8 + (t.indentLevel ?? 0) * 16}px`,
                        fontWeight: t.hasChildren ? 700 : 400,
                        gap: 4
                    }}
                >
                    {t.hasChildren ? (
                        <button
                            type="button"
                            aria-label={taskExpansion[t.id] ?? true ? '折りたたむ' : '展開する'}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskExpansion(t.id);
                            }}
                            style={{
                                width: 18,
                                height: 18,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #d0d0d0',
                                borderRadius: 4,
                                background: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            <span style={{ fontSize: 10, color: '#555', lineHeight: 1 }}>
                                {(taskExpansion[t.id] ?? true) ? '▼' : '▶'}
                            </span>
                        </button>
                    ) : (
                        <span style={{ display: 'inline-block', width: 18 }} />
                    )}
                    <div style={{ marginRight: 6, display: 'flex', alignItems: 'center' }}>
                        <TrackerIcon name={t.trackerName} />
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
                            const expanded = projectExpansion[row.projectId] ?? true;
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
                                    onClick={() => toggleProjectExpansion(row.projectId)}
                                >
                                    <span
                                        aria-label={expanded ? 'プロジェクトを折りたたむ' : 'プロジェクトを展開する'}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 18,
                                            height: 18,
                                            border: '1px solid #d0d0d0',
                                            borderRadius: 4,
                                            marginRight: 8,
                                            background: '#fff',
                                            cursor: 'pointer',
                                            fontSize: 10,
                                            color: '#555'
                                        }}
                                    >
                                        {expanded ? '▼' : '▶'}
                                    </span>
                                    <div style={{ marginRight: 6, display: 'flex', alignItems: 'center' }}>
                                        <ProjectIcon />
                                    </div>
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
