import React from 'react';

import type { ZoomLevel } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore, DEFAULT_COLUMNS } from '../stores/UIStore';
import { i18n } from '../utils/i18n';

interface GanttToolbarProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ zoomLevel, onZoomChange }) => {
    const {
        viewport, updateViewport, groupByProject, setGroupByProject, organizeByDependency, setOrganizeByDependency,
        filterText, setFilterText, allTasks, versions, selectedAssigneeIds, setSelectedAssigneeIds,
        selectedProjectIds, setSelectedProjectIds, selectedVersionIds, setSelectedVersionIds,
        showSubprojects, setShowSubprojects
    } = useTaskStore();
    const {
        showProgressLine,
        toggleProgressLine,
        showVersions,
        toggleVersions,
        visibleColumns,
        setVisibleColumns,
        toggleLeftPane,
        isFullScreen,
        toggleFullScreen
    } = useUIStore();
    const [showColumnMenu, setShowColumnMenu] = React.useState(false);
    const [showFilterMenu, setShowFilterMenu] = React.useState(false);
    const [showAssigneeMenu, setShowAssigneeMenu] = React.useState(false);
    const [showProjectMenu, setShowProjectMenu] = React.useState(false);
    const [showVersionMenu, setShowVersionMenu] = React.useState(false);

    const filterMenuRef = React.useRef<HTMLDivElement>(null);
    const columnMenuRef = React.useRef<HTMLDivElement>(null);
    const assigneeMenuRef = React.useRef<HTMLDivElement>(null);
    const projectMenuRef = React.useRef<HTMLDivElement>(null);
    const versionMenuRef = React.useRef<HTMLDivElement>(null);

