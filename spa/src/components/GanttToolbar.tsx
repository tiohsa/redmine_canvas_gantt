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
import { DisplaySettingsControls } from './DisplaySettingsControls';
import { BaselineControls } from './BaselineControls';
import {
    applyIndeterminateState,
    isCheckboxChecked,
    mergeStatusSelection,
    resolveCheckboxState,
    toggleAllSelectionValues,
    toggleSelectionValue,
} from './gantt/toolbarSelection';
import { COLUMN_CATALOG } from './sidebar/sidebarColumnCatalog';
import { ColumnMenuItem } from './sidebar/ColumnMenuItem';
import { useColumnMenuDrag } from './sidebar/useColumnMenuDrag';
import { useSavedQueriesLoader } from './gantt/useSavedQueriesLoader';
import { useToolbarShortcuts } from './gantt/useToolbarShortcuts';
import { fontFamilies, designTokens } from '../styles/designTokens';

interface GanttToolbarProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
    exportRef: React.RefObject<GanttExportHandle | null>;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ zoomLevel, onZoomChange, exportRef }) => {
    const {
        viewport, updateViewport, groupByProject, setGroupByProject, groupByAssignee, setGroupByAssignee, organizeByDependency, setOrganizeByDependency,
        filterText, setFilterText, allTasks, versions, selectedAssigneeIds, setSelectedAssigneeIds,
        selectedProjectIds, setSelectedProjectIds, selectedVersionIds, setSelectedVersionIds, memberProjectsOnly, setMemberProjectsOnly,
        setRowHeight, taskStatuses, selectedStatusIds, setSelectedStatusFromServer, showVersions, setShowVersions,
        modifiedTaskIds, saveChanges, discardChanges, autoSave, setAutoSave, customFields, activeQueryId, sortConfig, showSubprojects, permissions, filterOptions,
        applySavedQuery: applySavedQueryFromStore,
        clearSavedQuery: clearSavedQueryFromStore,
        savedQueries, savedQueriesStatus, savedQueriesError, loadSavedQueries
    } = useTaskStore();
    const {
        showProgressLine,
        toggleProgressLine,
        showTaskTitles,
        toggleTaskTitles,
        showHierarchyLines,
        toggleHierarchyLines,
        showBaseline,
        toggleBaseline,
        visibleColumns,
        columnSettings,
        toggleColumnVisibility,
        resetColumns,
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
        resetRelationPreferences,
        openQueryDialog,
        savedQueriesReloadToken,
        sidebarFontSize,
        setSidebarFontSize
    } = useUIStore();
    const baselineSaveStatus = useBaselineStore(state => state.saveStatus);
    const hasBaseline = useBaselineStore(state => state.hasBaseline);
    const isRightPaneMaximized = !leftPaneVisible && rightPaneVisible;
    const isLeftPaneMaximized = leftPaneVisible && !rightPaneVisible;
    const {
        queryMenuRef,
        columnMenuRef,
        filterMenuRef,
        assigneeMenuRef,
        projectMenuRef,
        versionMenuRef,
        statusMenuRef,
        displaySettingsMenuRef,
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
    const [projectFilterLoading, setProjectFilterLoading] = React.useState(false);
    const [projectFilterError, setProjectFilterError] = React.useState<string | null>(null);
    const [pendingSavedQueryId, setPendingSavedQueryId] = React.useState<number | null>(null);
    const filterInputRef = React.useRef<HTMLInputElement>(null);
    const columnMenuContentRef = React.useRef<HTMLDivElement>(null);
    const selectAllStatusesRef = React.useRef<HTMLInputElement>(null);
    const completedStatusesRef = React.useRef<HTMLInputElement>(null);
    const incompleteStatusesRef = React.useRef<HTMLInputElement>(null);
    const showQueryMenu = isMenuOpen('query');
    const showFilterMenu = isMenuOpen('filter');
    const showColumnMenu = isMenuOpen('column');
    const showAssigneeMenu = isMenuOpen('assignee');
    const showProjectMenu = isMenuOpen('project');
    const showVersionMenu = isMenuOpen('version');
    const showStatusMenu = isMenuOpen('status');
    const showDisplaySettingsMenu = isMenuOpen('displaySettings');
    const showRowHeightMenu = isMenuOpen('rowHeight');
    const showRelationSettingsMenu = isMenuOpen('relationSettings');
    const showExportMenu = isMenuOpen('export');
    const showWorkloadMenu = isMenuOpen('workload');
    const showBaselineSaveMenu = isMenuOpen('baselineSave');
    const displayedActiveQueryId = pendingSavedQueryId ?? activeQueryId;

    useToolbarShortcuts({
        closeMenu,
        filterInputRef,
        openMenuByKey,
        setFilterText,
        showFilterMenu
    });

    useSavedQueriesLoader({
        loadSavedQueries,
        savedQueriesReloadToken,
        savedQueriesStatus,
        showQueryMenu
    });

    React.useEffect(() => {
        if (!showRelationSettingsMenu) return;
        setDraftRelationType(defaultRelationType);
        setDraftAutoCalculateDelay(autoCalculateDelay);
        setDraftAutoApplyDefaultRelation(autoApplyDefaultRelation);
        setDraftAutoScheduleMoveMode(autoScheduleMoveMode);
    }, [autoApplyDefaultRelation, autoCalculateDelay, autoScheduleMoveMode, defaultRelationType, showRelationSettingsMenu]);

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

    const buildQueryEditorPath = ({ includeActiveQueryId = true }: { includeActiveQueryId?: boolean } = {}) => {
        const issueListPath = window.RedmineCanvasGantt?.issueListPath;
        const projectId = window.RedmineCanvasGantt?.projectId;
        if (!issueListPath && !projectId) return null;

        const queryState = toResolvedQueryStateFromStore({
            activeQueryId: includeActiveQueryId ? activeQueryId : null,
            selectedStatusIds,
            selectedAssigneeIds,
            selectedProjectIds,
            selectedVersionIds,
            memberProjectsOnly,
            sortConfig,
            groupByProject,
            groupByAssignee,
            showSubprojects,
            visibleColumns
        });
        const { params, notices } = buildRedmineIssueQueryParams(queryState);
        notices.forEach((notice) => useUIStore.getState().addNotification(notice, 'warning'));
        const query = params.toString();
        return `${issueListPath ?? `/projects/${projectId}/issues`}${query ? `?${query}` : ''}`;
    };

    const openRedmineQueryEditor = () => {
        const path = buildQueryEditorPath({ includeActiveQueryId: true });
        if (!path) return;

        navigateToRedminePath(path);
    };

    const openSavedQueryEditorDialog = () => {
        const path = buildQueryEditorPath({ includeActiveQueryId: false });
        if (!path) return;

        closeMenu('query');
        openQueryDialog(path);
    };

    const applySavedQuery = async (queryId: number | null) => {
        setPendingSavedQueryId(queryId);
        try {
            if (queryId !== null) {
                await applySavedQueryFromStore(queryId);
            } else {
                await clearSavedQueryFromStore();
            }
        } catch (error) {
            useUIStore.getState().addNotification(
                error instanceof Error ? error.message : (i18n.t('label_refresh_failed') || 'Refresh failed'),
                'error'
            );
        } finally {
            setPendingSavedQueryId(null);
        }
    };

    const clearSavedQuery = async () => {
        closeMenu('query');
        setPendingSavedQueryId(null);

        try {
            await clearSavedQueryFromStore();
        } catch (error) {
            useUIStore.getState().addNotification(
                error instanceof Error ? error.message : (i18n.t('label_refresh_failed') || 'Refresh failed'),
                'error'
            );
        }
    };

    const getColumnLabel = (key: string, fallback: string) => {
        const localizedLabel: Record<string, string> = {
            subject: i18n.t('field_subject') || fallback,
            notification: i18n.t('label_notifications') || fallback,
            project: i18n.t('field_project') || fallback,
            tracker: i18n.t('field_tracker') || fallback,
            status: i18n.t('field_status') || fallback,
            priority: i18n.t('field_priority') || fallback,
            assignee: i18n.t('field_assigned_to') || fallback,
            author: i18n.t('field_author') || fallback,
            startDate: i18n.t('field_start_date') || fallback,
            dueDate: i18n.t('field_due_date') || fallback,
            estimatedHours: i18n.t('field_estimated_hours') || fallback,
            ratioDone: i18n.t('field_done_ratio') || fallback,
            spentHours: i18n.t('field_spent_hours') || fallback,
            version: i18n.t('field_version') || fallback,
            category: i18n.t('field_category') || fallback,
            createdOn: i18n.t('field_created_on') || fallback,
            updatedOn: i18n.t('field_updated_on') || fallback
        };
        return localizedLabel[key] ?? fallback;
    };

    const baseColumnOptions = COLUMN_CATALOG.map((column) => ({
        key: column.key,
        label: getColumnLabel(column.key, column.label)
    }));
    const customFieldColumnOptions = customFields.map((cf) => ({
        key: `cf:${cf.id}`,
        label: cf.name
    }));
    const columnOptions = [...baseColumnOptions, ...customFieldColumnOptions];
    const {
        effectiveColumnSettings,
        orderedColumnOptions,
        draggingColumnKey,
        dropBeforeColumnKey,
        handleColumnDragStart,
        handleColumnDragOver,
        handleColumnDrop,
        handleColumnMenuDragOver,
        clearColumnDragState
    } = useColumnMenuDrag({
        columnSettings,
        visibleColumns,
        columnOptions,
        menuContentRef: columnMenuContentRef
    });
    const effectiveVisibleColumns = effectiveColumnSettings.filter((entry) => entry.visible).map((entry) => entry.key);

    const fallbackProjects = React.useMemo(() => {
        const map = new Map<string, string>();
        allTasks.forEach((task) => {
            if (task.projectId && task.projectName) {
                map.set(task.projectId, task.projectName);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [allTasks]);

    const fallbackAssignees = React.useMemo(() => {
        const map = new Map<number | null, { name: string | null; projectIds: Set<string> }>();
        allTasks.forEach((task) => {
            const assigneeId = task.assignedToId ?? null;
            const entry = map.get(assigneeId) ?? {
                name: assigneeId === null ? null : (task.assignedToName ?? null),
                projectIds: new Set<string>()
            };
            if (assigneeId !== null && entry.name === null && task.assignedToName) {
                entry.name = task.assignedToName;
            }
            if (task.projectId) {
                entry.projectIds.add(task.projectId);
            }
            map.set(assigneeId, entry);
        });
        return Array.from(map.entries()).map(([id, entry]) => ({
            id,
            name: entry.name,
            projectIds: Array.from(entry.projectIds)
        }));
    }, [allTasks]);

    const projectOptions = projectFilterLoading ? [] : filterOptions.projects;
    const assigneeOptions = filterOptions.assignees.length > 0 ? filterOptions.assignees : fallbackAssignees;
    const projectScopeOptions = filterOptions.projects.length > 0 ? filterOptions.projects : fallbackProjects;

    const projects = React.useMemo(() => (
        [...projectOptions].sort((a, b) => a.name.localeCompare(b.name))
    ), [projectOptions]);

    const scopedProjectIds = React.useMemo(() => (
        new Set(selectedProjectIds.length > 0 ? selectedProjectIds : projectScopeOptions.map((project) => project.id))
    ), [projectScopeOptions, selectedProjectIds]);

    const assignees = React.useMemo(() => {
        const selectedAssigneeIdSet = new Set(selectedAssigneeIds);
        return assigneeOptions
            .filter((assignee) => (
                selectedAssigneeIdSet.has(assignee.id) ||
                assignee.projectIds.some((projectId) => scopedProjectIds.has(projectId))
            ))
            .map((assignee) => ({
                id: assignee.id,
                name: assignee.id === null
                    ? (i18n.t('label_unassigned') || 'Unassigned')
                    : (assignee.name || `${i18n.t('field_assigned_to') || 'Assignee'} #${assignee.id}`)
            }))
            .sort((a, b) => {
                if (a.id === null) return -1;
                if (b.id === null) return 1;
                return a.name.localeCompare(b.name);
            });
    }, [assigneeOptions, scopedProjectIds, selectedAssigneeIds]);

    const toggleAssignee = (id: number | null) => {
        setSelectedAssigneeIds(toggleSelectionValue(selectedAssigneeIds, id));
    };

    const isAllAssigneesSelected = assignees.length > 0 && assignees.every((assignee) => selectedAssigneeIds.includes(assignee.id));

    const toggleAllAssignees = () => {
        setSelectedAssigneeIds(toggleAllSelectionValues(isAllAssigneesSelected, assignees.map(a => a.id)));
    };

    const toggleProject = (id: string) => {
        setSelectedProjectIds(toggleSelectionValue(selectedProjectIds, id));
    };

    const isAllProjectsSelected = projects.length > 0 && projects.every((project) => selectedProjectIds.includes(project.id));

    const toggleAllProjects = () => {
        setSelectedProjectIds(toggleAllSelectionValues(isAllProjectsSelected, projects.map(p => p.id)));
    };

    const handleMemberProjectsOnlyToggle = async (enabled: boolean) => {
        setProjectFilterError(null);
        setProjectFilterLoading(true);
        try {
            await setMemberProjectsOnly(enabled);
        } catch (error) {
            setProjectFilterError(error instanceof Error
                ? error.message
                : (i18n.t('label_project_candidates_load_failed') || 'Failed to load project candidates'));
        } finally {
            setProjectFilterLoading(false);
        }
    };

    const projectOptionIds = React.useMemo(() => new Set(projects.map((project) => project.id)), [projects]);
    const hasSelectedProjectsOutsideCandidates = memberProjectsOnly
        && selectedProjectIds.some((selectedProjectId) => !projectOptionIds.has(selectedProjectId));

    const versionsList = React.useMemo(() => (
        versions
            .filter((version) => (
                (version.status !== 'closed' && scopedProjectIds.has(version.projectId)) ||
                selectedVersionIds.includes(version.id)
            ))
            .sort((a, b) => a.name.localeCompare(b.name))
    ), [scopedProjectIds, selectedVersionIds, versions]);

    const toggleVersion = (id: string) => {
        setSelectedVersionIds(toggleSelectionValue(selectedVersionIds, id));
    };

    const allVersionIdsWithNone = ['_none', ...versionsList.map(v => v.id)];
    const isAllVersionsSelected = allVersionIdsWithNone.length > 1 && allVersionIdsWithNone.every((id) => selectedVersionIds.includes(id));

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
    const FONT_SIZE_OPTIONS = [
        { value: 11, label: i18n.t('label_font_size_small') || 'Small' },
        { value: 13, label: i18n.t('label_font_size_medium') || 'Medium' },
        { value: 15, label: i18n.t('label_font_size_large') || 'Large' }
    ];
    const currentRowHeightOption = ROW_HEIGHT_OPTIONS.find(option => option.value === viewport.rowHeight) || ROW_HEIGHT_OPTIONS[2];
    const rowHeightButtonLabel = `${i18n.t('label_row_height') || 'Row height'}: ${currentRowHeightOption.label}`;
    const zoomWheelHint = i18n.t('help_desc_zoom_wheel') || 'Hold Ctrl and use the mouse wheel to change the date display width.';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            backgroundColor: designTokens.controlBg,
            borderBottom: `1px solid ${designTokens.borderSubtle}`,
            height: '64px',
            boxSizing: 'border-box',
            fontFamily: fontFamilies.ui,
            fontSize: '13px',
            lineHeight: 1.5
        }}>
            {/* Left: Filter & Options */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                <button
                    data-testid="maximize-left-pane-button"
                    onClick={toggleRightPane}
                    title={isLeftPaneMaximized
                        ? (i18n.t('label_restore_split_view') || "Restore Split View")
                        : (i18n.t('label_maximize_left_pane') || "Maximize List")}
                    className={`minimax-pill-nav ${isLeftPaneMaximized ? 'active' : ''}`}
                    style={{ width: '32px', height: '32px', position: 'relative' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                    {isLeftPaneMaximized && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    data-testid="maximize-right-pane-button"
                    onClick={toggleLeftPane}
                    title={isRightPaneMaximized
                        ? (i18n.t('label_restore_split_view') || "Restore Split View")
                        : (i18n.t('label_maximize_right_pane') || "Maximize Chart")}
                    className={`minimax-pill-nav ${isRightPaneMaximized ? 'active' : ''}`}
                    style={{ width: '32px', height: '32px', position: 'relative' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                    {isRightPaneMaximized && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
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
                    className="minimax-pill-nav"
                    style={{ width: '32px', height: '32px' }}
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
                    className={`minimax-pill-nav ${filterText ? 'active' : ''}`}
                    style={{ width: '32px', height: '32px' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        {!!filterText && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>

                    {showFilterMenu && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '40px',
                            left: '80px',
                            background: designTokens.controlBg,
                            border: `1px solid ${designTokens.controlBorder}`,
                            borderRadius: '8px',
                            boxShadow: designTokens.menuShadow,
                            padding: '12px',
                            zIndex: 20,
                            minWidth: '220px'
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('label_filter_tasks') || 'Filter Tasks'}</div>
                        <input
                            ref={filterInputRef}
                            type="text"
                            placeholder={i18n.t('label_filter_by_subject') || "Filter by subject..."}
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: `1px solid ${designTokens.controlBorderStrong}`,
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
                                    color: designTokens.controlErrorFg,
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: 13
                                }}
                            >
                                {i18n.t('label_clear_filter') || 'Clear'}
                            </button>
                        )}
                        <div style={{ marginTop: '8px', fontSize: 11, color: designTokens.textMuted }}>
                            ESC {i18n.t('label_to_cancel') || 'to cancel'}
                        </div>
                    </div>
                    )}
                </div>

                <div ref={queryMenuRef} style={{ position: 'relative' }}>
                    <button
                        type="button"
                        onClick={() => toggleMenu('query')}
                        title={i18n.t('label_saved_queries') || 'Saved queries'}
                        data-testid="query-menu-button"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0',
                                borderRadius: '6px',
                                border: `1px solid ${designTokens.controlBorder}`,
                                backgroundColor: displayedActiveQueryId !== null ? designTokens.controlActiveBg : designTokens.controlBg,
                                color: displayedActiveQueryId !== null ? designTokens.controlActiveFg : designTokens.controlFg,
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px',
                                position: 'relative'
                            }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 6h16" />
                            <path d="M4 12h16" />
                            <path d="M4 18h10" />
                        </svg>
                        {displayedActiveQueryId !== null && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>

                    {showQueryMenu && (
                        <div
                            data-testid="query-menu"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '240px',
                                maxHeight: '320px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>
                                {i18n.t('label_saved_queries') || 'Saved queries'}
                            </div>

                            {savedQueriesStatus === 'loading' && (
                                <div style={{ color: designTokens.controlLoadingFg, fontSize: '13px' }}>
                                    {i18n.t('label_loading_saved_queries') || 'Loading saved queries...'}
                                </div>
                            )}

                            {savedQueriesStatus === 'error' && (
                                <div style={{ color: designTokens.controlErrorFg, fontSize: '13px' }}>
                                    {savedQueriesError || (i18n.t('label_saved_query_load_failed') || 'Failed to load saved queries')}
                                </div>
                            )}

                            {savedQueriesStatus === 'ready' && savedQueries.length === 0 && (
                                <div style={{ color: designTokens.controlLoadingFg, fontSize: '13px' }}>
                                    {i18n.t('label_no_saved_queries') || 'No saved queries'}
                                </div>
                            )}

                            <div role="radiogroup" aria-label={i18n.t('label_saved_queries') || 'Saved queries'}>
                                {savedQueries.map((query) => (
                                <label
                                    key={query.id}
                                    data-testid={`saved-query-item-${query.id}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        width: '100%',
                                        gap: '10px',
                                        background: query.id === displayedActiveQueryId ? designTokens.controlActiveBg : 'transparent',
                                        color: query.id === displayedActiveQueryId ? designTokens.controlActiveFg : designTokens.controlFg,
                                        cursor: 'pointer',
                                        borderRadius: '6px',
                                        padding: '8px'
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="saved-query-selection"
                                        checked={query.id === displayedActiveQueryId}
                                        onChange={() => {
                                            void applySavedQuery(query.id);
                                        }}
                                        aria-label={query.name}
                                        style={{
                                            margin: 0,
                                            accentColor: designTokens.controlActiveFg,
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <span style={{ flex: 1 }}>{query.name}</span>
                                </label>
                            ))}
                            </div>

                            <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {displayedActiveQueryId !== null && (
                                    <button
                                        type="button"
                                        data-testid="clear-saved-query-button"
                                        onClick={() => {
                                            void clearSavedQuery();
                                        }}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: designTokens.controlActiveFg,
                                            cursor: 'pointer',
                                            padding: '4px 0',
                                            textAlign: 'left'
                                        }}
                                    >
                                        {i18n.t('label_clear_saved_query') || 'Clear saved query'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    data-testid="save-custom-query-button"
                                    onClick={openSavedQueryEditorDialog}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: designTokens.controlActiveFg,
                                            cursor: 'pointer',
                                            padding: '4px 0',
                                            textAlign: 'left'
                                        }}
                                    >
                                    {i18n.t('label_save_custom_query') || 'Save custom query'}
                                </button>
                                <button
                                    type="button"
                                    onClick={openRedmineQueryEditor}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: designTokens.controlActiveFg,
                                            cursor: 'pointer',
                                            padding: '4px 0',
                                            textAlign: 'left'
                                        }}
                                    >
                                    {i18n.t('label_edit_query_in_redmine') || 'Edit Query in Redmine'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: effectiveVisibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: effectiveVisibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') ? designTokens.controlActiveFg : designTokens.controlFg,
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
                        {effectiveVisibleColumns.join(',') !== DEFAULT_COLUMNS.join(',') && (
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>

                    {showColumnMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                            onDragOver={handleColumnMenuDragOver}
                            ref={columnMenuContentRef}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('label_column_plural') || 'Columns'}</div>
                            {orderedColumnOptions.map(option => {
                                const setting = effectiveColumnSettings.find((entry) => entry.key === option.key);
                                if (!setting) return null;

                                return (
                                    <ColumnMenuItem
                                        key={option.key}
                                        columnKey={option.key}
                                        label={option.label}
                                        visible={setting.visible}
                                        draggable={true}
                                        isDragging={draggingColumnKey === option.key}
                                        isDropBefore={dropBeforeColumnKey === option.key}
                                        isPinned={false}
                                        onToggle={toggleColumnVisibility}
                                        onDragStart={handleColumnDragStart}
                                        onDragOver={handleColumnDragOver}
                                        onDrop={handleColumnDrop}
                                        onDragEnd={clearColumnDragState}
                                    />
                                );
                            })}
                            <button
                                onClick={() => resetColumns()}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: designTokens.controlActiveFg,
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
                                border: `1px solid ${designTokens.controlBorder}`,
                                backgroundColor: workloadPaneVisible ? designTokens.controlActiveBg : designTokens.controlBg,
                                color: workloadPaneVisible ? designTokens.controlActiveFg : designTokens.controlFg,
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
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>

                    {showWorkloadMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '220px',
                                maxHeight: '350px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('label_workload') || 'Workload'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: designTokens.controlFg, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={workloadPaneVisible}
                                    onChange={toggleWorkloadPaneVisible}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_show_workload') || 'Show Workload Pane'}</span>
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: workloadPaneVisible ? 1 : 0.5, pointerEvents: workloadPaneVisible ? 'auto' : 'none' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: designTokens.textSecondary }}>
                                    <span>{i18n.t('label_capacity_threshold') || 'Capacity Threshold (hours/day)'}</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="24"
                                        step="0.5"
                                        value={capacityThreshold}
                                        onChange={(e) => setCapacityThreshold(Number(e.target.value))}
                                        style={{ padding: '4px 8px', width: '80px', border: `1px solid ${designTokens.controlBorderStrong}`, borderRadius: '4px' }}
                                    />
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={leafIssuesOnly}
                                        onChange={(e) => setLeafIssuesOnly(e.target.checked)}
                                    />
                                    {i18n.t('label_leaf_issues_only') || 'Leaf Issues Only'}
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={includeClosedIssues}
                                        onChange={(e) => setIncludeClosedIssues(e.target.checked)}
                                    />
                                    {i18n.t('label_include_closed_issues') || 'Include Closed Issues'}
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
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
                                border: `1px solid ${designTokens.controlBorder}`,
                                backgroundColor: (selectedAssigneeIds.length > 0 || groupByAssignee) ? designTokens.controlActiveBg : designTokens.controlBg,
                                color: (selectedAssigneeIds.length > 0 || groupByAssignee) ? designTokens.controlActiveFg : designTokens.controlFg,
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
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>

                    {showAssigneeMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('field_assigned_to') || 'Assignee'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: designTokens.controlFg, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllAssigneesSelected}
                                    onChange={toggleAllAssignees}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            {assignees.map(assignee => (
                                <label key={assignee.id ?? 'none'} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedAssigneeIds.includes(assignee.id)}
                                        onChange={() => toggleAssignee(assignee.id)}
                                    />
                                    {assignee.name}
                                </label>
                            ))}
                            <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
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
                                    color: designTokens.controlActiveFg,
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: (selectedProjectIds.length > 0 || groupByProject) ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: (selectedProjectIds.length > 0 || groupByProject) ? designTokens.controlActiveFg : designTokens.controlFg,
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
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>
                    {showProjectMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('label_project_plural') || 'Projects'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: designTokens.controlFg, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllProjectsSelected}
                                    onChange={toggleAllProjects}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0 8px', color: designTokens.textSecondary, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={memberProjectsOnly}
                                    onChange={(event) => { void handleMemberProjectsOnlyToggle(event.target.checked); }}
                                    aria-label={i18n.t('label_member_projects_only') || 'Show only my member projects'}
                                />
                                <span>{i18n.t('label_member_projects_only') || 'Show only my member projects'}</span>
                            </label>
                            {projectFilterLoading && (
                                <div style={{ fontSize: '12px', color: designTokens.textMuted, marginBottom: '8px' }}>
                                    {i18n.t('label_loading') || 'Loading...'}
                                </div>
                            )}
                            {projectFilterError && (
                                <div style={{ fontSize: '12px', color: designTokens.errorFg, marginBottom: '8px' }}>
                                    {projectFilterError}
                                </div>
                            )}
                            {hasSelectedProjectsOutsideCandidates && (
                                <div style={{ fontSize: '12px', color: designTokens.textMuted, marginBottom: '8px' }}>
                                    {i18n.t('label_selected_projects_outside_candidates') || 'Some selected projects are hidden from the current candidate list.'}
                                </div>
                            )}
                            {projects.map(project => (
                                <label key={project.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedProjectIds.includes(project.id)}
                                        onChange={() => toggleProject(project.id)}
                                    />
                                    {project.name}
                                </label>
                            ))}
                            <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
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
                                    color: designTokens.controlActiveFg,
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: (selectedVersionIds.length > 0 || showVersions) ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: (selectedVersionIds.length > 0 || showVersions) ? designTokens.controlActiveFg : designTokens.controlFg,
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
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>
                    {showVersionMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('label_version_plural') || 'Versions'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: designTokens.controlFg, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllVersionsSelected}
                                    onChange={toggleAllVersions}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer', fontStyle: 'italic' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedVersionIds.includes('_none')}
                                    onChange={() => toggleVersion('_none')}
                                />
                                {i18n.t('label_none') || '(No version)'}
                            </label>
                            {versionsList.map(version => (
                                <label key={version.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedVersionIds.includes(version.id)}
                                        onChange={() => toggleVersion(version.id)}
                                    />
                                    {version.name}
                                </label>
                            ))}
                            <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: '8px', paddingTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
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
                                    color: designTokens.controlActiveFg,
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: selectedStatusIds.length > 0 ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: selectedStatusIds.length > 0 ? designTokens.controlActiveFg : designTokens.controlFg,
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
                            <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                        )}
                    </button>
                    {showStatusMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>{i18n.t('field_status') || 'Status'}</div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', color: designTokens.controlFg, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    ref={selectAllStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(allStatusesState)}
                                    onChange={toggleAllStatuses}
                                />
                                <span style={{ fontWeight: 500 }}>{i18n.t('label_all_select') || 'Select All'}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
                                <input
                                    ref={completedStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(completedStatusesState)}
                                    onChange={toggleCompletedStatuses}
                                />
                                {i18n.t('label_status_completed') || 'Completed'}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0 8px', color: designTokens.textSecondary, cursor: 'pointer', borderBottom: `1px solid ${designTokens.borderSubtle}`, marginBottom: '8px' }}>
                                <input
                                    ref={incompleteStatusesRef}
                                    type="checkbox"
                                    checked={isCheckboxChecked(incompleteStatusesState)}
                                    onChange={toggleIncompleteStatuses}
                                />
                                {i18n.t('label_status_incomplete') || 'Incomplete'}
                            </label>
                            {taskStatuses.map(status => (
                                <label key={status.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: designTokens.textSecondary, cursor: 'pointer' }}>
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
                                    color: designTokens.controlActiveFg,
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
                        border: `1px solid ${designTokens.controlBorder}`,
                        backgroundColor: showProgressLine ? designTokens.controlActiveBg : designTokens.controlBg,
                        color: showProgressLine ? designTokens.controlActiveFg : designTokens.controlFg,
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
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: autoApplyDefaultRelation ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: autoApplyDefaultRelation ? designTokens.controlActiveFg : designTokens.controlFg,
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
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: autoApplyDefaultRelation ? designTokens.controlActiveFg : designTokens.disabledFg, borderRadius: '50%' }} />
                    </button>
                    {showRelationSettingsMenu && (
                        <div
                            data-testid="relation-settings-menu"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 6,
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: 8,
                                boxShadow: designTokens.menuShadow,
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
                                    style={{ height: 30, borderRadius: 6, border: `1px solid ${designTokens.controlBorderStrong}` }}
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
                                    style={{ height: 30, borderRadius: 6, border: `1px solid ${designTokens.controlBorderStrong}` }}
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
                                <button type="button" onClick={handleResetRelationSettings} data-testid="relation-settings-reset-button" style={{ border: `1px solid ${designTokens.controlBorderStrong}`, background: designTokens.controlBg, borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>{i18n.t('button_reset') || 'Reset'}</button>
                                <button type="button" onClick={handleSaveRelationSettings} data-testid="relation-settings-save-button" style={{ border: `1px solid ${designTokens.brandPrimaryStrong}`, background: designTokens.brandPrimaryStrong, color: designTokens.controlBg, borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>{i18n.t('button_save') || 'Save'}</button>
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
                        border: `1px solid ${designTokens.controlBorder}`,
                        backgroundColor: organizeByDependency ? designTokens.controlActiveBg : designTokens.controlBg,
                        color: organizeByDependency ? designTokens.controlActiveFg : designTokens.controlFg,
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
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
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
                        border: `1px solid ${designTokens.controlBorder}`,
                        backgroundColor: showPointsOrphans ? designTokens.controlActiveBg : designTokens.controlBg,
                        color: showPointsOrphans ? designTokens.controlActiveFg : designTokens.controlFg,
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
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    data-testid="task-titles-toggle-button"
                    onClick={toggleTaskTitles}
                    title={i18n.t('label_toggle_task_titles') || 'Toggle Task Titles'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                        border: `1px solid ${designTokens.controlBorder}`,
                        backgroundColor: showTaskTitles ? designTokens.controlActiveBg : designTokens.controlBg,
                        color: showTaskTitles ? designTokens.controlActiveFg : designTokens.controlFg,
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        position: 'relative'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                        <circle cx="12" cy="12" r="2.5" />
                        <line x1="4" y1="20" x2="14" y2="20" />
                    </svg>
                    {showTaskTitles && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    data-testid="hierarchy-lines-toggle-button"
                    onClick={toggleHierarchyLines}
                    title={i18n.t('label_toggle_hierarchy_lines') || 'Toggle Hierarchy Lines'}
                    aria-label={i18n.t('label_toggle_hierarchy_lines') || 'Toggle Hierarchy Lines'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                        border: `1px solid ${designTokens.controlBorder}`,
                        backgroundColor: showHierarchyLines ? designTokens.controlActiveBg : designTokens.controlBg,
                        color: showHierarchyLines ? designTokens.controlActiveFg : designTokens.controlFg,
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        position: 'relative'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 5v14" />
                        <path d="M7 5h6" />
                        <path d="M7 12h6" />
                        <path d="M7 19h6" />
                        <path d="M13 5v14" />
                        <path d="M13 12h4" />
                    </svg>
                    {showHierarchyLines && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
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
                    title={i18n.t('label_today') || 'Today'}
                    aria-label={i18n.t('label_today') || 'Today'}
                        style={{
                            padding: '0',
                            borderRadius: '6px',
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
                            cursor: 'pointer',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        width: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                </button>


                <div style={{
                    display: 'flex',
                    backgroundColor: designTokens.surfaceMuted,
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '2px',
                    boxShadow: designTokens.controlInsetShadow
                }}>
                    {ZOOM_OPTIONS.map((option) => {
                        const isActive = zoomLevel === option.level;
                        return (
                            <button
                                key={option.level}
                                onClick={() => onZoomChange(option.level)}
                                style={{
                                    border: 'none',
                                    background: isActive ? designTokens.controlBg : 'transparent',
                                    color: isActive ? designTokens.textPrimary : designTokens.textMuted,
                                    padding: '0 12px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 600 : 500,
                                    cursor: 'pointer',
                                    boxShadow: isActive ? designTokens.controlActiveShadow : 'none',
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

                <DisplaySettingsControls
                    displaySettingsMenuRef={displaySettingsMenuRef}
                    showDisplaySettingsMenu={showDisplaySettingsMenu}
                    onToggleDisplaySettingsMenu={() => toggleMenu('displaySettings')}
                    onCloseDisplaySettingsMenu={() => closeMenu('displaySettings')}
                />

                <div
                    ref={rowHeightMenuRef}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px', position: 'relative' }}
                >
                    <button
                        type="button"
                        onClick={() => toggleMenu('rowHeight')}
                        title={rowHeightButtonLabel}
                        aria-label={rowHeightButtonLabel}
                        aria-haspopup="menu"
                        aria-expanded={showRowHeightMenu}
                        data-testid="row-height-menu-button"
                            style={{
                                padding: '0',
                                borderRadius: '6px',
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="8 9 12 5 16 9" />
                            <polyline points="8 15 12 19 16 15" />
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
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '220px'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: designTokens.controlFg }}>
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
                                            color: checked ? designTokens.controlActiveFg : designTokens.textSecondary,
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

                            <div style={{ fontWeight: 600, marginTop: '12px', marginBottom: '8px', color: designTokens.controlFg, borderTop: `1px solid ${designTokens.borderSubtle}`, paddingTop: '12px' }}>
                                {i18n.t('label_font_size') || 'Font size'}
                            </div>
                            {FONT_SIZE_OPTIONS.map(option => {
                                const checked = sidebarFontSize === option.value;

                                return (
                                    <label
                                        key={option.value}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '4px 0',
                                            color: checked ? designTokens.controlActiveFg : designTokens.textSecondary,
                                            cursor: 'pointer',
                                            fontWeight: checked ? 600 : 400
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => setSidebarFontSize(option.value)}
                                        />
                                        {option.label}
                                    </label>
                                );
                            })}

                            <div
                                data-testid="row-height-zoom-hint"
                                style={{
                                    borderTop: `1px solid ${designTokens.borderSubtle}`,
                                    marginTop: '12px',
                                    paddingTop: '12px',
                                    fontSize: '11px',
                                    lineHeight: 1.5,
                                    color: designTokens.controlLoadingFg
                                }}
                            >
                                {zoomWheelHint}
                            </div>
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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: rightPaneVisible ? designTokens.controlFg : designTokens.disabledFg,
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
                                background: designTokens.controlBg,
                                border: `1px solid ${designTokens.controlBorder}`,
                                borderRadius: '8px',
                                boxShadow: designTokens.menuShadow,
                                padding: '8px',
                                zIndex: 20,
                                minWidth: '180px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}
                        >
                            <button type="button" onClick={() => void handleExport('exportPng')} style={{ border: 'none', background: designTokens.controlBg, textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                {i18n.t('label_export_png') || 'Export PNG'}
                            </button>
                            <button type="button" onClick={() => void handleExport('exportCsv')} style={{ border: 'none', background: designTokens.controlBg, textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>
                                {i18n.t('label_export_csv') || 'Export CSV'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleFullScreen}
                    title={i18n.t('help_label_fullscreen') || "Full Screen"}
                        style={{
                            padding: '0',
                            borderRadius: '6px',
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: isFullScreen ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: isFullScreen ? designTokens.controlActiveFg : designTokens.controlFg,
                            cursor: 'pointer',
                            height: '32px',
                            width: '32px',
                            display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
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
                    {isFullScreen && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    onClick={() => updateViewport({ scrollY: 0 })}
                    title={i18n.t('button_top') || 'Top'}
                        style={{
                            padding: '0',
                            borderRadius: '6px',
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
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
                        <button
                            onClick={() => void saveChanges()}
                            title="Save changes"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                border: `1px solid ${designTokens.controlActiveFg}`,
                                backgroundColor: designTokens.controlActiveFg,
                                color: designTokens.controlBg,
                                cursor: 'pointer',
                                height: '32px',
                                fontSize: '10px',
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
                                border: `1px solid ${designTokens.controlErrorFg}`,
                                backgroundColor: designTokens.controlBg,
                                color: designTokens.controlErrorFg,
                                cursor: 'pointer',
                                height: '32px',
                                fontSize: '10px',
                                fontWeight: 500
                            }}
                        >
                            {i18n.t('button_cancel') || "Cancel"}
                        </button>
                    </>
                )}

                <BaselineControls
                    baselineSaveStatus={baselineSaveStatus}
                    hasBaseline={hasBaseline}
                    showBaseline={showBaseline}
                    baselineEditable={permissions.baselineEditable}
                    baselineSaveMenuRef={baselineSaveMenuRef}
                    showBaselineSaveMenu={showBaselineSaveMenu}
                    onToggleSaveMenu={() => toggleMenu('baselineSave')}
                    onSaveBaseline={(scope) => void handleSaveBaseline(scope)}
                    onToggleBaseline={() => toggleBaseline()}
                />

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
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: autoSave ? designTokens.controlActiveBg : designTokens.controlBg,
                            color: autoSave ? designTokens.controlActiveFg : designTokens.controlFg,
                            cursor: 'pointer',
                            position: 'relative'
                        }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {autoSave && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }} />
                    )}
                </button>

                <button
                    onClick={openHelpDialog}
                    title={i18n.t('label_help') || 'Help'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            borderRadius: '6px',
                            border: `1px solid ${designTokens.controlBorder}`,
                            backgroundColor: designTokens.controlBg,
                            color: designTokens.controlFg,
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
