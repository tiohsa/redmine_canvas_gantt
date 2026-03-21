import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor, getPriorityColor } from '../utils/styles';
import { useUIStore } from '../stores/UIStore';
import { SIDEBAR_RESIZE_CURSOR } from '../constants';

import { CustomFieldEditor, DoneRatioEditor, DueDateEditor, SelectEditor, SubjectEditor } from './InlineEditors';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { InlineEditSettings } from '../types/editMeta';
import { i18n } from '../utils/i18n';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { customFieldEditField, customFieldIdFromEditField, formatCustomFieldCellValue, type SidebarColumn } from './sidebar/sidebarColumns';
import { useSidebarColumnSizing } from './sidebar/useSidebarColumnSizing';
import { useSidebarDragAndDrop } from './sidebar/useSidebarDragAndDrop';
import { useSidebarInlineEdit } from './sidebar/useSidebarInlineEdit';
import type { SchedulingStateInfo } from '../scheduling/constraintGraph';
import type { CriticalPathTaskMetrics } from '../scheduling/criticalPath';
import { SvgIcon } from '../icons/SvgIcon';

type TaskNotificationDescriptor = {
    iconName: 'rcg-icon-notification-unscheduled' | 'rcg-icon-notification-warning' | 'rcg-icon-notification-critical';
    color: string;
    tooltip: string;
    testIdSuffix: string;
};

const NOTIFICATION_COLUMN_KEY = 'notification';

const getSchedulingNotification = (schedulingState?: SchedulingStateInfo): TaskNotificationDescriptor | null => {
    if (!schedulingState || schedulingState.state === 'normal') return null;

    if (schedulingState.state === 'invalid') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: '#ea8600',
            tooltip: schedulingState.message,
            testIdSuffix: 'invalid'
        };
    }

    if (schedulingState.state === 'cyclic') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: '#d93025',
            tooltip: schedulingState.message,
            testIdSuffix: 'cyclic'
        };
    }

    if (schedulingState.state === 'conflicted') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: '#f9ab00',
            tooltip: schedulingState.message,
            testIdSuffix: 'conflicted'
        };
    }

    return {
        iconName: 'rcg-icon-notification-unscheduled',
        color: '#5f6368',
        tooltip: schedulingState.message,
        testIdSuffix: 'unscheduled'
    };
};

const getCriticalPathNotification = (criticalPathMetrics?: CriticalPathTaskMetrics): TaskNotificationDescriptor | null => {
    if (!criticalPathMetrics?.critical) return null;

    return {
        iconName: 'rcg-icon-notification-critical',
        color: '#b42318',
        tooltip: `Critical path task. Total slack: ${criticalPathMetrics.totalSlackDays} working day(s).`,
        testIdSuffix: 'critical'
    };
};

const getTaskNotification = (
    schedulingState?: SchedulingStateInfo,
    criticalPathMetrics?: CriticalPathTaskMetrics
): TaskNotificationDescriptor | null => (
    getSchedulingNotification(schedulingState) ?? getCriticalPathNotification(criticalPathMetrics)
);

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

const AssigneeIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
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
    const schedulingStates = useTaskStore(state => state.schedulingStates);
    const criticalPathMetrics = useTaskStore(state => state.criticalPathMetrics);
    const layoutRows = useTaskStore(state => state.layoutRows);
    const rowCount = useTaskStore(state => state.rowCount);
    const viewport = useTaskStore(state => state.viewport);
    const updateViewport = useTaskStore(state => state.updateViewport);
    const selectTask = useTaskStore(state => state.selectTask);
    const scrollToTask = useTaskStore(state => state.scrollToTask);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const projectExpansion = useTaskStore(state => state.projectExpansion);
    const taskExpansion = useTaskStore(state => state.taskExpansion);
    const customFields = useTaskStore(state => state.customFields);
    const toggleProjectExpansion = useTaskStore(state => state.toggleProjectExpansion);
    const toggleTaskExpansion = useTaskStore(state => state.toggleTaskExpansion);
    const toggleAllExpansion = useTaskStore(state => state.toggleAllExpansion);
    const canDropAsChild = useTaskStore(state => state.canDropAsChild);
    const canDropToRoot = useTaskStore(state => state.canDropToRoot);
    const moveTaskAsChild = useTaskStore(state => state.moveTaskAsChild);
    const moveTaskToRoot = useTaskStore(state => state.moveTaskToRoot);
    const visibleColumns = useUIStore(state => state.visibleColumns);
    const setActiveInlineEdit = useUIStore(state => state.setActiveInlineEdit);
    const activeInlineEdit = useUIStore(state => state.activeInlineEdit);
    const columnWidths = useUIStore(state => state.columnWidths);
    const setColumnWidth = useUIStore(state => state.setColumnWidth);

    const editMetaByTaskId = useEditMetaStore((s) => s.metaByTaskId);
    const fetchEditMeta = useEditMetaStore((s) => s.fetchEditMeta);

    const settings = React.useMemo(() => {
        return (window as unknown as { RedmineCanvasGantt?: { settings?: InlineEditSettings } }).RedmineCanvasGantt?.settings ?? {};
    }, []);

    const { handleResizeStart } = useSidebarColumnSizing({ tasks, customFields, setColumnWidth });
    const {
        dropTargetTaskId,
        isRootDropActive,
        setIsRootDropActive,
        handleTaskDragStart,
        handleTaskDragOver,
        handleTaskDrop,
        handleRootDragOver,
        handleRootDrop,
        resetDragState
    } = useSidebarDragAndDrop({
        canDropAsChild,
        canDropToRoot,
        moveTaskAsChild,
        moveTaskToRoot
    });
    const {
        toDateInputValue,
        getSortField,
        getEditField,
        shouldEnableField,
        startCellEdit,
        save
    } = useSidebarInlineEdit({
        settings,
        editMetaByTaskId,
        fetchEditMeta,
        selectTask,
        setActiveInlineEdit
    });

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

    const columns: SidebarColumn[] = [
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
            key: NOTIFICATION_COLUMN_KEY,
            title: i18n.t('label_notifications') || 'Notifications',
            width: columnWidths[NOTIFICATION_COLUMN_KEY] ?? 44,
            render: (t: Task) => {
                const notification = getTaskNotification(schedulingStates[t.id], criticalPathMetrics[t.id]);
                if (!notification) return null;

                return (
                    <span
                        data-testid={`task-notification-badge-${notification.testIdSuffix}-${t.id}`}
                        data-tooltip={notification.tooltip}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 18,
                            height: 18,
                            color: notification.color
                        }}
                    >
                        <SvgIcon name={notification.iconName} size={18} />
                    </span>
                );
            }
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
                                    href={buildRedmineUrl(`/issues/${t.id}`)}
                                    className="task-subject"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        useUIStore.getState().openIssueDialog(buildRedmineUrl(`/issues/${t.id}`));
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
                                <button
                                    className="task-edit-badge"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        useUIStore.getState().openIssueDialog(buildRedmineUrl(`/issues/${t.id}/edit`));
                                    }}
                                    title={i18n.t('button_edit') || 'Edit'}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        display: 'flex', // Hidden by CSS by default, shown on hover
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#5f6368',
                                        marginLeft: '4px'
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </button>
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
        ...customFields.map((customField) => ({
            key: `cf:${customField.id}`,
            title: customField.name,
            width: columnWidths[`cf:${customField.id}`] ?? (customField.fieldFormat === 'text' ? 180 : 120),
            render: (t: Task) => {
                const displayValue = formatCustomFieldCellValue(t, customField);
                return renderEditableCell(t, customFieldEditField(String(customField.id)), (
                    <span
                        style={{ color: displayValue === '-' ? '#999' : '#666', fontSize: '12px' }}
                        data-tooltip={displayValue !== '-' ? displayValue : undefined}
                    >
                        {displayValue}
                    </span>
                ));
            }
        }))
    ];

    const activeColumns = columns.filter(col => col.key === 'subject' || visibleColumns.includes(col.key));

    const inlineControlHeight = Math.max(20, Math.min(24, viewport.rowHeight - 6));

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
                fontSize: '13px',
                overflow: 'hidden'
            }}>
                {
                    activeColumns.map((col, idx) => {
                        const sortConfig = useTaskStore.getState().sortConfig;
                        const sortField = getSortField(col.key);
                        const isSorted = sortConfig?.key === sortField;
                        return (
                            <div
                                key={idx}
                                data-testid={`sidebar-header-${col.key}`}
                                style={{
                                    width: col.width,
                                    flexShrink: 0,
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
                                                    const anyAssigneeCollapsed = useTaskStore.getState().groupByAssignee &&
                                                        Object.keys(projectExpansion).length > 0 &&
                                                        Object.values(projectExpansion).some(v => v === false);
                                                    const anyTaskCollapsed = tasks.some(t => t.hasChildren && taskExpansion[t.id] === false);
                                                    return (anyProjectCollapsed || anyAssigneeCollapsed || anyTaskCollapsed)
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
                                                    const anyAssigneeCollapsed = useTaskStore.getState().groupByAssignee &&
                                                        Object.keys(projectExpansion).length > 0 &&
                                                        Object.values(projectExpansion).some(v => v === false);
                                                    const anyTaskCollapsed = tasks.some(t => t.hasChildren && taskExpansion[t.id] === false);
                                                    return (anyProjectCollapsed || anyAssigneeCollapsed || anyTaskCollapsed) ? <ExpandAllIcon /> : <CollapseAllIcon />;
                                                })()}
                                            </button>
                                        </div>
                                    )
                                }

                                <div
                                    data-testid={`sidebar-column-resize-handle-${col.key}`}
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        bottom: 0,
                                        width: 4, // Hit area
                                        height: '100%',
                                        cursor: SIDEBAR_RESIZE_CURSOR,
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
            <div
                style={{
                    flex: 1,
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: isRootDropActive ? '#fff8e1' : 'transparent',
                    boxShadow: isRootDropActive ? 'inset 0 0 0 1px #f9ab00' : 'none',
                    transition: 'background-color 0.2s, box-shadow 0.2s'
                }}
                onWheel={handleWheel}
                onDragOver={handleRootDragOver}
                onDrop={(e) => { void handleRootDrop(e); }}
                onDragLeave={(e) => {
                    if (e.currentTarget !== e.target) return;
                    setIsRootDropActive(false);
                }}
            >
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
                                        {row.groupKind === 'assignee' ? <AssigneeIcon /> : <ProjectIcon />}
                                    </div>
                                    {row.projectName || (row.groupKind === 'assignee' ? (i18n.t('field_assigned_to') || 'Assignee') : (i18n.t('label_project') || 'Project'))}
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
                        const isDropTarget = dropTargetTaskId === task.id;
                        const meta = editMetaByTaskId[task.id];

                        return (
                            <div
                                key={task.id}
                                data-testid={`task-row-${task.id}`}
                                draggable={task.editable}
                                onDragStart={(e) => handleTaskDragStart(task.id, e)}
                                onDragOver={(e) => handleTaskDragOver(task.id, e)}
                                onDrop={(e) => { void handleTaskDrop(task.id, e); }}
                                onDragEnd={resetDragState}
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
                                    backgroundColor: isDropTarget ? '#e6f4ea' : (isSelected ? '#e8f0fe' : 'transparent'),
                                    boxShadow: isDropTarget ? 'inset 0 0 0 1px #34a853' : 'none',
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
                                        flexShrink: 0,
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
                                                            onCancel={close}
                                                            onCommit={(next) => {
                                                                // Handle clearing the date
                                                                if (next === '') {
                                                                    const { updateTask, autoSave, saveChanges } = useTaskStore.getState();
                                                                    updateTask(task.id, { dueDate: undefined });
                                                                    if (autoSave) {
                                                                        saveChanges().catch(console.error);
                                                                    }
                                                                    close();
                                                                    return;
                                                                }

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
                                                            controlHeight={inlineControlHeight}
                                                            onCancel={close}
                                                            onCommit={(next) => {
                                                                // Handle clearing the date
                                                                if (next === '') {
                                                                    const { updateTask, autoSave, saveChanges } = useTaskStore.getState();
                                                                    updateTask(task.id, { startDate: undefined });
                                                                    if (autoSave) {
                                                                        saveChanges().catch(console.error);
                                                                    }
                                                                    close();
                                                                    return;
                                                                }

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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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
                                                            controlHeight={inlineControlHeight}
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

                                                    const allVersions = useTaskStore.getState().versions;
                                                    const closedVersionIds = new Set(allVersions.filter(v => v.status === 'closed').map(v => Number(v.id)));
                                                    const filteredVersions = (taskMeta.options.versions || []).filter(v => !closedVersionIds.has(v.id));

                                                    return (
                                                        <SelectEditor
                                                            value={task.fixedVersionId ? Number(task.fixedVersionId) : null}
                                                            options={filteredVersions}
                                                            includeUnassigned
                                                            controlHeight={inlineControlHeight}
                                                            onCancel={close}
                                                            onCommit={async (next) => {
                                                                const nextName = taskMeta.options.versions?.find(s => s.id === next)?.name;
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

                                                {
                                                    if (!field) return <span>{i18n.t('button_edit')}</span>;
                                                    const customFieldId = customFieldIdFromEditField(field);
                                                    if (customFieldId) {
                                                        const taskMeta = editMetaByTaskId[task.id];
                                                        if (!taskMeta) return <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</span>;
                                                        if (!taskMeta.editable.customFieldValues) return <span>{i18n.t('button_edit')}</span>;

                                                        const customField = taskMeta.options.customFields.find((cf) => String(cf.id) === customFieldId)
                                                            ?? customFields.find((cf) => String(cf.id) === customFieldId);
                                                        if (!customField) return <span>{i18n.t('button_edit')}</span>;

                                                        return (
                                                            <CustomFieldEditor
                                                                customField={customField}
                                                                initialValue={task.customFieldValues?.[customFieldId] ?? taskMeta.customFieldValues[customFieldId] ?? null}
                                                                controlHeight={inlineControlHeight}
                                                                onCancel={close}
                                                                onCommit={async (next) => {
                                                                    const prevRecord = task.customFieldValues;
                                                                    const nextRecord = { ...(prevRecord ?? {}), [customFieldId]: next };
                                                                    useTaskStore.getState().updateTask(task.id, { customFieldValues: nextRecord });
                                                                    useEditMetaStore.getState().setCustomFieldValue(task.id, Number(customFieldId), next);
                                                                    try {
                                                                        await save({
                                                                            taskId: task.id,
                                                                            optimisticTaskUpdates: {},
                                                                            rollbackTaskUpdates: {},
                                                                            fields: { custom_field_values: { [customFieldId]: next ?? '' } }
                                                                        });
                                                                    } catch (e) {
                                                                        useTaskStore.getState().updateTask(task.id, { customFieldValues: prevRecord });
                                                                        useEditMetaStore.getState().setCustomFieldValue(task.id, Number(customFieldId), taskMeta.customFieldValues[customFieldId] ?? null);
                                                                        throw e;
                                                                    }
                                                                    close();
                                                                }}
                                                            />
                                                        );
                                                    }
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
