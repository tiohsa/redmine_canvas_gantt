import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor } from '../utils/styles';
import { useUIStore } from '../stores/UIStore';
import { loadPreferences } from '../utils/preferences';

import { DoneRatioEditor, DueDateEditor, SelectEditor, SubjectEditor } from './TaskDetailPanel';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { InlineEditSettings, TaskEditMeta } from '../types/editMeta';
import { InlineEditService } from '../services/InlineEditService';
import { i18n } from '../utils/i18n';

const getAvatarColor = (name: string) => {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
);

const TrackerIcon = ({ name }: { name?: string }) => {
    const lowerName = name?.toLowerCase() || '';

    // Bug icon - 🐞
    if (lowerName.includes('bug') || lowerName.includes('バグ')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#f57c00" fillOpacity="0.2"></polygon>
            </svg>
        );
    }

    // Support icon - ❓
    if (lowerName.includes('support') || lowerName.includes('サポート')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" fill="#1976d2" fillOpacity="0.1"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <circle cx="12" cy="17" r="0.5" fill="#1976d2"></circle>
            </svg>
        );
    }

    // Task icon (default) - 📄
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d61b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
    const scrollToTask = useTaskStore(state => state.scrollToTask);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const projectExpansion = useTaskStore(state => state.projectExpansion);
    const taskExpansion = useTaskStore(state => state.taskExpansion);
    const toggleProjectExpansion = useTaskStore(state => state.toggleProjectExpansion);
    const toggleTaskExpansion = useTaskStore(state => state.toggleTaskExpansion);
    const visibleColumns = useUIStore(state => state.visibleColumns);
    const setActiveInlineEdit = useUIStore(state => state.setActiveInlineEdit);
    const activeInlineEdit = useUIStore(state => state.activeInlineEdit);
    const columnWidths = useUIStore(state => state.columnWidths);
    const setColumnWidth = useUIStore(state => state.setColumnWidth);

    const resizeRef = React.useRef<{ key: string; startX: number; startWidth: number } | null>(null);

    React.useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = e.clientX - resizeRef.current.startX;
            const newWidth = Math.max(40, resizeRef.current.startWidth + delta);
            setColumnWidth(resizeRef.current.key, newWidth);
        };

        const onMouseUp = () => {
            if (resizeRef.current) {
                resizeRef.current = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [setColumnWidth]);

    // Auto-size columns on load (skip if user has saved column widths)
    const calculatedRef = React.useRef(false);
    React.useEffect(() => {
        const savedPrefs = loadPreferences();
        // Skip auto-sizing if user has previously saved column widths
        if (calculatedRef.current || tasks.length === 0 || savedPrefs.columnWidths) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        context.font = '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'; // ID font
        const idWidth = Math.max(
            context.measureText('ID').width,
            ...tasks.slice(0, 50).map(t => context.measureText(String(t.id)).width)
        ) + 24; // padding

        context.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'; // Body font

        const measure = (text: string) => context.measureText(text).width;

        const getColWidth = (title: string, accessor: (t: Task) => string) => {
            const headerWidth = measure(title) + 24; // Padding + sort/resizer space
            const contentWidth = Math.max(...tasks.slice(0, 50).map(t => measure(accessor(t))));
            return Math.ceil(Math.max(headerWidth, contentWidth + 20)); // Content padding
        };

        const newWidths: Record<string, number> = {};
        newWidths['id'] = Math.ceil(idWidth);

        // Subject typically takes remaining space or has a min width, but user asked for "exact".
        // Subject has indentation and icons.
        // base 8px + indent * 16 + 18 (expander) + 6 (gap) + 16 (tracker) + text + 20 (edit icon) + padding
        const getSubjectWidth = (t: Task) => {
            const indent = 8 + (t.indentLevel ?? 0) * 16;
            const icons = (t.hasChildren ? 18 : 18) + 6 + 16; // Expander + gap + tracker
            const text = measure(t.subject);
            const editIcon = 24;
            return indent + icons + text + editIcon + 12;
        };
        const subjectWidth = Math.max(measure('Task Name') + 24, ...tasks.slice(0, 50).map(getSubjectWidth));
        newWidths['subject'] = Math.ceil(Math.min(600, subjectWidth)); // Cap at 600 to prevent explosion

        newWidths['status'] = getColWidth('Status', (t: Task) => {
            const s = getStatusColor(t.statusId);
            return s.label; // Padded pill
        }) + 16; // Pill padding

        newWidths['assignee'] = Math.max(measure('Assignee') + 24, ...tasks.slice(0, 50).map(t => {
            if (!t.assignedToName) return 0;
            // Icon 24 + gap 4 + text
            return 24 + 4 + measure(t.assignedToName) + 12;
        }));

        newWidths['startDate'] = getColWidth('Start Date', (t: Task) => Number.isFinite(t.startDate) ? new Date(t.startDate).toLocaleDateString() : '-');
        newWidths['dueDate'] = getColWidth('Due Date', (t: Task) => Number.isFinite(t.dueDate) ? new Date(t.dueDate).toLocaleDateString() : '-');

        newWidths['ratioDone'] = Math.max(measure('Progress') + 24, ...tasks.slice(0, 50).map(t => {
            // Icon 20 + gap 6 + text
            return 20 + 6 + measure(String(t.ratioDone) + '%') + 12;
        }));

        // Apply
        Object.keys(newWidths).forEach(key => {
            setColumnWidth(key, newWidths[key]);
        });

        calculatedRef.current = true;
    }, [tasks, setColumnWidth]);

    const handleResizeStart = (e: React.MouseEvent, key: string, currentWidth: number) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = { key, startX: e.clientX, startWidth: currentWidth };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const editMetaByTaskId = useEditMetaStore((s) => s.metaByTaskId);
    const fetchEditMeta = useEditMetaStore((s) => s.fetchEditMeta);

    const settings = React.useMemo(() => {
        return (window as unknown as { RedmineCanvasGantt?: { settings?: InlineEditSettings } }).RedmineCanvasGantt?.settings ?? {};
    }, []);

    const taskMap = React.useMemo(() => {
        const map = new Map<string, Task>();
        tasks.forEach(t => map.set(t.id, t));
        return map;
    }, [tasks]);

    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
    const visibleRows = layoutRows.filter(row => row.rowIndex >= startRow && row.rowIndex <= endRow);

    const renderFallbackCellValue = React.useCallback((task: Task, key: string) => {
        const value = (task as unknown as Record<string, unknown>)[key];
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        if (value instanceof Date) return value.toLocaleDateString();
        return '';
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const renderEditableCell = (_t: Task, _field: string, content: React.ReactNode) => {
        return (
            <div
                className="task-cell-editable"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    height: '100%',
                    position: 'relative'
                }}
            >
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {content}
                </div>
            </div>
        );
    };

    const columns = [
        {
            key: 'id',
            title: 'ID',
            width: columnWidths['id'] ?? 72,
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
            width: columnWidths['subject'] ?? 280,
            render: (t: Task) => (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: `${8 + (t.indentLevel ?? 0) * 16}px`,
                        fontWeight: t.hasChildren ? 700 : 400,
                        gap: 4,
                        width: '100%',
                        position: 'relative'
                    }}
                    className="task-subject-cell"
                >
                    {t.hasChildren ? (
                        <button
                            type="button"
                            aria-label={taskExpansion[t.id] ?? true ? '折りたたむ' : '展開する'}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveInlineEdit(null);
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
                                cursor: 'pointer',
                                flexShrink: 0
                            }}
                        >
                            <span style={{ fontSize: 10, color: '#555', lineHeight: 1 }}>
                                {(taskExpansion[t.id] ?? true) ? '▼' : '▶'}
                            </span>
                        </button>
                    ) : (
                        <span style={{ display: 'inline-block', width: 18, flexShrink: 0 }} />
                    )}
                    <div style={{ marginRight: 6, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <TrackerIcon name={t.trackerName} />
                    </div>
                    <a
                        href={`/issues/${t.id}`}
                        className="task-subject"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                            e.stopPropagation();
                            useUIStore.getState().openIssueDialog(`/issues/${t.id}/edit`);
                        }}
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#1a73e8',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            font: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                    >
                        {t.subject}
                    </a>
                </div>
            )
        },
        {
            key: 'status',
            title: 'Status',
            width: columnWidths['status'] ?? 100,
            render: (t: Task) => {
                const style = getStatusColor(t.statusId);
                return renderEditableCell(t, 'statusId', (
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
                ));
            }
        },
        {
            key: 'assignee',
            title: 'Assignee',
            width: columnWidths['assignee'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'assignedToId', (
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    {t.assignedToName && (
                        <>
                            <div
                                className="assignee-avatar"
                                style={{ backgroundColor: getAvatarColor(t.assignedToName || ''), width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', marginRight: 4, flexShrink: 0 }}
                            >
                                {getInitials(t.assignedToName)}
                            </div>
                            <span style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.assignedToName}
                            </span>
                        </>
                    )}
                </div>
            ))
        },
        {
            key: 'startDate',
            title: 'Start Date',
            width: columnWidths['startDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'startDate', (
                <span style={{ color: '#666' }}>{Number.isFinite(t.startDate) ? new Date(t.startDate).toLocaleDateString() : '-'}</span>
            ))
        },
        {
            key: 'dueDate',
            title: 'Due Date',
            width: columnWidths['dueDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'dueDate', (
                <span style={{ color: '#666' }}>{Number.isFinite(t.dueDate) ? new Date(t.dueDate).toLocaleDateString() : '-'}</span>
            ))
        },
        {
            key: 'ratioDone',
            title: 'Progress',
            width: columnWidths['ratioDone'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'doneRatio', (
                <ProgressCircle ratio={t.ratioDone} statusId={t.statusId} />
            ))
        },
    ];

    const activeColumns = columns.filter(col => col.key === 'subject' || visibleColumns.includes(col.key));

    const isInlineEditEnabled = React.useCallback((key: keyof InlineEditSettings, defaultValue: boolean) => {
        const value = settings[key];
        if (value === undefined) return defaultValue;
        return String(value) === '1';
    }, [settings]);

    const toDateInputValue = React.useCallback((timestamp: number) => {
        return new Date(timestamp).toISOString().split('T')[0];
    }, []);

    const mapColumnToField = React.useCallback((columnKey: string) => {
        if (columnKey === 'subject') return 'subject';
        if (columnKey === 'assignee') return 'assignedToId';
        if (columnKey === 'status') return 'statusId';
        if (columnKey === 'ratioDone') return 'doneRatio';
        if (columnKey === 'dueDate') return 'dueDate';
        if (columnKey === 'startDate') return 'startDate';
        return null;
    }, []);

    const shouldEnableField = React.useCallback((field: string) => {
        if (field === 'subject') return isInlineEditEnabled('inline_edit_subject', true);
        if (field === 'assignedToId') return isInlineEditEnabled('inline_edit_assigned_to', true);
        if (field === 'statusId') return isInlineEditEnabled('inline_edit_status', true);
        if (field === 'doneRatio') return isInlineEditEnabled('inline_edit_done_ratio', true);
        if (field === 'dueDate') return isInlineEditEnabled('inline_edit_due_date', true);
        if (field === 'startDate') return isInlineEditEnabled('inline_edit_start_date', true);
        return false;
    }, [isInlineEditEnabled]);

    const ensureEditMeta = React.useCallback(async (taskId: string): Promise<TaskEditMeta | null> => {
        const cached = editMetaByTaskId[taskId];
        if (cached) return cached;
        try {
            return await fetchEditMeta(taskId);
        } catch {
            return null;
        }
    }, [editMetaByTaskId, fetchEditMeta]);

    const startCellEdit = React.useCallback(async (task: Task, field: string) => {
        if (!task.editable) return;
        if (!shouldEnableField(field)) return;
        selectTask(task.id);

        // For select-based editors, ensure meta is available before opening.
        if (field === 'assignedToId' || field === 'statusId') {
            await ensureEditMeta(task.id);
        }

        setActiveInlineEdit({ taskId: task.id, field, source: 'cell' });
    }, [ensureEditMeta, selectTask, setActiveInlineEdit, shouldEnableField]);

    const save = React.useCallback(async (params: Parameters<typeof InlineEditService.saveTaskFields>[0]) => {
        await InlineEditService.saveTaskFields(params);
    }, []);

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
                    activeColumns.map((col, idx) => {
                        const sortConfig = useTaskStore.getState().sortConfig;
                        const isSorted = sortConfig?.key === col.key;
                        return (
                            <div
                                key={idx}
                                style={{
                                    width: col.width,
                                    padding: '0 8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    justifyContent: 'space-between'
                                }}
                                onClick={() => useTaskStore.getState().setSortConfig(col.key as keyof Task)}
                                title={`Sort by ${col.title}`}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {col.title}
                                </span>

                                {isSorted && (
                                    <span style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                                        {sortConfig?.direction === 'asc' ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="18 15 12 9 6 15"></polyline>
                                            </svg>
                                        ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="6 9 12 15 18 9"></polyline>
                                            </svg>
                                        )}
                                    </span>
                                )}

                                <div
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        bottom: 0,
                                        width: 4, // Hit area
                                        height: '100%',
                                        cursor: 'col-resize',
                                        zIndex: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => handleResizeStart(e, col.key, col.width)}
                                >
                                    <div style={{
                                        width: 1,
                                        height: 12,
                                        backgroundColor: '#d0d0d0',
                                        pointerEvents: 'none'
                                    }} />
                                </div>
                            </div>
                        )
                    })
                }
            </div>

            {/* Body */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} onWheel={handleWheel}>
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
                                    onClick={() => {
                                        setActiveInlineEdit(null);
                                        toggleProjectExpansion(row.projectId);
                                    }}
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
                        const meta = editMetaByTaskId[task.id];

                        return (
                            <div
                                key={task.id}
                                onClick={() => {
                                    if (activeInlineEdit && activeInlineEdit.taskId !== task.id) {
                                        setActiveInlineEdit(null);
                                    }
                                    selectTask(task.id);
                                    scrollToTask(task.id);
                                }}
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
                                        <div
                                            data-testid={`cell-${task.id}-${col.key}`}
                                            style={{ width: '100%' }}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                // Prevent double click edit for subject as it is now handled by icon
                                                if (col.key === 'subject') return;

                                                const field = mapColumnToField(col.key);
                                                if (!field) return;
                                                void startCellEdit(task, field);
                                            }}
                                        >
                                            {(() => {
                                                const field = mapColumnToField(col.key);
                                                const isEditing = Boolean(
                                                    field &&
                                                    activeInlineEdit?.taskId === task.id &&
                                                    activeInlineEdit?.field === field &&
                                                    (activeInlineEdit.source ?? 'panel') === 'cell'
                                                );
                                                if (!isEditing) return (col.render ? col.render(task) : renderFallbackCellValue(task, col.key));

                                                const close = () => setActiveInlineEdit(null);

                                                if (field === 'subject') {
                                                    return (
                                                        <SubjectEditor
                                                            initialValue={task.subject}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { subject: next },
                                                                    rollbackTaskUpdates: { subject: task.subject },
                                                                    fields: { subject: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'assignedToId') {
                                                    if (!meta) return <span style={{ fontSize: 12, color: '#666' }}>Loading…</span>;
                                                    const current = task.assignedToId ?? null;
                                                    return (
                                                        <SelectEditor
                                                            value={current}
                                                            options={meta.options.assignees}
                                                            includeUnassigned
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const prevId = task.assignedToId ?? null;
                                                                const prevName = task.assignedToName;
                                                                const name = next === null ? undefined : meta.options.assignees.find((o) => o.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { assignedToId: next ?? undefined, assignedToName: next === null ? undefined : name },
                                                                    rollbackTaskUpdates: { assignedToId: prevId ?? undefined, assignedToName: prevName },
                                                                    fields: { assigned_to_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'statusId') {
                                                    if (!meta) return <span style={{ fontSize: 12, color: '#666' }}>Loading…</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.statusId}
                                                            options={meta.options.statuses}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                if (next === null) return;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { statusId: next },
                                                                    rollbackTaskUpdates: { statusId: task.statusId },
                                                                    fields: { status_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'doneRatio') {
                                                    return (
                                                        <DoneRatioEditor
                                                            initialValue={task.ratioDone}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { ratioDone: next },
                                                                    rollbackTaskUpdates: { ratioDone: task.ratioDone },
                                                                    fields: { done_ratio: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'dueDate') {
                                                    return (
                                                        <DueDateEditor
                                                            initialValue={toDateInputValue(task.dueDate)}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextTs = new Date(next).getTime();
                                                                if (!Number.isFinite(nextTs)) return;
                                                                if (Number.isFinite(task.startDate) && task.startDate > nextTs) {
                                                                    useUIStore.getState().addNotification('Invalid date range', 'warning');
                                                                    return;
                                                                }
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { dueDate: nextTs },
                                                                    rollbackTaskUpdates: { dueDate: task.dueDate },
                                                                    fields: { due_date: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'startDate') {
                                                    return (
                                                        <DueDateEditor
                                                            initialValue={toDateInputValue(task.startDate)}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextTs = new Date(next).getTime();
                                                                if (!Number.isFinite(nextTs)) return;
                                                                if (Number.isFinite(task.dueDate) && nextTs > task.dueDate) {
                                                                    useUIStore.getState().addNotification('Invalid date range', 'warning');
                                                                    return;
                                                                }
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { startDate: nextTs },
                                                                    rollbackTaskUpdates: { startDate: task.startDate },
                                                                    fields: { start_date: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                return <span>{i18n.t('button_edit')}</span>;
                                            })()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })
                }
            </div>

            {/* Level 1: Inline detail panel (Level 2+ edits live here) */}

        </div>
    );
};
