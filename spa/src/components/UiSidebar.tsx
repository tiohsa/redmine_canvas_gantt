import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Task } from '../types';
import { getStatusColor, getPriorityColor } from '../utils/styles';
import { useUIStore } from '../stores/UIStore';
import { SIDEBAR_RESIZE_CURSOR } from '../constants';

import { CustomFieldEditor, DoneRatioEditor, DueDateEditor, EstimatedHoursEditor, SelectEditor, SubjectEditor } from './InlineEditors';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { InlineEditSettings } from '../types/editMeta';
import { i18n } from '../utils/i18n';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { customFieldEditField, customFieldIdFromEditField, formatCustomFieldCellValue, type SidebarColumn } from './sidebar/sidebarColumns';
import { mergeColumnSettings, resolveVisibleColumnKeys } from './sidebar/sidebarColumnSettings';
import { useSidebarColumnSizing } from './sidebar/useSidebarColumnSizing';
import { useSidebarDragAndDrop } from './sidebar/useSidebarDragAndDrop';
import { useSidebarInlineEdit } from './sidebar/useSidebarInlineEdit';
import { SvgIcon } from '../icons/SvgIcon';
import { getTaskNotification } from './sidebar/sidebarNotifications';
import { parseTrackerIconMap, resolveTrackerIconKind } from './sidebar/trackerIconUtils';
import { TrackerIcon } from './sidebar/trackerIcon';
import { designTokens, fontFamilies } from '../styles/designTokens';
import { formatDate } from '../utils/dateUtils';
const NOTIFICATION_COLUMN_KEY = 'notification';

