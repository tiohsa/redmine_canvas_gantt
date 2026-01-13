import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor, getPriorityColor } from '../utils/styles';
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

const ProgressCircle = ({ ratio }: { ratio: number, statusId: number }) => {
    const r = 8;
    const c = 2 * Math.PI * r;
    const offset = c - (ratio / 100) * c;

    // Matching TaskRenderer.DONE_GREEN
    const color = '#50c878';

    return (
        <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
            data-tooltip={`${ratio}%`}
        >
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="10" cy="10" r={r} fill="none" stroke="#e0e0e0" strokeWidth="3" />
                <circle cx="10" cy="10" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
            </svg>
        </div>
    );
};

const ProjectIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            color: '#5f6368'
        }}
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

const TrackerIcon = ({ name }: { name?: string }) => {
    const lowerName = name?.toLowerCase() || '';

    // Bug icon
    if (lowerName.includes('bug')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d93025" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="8" fill="#d93025" fillOpacity="0.1" />
                <path d="M12 4v2m0 12v2M4 12h2m12 0h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42" />
            </svg>
        );
    }

    // Feature icon
    if (lowerName.includes('feature')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#188038" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#188038" fillOpacity="0.1" />
            </svg>
        );
    }

    // Support icon
    if (lowerName.includes('support')) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" fill="#1a73e8" fillOpacity="0.1" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
            </svg>
        );
    }

    // Task icon (default)
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
        </svg>
    );
};

const ExpandAllIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 15 12 20 17 15" />
        <polyline points="7 9 12 4 17 9" />
    </svg>
);

const CollapseAllIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 20 12 15 17 20" />
        <polyline points="7 4 12 9 17 4" />
    </svg>
);

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
    const toggleAllExpansion = useTaskStore(state => state.toggleAllExpansion);
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
        const subjectTitle = i18n.t('field_subject') || 'Task Name';
        const subjectWidth = Math.max(measure(subjectTitle) + 24, ...tasks.slice(0, 50).map(getSubjectWidth));
        newWidths['subject'] = Math.ceil(Math.min(600, subjectWidth)); // Cap at 600 to prevent explosion

        newWidths['status'] = getColWidth(i18n.t('field_status') || 'Status', (t: Task) => {
            const s = getStatusColor(t.statusId);
            return s.label; // Padded pill
        }) + 16; // Pill padding

        newWidths['assignee'] = Math.max(measure(i18n.t('field_assigned_to') || 'Assignee') + 24, ...tasks.slice(0, 50).map(t => {
            if (!t.assignedToName) return 0;
            // Icon 24 + padding
            return 24 + 12;
        }));

        newWidths['startDate'] = getColWidth(i18n.t('field_start_date') || 'Start Date', (t: Task) => (t.startDate !== undefined && Number.isFinite(t.startDate)) ? new Date(t.startDate).toLocaleDateString() : '-');
        newWidths['dueDate'] = getColWidth(i18n.t('field_due_date') || 'Due Date', (t: Task) => (t.dueDate !== undefined && Number.isFinite(t.dueDate)) ? new Date(t.dueDate).toLocaleDateString() : '-');

        newWidths['ratioDone'] = Math.max(measure(i18n.t('field_done_ratio') || 'Progress') + 24, ...tasks.slice(0, 50).map(() => {
            // Icon 20 + padding
            return 20 + 12;
        }));

        const addAutoWidth = (key: string, title: string, accessor: (t: Task) => string) => {
            newWidths[key] = getColWidth(title, accessor);
        };

        addAutoWidth('project', i18n.t('field_project') || 'Project', (t) => t.projectName || '');
        addAutoWidth('tracker', i18n.t('field_tracker') || 'Tracker', (t) => t.trackerName || '');
        addAutoWidth('priority', i18n.t('field_priority') || 'Priority', (t) => t.priorityName || '');
        newWidths['priority'] += 16; // Badge padding
        addAutoWidth('author', i18n.t('field_author') || 'Author', (t) => t.authorName || '');
        addAutoWidth('category', i18n.t('field_category') || 'Category', (t) => t.categoryName || '');
        addAutoWidth('estimatedHours', i18n.t('field_estimated_hours') || 'Estimated Time', (t) => t.estimatedHours !== undefined ? `${t.estimatedHours}h` : '');
        addAutoWidth('createdOn', i18n.t('field_created_on') || 'Created', (t) => t.createdOn ? new Date(t.createdOn).toLocaleString() : '');
        addAutoWidth('updatedOn', i18n.t('field_updated_on') || 'Updated', (t) => t.updatedOn ? new Date(t.updatedOn).toLocaleString() : '');
        addAutoWidth('spentHours', i18n.t('field_spent_hours') || 'Spent Time', (t) => t.spentHours !== undefined ? `${t.spentHours}h` : '');
        addAutoWidth('version', i18n.t('field_version') || 'Target Version', (t) => t.fixedVersionName || '');

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
        return '-';
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        updateViewport({
            scrollY: Math.max(0, viewport.scrollY + e.deltaY)
        });
    };

    const renderEditableCell = (t: Task, field: string, content: React.ReactNode) => {
        if (!shouldEnableField(field, t)) return content;
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
            title: i18n.t('field_subject') || 'Task Name',
            width: columnWidths['subject'] ?? 280,
            render: (t: Task) => (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontWeight: t.hasChildren ? 600 : 400,
                        height: '100%',
                        width: '100%',
                        position: 'relative'
                    }}
                    className="task-subject-cell"
                >
                    {(() => {
                        const isSelected = t.id === selectedTaskId;
                        return (
                            <>
                                {/* Tree Lines */}
                                <div style={{ display: 'flex', height: '100%', flexShrink: 0, paddingLeft: 8 }}>
                                    {(t.treeLevelGuides ?? []).map((hasLine, i) => (
                                        <div key={i} style={{ width: 16, height: '100%', position: 'relative' }}>
                                            {hasLine && (
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 1,
                                                    backgroundColor: '#e0e0e0',
                                                    transform: 'translateX(-50%)'
                                                }} />
                                            )}
                                        </div>
                                    ))}
                                    <div style={{ width: 16, height: '100%', position: 'relative' }}>
                                        {/* Vertical line for the current node */}
                                        <div style={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: 0,
                                            bottom: t.isLastChild ? '50%' : 0,
                                            width: 1,
                                            backgroundColor: '#e0e0e0',
                                            transform: 'translateX(-50%)'
                                        }} />
                                        {/* Horizontal line for the current node */}
                                        <div style={{
                                            position: 'absolute',
                                            left: '50%',
                                            top: '50%',
                                            right: 0,
                                            height: 1,
                                            backgroundColor: '#e0e0e0',
                                            transform: 'translateY(-50%)'
                                        }} />

                                        {/* Expansion Trigger (Chevron) overlaying on the line branch */}
                                        {t.hasChildren && (
                                            <button
                                                type="button"
                                                aria-label={(taskExpansion[t.id] ?? true) ? (i18n.t('button_collapse') || 'Collapse') : (i18n.t('button_expand') || 'Expand')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveInlineEdit(null);
                                                    toggleTaskExpansion(t.id);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    width: 20,
                                                    height: 20,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid #d0d0d0',
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                    zIndex: 1,
                                                    padding: 0,
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                <ChevronIcon expanded={taskExpansion[t.id] ?? true} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <TrackerIcon name={t.trackerName} />
                                </div>
                                <a
                                    href={`/issues/${t.id}`}
                                    className="task-subject"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        useUIStore.getState().openIssueDialog(`/issues/${t.id}/edit`);
                                    }}
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        color: isSelected ? '#1a73e8' : '#3c4043',
                                        textDecoration: 'none',
                                        whiteSpace: 'nowrap',
                                        flex: 1,
                                        background: 'none',
                                        border: 'none',
                                        padding: '0 8px',
                                        font: 'inherit',
                                        cursor: 'pointer',
                                        textAlign: 'left'
                                    }}
                                    title={undefined}
                                    data-tooltip={t.subject}
                                >
                                    {t.subject}
                                </a>
                            </>
                        );
                    })()}
                </div>
            )
        },
        {
            key: 'status',
            title: i18n.t('field_status') || 'Status',
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
                        {t.statusName || style.label}
                    </span>
                ));
            }
        },
        {
            key: 'assignee',
            title: i18n.t('field_assigned_to') || 'Assignee',
            width: columnWidths['assignee'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'assignedToId', (
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: '24px' }}>
                    {t.assignedToName ? (
                        <>
                            <div
                                className="assignee-avatar"
                                title={t.assignedToName}
                                style={{ backgroundColor: getAvatarColor(t.assignedToName || ''), width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', flexShrink: 0 }}
                            >
                                {getInitials(t.assignedToName)}
                            </div>
                        </>
                    ) : (
                        <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>
                    )}
                </div>
            ))
        },
        {
            key: 'startDate',
            title: i18n.t('field_start_date') || 'Start Date',
            width: columnWidths['startDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'startDate', (
                <span style={{ color: '#666' }}>{(t.startDate !== undefined && Number.isFinite(t.startDate)) ? new Date(t.startDate).toLocaleDateString() : '-'}</span>
            ))
        },
        {
            key: 'dueDate',
            title: i18n.t('field_due_date') || 'Due Date',
            width: columnWidths['dueDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'dueDate', (
                <span style={{ color: '#666' }}>{(t.dueDate !== undefined && Number.isFinite(t.dueDate)) ? new Date(t.dueDate).toLocaleDateString() : '-'}</span>
            ))
        },
        {
            key: 'ratioDone',
            title: i18n.t('field_done_ratio') || 'Progress',
            width: columnWidths['ratioDone'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'ratioDone', (
                <ProgressCircle ratio={t.ratioDone} statusId={t.statusId} />
            ))
        },
        {
            key: 'project',
            title: i18n.t('field_project') || 'Project',
            width: columnWidths['project'] ?? 120,
            render: (t: Task) => renderEditableCell(t, 'projectId', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.projectName || '-'}</span>
            ))
        },
        {
            key: 'tracker',
            title: i18n.t('field_tracker') || 'Tracker',
            width: columnWidths['tracker'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'trackerId', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.trackerName || '-'}</span>
            ))
        },
        {
            key: 'priority',
            title: i18n.t('field_priority') || 'Priority',
            width: columnWidths['priority'] ?? 90,
            render: (t: Task) => {
                const priorityId = t.priorityId || 0;
                const style = getPriorityColor(priorityId, t.priorityName);
                return renderEditableCell(t, 'priorityId', (
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
                        {t.priorityName}
                    </span>
                ));
            }
        },
        {
            key: 'author',
            title: i18n.t('field_author') || 'Author',
            width: columnWidths['author'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'authorId', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.authorName || '-'}</span>
            ))
        },
        {
            key: 'category',
            title: i18n.t('field_category') || 'Category',
            width: columnWidths['category'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'categoryId', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.categoryName || '-'}</span>
            ))
        },
        {
            key: 'estimatedHours',
            title: i18n.t('field_estimated_hours') || 'Estimated Time',
            width: columnWidths['estimatedHours'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'estimatedHours', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.estimatedHours !== undefined ? `${t.estimatedHours}h` : '-'}</span>
            ))
        },
        {
            key: 'createdOn',
            title: i18n.t('field_created_on') || 'Created',
            width: columnWidths['createdOn'] ?? 120,
            render: (t: Task) => <span style={{ color: '#666', fontSize: '12px' }}>{t.createdOn ? new Date(t.createdOn).toLocaleString() : '-'}</span>
        },
        {
            key: 'updatedOn',
            title: i18n.t('field_updated_on') || 'Updated',
            width: columnWidths['updatedOn'] ?? 120,
            render: (t: Task) => <span style={{ color: '#666', fontSize: '12px' }}>{t.updatedOn ? new Date(t.updatedOn).toLocaleString() : '-'}</span>
        },
        {
            key: 'spentHours',
            title: i18n.t('field_spent_hours') || 'Spent Time',
            width: columnWidths['spentHours'] ?? 80,
            render: (t: Task) => <span style={{ color: '#666', fontSize: '12px' }}>{t.spentHours !== undefined ? `${t.spentHours}h` : '-'}</span>
        },
        {
            key: 'version',
            title: i18n.t('field_version') || 'Target Version',
            width: columnWidths['version'] ?? 120,
            render: (t: Task) => renderEditableCell(t, 'fixedVersionId', (
                <span style={{ color: '#666', fontSize: '12px' }}>{t.fixedVersionName || '-'}</span>
            ))
        },
    ];

    const activeColumns = columns.filter(col => col.key === 'subject' || visibleColumns.includes(col.key));

    const isInlineEditEnabled = React.useCallback((key: keyof InlineEditSettings, defaultValue: boolean) => {
        const value = settings[key];
        if (value === undefined) return defaultValue;
        return String(value) === '1';
    }, [settings]);

    const toDateInputValue = React.useCallback((timestamp: number | undefined) => {
        if (timestamp === undefined || !Number.isFinite(timestamp)) return '';
        try {
            return new Date(timestamp).toISOString().split('T')[0];
        } catch (e) {
            return '';
        }
    }, []);

    const getSortField = React.useCallback((columnKey: string): keyof Task | null => {
        if (columnKey === 'subject') return 'subject';
        if (columnKey === 'assignee') return 'assignedToName';
        if (columnKey === 'status') return 'statusId'; // Position is better than name
        if (columnKey === 'ratioDone') return 'ratioDone';
        if (columnKey === 'dueDate') return 'dueDate';
        if (columnKey === 'startDate') return 'startDate';
        if (columnKey === 'estimatedHours') return 'estimatedHours';
        if (columnKey === 'priority') return 'priorityId'; // Weight is better than name
        if (columnKey === 'author') return 'authorName';
        if (columnKey === 'category') return 'categoryName';
        if (columnKey === 'project') return 'projectName';
        if (columnKey === 'tracker') return 'trackerName';
        if (columnKey === 'spentHours') return 'spentHours';
        if (columnKey === 'version') return 'fixedVersionName';
        if (columnKey === 'createdOn') return 'createdOn';
        if (columnKey === 'updatedOn') return 'updatedOn';
        if (columnKey === 'id') return 'id';
        return null;
    }, []);

    const getEditField = React.useCallback((columnKey: string) => {
        if (columnKey === 'subject') return 'subject';
        if (columnKey === 'assignee') return 'assignedToId';
        if (columnKey === 'status') return 'statusId';
        if (columnKey === 'ratioDone') return 'ratioDone';
        if (columnKey === 'dueDate') return 'dueDate';
        if (columnKey === 'startDate') return 'startDate';
        if (columnKey === 'priority') return 'priorityId';
        if (columnKey === 'author') return 'authorId';
        if (columnKey === 'category') return 'categoryId';
        if (columnKey === 'estimatedHours') return 'estimatedHours';
        if (columnKey === 'project') return 'projectId';
        if (columnKey === 'tracker') return 'trackerId';
        if (columnKey === 'version') return 'fixedVersionId';
        return null;
    }, []);

    const shouldEnableField = React.useCallback((field: string, task: Task, providedMeta?: TaskEditMeta) => {
        if (!task.editable) return false;

        // Plugin settings
        if (field === 'subject') return isInlineEditEnabled('inline_edit_subject', true);
        if (field === 'assignedToId') return isInlineEditEnabled('inline_edit_assigned_to', true);
        if (field === 'statusId') return isInlineEditEnabled('inline_edit_status', true);
        if (field === 'ratioDone') return isInlineEditEnabled('inline_edit_done_ratio', true);
        if (field === 'dueDate') return isInlineEditEnabled('inline_edit_due_date', true);
        if (field === 'startDate') return isInlineEditEnabled('inline_edit_start_date', true);

        // Check metadata for field-level editability
        const meta = providedMeta || editMetaByTaskId[task.id];
        if (meta && meta.editable) {
            const editableMap = meta.editable as Record<string, boolean>;
            if (editableMap[field] === false) return false;
        }

        if (field === 'priorityId') return true;
        if (field === 'authorId') return true;
        if (field === 'categoryId') return true;
        if (field === 'estimatedHours') return true;
        if (field === 'projectId') return true;
        if (field === 'trackerId') return true;
        if (field === 'fixedVersionId') return true;
        return false;
    }, [isInlineEditEnabled, editMetaByTaskId]);

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
        if (!shouldEnableField(field, task)) return;
        selectTask(task.id);

        // For select-based editors, ensure meta is available before opening.
        const requiresMeta = [
            'assignedToId', 'statusId', 'priorityId', 'authorId',
            'categoryId', 'projectId', 'trackerId', 'fixedVersionId'
        ].includes(field);

        if (requiresMeta) {
            const m = await ensureEditMeta(task.id);
            if (!m) return;
            // Re-check after meta is loaded to catch field-level restrictions
            // IMPORTANT: use the fresh meta 'm' to avoid stale closure issues
            if (!shouldEnableField(field, task, m)) return;
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
                        const sortField = getSortField(col.key);
                        const isSorted = sortConfig?.key === sortField;
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
                                onClick={() => {
                                    const field = getSortField(col.key);
                                    if (field) {
                                        useTaskStore.getState().setSortConfig(field);
                                    }
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {col.title}
                                </span>

                                {
                                    isSorted && (
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
                                    )
                                }

                                {
                                    col.key === 'subject' && (
                                        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', marginRight: '12px' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleAllExpansion();
                                                }}
                                                title={(() => {
                                                    const anyProjectCollapsed = useTaskStore.getState().groupByProject &&
                                                        Object.keys(projectExpansion).length > 0 &&
                                                        Object.values(projectExpansion).some(v => v === false);
                                                    const anyTaskCollapsed = tasks.some(t => t.hasChildren && taskExpansion[t.id] === false);
                                                    return (anyProjectCollapsed || anyTaskCollapsed)
                                                        ? (i18n.t('button_expand_all') || 'すべて展開')
                                                        : (i18n.t('button_collapse_all') || 'すべて折りたたむ');
                                                })()}
                                                className="header-action-button"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '24px',
                                                    height: '24px',
                                                    padding: 0,
                                                    border: '1px solid #dadce0',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#fff',
                                                    color: '#5f6368',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {(() => {
                                                    const anyProjectCollapsed = useTaskStore.getState().groupByProject &&
                                                        Object.keys(projectExpansion).length > 0 &&
                                                        Object.values(projectExpansion).some(v => v === false);
                                                    const anyTaskCollapsed = tasks.some(t => t.hasChildren && taskExpansion[t.id] === false);
                                                    return (anyProjectCollapsed || anyTaskCollapsed) ? <ExpandAllIcon /> : <CollapseAllIcon />;
                                                })()}
                                            </button>
                                        </div>
                                    )
                                }

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
                                        backgroundColor: '#f8f9fa',
                                        color: '#3c4043',
                                        fontWeight: 600,
                                        borderBottom: '1px solid #e0e0e0',
                                        boxSizing: 'border-box',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setActiveInlineEdit(null);
                                        toggleProjectExpansion(row.projectId);
                                    }}
                                    className="project-header-row"
                                >
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 20,
                                        height: 20,
                                        marginRight: 8
                                    }}>
                                        <ChevronIcon expanded={expanded} />
                                    </div>
                                    <div style={{ marginRight: 8, display: 'flex', alignItems: 'center', color: '#5f6368' }}>
                                        <ProjectIcon />
                                    </div>
                                    {row.projectName || i18n.t('label_project') || 'Project'}
                                </div>
                            );
                        } else if (row.type === 'version') {
                            const expanded = useTaskStore.getState().versionExpansion[row.id] ?? true;
                            const toggleVersionExpansion = useTaskStore.getState().toggleVersionExpansion;
                            return (
                                <div
                                    key={`version-${row.id}`}
                                    style={{
                                        position: 'absolute',
                                        top,
                                        left: 0,
                                        height: viewport.rowHeight,
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0 12px 0 32px',
                                        backgroundColor: '#ffffff',
                                        color: '#3c4043',
                                        fontWeight: 600,
                                        borderBottom: '1px solid #e0e0e0',
                                        boxSizing: 'border-box',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onClick={() => {
                                        setActiveInlineEdit(null);
                                        toggleVersionExpansion(row.id);
                                    }}
                                >
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 20,
                                        height: 20,
                                        marginRight: 8
                                    }}>
                                        <ChevronIcon expanded={expanded} />
                                    </div>
                                    <div style={{ marginRight: 8, display: 'flex', alignItems: 'center', color: '#009688' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                            <line x1="4" y1="22" x2="4" y2="15" />
                                        </svg>
                                    </div>
                                    {row.name}
                                </div>
                            );
                        }

                        if (row.type !== 'task') return null;
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
                                    borderBottom: '1px solid #f1f3f4',
                                    backgroundColor: isSelected ? '#e8f0fe' : 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: '#3c4043',
                                    transition: 'background-color 0.2s, color 0.2s'
                                }}
                                className={`task-row ${isSelected ? 'is-selected' : ''}`}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    useTaskStore.getState().setContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        taskId: task.id
                                    });
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
                                            style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                // Prevent double click edit for subject as it is now handled by icon
                                                if (col.key === 'subject') return;

                                                const field = getEditField(col.key);
                                                if (!field || !shouldEnableField(field, task)) return;
                                                void startCellEdit(task, field);
                                            }}
                                        >
                                            {(() => {
                                                const field = getEditField(col.key);
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
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    const current = task.assignedToId ?? null;
                                                    return (
                                                        <SelectEditor
                                                            value={current}
                                                            options={taskMeta.options.assignees}
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
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.statusId}
                                                            options={taskMeta.options.statuses}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                if (next === null) return;
                                                                const nextName = meta.options.statuses.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { statusId: next, statusName: nextName },
                                                                    rollbackTaskUpdates: { statusId: task.statusId, statusName: task.statusName },
                                                                    fields: { status_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'ratioDone') {
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
                                                            min={toDateInputValue(task.startDate)}
                                                            onCancel={close}
                                                            onCommit={(next) => {
                                                                const nextTs = new Date(next).getTime();
                                                                if (!Number.isFinite(nextTs)) return;
                                                                if (task.startDate !== undefined && Number.isFinite(task.startDate) && task.startDate! > nextTs) {
                                                                    useUIStore.getState().addNotification('Invalid date range', 'warning');
                                                                    return;
                                                                }
                                                                // Update local state - will be saved with batch save or auto-save
                                                                const { updateTask, autoSave, saveChanges } = useTaskStore.getState();
                                                                updateTask(task.id, { dueDate: nextTs });
                                                                if (autoSave) {
                                                                    saveChanges().catch(console.error);
                                                                }
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'startDate') {
                                                    return (
                                                        <DueDateEditor
                                                            initialValue={toDateInputValue(task.startDate)}
                                                            max={toDateInputValue(task.dueDate)}
                                                            onCancel={close}
                                                            onCommit={(next) => {
                                                                const nextTs = new Date(next).getTime();
                                                                if (!Number.isFinite(nextTs)) return;
                                                                if (task.dueDate !== undefined && Number.isFinite(task.dueDate) && nextTs > task.dueDate!) {
                                                                    useUIStore.getState().addNotification('Invalid date range', 'warning');
                                                                    return;
                                                                }
                                                                // Update local state - will be saved with batch save or auto-save
                                                                const { updateTask, autoSave, saveChanges } = useTaskStore.getState();
                                                                updateTask(task.id, { startDate: nextTs });
                                                                if (autoSave) {
                                                                    saveChanges().catch(console.error);
                                                                }
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'priorityId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.priorityId ?? null}
                                                            options={taskMeta.options.priorities || []}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                if (next === null) return;
                                                                const nextName = meta.options.priorities?.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { priorityId: next, priorityName: nextName },
                                                                    rollbackTaskUpdates: { priorityId: task.priorityId, priorityName: task.priorityName },
                                                                    fields: { priority_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'authorId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.authorId ?? null}
                                                            options={taskMeta.options.assignees}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextName = meta.options.assignees.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { authorId: next ?? undefined, authorName: nextName },
                                                                    rollbackTaskUpdates: { authorId: task.authorId, authorName: task.authorName },
                                                                    fields: { author_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'categoryId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.categoryId ?? null}
                                                            options={taskMeta.options.categories || []}
                                                            includeUnassigned
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextName = meta.options.categories?.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { categoryId: next ?? undefined, categoryName: nextName },
                                                                    rollbackTaskUpdates: { categoryId: task.categoryId, categoryName: task.categoryName },
                                                                    fields: { category_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'estimatedHours') {
                                                    return (
                                                        <DoneRatioEditor
                                                            initialValue={task.estimatedHours || 0}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { estimatedHours: next },
                                                                    rollbackTaskUpdates: { estimatedHours: task.estimatedHours },
                                                                    fields: { estimated_hours: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'projectId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.projectId ? Number(task.projectId) : null}
                                                            options={taskMeta.options.projects || []}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                if (next === null) return;
                                                                const nextName = meta.options.projects?.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { projectId: next !== null ? String(next) : undefined, projectName: nextName },
                                                                    rollbackTaskUpdates: { projectId: task.projectId, projectName: task.projectName },
                                                                    fields: { project_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'trackerId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.trackerId ?? null}
                                                            options={taskMeta.options.trackers || []}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                if (next === null) return;
                                                                const nextName = meta.options.trackers?.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { trackerId: next, trackerName: nextName },
                                                                    rollbackTaskUpdates: { trackerId: task.trackerId, trackerName: task.trackerName },
                                                                    fields: { tracker_id: next }
                                                                });
                                                                close();
                                                            }}
                                                        />
                                                    );
                                                }

                                                if (field === 'fixedVersionId') {
                                                    const taskMeta = editMetaByTaskId[task.id];
                                                    if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                    return (
                                                        <SelectEditor
                                                            value={task.fixedVersionId ? Number(task.fixedVersionId) : null}
                                                            options={taskMeta.options.versions || []}
                                                            includeUnassigned
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextName = meta.options.versions?.find(s => s.id === next)?.name;
                                                                await save({
                                                                    taskId: task.id,
                                                                    optimisticTaskUpdates: { fixedVersionId: next !== null ? String(next) : undefined, fixedVersionName: nextName },
                                                                    rollbackTaskUpdates: { fixedVersionId: task.fixedVersionId, fixedVersionName: task.fixedVersionName },
                                                                    fields: { fixed_version_id: next }
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

        </div >
    );
};
