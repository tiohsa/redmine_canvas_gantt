import React from 'react';

import type { TaskStatus, ZoomLevel } from '../types';
import { AutoScheduleMoveMode, RelationType, type AutoScheduleMoveMode as AutoScheduleMoveModeValue, type DefaultRelationType } from '../types/constraints';
import type { BaselineSaveScope } from '../types/baseline';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore, DEFAULT_COLUMNS } from '../stores/UIStore';
import { useBaselineStore } from '../stores/BaselineStore';
import { i18n } from '../utils/i18n';
import { apiClient } from '../api/client';
import { getRelationTypeLabel } from '../utils/relationEditing';
import { savePreferences } from '../utils/preferences';
import { buildRedmineUrl } from '../utils/redmineUrl';
import { navigateToRedminePath } from '../utils/navigation';
import { buildRedmineIssueQueryParams, toResolvedQueryStateFromStore } from '../utils/queryParams';
import { useToolbarMenuState } from './gantt/useToolbarMenuState';
import { useWorkloadStore } from '../stores/WorkloadStore';
import type { GanttExportHandle } from '../export/types';
import {
    applyIndeterminateState,
    isCheckboxChecked,
    mergeStatusSelection,
    resolveCheckboxState,
    toggleAllSelectionValues,
    toggleSelectionValue,
} from './gantt/toolbarSelection';