type CanvasGanttSettings = InlineEditSettings & {
    row_height?: string;
    tracker_icon_map?: string;
};

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
    const color = designTokens.sidebarProgressFill;

    return (
        <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%' }}
            data-tooltip={`${ratio}%`}
        >
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="10" cy="10" r={r} fill="none" stroke={designTokens.sidebarProgressTrack} strokeWidth="3" />
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

const ExpansionIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={designTokens.textMuted}
        strokeWidth="2.0"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

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
    const taskStatuses = useTaskStore(state => state.taskStatuses);
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
    const columnSettings = useUIStore(state => state.columnSettings);
    const visibleColumns = useUIStore(state => state.visibleColumns);
    const setActiveInlineEdit = useUIStore(state => state.setActiveInlineEdit);
    const activeInlineEdit = useUIStore(state => state.activeInlineEdit);
    const showHierarchyLines = useUIStore(state => state.showHierarchyLines);
    const columnWidths = useUIStore(state => state.columnWidths);
    const setColumnWidth = useUIStore(state => state.setColumnWidth);
    const sidebarFontSize = useUIStore(state => state.sidebarFontSize);

    const smallFontSize = Math.max(9, sidebarFontSize - 2);
    const mediumSmallFontSize = Math.max(10, sidebarFontSize - 1);

    const editMetaByTaskId = useEditMetaStore((s) => s.metaByTaskId);
    const fetchEditMeta = useEditMetaStore((s) => s.fetchEditMeta);
    const treeGuideWidth = 16;
    const currentTreeGuideWidth = 16;
    const sidebarPaddingX = 8;
    const sidebarGapSm = 4;
    const sidebarGapMd = 6;
    const trackerIconSize = 14;
    const sidebarControlSize = 20;
    const sidebarButtonSize = 24;
    const sidebarHeaderHeight = 48;
    const sidebarRowPaddingX = 12;
    const sidebarRowIndentX = 32;
    const sidebarHeaderBg = designTokens.surfaceHover;
    const sidebarRowBorder = `1px solid ${designTokens.controlBorder}`;
    const sidebarMutedText = designTokens.textMuted;
    const sidebarSecondaryText = designTokens.textSecondary;
    const sidebarClosedText = designTokens.textMuted;
    const sidebarPlaceholderText = designTokens.disabledFg;
    const sidebarLoadingText = designTokens.controlLoadingFg;
    const sidebarSelectedRowBg = designTokens.sidebarSelectedRowBg;
    const sidebarDropTargetBg = designTokens.sidebarDropTargetBg;
    const sidebarDropTargetBorder = designTokens.sidebarDropTargetBorder;
    const sidebarRootDropBg = designTokens.sidebarRootDropBg;
    const sidebarRootDropBorder = designTokens.sidebarRootDropBorder;
    const tr = (key: string) => i18n.t(key) ?? '';

    const settings = React.useMemo(() => {
        return (window as unknown as { RedmineCanvasGantt?: { settings?: CanvasGanttSettings } }).RedmineCanvasGantt?.settings ?? {};
    }, []);
    const trackerIconMap = React.useMemo(() => parseTrackerIconMap(settings.tracker_icon_map), [settings]);
    const bodyRef = React.useRef<HTMLDivElement>(null);

    const { handleResizeStart } = useSidebarColumnSizing({ tasks, customFields, setColumnWidth });
    const {
        dropTargetTaskId,
        isRootDropActive,
        handleTaskDragStart,
        handleTaskDragOver,
        handleTaskDrop,
        handleRootDragOver,
        handleRootDrop,
        handleBodyDragLeave,
        resetDragState
    } = useSidebarDragAndDrop({
        bodyRef,
        viewportScrollY: viewport.scrollY,
        updateViewport,
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

    const closedStatusIds = React.useMemo(
        () => new Set(taskStatuses.filter(status => status.isClosed).map(status => status.id)),
        [taskStatuses]
    );
    const isTaskClosed = React.useCallback((task: Task) => closedStatusIds.has(task.statusId), [closedStatusIds]);

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
                    style={{ fontFamily: fontFamilies.mono, color: designTokens.textMuted, fontSize: `${mediumSmallFontSize}px` }}
                >
                    {t.id}
                </span>
            )
        },
        {
            key: NOTIFICATION_COLUMN_KEY,
            title: tr('label_notifications'),
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
                            width: 14,
                            height: 14,
                            color: notification.color
                        }}
                    >
                        <SvgIcon name={notification.iconName} size={14} />
                    </span>
                );
            }
        },
        {
            key: 'subject',
            title: tr('field_subject'),
            width: columnWidths['subject'] ?? 280,
            render: (t: Task) => (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontWeight: t.hasChildren ? 500 : 400,
                        height: '100%',
                        width: '100%',
                        position: 'relative',
                        gap: sidebarGapMd
                    }}
                    className="task-subject-cell"
                >
                    {(() => {
                        const isSelected = t.id === selectedTaskId;
                        const isClosed = isTaskClosed(t);
                        const hasParentGuide = (t.treeLevelGuides ?? []).length > 0;
                        const level = (t.treeLevelGuides ?? []).length;
                        const trackerIconCenterOffset = sidebarPaddingX + currentTreeGuideWidth + sidebarGapMd + sidebarPaddingX + trackerIconSize / 2;
                        const getTreeColumnX = (l: number) => trackerIconCenterOffset + l * treeGuideWidth;
                        const currentGuideStartX = sidebarPaddingX + level * treeGuideWidth;
                        const expansionButtonLeft = getTreeColumnX(level) - currentGuideStartX;

                        return (
                            <>
                                {/* Tree Lines Overlay */}
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, pointerEvents: 'none', zIndex: 1 }}>
                                    {/* Ancestor Vertical Lines */}
                                    {showHierarchyLines && (t.treeLevelGuides ?? []).map((hasLine, i) => {
                                        if (!hasLine || i === level - 1) return null;
                                        return (
                                            <div key={i} style={{
                                                position: 'absolute',
                                                left: getTreeColumnX(i),
                                                top: -1,
                                                bottom: 0,
                                                width: 1,
                                                backgroundColor: designTokens.controlBorder,
                                                transform: 'translateX(-50%)'
                                            }} data-testid="task-tree-guide-line" />
                                        );
                                    })}

                                    {/* Parent connector line */}
                                    {showHierarchyLines && hasParentGuide && (
                                        <div style={{
                                            position: 'absolute',
                                            left: getTreeColumnX(level - 1),
                                            top: -1,
                                            bottom: t.isLastChild ? '50%' : 0,
                                            width: 1,
                                            backgroundColor: designTokens.controlBorder,
                                            transform: 'translateX(-50%)'
                                        }} data-testid="task-tree-parent-guide" />
                                    )}

                                    {/* Current Task Vertical Line (if expanded) */}
                                    {showHierarchyLines && (t.hasChildren && (taskExpansion[t.id] ?? true)) && (
                                        <div style={{
                                            position: 'absolute',
                                            left: getTreeColumnX(level),
                                            top: '50%',
                                            bottom: -1,
                                            width: 1,
                                            backgroundColor: designTokens.controlBorder,
                                            transform: 'translateX(-50%)'
                                        }} data-testid="task-tree-current-guide" />
                                    )}

                                    {/* Horizontal Branch Line connecting to parent */}
                                    {showHierarchyLines && hasParentGuide && (
                                        <div style={{
                                            position: 'absolute',
                                            left: getTreeColumnX(level - 1),
                                            width: treeGuideWidth,
                                            top: '50%',
                                            height: 1,
                                            backgroundColor: designTokens.controlBorder,
                                            transform: 'translateY(-50%)'
                                        }} data-testid="task-tree-branch-guide" />
                                    )}
                                </div>

                                {/* Tree Guide Area (Expansion Buttons) */}
                                <div style={{ display: 'flex', height: '100%', flexShrink: 0, paddingLeft: sidebarPaddingX }}>
                                    {(t.treeLevelGuides ?? []).map((_, i) => (
                                        <div key={i} style={{ width: treeGuideWidth, height: '100%', position: 'relative' }} />
                                    ))}
                                    <div style={{ width: currentTreeGuideWidth, height: '100%', position: 'relative' }}>
                                        {/* Expansion Trigger (Chevron) - Maintained at the center of the guide div */}
                                        {t.hasChildren && (
                                            <button
                                                type="button"
                                                aria-label={(taskExpansion[t.id] ?? true) ? tr('button_collapse') : tr('button_expand')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveInlineEdit(null);
                                                    toggleTaskExpansion(t.id);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    left: expansionButtonLeft,
                                                    top: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    width: 20,
                                                    height: 20,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    background: isSelected ? designTokens.sidebarSelectedRowBg : designTokens.controlBg,
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                    zIndex: 3,
                                                    padding: 0
                                                }}
                                            >
                                                <ExpansionIcon expanded={taskExpansion[t.id] ?? true} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{
                                    marginLeft: sidebarPaddingX,
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexShrink: 0,
                                    zIndex: 2,
                                    position: 'relative',
                                    backgroundColor: isSelected ? designTokens.sidebarSelectedRowBg : designTokens.controlBg
                                }}>
                                    <TrackerIcon kind={resolveTrackerIconKind(t.trackerId, t.trackerName, trackerIconMap)} />
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
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        color: isSelected ? designTokens.controlActiveFg : (isClosed ? sidebarClosedText : sidebarSecondaryText),
                                        textDecoration: isClosed ? 'line-through' : 'none',
                                        whiteSpace: 'nowrap',
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
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
                                    title={tr('button_edit')}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        display: 'flex', // Hidden by CSS by default, shown on hover
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: sidebarMutedText,
                                        marginLeft: sidebarPaddingX / 2
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
            title: tr('field_status'),
            width: columnWidths['status'] ?? 100,
            render: (t: Task) => {
                const isClosed = isTaskClosed(t);
                const style = getStatusColor(t.statusId, isClosed);
                return renderEditableCell(t, 'statusId', (
                    <span data-testid={`task-status-badge-${t.id}`} style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: `${smallFontSize}px`,
                        fontWeight: 500,
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
            title: tr('field_assigned_to'),
            width: columnWidths['assignee'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'assignedToId', (
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: '24px' }}>
                    {t.assignedToName ? (
                        <>
                            <div
                                className="assignee-avatar"
                                title={t.assignedToName}
                                style={{ backgroundColor: getAvatarColor(t.assignedToName || ''), width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: `${smallFontSize - 1}px`, flexShrink: 0 }}
                            >
                                {getInitials(t.assignedToName)}
                            </div>
                        </>
                    ) : (
                        <span style={{ color: sidebarPlaceholderText, fontSize: `${mediumSmallFontSize}px` }}>-</span>
                    )}
                </div>
            ))
        },
        {
            key: 'startDate',
            title: tr('field_start_date'),
            width: columnWidths['startDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'startDate', (
                <span style={{ color: designTokens.textMuted }}>{formatDate(t.startDate)}</span>
            ))
        },
        {
            key: 'dueDate',
            title: tr('field_due_date'),
            width: columnWidths['dueDate'] ?? 90,
            render: (t: Task) => renderEditableCell(t, 'dueDate', (
                <span style={{ color: designTokens.textMuted }}>{formatDate(t.dueDate)}</span>
            ))
        },
        {
            key: 'ratioDone',
            title: tr('field_done_ratio'),
            width: columnWidths['ratioDone'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'ratioDone', (
                <ProgressCircle ratio={t.ratioDone} statusId={t.statusId} />
            ))
        },
        {
            key: 'project',
            title: tr('field_project'),
            width: columnWidths['project'] ?? 120,
            render: (t: Task) => renderEditableCell(t, 'projectId', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.projectName || '-'}</span>
            ))
        },
        {
            key: 'tracker',
            title: tr('field_tracker'),
            width: columnWidths['tracker'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'trackerId', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.trackerName || '-'}</span>
            ))
        },
        {
            key: 'priority',
            title: tr('field_priority'),
            width: columnWidths['priority'] ?? 90,
            render: (t: Task) => {
                const priorityId = t.priorityId || 0;
                const style = getPriorityColor(priorityId, t.priorityPosition);
                return renderEditableCell(t, 'priorityId', (
                    <span style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: `${smallFontSize}px`,
                        fontWeight: 500,
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
            title: tr('field_author'),
            width: columnWidths['author'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'authorId', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.authorName || '-'}</span>
            ))
        },
        {
            key: 'category',
            title: tr('field_category'),
            width: columnWidths['category'] ?? 100,
            render: (t: Task) => renderEditableCell(t, 'categoryId', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.categoryName || '-'}</span>
            ))
        },
        {
            key: 'estimatedHours',
            title: tr('field_estimated_hours'),
            width: columnWidths['estimatedHours'] ?? 80,
            render: (t: Task) => renderEditableCell(t, 'estimatedHours', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.estimatedHours !== undefined ? `${t.estimatedHours}h` : '-'}</span>
            ))
        },
        {
            key: 'createdOn',
            title: tr('field_created_on'),
            width: columnWidths['createdOn'] ?? 120,
            render: (t: Task) => <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.createdOn ? new Date(t.createdOn).toLocaleString() : '-'}</span>
        },
        {
            key: 'updatedOn',
            title: tr('field_updated_on'),
            width: columnWidths['updatedOn'] ?? 120,
            render: (t: Task) => <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.updatedOn ? new Date(t.updatedOn).toLocaleString() : '-'}</span>
        },
        {
            key: 'spentHours',
            title: tr('field_spent_hours'),
            width: columnWidths['spentHours'] ?? 80,
            render: (t: Task) => <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.spentHours !== undefined ? `${t.spentHours}h` : '-'}</span>
        },
        {
            key: 'version',
            title: tr('field_version'),
            width: columnWidths['version'] ?? 120,
            render: (t: Task) => renderEditableCell(t, 'fixedVersionId', (
                <span style={{ color: sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}>{t.fixedVersionName || '-'}</span>
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
                        style={{ color: displayValue === '-' ? sidebarPlaceholderText : sidebarMutedText, fontSize: `${mediumSmallFontSize}px` }}
                        data-tooltip={displayValue !== '-' ? displayValue : undefined}
                    >
                        {displayValue}
                    </span>
                ));
            }
        }))
    ];

    const effectiveColumnSettings = mergeColumnSettings(
        columnSettings,
        columns.map((column) => ({ key: column.key, label: column.title })),
        visibleColumns
    );
    const activeColumnKeys = resolveVisibleColumnKeys(effectiveColumnSettings, []);
    const activeColumns = activeColumnKeys
        .map((key) => columns.find((col) => col.key === key))
        .filter((col): col is SidebarColumn => Boolean(col));

    const sidebarColumnBorder = `1px solid ${designTokens.controlBorder}`;
    const inlineControlHeight = Math.max(20, Math.min(24, viewport.rowHeight - 6));

    return (
        <div
            style={{
                width: '100%',
                backgroundColor: designTokens.controlBg,
                borderRight: `1px solid ${designTokens.controlBorder}`,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                flexShrink: 0
            }}
        >
            {/* Header */}
            <div style={{
                height: sidebarHeaderHeight,
                borderBottom: sidebarRowBorder,
                display: 'flex',
                fontWeight: 500,
                backgroundColor: sidebarHeaderBg,
                color: sidebarSecondaryText,
                fontSize: `${sidebarFontSize}px`,
                overflow: 'hidden'
            }}>
                {
                    activeColumns.map((col, idx) => {
                        const isLastColumn = idx === activeColumns.length - 1;
                        const sortConfig = useTaskStore.getState().sortConfig;
                        const sortField = getSortField(col.key);
                        const isSorted = sortConfig?.key === sortField;
                        return (
                            <div
                                key={col.key}
                                data-testid={`sidebar-header-${col.key}`}
                                style={{
                                    width: isLastColumn ? 0 : col.width,
                                    flex: isLastColumn ? '1 1 0px' : '0 0 auto',
                                    minWidth: isLastColumn ? 0 : undefined,
                                    padding: `0 ${sidebarPaddingX}px`,
                                    borderRight: isLastColumn ? 'none' : sidebarColumnBorder,
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    justifyContent: col.key === NOTIFICATION_COLUMN_KEY ? 'center' : 'space-between'
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
                                        <span style={{ marginLeft: sidebarGapSm, display: 'flex', alignItems: 'center' }}>
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
                                        <div style={{ display: 'flex', gap: sidebarGapSm, marginLeft: 'auto', marginRight: sidebarRowPaddingX }}>
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
                                                        ? tr('button_expand_all')
                                                        : tr('button_collapse_all');
                                                })()}
                                                className="header-action-button"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: `${sidebarButtonSize}px`,
                                                    height: `${sidebarButtonSize}px`,
                                                    padding: 0,
                                                    border: `1px solid ${designTokens.borderSubtle}`,
                                                    borderRadius: '4px',
                                                    backgroundColor: designTokens.controlBg,
                                                    color: sidebarMutedText,
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

                                {!isLastColumn && (
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
                                    />
                                )}
                            </div>
                        )
                    })
                }
            </div>

            {/* Body */}
            <div
                ref={bodyRef}
                data-testid="sidebar-body"
                style={{
                    flex: 1,
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: isRootDropActive ? sidebarRootDropBg : 'transparent',
                    boxShadow: isRootDropActive ? `inset 0 0 0 1px ${sidebarRootDropBorder}` : 'none',
                    transition: 'background-color 0.2s, box-shadow 0.2s'
                }}
                onWheel={handleWheel}
                onDragOver={handleRootDragOver}
                onDrop={(e) => { void handleRootDrop(e); }}
                onDragLeave={handleBodyDragLeave}
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
                                        padding: `0 ${sidebarRowPaddingX}px`,
                                        backgroundColor: sidebarHeaderBg,
                                        color: sidebarSecondaryText,
                                        fontWeight: 500,
                                        borderTop: sidebarRowBorder,
                                        borderBottom: sidebarRowBorder,
                                        marginTop: -1,
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
                                        width: sidebarControlSize,
                                        height: sidebarControlSize,
                                        marginRight: sidebarPaddingX,
                                        flexShrink: 0
                                    }}>
                                        <ExpansionIcon expanded={expanded} />
                                    </div>
                                    <div style={{ marginRight: sidebarPaddingX, display: 'flex', alignItems: 'center', color: sidebarMutedText }}>
                                        {row.groupKind === 'assignee' ? <AssigneeIcon /> : <ProjectIcon />}
                                    </div>
                                    {row.projectName || (row.groupKind === 'assignee' ? tr('field_assigned_to') : tr('label_project'))}
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
                                        padding: `0 ${sidebarRowPaddingX}px 0 ${sidebarRowIndentX}px`,
                                        backgroundColor: sidebarHeaderBg,
                                        color: sidebarSecondaryText,
                                        fontWeight: 500,
                                        borderTop: sidebarRowBorder,
                                        borderBottom: sidebarRowBorder,
                                        marginTop: -1,
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
                                        width: sidebarControlSize,
                                        height: sidebarControlSize,
                                        marginRight: sidebarPaddingX,
                                        flexShrink: 0
                                    }}>
                                        <ExpansionIcon expanded={expanded} />
                                    </div>
                                    <div style={{ marginRight: sidebarPaddingX, display: 'flex', alignItems: 'center', color: designTokens.trackerMilestoneStroke }}>
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
                        const isClosed = isTaskClosed(task);
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
                                    borderBottom: sidebarRowBorder,
                                    backgroundColor: isDropTarget ? sidebarDropTargetBg : (isSelected ? sidebarSelectedRowBg : 'transparent'),
                                    boxShadow: isDropTarget ? `inset 0 0 0 1px ${sidebarDropTargetBorder}` : 'none',
                                    cursor: 'pointer',
                                    fontSize: `${sidebarFontSize}px`,
                                    color: isClosed ? sidebarClosedText : sidebarSecondaryText,
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
                                {activeColumns.map((col, idx) => {
                                    const isLastColumn = idx === activeColumns.length - 1;
                                    return (
                                        <div key={col.key} style={{
                                            width: isLastColumn ? 0 : col.width,
                                            flex: isLastColumn ? '1 1 0px' : '0 0 auto',
                                            minWidth: isLastColumn ? 0 : undefined,
                                            padding: `0 ${sidebarPaddingX}px`,
                                            borderRight: isLastColumn ? 'none' : sidebarColumnBorder,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: col.key === NOTIFICATION_COLUMN_KEY ? 'center' : 'flex-start',
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            <div
                                                data-testid={`cell-${task.id}-${col.key}`}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: col.key === NOTIFICATION_COLUMN_KEY ? 'center' : 'flex-start'
                                                }}
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
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
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
                                                                    const prevName = task.assignedToName ?? null;
                                                                    const name = next === null ? null : (meta.options.assignees.find((o) => o.id === next)?.name ?? null);
                                                                    await save({
                                                                        taskId: task.id,
                                                                        optimisticTaskUpdates: { assignedToId: next, assignedToName: name },
                                                                        rollbackTaskUpdates: { assignedToId: prevId, assignedToName: prevName },
                                                                        fields: { assigned_to_id: next ?? '' }
                                                                    });
                                                                    close();
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    if (field === 'statusId') {
                                                        const taskMeta = editMetaByTaskId[task.id];
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
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
                                                                        useUIStore.getState().addNotification(tr('label_invalid_date_range'), 'warning');
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
                                                                        useUIStore.getState().addNotification(tr('label_invalid_date_range'), 'warning');
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
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
                                                        return (
                                                            <SelectEditor
                                                                value={task.priorityId ?? null}
                                                                options={taskMeta.options.priorities || []}
                                                                controlHeight={inlineControlHeight}
                                                                onCancel={close}
                                                                onCommit={async (next) => {
                                                                    if (next === null) return;
                                                                    const nextPriority = meta.options.priorities?.find(s => s.id === next);
                                                                    const nextName = nextPriority?.name;
                                                                    await save({
                                                                        taskId: task.id,
                                                                        optimisticTaskUpdates: { priorityId: next, priorityName: nextName, priorityPosition: nextPriority?.position },
                                                                        rollbackTaskUpdates: { priorityId: task.priorityId, priorityName: task.priorityName, priorityPosition: task.priorityPosition },
                                                                        fields: { priority_id: next }
                                                                    });
                                                                    close();
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    if (field === 'authorId') {
                                                        const taskMeta = editMetaByTaskId[task.id];
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
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
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
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
                                                            <EstimatedHoursEditor
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
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
                                                        return (
                                                            <SelectEditor
                                                                value={task.projectId ? Number(task.projectId) : null}
                                                                options={taskMeta.options.projects || []}
                                                                controlHeight={inlineControlHeight}
                                                                onCancel={close}
                                                                onCommit={async (next) => {
                                                                    if (next === null) return;
                                                                    await fetchEditMeta(task.id, { targetProjectId: next, force: true });
                                                                    const nextName = taskMeta.options.projects?.find(s => s.id === next)?.name;
                                                                    try {
                                                                        await save({
                                                                            taskId: task.id,
                                                                            optimisticTaskUpdates: {
                                                                                projectId: next !== null ? String(next) : undefined,
                                                                                projectName: nextName,
                                                                                fixedVersionId: undefined,
                                                                                fixedVersionName: undefined,
                                                                                categoryId: undefined,
                                                                                categoryName: undefined
                                                                            },
                                                                            rollbackTaskUpdates: {
                                                                                projectId: task.projectId,
                                                                                projectName: task.projectName,
                                                                                fixedVersionId: task.fixedVersionId,
                                                                                fixedVersionName: task.fixedVersionName,
                                                                                categoryId: task.categoryId,
                                                                                categoryName: task.categoryName
                                                                            },
                                                                            fields: { project_id: next, fixed_version_id: null, category_id: null }
                                                                        });
                                                                        close();
                                                                    } catch (error) {
                                                                        if (task.projectId) {
                                                                            await fetchEditMeta(task.id, { targetProjectId: Number(task.projectId), force: true });
                                                                        }
                                                                        throw error;
                                                                    }
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    if (field === 'trackerId') {
                                                        const taskMeta = editMetaByTaskId[task.id];
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
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
                                                        if (!taskMeta) return <span style={{ fontSize: `${mediumSmallFontSize}px`, color: sidebarLoadingText }}>{tr('label_loading')}</span>;

                                                        const allVersions = useTaskStore.getState().versions;
                                                        const closedVersionIds = new Set(allVersions.filter(v => v.status === 'closed').map(v => Number(v.id)));
                                                        const filteredVersions = (taskMeta.options.versions || []).filter(v => !closedVersionIds.has(v.id));

                                                        return (
                                                            <SelectEditor
                                                                value={task.fixedVersionId ? Number(task.fixedVersionId) : null}
                                                                options={filteredVersions}
                                                                includeUnassigned
                                                                emptyOptionLabel={tr('label_none')}
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
                                                        if (!field) return <span>{tr('button_edit')}</span>;
                                                        const customFieldId = customFieldIdFromEditField(field);
                                                        if (customFieldId) {
                                                            const taskMeta = editMetaByTaskId[task.id];
                                                            if (!taskMeta) return <span style={{ fontSize: mediumSmallFontSize, color: sidebarLoadingText }}>{tr('label_loading')}</span>;
                                                            if (!taskMeta.editable.customFieldValues) return <span>{tr('button_edit')}</span>;

                                                            const customField = taskMeta.options.customFields.find((cf) => String(cf.id) === customFieldId)
                                                                ?? customFields.find((cf) => String(cf.id) === customFieldId);
                                                            if (!customField) return <span>{tr('button_edit')}</span>;

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

                                                    return <span>{tr('button_edit')}</span>;
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })
                }
            </div>

            {/* Level 1: Inline detail panel (Level 2+ edits live here) */}

        </div >
    );
};