    // Click outside handler to close all dropdowns
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (showFilterMenu && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
                setShowFilterMenu(false);
            }
            if (showColumnMenu && columnMenuRef.current && !columnMenuRef.current.contains(target)) {
                setShowColumnMenu(false);
            }
            if (showAssigneeMenu && assigneeMenuRef.current && !assigneeMenuRef.current.contains(target)) {
                setShowAssigneeMenu(false);
            }
            if (showProjectMenu && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
                setShowProjectMenu(false);
            }
            if (showVersionMenu && versionMenuRef.current && !versionMenuRef.current.contains(target)) {
                setShowVersionMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showFilterMenu, showColumnMenu, showAssigneeMenu, showProjectMenu, showVersionMenu]);

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

    const columnOptions = [
        { key: 'id', label: 'ID' },
        { key: 'status', label: i18n.t('field_status') || 'Status' },
        { key: 'assignee', label: i18n.t('field_assigned_to') || 'Assignee' },
        { key: 'startDate', label: i18n.t('field_start_date') || 'Start Date' },
        { key: 'dueDate', label: i18n.t('field_due_date') || 'Due Date' },
        { key: 'ratioDone', label: i18n.t('field_done_ratio') || 'Progress' }
    ];

    const assignees = React.useMemo(() => {
        const map = new Map<number | null, string>();
        // 未割当を明示的に追加
        map.set(null, '未割当');
        allTasks.forEach(task => {
            if (task.assignedToId !== undefined && task.assignedToId !== null) {
                map.set(task.assignedToId, task.assignedToName || `担当者 #${task.assignedToId}`);
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
        const next = selectedAssigneeIds.includes(id)
            ? selectedAssigneeIds.filter(i => i !== id)
            : [...selectedAssigneeIds, id];
        setSelectedAssigneeIds(next);
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
        const next = selectedProjectIds.includes(id)
            ? selectedProjectIds.filter(i => i !== id)
            : [...selectedProjectIds, id];
        setSelectedProjectIds(next);
    };

    const versionsList = React.useMemo(() => {
        const currentProjects = new Set(projects.map(p => p.id));
        return versions.filter(v => currentProjects.has(v.projectId)).sort((a, b) => a.name.localeCompare(b.name));
    }, [versions, projects]);

    const toggleVersion = (id: string) => {
        const next = selectedVersionIds.includes(id)
            ? selectedVersionIds.filter(i => i !== id)
            : [...selectedVersionIds, id];
        setSelectedVersionIds(next);
    };

    const ZOOM_OPTIONS: { level: ZoomLevel; label: string }[] = [
        { level: 0, label: i18n.t('label_month') || 'Month' },
        { level: 1, label: i18n.t('label_week') || 'Week' },
        { level: 2, label: i18n.t('label_day') || 'Day' }
    ];

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
                    onClick={toggleLeftPane}
                    title={i18n.t('label_toggle_sidebar') || "Toggle Sidebar"}
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
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>

                <button
                    onClick={() => {
                        const projectId = window.RedmineCanvasGantt?.projectId;
                        if (projectId) {
                            useUIStore.getState().openIssueDialog(`/projects/${projectId}/issues/new`);
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

                <div style={{ width: 1, height: 20, backgroundColor: '#e0e0e0', margin: '0 4px' }} />

                <button
                    onClick={() => setShowFilterMenu(prev => !prev)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: filterText ? '#e8f0fe' : '#fff',
                        color: filterText ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {'フィルタ'}
                </button>

                {showFilterMenu && (
                    <div
                        ref={filterMenuRef}
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
                                {i18n.t('label_clear_filter') || 'Clear Filter'}
                            </button>
                        )}
                    </div>
                )}

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowColumnMenu(prev => !prev)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0 10px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                            <line x1="15" y1="3" x2="15" y2="21" />
                        </svg>
                        {'カラム'}
                    </button>

                    {showColumnMenu && (
                        <div
                            ref={columnMenuRef}
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
                                minWidth: '200px'
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

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowAssigneeMenu(prev => !prev)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0 10px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: selectedAssigneeIds.length > 0 ? '#e8f0fe' : '#fff',
                            color: selectedAssigneeIds.length > 0 ? '#1a73e8' : '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        {'担当者'}
                    </button>

                    {showAssigneeMenu && (
                        <div
                            ref={assigneeMenuRef}
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
                                {'クリア'}
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowProjectMenu(prev => !prev)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0 10px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: selectedProjectIds.length > 0 ? '#e8f0fe' : '#fff',
                            color: selectedProjectIds.length > 0 ? '#1a73e8' : '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        {'プロジェクト'}
                    </button>
                    {showProjectMenu && (
                        <div
                            ref={projectMenuRef}
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
                                {'クリア'}
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowVersionMenu(prev => !prev)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0 10px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: selectedVersionIds.length > 0 ? '#e8f0fe' : '#fff',
                            color: selectedVersionIds.length > 0 ? '#1a73e8' : '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        </svg>
                        {'バージョン'}
                    </button>
                    {showVersionMenu && (
                        <div
                            ref={versionMenuRef}
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
                                {'クリア'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleProgressLine}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: showProgressLine ? '#e8f0fe' : '#fff',
                        color: showProgressLine ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    {'進捗ライン'}
                </button>

                <button
                    onClick={toggleVersions}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: showVersions ? '#e8f0fe' : '#fff',
                        color: showVersions ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                    {i18n.t('label_version_plural') || 'バージョン'}
                </button>

                <button
                    onClick={() => setGroupByProject(!groupByProject)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: groupByProject ? '#e8f0fe' : '#fff',
                        color: groupByProject ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {'プロジェクトでグループ化'}
                </button>

                <button
                    onClick={() => setShowSubprojects(!showSubprojects)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: showSubprojects ? '#e8f0fe' : '#fff',
                        color: showSubprojects ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                        <path d="M12 18h.01" />
                    </svg>
                    {i18n.t('label_show_subprojects') || '子プロジェクトを表示'}
                </button>

                <button
                    onClick={() => setOrganizeByDependency(!organizeByDependency)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: organizeByDependency ? '#e8f0fe' : '#fff',
                        color: organizeByDependency ? '#1a73e8' : '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 6h6v6H5z" />
                        <path d="M13 12h6v6h-6z" />
                        <path d="M11 9l2 2" />
                        <path d="M7 12l6-6" />
                    </svg>
                    {'依存関係で整理'}
                </button>
            </div>

            {/* Right: Zoom Level & Today */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
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
                    {'今日'}
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
            </div>
        </div>
    );
};