interface GanttToolbarProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
    exportRef: React.RefObject<GanttExportHandle | null>;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ zoomLevel, onZoomChange, exportRef }) => {
    const {
        viewport, updateViewport, groupByProject, setGroupByProject, groupByAssignee, setGroupByAssignee, organizeByDependency, setOrganizeByDependency,
        filterText, setFilterText, allTasks, versions, selectedAssigneeIds, setSelectedAssigneeIds,
        selectedProjectIds, setSelectedProjectIds, selectedVersionIds, setSelectedVersionIds,
        setRowHeight, taskStatuses, selectedStatusIds, setSelectedStatusFromServer, showVersions, setShowVersions,
        modifiedTaskIds, saveChanges, discardChanges, autoSave, setAutoSave, customFields, activeQueryId, sortConfig, showSubprojects, permissions
    } = useTaskStore();
    const {
        showProgressLine,
        toggleProgressLine,
        showBaseline,
        toggleBaseline,
        visibleColumns,
        setVisibleColumns,
        toggleLeftPane,
        toggleRightPane,
        leftPaneVisible,
        rightPaneVisible,
        showPointsOrphans,
        togglePointsOrphans,
        isFullScreen,
        toggleFullScreen,
        openHelpDialog,
        defaultRelationType,
        autoCalculateDelay,
        autoApplyDefaultRelation,
        autoScheduleMoveMode,
        setDefaultRelationType,
        setAutoCalculateDelay,
        setAutoApplyDefaultRelation,
        setAutoScheduleMoveMode,
        resetRelationPreferences
    } = useUIStore();
    const baselineSaveStatus = useBaselineStore(state => state.saveStatus);
    const hasBaseline = useBaselineStore(state => state.hasBaseline);
    const isRightPaneMaximized = !leftPaneVisible && rightPaneVisible;
    const isLeftPaneMaximized = leftPaneVisible && !rightPaneVisible;
    const {
        columnMenuRef,
        filterMenuRef,
        assigneeMenuRef,
        projectMenuRef,
        versionMenuRef,
        statusMenuRef,
        rowHeightMenuRef,
        relationSettingsMenuRef,
        exportMenuRef,
        workloadMenuRef,
        baselineSaveMenuRef,
        isMenuOpen,
        toggleMenu,
        openMenuByKey,
        closeMenu
    } = useToolbarMenuState();
    const {
        workloadPaneVisible,
        toggleWorkloadPaneVisible,
        capacityThreshold,
        setCapacityThreshold,
        leafIssuesOnly,
        setLeafIssuesOnly,
        includeClosedIssues,
        setIncludeClosedIssues,
        todayOnwardOnly,
        setTodayOnwardOnly
    } = useWorkloadStore();

    const [draftRelationType, setDraftRelationType] = React.useState<DefaultRelationType>(defaultRelationType);
    const [draftAutoCalculateDelay, setDraftAutoCalculateDelay] = React.useState<boolean>(autoCalculateDelay);
    const [draftAutoApplyDefaultRelation, setDraftAutoApplyDefaultRelation] = React.useState<boolean>(autoApplyDefaultRelation);
    const [draftAutoScheduleMoveMode, setDraftAutoScheduleMoveMode] = React.useState<AutoScheduleMoveModeValue>(autoScheduleMoveMode);

    const filterInputRef = React.useRef<HTMLInputElement>(null);
    const selectAllStatusesRef = React.useRef<HTMLInputElement>(null);
    const completedStatusesRef = React.useRef<HTMLInputElement>(null);
    const incompleteStatusesRef = React.useRef<HTMLInputElement>(null);
    const showFilterMenu = isMenuOpen('filter');
    const showColumnMenu = isMenuOpen('column');
    const showAssigneeMenu = isMenuOpen('assignee');
    const showProjectMenu = isMenuOpen('project');
    const showVersionMenu = isMenuOpen('version');
    const showStatusMenu = isMenuOpen('status');
    const showRowHeightMenu = isMenuOpen('rowHeight');
    const showRelationSettingsMenu = isMenuOpen('relationSettings');
    const showExportMenu = isMenuOpen('export');
    const showWorkloadMenu = isMenuOpen('workload');
    const showBaselineSaveMenu = isMenuOpen('baselineSave');

    React.useEffect(() => {
        if (!showFilterMenu) return;

        const requestId = window.requestAnimationFrame(() => {
            filterInputRef.current?.focus();
            filterInputRef.current?.select();
        });

        return () => window.cancelAnimationFrame(requestId);
    }, [showFilterMenu]);

    React.useEffect(() => {
        if (!showRelationSettingsMenu) return;
        setDraftRelationType(defaultRelationType);
        setDraftAutoCalculateDelay(autoCalculateDelay);
        setDraftAutoApplyDefaultRelation(autoApplyDefaultRelation);
        setDraftAutoScheduleMoveMode(autoScheduleMoveMode);
    }, [autoApplyDefaultRelation, autoCalculateDelay, autoScheduleMoveMode, defaultRelationType, showRelationSettingsMenu]);

    React.useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;

            const key = event.key.toLowerCase();

            if (event.ctrlKey && !event.altKey && !event.metaKey && key === 'f') {
                event.preventDefault();
                event.stopPropagation();
                openMenuByKey('filter');
                return;
            }

            if (key === 'escape' && showFilterMenu) {
                event.preventDefault();
                event.stopPropagation();
                setFilterText('');
                closeMenu('filter');
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
    }, [closeMenu, openMenuByKey, showFilterMenu, setFilterText]);

    const handleSaveRelationSettings = () => {
        setDefaultRelationType(draftRelationType);
        setAutoCalculateDelay(draftAutoCalculateDelay);
        setAutoApplyDefaultRelation(draftAutoApplyDefaultRelation);
        setAutoScheduleMoveMode(draftAutoScheduleMoveMode);
        savePreferences({
            defaultRelationType: draftRelationType,
            autoCalculateDelay: draftAutoCalculateDelay,
            autoApplyDefaultRelation: draftAutoApplyDefaultRelation,
            autoScheduleMoveMode: draftAutoScheduleMoveMode
        });
        closeMenu('relationSettings');
    };

    const handleResetRelationSettings = () => {
        resetRelationPreferences();
        savePreferences({
            defaultRelationType: undefined,
            autoCalculateDelay: undefined,
            autoApplyDefaultRelation: undefined,
            autoScheduleMoveMode: undefined
        });
        closeMenu('relationSettings');
    };

    const handleExport = async (method: keyof GanttExportHandle) => {
        try {
            const handle = exportRef.current;
            if (!handle || !rightPaneVisible) {
                throw new Error(i18n.t('label_export_unavailable') || 'Export is unavailable in the current layout');
            }

            await handle[method]();
            closeMenu('export');
        } catch (error) {
            useUIStore.getState().addNotification(
                error instanceof Error ? error.message : (i18n.t('label_export_failed') || 'Export failed'),
                'error'
            );
        }
    };

    const handleSaveBaseline = async (scope: BaselineSaveScope) => {
        if (!permissions.baselineEditable || baselineSaveStatus === 'saving') {
            return;
        }

        const baselineStore = useBaselineStore.getState();
        baselineStore.setSaveStatus('saving');
        baselineStore.setLastError(null);

        try {
            if (modifiedTaskIds.size > 0) {
                const failures = await saveChanges();
                if (failures.size > 0) {
                    baselineStore.setSaveStatus('error');
                    return;
                }
            }

            const result = await apiClient.saveBaseline({
                query: scope === 'filtered' ? toResolvedQueryStateFromStore(useTaskStore.getState()) : undefined,
                scope
            });

            if (result.status === 'error') {
                throw new Error(result.error || 'Failed to save baseline');
            }
            if (!result.baseline) {
                throw new Error('Failed to save baseline');
            }

            baselineStore.setSnapshot(result.baseline, result.warnings ?? []);
            baselineStore.setSaveStatus('ready');
            closeMenu('baselineSave');

            if (result.warnings?.length) {
                result.warnings.forEach((warning) => useUIStore.getState().addNotification(warning, 'warning'));
            }

            useUIStore.getState().addNotification(i18n.t('label_baseline_saved') || 'Baseline saved', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : (i18n.t('label_baseline_save_failed') || 'Failed to save baseline');
            baselineStore.setLastError(message);
            useUIStore.getState().addNotification(message, 'error');
        }
    };

    const handleTodayClick = () => {
        const now = Date.now();
        let newStartDate = viewport.startDate;

        // If today is before current start date, move start date back
        if (now < newStartDate) {
            // Move start date to 1 month before today to give some context
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            newStartDate = d.getTime();
        }

        const todayX = (now - newStartDate) * viewport.scale;
        // Center the view (assuming width is available in viewport, otherwise guess)
        const centeredX = Math.max(0, todayX - (viewport.width / 2));
        updateViewport({ startDate: newStartDate, scrollX: centeredX });
    };

    const navigateMonth = (offset: number) => {
        const leftDate = new Date(viewport.startDate + viewport.scrollX / viewport.scale);
        leftDate.setDate(1);
        leftDate.setMonth(leftDate.getMonth() + offset);
        leftDate.setHours(0, 0, 0, 0);
        updateViewport({ startDate: leftDate.getTime(), scrollX: 0 });
    };

    const toggleColumn = (key: string) => {
        const next = visibleColumns.includes(key)
            ? visibleColumns.filter(k => k !== key)
            : [...visibleColumns, key];
        setVisibleColumns(next);
    };

    const openRedmineQueryEditor = () => {
        const issueListPath = window.RedmineCanvasGantt?.issueListPath;
        const projectId = window.RedmineCanvasGantt?.projectId;
        if (!issueListPath && !projectId) return;

        const queryState = toResolvedQueryStateFromStore({
            activeQueryId,
            selectedStatusIds,
            selectedAssigneeIds,
            selectedProjectIds,
            selectedVersionIds,
            sortConfig,
            groupByProject,
            groupByAssignee,
            showSubprojects
        });
        const { params, notices } = buildRedmineIssueQueryParams(queryState);
        notices.forEach((notice) => useUIStore.getState().addNotification(notice, 'warning'));
        const query = params.toString();
        navigateToRedminePath(`${issueListPath ?? `/projects/${projectId}/issues`}${query ? `?${query}` : ''}`);
    };

    const baseColumnOptions = [
        { key: 'id', label: 'ID' },
        { key: 'notification', label: i18n.t('label_notifications') || 'Notifications' },
        { key: 'project', label: i18n.t('field_project') || 'Project' },
        { key: 'tracker', label: i18n.t('field_tracker') || 'Tracker' },
        { key: 'status', label: i18n.t('field_status') || 'Status' },
        { key: 'priority', label: i18n.t('field_priority') || 'Priority' },
        { key: 'assignee', label: i18n.t('field_assigned_to') || 'Assignee' },
        { key: 'author', label: i18n.t('field_author') || 'Author' },
        { key: 'startDate', label: i18n.t('field_start_date') || 'Start Date' },
        { key: 'dueDate', label: i18n.t('field_due_date') || 'Due Date' },
        { key: 'estimatedHours', label: i18n.t('field_estimated_hours') || 'Estimated Time' },
        { key: 'ratioDone', label: i18n.t('field_done_ratio') || 'Progress' },
        { key: 'spentHours', label: i18n.t('field_spent_hours') || 'Spent Time' },
        { key: 'version', label: i18n.t('field_version') || 'Target Version' },
        { key: 'category', label: i18n.t('field_category') || 'Category' },
        { key: 'createdOn', label: i18n.t('field_created_on') || 'Created' },
        { key: 'updatedOn', label: i18n.t('field_updated_on') || 'Updated' }
    ];
    const customFieldColumnOptions = customFields.map((cf) => ({
        key: `cf:${cf.id}`,
        label: cf.name
    }));
    const columnOptions = [...baseColumnOptions, ...customFieldColumnOptions];

    const assignees = React.useMemo(() => {
        const map = new Map<number | null, string>();
        // 未割当を明示的に追加
        map.set(null, i18n.t('label_unassigned') || 'Unassigned');
        allTasks.forEach(task => {
            if (task.assignedToId !== undefined && task.assignedToId !== null) {
                map.set(task.assignedToId, task.assignedToName || (i18n.t('field_assigned_to') || 'Assignee') + ` #${task.assignedToId}`);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => {
            // 未割当(null)は一番上に表示
            if (a.id === null) return -1;
            if (b.id === null) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [allTasks]);

    const toggleAssignee = (id: number | null) => {
        setSelectedAssigneeIds(toggleSelectionValue(selectedAssigneeIds, id));
    };

    const isAllAssigneesSelected = assignees.length > 0 && selectedAssigneeIds.length === assignees.length;

    const toggleAllAssignees = () => {
        setSelectedAssigneeIds(toggleAllSelectionValues(isAllAssigneesSelected, assignees.map(a => a.id)));
    };

    const projects = React.useMemo(() => {
        const map = new Map<string, string>();
        allTasks.forEach(t => {
            if (t.projectId && t.projectName) {
                map.set(t.projectId, t.projectName);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [allTasks]);

    const toggleProject = (id: string) => {
        setSelectedProjectIds(toggleSelectionValue(selectedProjectIds, id));
    };

    const isAllProjectsSelected = projects.length > 0 && selectedProjectIds.length === projects.length;

    const toggleAllProjects = () => {
        setSelectedProjectIds(toggleAllSelectionValues(isAllProjectsSelected, projects.map(p => p.id)));
    };

    const versionsList = React.useMemo(() => {
        const currentProjects = new Set(projects.map(p => p.id));
        return versions.filter(v => currentProjects.has(v.projectId) && v.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
    }, [versions, projects]);

    const toggleVersion = (id: string) => {
        setSelectedVersionIds(toggleSelectionValue(selectedVersionIds, id));
    };

    const allVersionIdsWithNone = ['_none', ...versionsList.map(v => v.id)];
    const isAllVersionsSelected = versionsList.length > 0 && selectedVersionIds.length === allVersionIdsWithNone.length && selectedVersionIds.includes('_none');

    const toggleAllVersions = () => {
        setSelectedVersionIds(toggleAllSelectionValues(isAllVersionsSelected, allVersionIdsWithNone));
    };

    const toggleStatus = (id: number) => {
        setSelectedStatusFromServer(toggleSelectionValue(selectedStatusIds, id));
    };

    const closedStatusIds = React.useMemo(
        () => taskStatuses.filter((status: TaskStatus) => status.isClosed).map((status: TaskStatus) => status.id),
        [taskStatuses]
    );
    const openStatusIds = React.useMemo(
        () => taskStatuses.filter((status: TaskStatus) => !status.isClosed).map((status: TaskStatus) => status.id),
        [taskStatuses]
    );
    const allStatusIds = React.useMemo(() => taskStatuses.map((status: TaskStatus) => status.id), [taskStatuses]);
    const allStatusesState = resolveCheckboxState(allStatusIds, selectedStatusIds);
    const completedStatusesState = resolveCheckboxState(closedStatusIds, selectedStatusIds);
    const incompleteStatusesState = resolveCheckboxState(openStatusIds, selectedStatusIds);

    React.useEffect(() => {
        applyIndeterminateState(selectAllStatusesRef.current, allStatusesState);
    }, [allStatusesState, showStatusMenu]);

    React.useEffect(() => {
        applyIndeterminateState(completedStatusesRef.current, completedStatusesState);
    }, [completedStatusesState, showStatusMenu]);

    React.useEffect(() => {
        applyIndeterminateState(incompleteStatusesRef.current, incompleteStatusesState);
    }, [incompleteStatusesState, showStatusMenu]);

    const toggleAllStatuses = () => {
        setSelectedStatusFromServer(toggleAllSelectionValues(allStatusesState === 'checked', allStatusIds));
    };

    const toggleCompletedStatuses = () => {
        setSelectedStatusFromServer(mergeStatusSelection(selectedStatusIds, closedStatusIds, completedStatusesState !== 'checked'));
    };

    const toggleIncompleteStatuses = () => {
        setSelectedStatusFromServer(mergeStatusSelection(selectedStatusIds, openStatusIds, incompleteStatusesState !== 'checked'));
    };

    const ZOOM_OPTIONS: { level: ZoomLevel; label: string }[] = [
        { level: 0, label: i18n.t('label_month') || 'Month' },
        { level: 1, label: i18n.t('label_week') || 'Week' },
        { level: 2, label: i18n.t('label_day') || 'Day' }
    ];
    const ROW_HEIGHT_OPTIONS = [
        { value: 20, label: i18n.t('label_row_height_xs') || 'XS' },
        { value: 28, label: i18n.t('label_row_height_s') || 'S' },
        { value: 36, label: i18n.t('label_row_height_m') || 'M' },
        { value: 44, label: i18n.t('label_row_height_l') || 'L' },
        { value: 52, label: i18n.t('label_row_height_xl') || 'XL' }
    ];
    const currentRowHeightOption = ROW_HEIGHT_OPTIONS.find(option => option.value === viewport.rowHeight) || ROW_HEIGHT_OPTIONS[2];

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e0e0e0',
            height: '60px',
            boxSizing: 'border-box'
        }}>
            {/* Left: Filter & Options */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                <button
                    data-testid="maximize-left-pane-button"
                    onClick={toggleRightPane}
                    title={isLeftPaneMaximized
                        ? (i18n.t('label_restore_split_view') || "Restore Split View")
                        : (i18n.t('label_maximize_left_pane') || "Maximize List")}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: isLeftPaneMaximized ? '#e8f0fe' : '#fff',
                        color: isLeftPaneMaximized ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                </button>

                <button
                    data-testid="maximize-right-pane-button"
                    onClick={toggleLeftPane}
                    title={isRightPaneMaximized
                        ? (i18n.t('label_restore_split_view') || "Restore Split View")
                        : (i18n.t('label_maximize_right_pane') || "Maximize Chart")}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: isRightPaneMaximized ? '#e8f0fe' : '#fff',
                        color: isRightPaneMaximized ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>

                <button
                    onClick={() => {
                        const newIssuePath = window.RedmineCanvasGantt?.newIssuePath;
                        const projectId = window.RedmineCanvasGantt?.projectId;
                        if (newIssuePath || projectId) {
                            useUIStore.getState().openIssueDialog(buildRedmineUrl(newIssuePath ?? `/projects/${projectId}/issues/new`));
                        }
                    }}
                    title={i18n.t('label_issue_new')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>

                <div ref={filterMenuRef} style={{ position: 'relative' }}>
                <button
                    onClick={() => toggleMenu('filter')}
                    title={i18n.t('label_filter_tasks') || 'Filter Tasks'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: filterText ? '#e8f0fe' : '#fff',
                        color: filterText ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                    </button>

                    {showFilterMenu && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '40px',
                            left: '80px',
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            padding: '12px',
                            zIndex: 20,
                            minWidth: '220px'
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('label_filter_tasks') || 'Filter Tasks'}</div>
                        <input
                            ref={filterInputRef}
                            type="text"
                            placeholder={i18n.t('label_filter_by_subject') || "Filter by subject..."}
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d0d0d0',
                                borderRadius: '4px',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                            autoFocus
                        />
                        {filterText && (
                            <button
                                onClick={() => setFilterText('')}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#d32f2f',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: 13
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        )}
                        <div style={{ marginTop: '8px', fontSize: 11, color: '#999' }}>
                            ESC {i18n.t('label_to_cancel') || 'to cancel'}
                        </div>
                    </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={openRedmineQueryEditor}
                    title={i18n.t('label_edit_query_in_redmine_tooltip') || 'Edit filter conditions in the standard Redmine issue list'}
                    data-testid="edit-query-in-redmine-button"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: activeQueryId !== null ? '#e8f0fe' : '#fff',
                        color: activeQueryId !== null ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 5h18" />
                        <path d="M6 12h12" />
                        <path d="M10 19h4" />
                    </svg>
                </button>

                <div ref={columnMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('column')}
                        title={i18n.t('label_column_plural') || 'Columns'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: visibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') ? '#e8f0fe' : '#fff',
                            color: visibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                            <line x1="15" y1="3" x2="15" y2="21" />
                        </svg>
                        {visibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>

                    {showColumnMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('label_column_plural') || 'Columns'}</div>
                            {columnOptions.map(option => (
                                <label key={option.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444' }}>
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns.includes(option.key)}
                                        onChange={() => toggleColumn(option.key)}
                                    />
                                    {option.label}
                                </label>
                            ))}
                            <button
                                onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {i18n.t('button_reset') || 'Reset'}
                            </button>
                        </div>
                    )}
                </div>

                <div ref={workloadMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('workload')}
                        title={i18n.t('label_workload') || 'Workload'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: workloadPaneVisible ? '#e8f0fe' : '#fff',
                            color: workloadPaneVisible ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        {workloadPaneVisible && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>

                    {showWorkloadMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '220px',
                                maxHeight: '350px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('label_workload') || 'Workload'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: '#333', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={workloadPaneVisible}
                                    onChange={toggleWorkloadPaneVisible}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_show_workload') || 'Show Workload Pane'}</span>
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: workloadPaneVisible ? 1 : 0.5, pointerEvents: workloadPaneVisible ? 'auto' : 'none' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#444' }}>
                                    <span>{i18n.t('label_capacity_threshold') || 'Capacity Threshold (hours/day)'}</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="24"
                                        step="0.5"
                                        value={capacityThreshold}
                                        onChange={(e) => setCapacityThreshold(Number(e.target.value))}
                                        style={{ padding: '4px 8px', width: '80px', border: '1px solid #d0d0d0', borderRadius: '4px' }}
                                    />
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={leafIssuesOnly}
                                        onChange={(e) => setLeafIssuesOnly(e.target.checked)}
                                    />
                                    {i18n.t('label_leaf_issues_only') || 'Leaf Issues Only'}
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={includeClosedIssues}
                                        onChange={(e) => setIncludeClosedIssues(e.target.checked)}
                                    />
                                    {i18n.t('label_include_closed_issues') || 'Include Closed Issues'}
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={todayOnwardOnly}
                                        onChange={(e) => setTodayOnwardOnly(e.target.checked)}
                                    />
                                    {i18n.t('label_today_onward_only') || 'Today Onward Only'}
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div ref={assigneeMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('assignee')}
                        title={i18n.t('field_assigned_to') || 'Assignee Filter'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: (selectedAssigneeIds.length > 0 || groupByAssignee) ? '#e8f0fe' : '#fff',
                            color: (selectedAssigneeIds.length > 0 || groupByAssignee) ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        {(selectedAssigneeIds.length > 0 || groupByAssignee) && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>

                    {showAssigneeMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('field_assigned_to') || 'Assignee'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: '#333', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllAssigneesSelected}
                                    onChange={toggleAllAssignees}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            {assignees.map(assignee => (
                                <label key={assignee.id ?? 'none'} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedAssigneeIds.includes(assignee.id)}
                                        onChange={() => toggleAssignee(assignee.id)}
                                    />
                                    {assignee.name}
                                </label>
                            ))}
                            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={groupByAssignee}
                                        onChange={() => setGroupByAssignee(!groupByAssignee)}
                                    />
                                    {i18n.t('label_group_by_assignee') || 'Group by Assignee'}
                                </label>
                            </div>
                            <button
                                onClick={() => setSelectedAssigneeIds([])}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        </div>
                    )}
                </div>

                <div ref={projectMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('project')}
                        title={i18n.t('label_project_plural') || 'Filter by project'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: (selectedProjectIds.length > 0 || groupByProject) ? '#e8f0fe' : '#fff',
                            color: (selectedProjectIds.length > 0 || groupByProject) ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        {(selectedProjectIds.length > 0 || groupByProject) && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>
                    {showProjectMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('label_project_plural') || 'Projects'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: '#333', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllProjectsSelected}
                                    onChange={toggleAllProjects}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            {projects.map(project => (
                                <label key={project.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedProjectIds.includes(project.id)}
                                        onChange={() => toggleProject(project.id)}
                                    />
                                    {project.name}
                                </label>
                            ))}
                            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={groupByProject}
                                        onChange={() => setGroupByProject(!groupByProject)}
                                    />
                                    {i18n.t('label_group_by_project') || 'Group by project'}
                                </label>
                            </div>
                            <button
                                onClick={() => setSelectedProjectIds([])}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        </div>
                    )}
                </div>

                <div ref={versionMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('version')}
                        title={i18n.t('label_version_plural') || 'Filter by version'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: (selectedVersionIds.length > 0 || showVersions) ? '#e8f0fe' : '#fff',
                            color: (selectedVersionIds.length > 0 || showVersions) ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                        {(selectedVersionIds.length > 0 || showVersions) && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>
                    {showVersionMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('label_version_plural') || 'Versions'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: '#333', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllVersionsSelected}
                                    onChange={toggleAllVersions}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer', fontStyle: 'italic' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedVersionIds.includes('_none')}
                                    onChange={() => toggleVersion('_none')}
                                />
                                {i18n.t('label_none') || '(No version)'}
                            </label>
                            {versionsList.map(version => (
                                <label key={version.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedVersionIds.includes(version.id)}
                                        onChange={() => toggleVersion(version.id)}
                                    />
                                    {version.name}
                                </label>
                            ))}
                            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={showVersions}
                                        onChange={() => setShowVersions(!showVersions)}
                                    />
                                    {i18n.t('label_show_versions') || 'Show version headers'}
                                </label>
                            </div>
                            <button
                                onClick={() => setSelectedVersionIds([])}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        </div>
                    )}
                </div>

                <div ref={statusMenuRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => toggleMenu('status')}
                        title={i18n.t('field_status') || 'Filter by status'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: selectedStatusIds.length > 0 ? '#e8f0fe' : '#fff',
                            color: selectedStatusIds.length > 0 ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        {selectedStatusIds.length > 0 && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                        )}
                    </button>
                    {showStatusMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>{i18n.t('field_status') || 'Status'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: '#333', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    ref={selectAllStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(allStatusesState)}
                                    onChange={toggleAllStatuses}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                <input
                                    ref={completedStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(completedStatusesState)}
                                    onChange={toggleCompletedStatuses}
                                />
                                {i18n.t('label_status_completed') || 'Completed'}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0 8px', color: '#444', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                                <input
                                    ref={incompleteStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(incompleteStatusesState)}
                                    onChange={toggleIncompleteStatuses}
                                />
                                {i18n.t('label_status_incomplete') || 'Incomplete'}
                            </label>
                            {taskStatuses.map(status => (
                                <label key={status.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedStatusIds.includes(status.id)}
                                        onChange={() => toggleStatus(status.id)}
                                    />
                                    {status.name}
                                </label>
                            ))}
                            <button
                                onClick={() => setSelectedStatusFromServer([])}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleProgressLine}
                    title={i18n.t('label_progress_line') || 'Progress Line'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: showProgressLine ? '#e8f0fe' : '#fff',
                        color: showProgressLine ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        position: 'relative'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    {showProgressLine && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                    )}
                </button>


                <div
                    ref={relationSettingsMenuRef}
                    style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
                >
                    <button
                        onClick={() => toggleMenu('relationSettings')}
                        title={i18n.t('label_relation_title') || 'Dependency'}
                        data-testid="relation-settings-menu-button"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: autoApplyDefaultRelation ? '#e8f0fe' : '#fff',
                            color: autoApplyDefaultRelation ? '#1a73e8' : '#333',
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            position: 'relative'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 12h6" />
                            <path d="M14 12h6" />
                            <circle cx="10" cy="12" r="2" />
                            <circle cx="14" cy="12" r="2" />
                        </svg>
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: autoApplyDefaultRelation ? '#1a73e8' : '#a0a0a0', borderRadius: '50%' }} />
                    </button>
                    {showRelationSettingsMenu && (
                        <div
                            data-testid="relation-settings-menu"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 6,
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: 8,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: 12,
                                minWidth: 260,
                                zIndex: 20
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>{i18n.t('label_relation_title') || 'Dependency'}</div>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 8 }}>
                                <span>{i18n.t('label_relation_type') || 'Relation type'}</span>
                                <select
                                    data-testid="relation-default-type-select"
                                    value={draftRelationType}
                                    onChange={(event) => setDraftRelationType(event.target.value as DefaultRelationType)}
                                    style={{ height: 30, borderRadius: 6, border: '1px solid #ddd' }}
                                >
                                    <option value={RelationType.Precedes}>{getRelationTypeLabel(RelationType.Precedes)}</option>
                                    <option value={RelationType.Relates}>{getRelationTypeLabel(RelationType.Relates)}</option>
                                    <option value={RelationType.Blocks}>{getRelationTypeLabel(RelationType.Blocks)}</option>
                                </select>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                                <input
                                    data-testid="relation-auto-calculate-toggle"
                                    type="checkbox"
                                    checked={draftAutoCalculateDelay}
                                    onChange={(event) => setDraftAutoCalculateDelay(event.target.checked)}
                                />
                                <span>{i18n.t('label_relation_auto_calculate_delay') || 'Auto calculate delay'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
                                <input
                                    data-testid="relation-auto-apply-toggle"
                                    type="checkbox"
                                    checked={draftAutoApplyDefaultRelation}
                                    onChange={(event) => setDraftAutoApplyDefaultRelation(event.target.checked)}
                                />
                                <span>{i18n.t('label_relation_auto_apply_default') || 'Auto apply default relation'}</span>
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 10 }}>
                                <span>{i18n.t('label_auto_schedule_move_mode') || 'Auto scheduling move mode'}</span>
                                <select
                                    data-testid="auto-schedule-move-mode-select"
                                    value={draftAutoScheduleMoveMode}
                                    onChange={(event) => setDraftAutoScheduleMoveMode(event.target.value as AutoScheduleMoveModeValue)}
                                    style={{ height: 30, borderRadius: 6, border: '1px solid #ddd' }}
                                >
                                    <option value={AutoScheduleMoveMode.Off}>
                                        {i18n.t('label_auto_schedule_move_mode_off') || 'Off'}
                                    </option>
                                    <option value={AutoScheduleMoveMode.ConstraintPush}>
                                        {i18n.t('label_auto_schedule_move_mode_constraint_push') || 'Constraint push'}
                                    </option>
                                    <option value={AutoScheduleMoveMode.LinkedDownstreamShift}>
                                        {i18n.t('label_auto_schedule_move_mode_linked_shift') || 'Linked downstream shift'}
                                    </option>
                                </select>
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button type="button" onClick={handleResetRelationSettings} data-testid="relation-settings-reset-button" style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>{i18n.t('button_reset') || 'Reset'}</button>
                                <button type="button" onClick={handleSaveRelationSettings} data-testid="relation-settings-save-button" style={{ border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#fff', borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>{i18n.t('button_save') || 'Save'}</button>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => setOrganizeByDependency(!organizeByDependency)}
                    title={i18n.t('label_organize_by_dependency') || 'Organize by dependency'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: organizeByDependency ? '#e8f0fe' : '#fff',
                        color: organizeByDependency ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        position: 'relative'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 6h6v6H5z" />
                        <path d="M13 12h6v6h-6z" />
                        <path d="M11 9l2 2" />
                        <path d="M7 12l6-6" />
                    </svg>
                    {organizeByDependency && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    onClick={togglePointsOrphans}
                    title={i18n.t('label_toggle_points_orphans') || 'Toggle Orphan Date Points'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: showPointsOrphans ? '#e8f0fe' : '#fff',
                        color: showPointsOrphans ? '#1a73e8' : '#333',
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        position: 'relative'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l3 5h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" />
                    </svg>
                    {showPointsOrphans && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                    )}
                </button>
            </div>

            {/* Right: Zoom Level & Today */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        aria-label={i18n.t('label_prev_month') || 'Previous month'}
                        onClick={() => navigateMonth(-1)}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <button
                        aria-label={i18n.t('label_next_month') || 'Next month'}
                        onClick={() => navigateMonth(1)}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </div>

                <button
                    onClick={handleTodayClick}
                    style={{
                        padding: '0 12px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {i18n.t('label_today') || 'Today'}
                </button>


                <div style={{
                    display: 'flex',
                    backgroundColor: '#e9ecef',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '2px',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                }}>
                    {ZOOM_OPTIONS.map((option) => {
                        const isActive = zoomLevel === option.level;
                        return (
                            <button
                                key={option.level}
                                onClick={() => onZoomChange(option.level)}
                                style={{
                                    border: 'none',
                                    background: isActive ? '#fff' : 'transparent',
                                    color: isActive ? '#1a1a1a' : '#6c757d',
                                    padding: '0 12px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 600 : 500,
                                    cursor: 'pointer',
                                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                    transition: 'all 0.2s ease',
                                    outline: 'none',
                                    height: '26px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                <div
                    ref={rowHeightMenuRef}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px', position: 'relative' }}
                >
                    <button
                        type="button"
                        onClick={() => toggleMenu('rowHeight')}
                        title={i18n.t('label_row_height') || 'Row height'}
                        aria-haspopup="menu"
                        aria-expanded={showRowHeightMenu}
                        data-testid="row-height-menu-button"
                        style={{
                            padding: '0 8px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {currentRowHeightOption.label}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                    {showRowHeightMenu && (
                        <div
                            role="menu"
                            data-testid="row-height-menu"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '120px'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>
                                {i18n.t('label_row_height') || 'Row height'}
                            </div>
                            {ROW_HEIGHT_OPTIONS.map(option => {
                                const checked = viewport.rowHeight === option.value;

                                return (
                                    <label
                                        key={option.value}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '4px 0',
                                            color: checked ? '#1a73e8' : '#444',
                                            cursor: 'pointer',
                                            fontWeight: checked ? 600 : 400
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => setRowHeight(option.value)}
                                        />
                                        {option.label}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div ref={exportMenuRef} style={{ position: 'relative' }}>
                    <button
                        type="button"
                        onClick={() => toggleMenu('export')}
                        aria-label={i18n.t('label_export') || 'Export'}
                        title={i18n.t('label_export') || 'Export'}
                        data-testid="export-menu-button"
                        disabled={!rightPaneVisible}
                        style={{
                            padding: '0',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: rightPaneVisible ? '#333' : '#aaa',
                            cursor: rightPaneVisible ? 'pointer' : 'not-allowed',
                            height: '32px',
                            width: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                    {showExportMenu && (
                        <div
                            data-testid="export-menu"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '8px',
                                zIndex: 20,
                                minWidth: '180px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}
                        >
                            <button type="button" onClick={() => void handleExport('exportPng')} style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                {i18n.t('label_export_png') || 'Export PNG'}
                            </button>
                            <button type="button" onClick={() => void handleExport('exportCsv')} style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                {i18n.t('label_export_csv') || 'Export CSV'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleFullScreen}
                    style={{
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: isFullScreen ? '#1a73e8' : '#fff',
                        color: isFullScreen ? '#fff' : '#333',
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {isFullScreen ? (
                            <>
                                <polyline points="4 14 10 14 10 20" />
                                <polyline points="20 10 14 10 14 4" />
                                <line x1="14" y1="10" x2="21" y2="3" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </>
                        ) : (
                            <>
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </>
                        )}
                    </svg>
                </button>

                <button
                    onClick={() => updateViewport({ scrollY: 0 })}
                    title={i18n.t('button_top') || 'Top'}
                    style={{
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5"></line>
                        <polyline points="5 12 12 5 19 12"></polyline>
                        <line x1="5" y1="5" x2="19" y2="5"></line>
                    </svg>
                </button>

                {modifiedTaskIds.size > 0 && !autoSave && (
                    <>
                        <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />
                        <button
                            onClick={() => void saveChanges()}
                            title="Save changes"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                border: '1px solid #1a73e8',
                                backgroundColor: '#1a73e8',
                                color: '#fff',
                                cursor: 'pointer',
                                height: '32px',
                                fontSize: '13px',
                                fontWeight: 600
                            }}
                        >
                            {i18n.t('button_save') || "Save"}
                        </button>
                        <button
                            onClick={() => void discardChanges()}
                            title="Discard changes"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                border: '1px solid #d32f2f',
                                backgroundColor: '#fff',
                                color: '#d32f2f',
                                cursor: 'pointer',
                                height: '32px',
                                fontSize: '13px',
                                fontWeight: 500
                            }}
                        >
                            {i18n.t('button_cancel') || "Cancel"}
                        </button>
                    </>
                )}

                {permissions.baselineEditable && (
                    <>
                        <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />
                        <div ref={baselineSaveMenuRef} style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={() => toggleMenu('baselineSave')}
                                aria-label={i18n.t('label_save_baseline') || 'Save Baseline'}
                                title={i18n.t('label_save_baseline_tooltip') || 'Save a baseline snapshot'}
                                disabled={baselineSaveStatus === 'saving'}
                                data-testid="baseline-save-menu-button"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    padding: '0 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #b45309',
                                    backgroundColor: baselineSaveStatus === 'saving' ? '#fef3c7' : '#fff7ed',
                                    color: '#b45309',
                                    cursor: baselineSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                                    height: '32px',
                                    width: '40px'
                                }}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: baselineSaveStatus === 'saving' ? 0.6 : 1 }}>
                                    <path d="M12 3v12" />
                                    <path d="m7 10 5 5 5-5" />
                                    <path d="M5 21h14" />
                                </svg>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            {showBaselineSaveMenu && baselineSaveStatus !== 'saving' && (
                                <div
                                    data-testid="baseline-save-menu"
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '4px',
                                        background: '#fff',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                        padding: '8px',
                                        zIndex: 20,
                                        minWidth: '220px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveBaseline('filtered')}
                                        style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                                    >
                                        {i18n.t('label_save_baseline_filtered') || 'Save filtered view as baseline'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveBaseline('project')}
                                        style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                                    >
                                        {i18n.t('label_save_baseline_project') || 'Save whole project as baseline'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {permissions.viewable && (
                    <>
                        <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />
                        <button
                            type="button"
                            onClick={() => toggleBaseline()}
                            aria-label={i18n.t('label_show_baseline') || 'Show Baseline'}
                            title={showBaseline
                                ? (i18n.t('label_hide_baseline_tooltip') || 'Hide baseline comparison')
                                : (i18n.t('label_show_baseline_tooltip') || 'Show baseline comparison')}
                            disabled={!hasBaseline}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: showBaseline ? '#e8f0fe' : '#fff',
                                color: hasBaseline ? (showBaseline ? '#1a73e8' : '#333') : '#94a3b8',
                                cursor: hasBaseline ? 'pointer' : 'not-allowed',
                                opacity: hasBaseline ? 1 : 0.75,
                                height: '32px',
                                width: '32px'
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </>
                )}

                <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />
                <button
                    onClick={() => setAutoSave(!autoSave)}
                    title={autoSave ? (i18n.t('tooltip_auto_save_on') || "Auto Save: ON (Changes saved immediately)") : (i18n.t('tooltip_auto_save_off') || "Auto Save: OFF (Use Save button)")}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: autoSave ? '#e8f0fe' : '#fff',
                        color: autoSave ? '#1a73e8' : '#333',
                        cursor: 'pointer'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                </button>

                <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />

                <button
                    onClick={openHelpDialog}
                    title={i18n.t('label_help') || 'Help'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </button>
            </div>
        </div >
    );
};
